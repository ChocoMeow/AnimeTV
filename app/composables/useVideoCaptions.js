import {
    aiCaptionLang,
    captionDisplayLabel,
    isEnCaptionCode,
    isEnCaptionTrack,
    isTwCaptionTrack,
    normCaptionCode,
    pickPreferredCaptionLang,
} from '#shared/utils/aiCaptions'

const LANG_KEY = 'videoCaptionLang'
const LAST_KEY = 'videoCaptionLangLast'
const OFF = 'off'
const AI_POLL_MS = 4_000
const AI_POLL_MAX_MS = 6 * 60_000
const VTT_TYPE = 'text/vtt;charset=utf-8'

const storageGet = (key) => { try { return localStorage.getItem(key) } catch { return null } }
const storageSet = (key, value) => { try { localStorage.setItem(key, value) } catch { /* ignore */ } }
const sameLang = (a, b) => normCaptionCode(a) === normCaptionCode(b)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const findMeta = (tracks, lang) => tracks.find((t) => sameLang(t.srclang, lang))

function normalizeList(raw) {
    if (!Array.isArray(raw)) return []
    return raw
        .filter((c) => c?.srclang && (c?.src || c?.vttText))
        .map((c) => {
            const srclang = String(c.srclang)
            return {
                srclang,
                label: captionDisplayLabel(srclang, c.label),
                ...(c.vttText ? { vttText: String(c.vttText) } : { src: String(c.src) }),
            }
        })
}

function pickLang(tracks, allowOff = true) {
    if (!tracks.length) return null
    const saved = storageGet(LANG_KEY)
    if (allowOff && saved === OFF) return null
    if (saved && saved !== OFF) {
        const hit = findMeta(tracks, saved)
        if (hit) return hit.srclang
    }
    const last = findMeta(tracks, storageGet(LAST_KEY))?.srclang
    // Remembered English loses to 繁中 when available.
    if (last && !(isEnCaptionCode(last) && tracks.some(isTwCaptionTrack))) return last
    return pickPreferredCaptionLang(tracks) // 繁中 → en → first
}

function pickAiSourceTrack(tracks, targetLang) {
    const candidates = tracks.filter((t) => t?.src && !sameLang(t.srclang, targetLang))
    return candidates.find(isEnCaptionTrack) || candidates[0] || null
}

function cueText(cue) {
    return String(cue?.text || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/?[^>]+>/g, '').trim()
}

/** Materialize the selected WebVTT language into a blob URL + custom overlay text. */
export function useVideoCaptions({ videoRef, captions, aiCaptionLangs, episodeToken, notify, onCaptionAdded }) {
    const baseTracks = computed(() => normalizeList(toValue(captions)))
    /** Optimistic AI tracks until the parent merges them into `captions`. */
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
        return findMeta(available.value, selectedLang.value)?.label || selectedLang.value
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

    function clearCueListeners() {
        const video = videoRef.value
        if (!onCueChange || !video?.textTracks) return
        for (const t of video.textTracks) t.removeEventListener('cuechange', onCueChange)
    }

    function syncCues() {
        const video = videoRef.value
        const lang = selectedLang.value
        activeCaptionText.value = ''
        if (!video?.textTracks || !lang) return
        for (const track of video.textTracks) {
            if (!sameLang(track.language, lang)) continue
            const cues = track.activeCues
            if (cues?.length) activeCaptionText.value = Array.from(cues).map(cueText).filter(Boolean).join('\n')
            return
        }
    }

    function applyModes() {
        const video = videoRef.value
        if (!video?.textTracks) return
        clearCueListeners()
        onCueChange = syncCues
        const lang = selectedLang.value
        for (const track of video.textTracks) {
            if (track.kind !== 'subtitles' && track.kind !== 'captions') continue
            // `hidden` = cues for JS only. Safari may still paint — VideoPlayer CSS hides native cues.
            track.mode = lang && sameLang(track.language, lang) ? 'hidden' : 'disabled'
            track.addEventListener('cuechange', onCueChange)
        }
        syncCues()
    }

    async function ensure(lang) {
        if (!lang || cache.has(lang)) return
        const meta = findMeta(available.value, lang)
        if (!meta) return
        const g = gen
        try {
            let blob
            if (meta.vttText) {
                blob = new Blob([meta.vttText], { type: VTT_TYPE })
            } else {
                const res = await fetch(meta.src)
                if (!res.ok || g !== gen) return
                blob = await res.blob()
            }
            if (g !== gen) return
            const url = URL.createObjectURL(blob)
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
            const meta = findMeta(available.value, lang)
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
        const name = lang ? (findMeta(available.value, lang)?.label || lang) : '關閉'
        notify?.(`字幕 ${name}`, lang ? 'closed_caption' : 'closed_caption_disabled')
    }

    function toggleCaptions() {
        if (!available.value.length) return
        setCaptionLang(selectedLang.value ? null : pickLang(available.value, false))
    }

    async function requestAiCaption(lang) {
        const meta = aiCaptionLang(lang)
        const token = String(toValue(episodeToken) || '').trim()
        if (!meta || !token || aiLoadingLang.value) return false
        if (findMeta(available.value, meta.srclang)) {
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
        const g = gen
        const startedAt = Date.now()
        const req = {
            method: 'POST',
            timeout: 30_000,
            body: {
                token,
                lang: meta.srclang,
                sourceSrc: source.src,
                sourceLang: source.srclang,
            },
        }

        try {
            // Server translates in the background; poll until cached.
            let res = await $fetch('/api/caption-ai', req)
            while (res?.status === 'pending') {
                if (Date.now() - startedAt > AI_POLL_MAX_MS) throw new Error('AI 字幕產生逾時，請稍後再試')
                await sleep(AI_POLL_MS)
                if (g !== gen) return false
                res = await $fetch('/api/caption-ai', req)
            }
            const caption = res?.caption
            if (!caption?.vttText || !caption?.srclang) throw new Error('empty caption')
            const srclang = String(caption.srclang)
            const track = {
                srclang,
                label: captionDisplayLabel(srclang, caption.label),
                vttText: String(caption.vttText),
            }
            if (!findMeta(localExtras.value, track.srclang)) {
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
        clearCueListeners()
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
