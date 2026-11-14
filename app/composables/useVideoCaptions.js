import { aiCaptionLang } from '#shared/utils/aiCaptions'

const LANG_KEY = 'videoCaptionLang'
const LAST_KEY = 'videoCaptionLangLast'
const OFF = 'off'

function storageGet(key) {
    try { return localStorage.getItem(key) } catch { return null }
}
function storageSet(key, value) {
    try { localStorage.setItem(key, value) } catch { /* ignore */ }
}

function normalizeList(raw) {
    if (!Array.isArray(raw)) return []
    return raw
        .filter((c) => c?.srclang && (c?.src || c?.vttText))
        .map((c) => ({
            srclang: String(c.srclang),
            label: String(c.label || c.srclang),
            ...(c.vttText ? { vttText: String(c.vttText) } : { src: String(c.src) }),
        }))
}

function pickLang(tracks, allowOff = true) {
    if (!tracks.length) return null
    const saved = storageGet(LANG_KEY)
    if (allowOff && saved === OFF) return null
    if (saved && saved !== OFF && tracks.some((t) => t.srclang === saved)) return saved
    const last = storageGet(LAST_KEY)
    if (last && tracks.some((t) => t.srclang === last)) return last
    return tracks.find((t) => t.srclang === 'TW')?.srclang || tracks[0].srclang
}

/** Prefer English upstream track as AI translation source. */
function pickAiSourceTrack(tracks, targetLang) {
    const candidates = tracks.filter((t) => t?.src && t.srclang !== targetLang)
    return candidates.find((t) => String(t.srclang).toLowerCase() === 'en') || candidates[0] || null
}

function cueText(cue) {
    return String(cue?.text || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/?[^>]+>/g, '').trim()
}

/** External / inline WebVTT captions — materialize only the selected language. */
export function useVideoCaptions({ videoRef, captions, aiCaptionLangs, episodeToken, notify, onCaptionAdded }) {
    const baseTracks = computed(() => normalizeList(toValue(captions)))
    /** Optimistic AI tracks until parent merges into `captions`. */
    const localExtras = ref([])
    const available = computed(() => {
        const seen = new Set()
        const out = []
        for (const t of [...baseTracks.value, ...localExtras.value]) {
            if (!t?.srclang || seen.has(t.srclang)) continue
            seen.add(t.srclang)
            out.push(t)
        }
        return out
    })

    const pendingAiLangs = computed(() => {
        const have = new Set(available.value.map((t) => t.srclang))
        return (toValue(aiCaptionLangs) || [])
            .map((code) => aiCaptionLang(code))
            .filter((m) => m && !have.has(m.srclang))
    })
    const hasCaptions = computed(() => available.value.length > 0 || pendingAiLangs.value.length > 0)

    const tracks = ref([])
    const selectedLang = ref(null)
    const activeCaptionText = ref('')
    const aiLoadingLang = ref(null)
    const aiError = ref('')
    const captionLabel = computed(() => {
        if (!selectedLang.value) return '關閉'
        return available.value.find((c) => c.srclang === selectedLang.value)?.label || selectedLang.value
    })

    const cache = new Map()
    let gen = 0
    let onCueChange = null

    function revokeCache() {
        for (const url of cache.values()) {
            try { URL.revokeObjectURL(url) } catch { /* ignore */ }
        }
        cache.clear()
    }

    function syncCues() {
        const video = videoRef.value
        const lang = selectedLang.value
        activeCaptionText.value = ''
        if (!video?.textTracks || !lang) return
        for (const track of video.textTracks) {
            if (track.language !== lang) continue
            const cues = track.activeCues
            if (cues?.length) activeCaptionText.value = Array.from(cues).map(cueText).filter(Boolean).join('\n')
            return
        }
    }

    function applyModes() {
        const video = videoRef.value
        if (!video?.textTracks) return
        if (onCueChange) {
            for (const t of video.textTracks) t.removeEventListener('cuechange', onCueChange)
        }
        onCueChange = syncCues
        const lang = selectedLang.value
        for (const track of video.textTracks) {
            if (track.kind !== 'subtitles' && track.kind !== 'captions') continue
            track.mode = lang && track.language === lang ? 'hidden' : 'disabled'
            track.addEventListener('cuechange', onCueChange)
        }
        syncCues()
    }

    async function ensure(lang) {
        if (!lang || cache.has(lang)) return
        const meta = available.value.find((t) => t.srclang === lang)
        if (!meta) return
        const g = gen
        try {
            if (meta.vttText) {
                const url = URL.createObjectURL(new Blob([meta.vttText], { type: 'text/vtt;charset=utf-8' }))
                if (g !== gen) return URL.revokeObjectURL(url)
                cache.set(lang, url)
                return
            }
            const res = await fetch(meta.src)
            if (!res.ok || g !== gen) return
            const url = URL.createObjectURL(await res.blob())
            if (g !== gen) return URL.revokeObjectURL(url)
            cache.set(lang, url)
        } catch { /* skip */ }
    }

    async function show(lang) {
        selectedLang.value = lang || null
        if (!lang) {
            tracks.value = []
            activeCaptionText.value = ''
        } else {
            await ensure(lang)
            const src = cache.get(lang)
            const meta = available.value.find((t) => t.srclang === lang)
            tracks.value = src && meta ? [{ srclang: meta.srclang, label: meta.label, src }] : []
        }
        await nextTick()
        applyModes()
    }

    function setCaptionLang(lang) {
        if (lang) {
            storageSet(LANG_KEY, lang)
            storageSet(LAST_KEY, lang)
        } else {
            storageSet(LANG_KEY, OFF)
        }
        show(lang || null)
        notify?.(
            `字幕 ${lang ? (available.value.find((c) => c.srclang === lang)?.label || lang) : '關閉'}`,
            lang ? 'closed_caption' : 'closed_caption_disabled',
        )
    }

    function toggleCaptions() {
        if (!available.value.length) return
        setCaptionLang(selectedLang.value ? null : pickLang(available.value, false))
    }

    async function requestAiCaption(lang) {
        const meta = aiCaptionLang(lang)
        const token = String(toValue(episodeToken) || '').trim()
        if (!meta || !token || aiLoadingLang.value) return false
        if (available.value.some((t) => t.srclang === meta.srclang)) {
            setCaptionLang(meta.srclang)
            return true
        }

        const source = pickAiSourceTrack(available.value, meta.srclang)
        if (!source?.src) {
            aiError.value = '找不到可翻譯的原始字幕'
            notify?.(aiError.value, 'error')
            return false
        }

        aiLoadingLang.value = meta.srclang
        aiError.value = ''
        const req = {
            method: 'POST',
            timeout: 180_000,
            body: {
                token,
                lang: meta.srclang,
                sourceSrc: source.src,
                sourceLang: source.srclang,
            },
        }
        try {
            let res
            try {
                res = await $fetch('/api/caption-ai', req)
            } catch (err) {
                // Retry upstream busy only — never our 429 quota/cooldown.
                const status = Number(err?.statusCode || err?.status || err?.data?.statusCode) || 0
                if (status !== 503) throw err
                await new Promise((r) => setTimeout(r, 1500))
                res = await $fetch('/api/caption-ai', req)
            }
            const caption = res?.caption
            if (!caption?.vttText || !caption?.srclang) throw new Error('empty caption')
            const track = {
                srclang: String(caption.srclang),
                label: String(caption.label || caption.srclang),
                vttText: String(caption.vttText),
            }
            if (!localExtras.value.some((t) => t.srclang === track.srclang)) {
                localExtras.value = [...localExtras.value, track]
            }
            onCaptionAdded?.(track)
            await nextTick()
            setCaptionLang(track.srclang)
            return true
        } catch (err) {
            const msg = err?.data?.message || err?.statusMessage || err?.message || 'AI 字幕產生失敗'
            aiError.value = msg
            notify?.(msg, 'error')
            return false
        } finally {
            aiLoadingLang.value = null
        }
    }

    watch(baseTracks, (list) => {
        gen++
        revokeCache()
        localExtras.value = []
        aiError.value = ''
        show(pickLang(list))
    }, { immediate: true })

    onScopeDispose(() => {
        gen++
        const video = videoRef.value
        if (onCueChange && video?.textTracks) {
            for (const t of video.textTracks) t.removeEventListener('cuechange', onCueChange)
        }
        revokeCache()
    })

    return {
        hasCaptions,
        captionTracks: available,
        pendingAiLangs,
        aiLoadingLang,
        aiError,
        resolvedCaptionTracks: tracks,
        selectedCaptionLang: selectedLang,
        captionLabel,
        activeCaptionText,
        applyCaptionTracks: applyModes,
        setCaptionLang,
        toggleCaptions,
        requestAiCaption,
    }
}
