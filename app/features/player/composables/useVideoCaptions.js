import {
    captionDisplayLabel,
    captionLang,
    captionMenuRank,
    isEnCaptionCode,
    isEnCaptionTrack,
    isTwCaptionTrack,
    normCaptionCode,
    pickPreferredCaptionLang,
} from '#shared/utils/captions'

const LANG_KEY = 'videoCaptionLang'
const LAST_KEY = 'videoCaptionLangLast'
const OFF = 'off'
const AI_POLL_MS = 20_000
const GOOGLE_POLL_MS = 2_000
const AI_POLL_MAX_MS = 10 * 60_000
const VTT_TYPE = 'text/vtt;charset=utf-8'

const storageGet = (key) => {
    if (!import.meta.client) return null
    try { return localStorage.getItem(key) } catch { return null }
}
const storageSet = (key, value) => {
    if (!import.meta.client) return
    try { localStorage.setItem(key, value) } catch { /* ignore */ }
}
const sameLang = (a, b) => normCaptionCode(a) === normCaptionCode(b)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const findMeta = (tracks, lang) => tracks.find((t) => sameLang(t.srclang, lang))
const cueText = (cue) => String(cue?.text || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/?[^>]+>/g, '').trim()

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
    return pickPreferredCaptionLang(tracks)
}

function pickAiSourceTrack(tracks, targetLang) {
    const candidates = tracks.filter((t) => t?.src && !sameLang(t.srclang, targetLang))
    return candidates.find(isEnCaptionTrack) || candidates[0] || null
}

/**
 * Selected WebVTT → blob URL + overlay text.
 * Inline: track `hidden` + PlayerCaptionOverlay.
 * iOS native FS: track `showing` so Safari paints the same language.
 */
export function useVideoCaptions({ videoRef, captions, aiCaptionLangs, episodeToken, notify, onCaptionAdded }) {
    const aiEnabled = Boolean(useRuntimeConfig().public.aiEnabled)
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
        return out.sort((a, b) => captionMenuRank(a) - captionMenuRank(b) || a.label.localeCompare(b.label, 'zh'))
    })
    /** Pending translate options — Google always; AI only when `aiEnabled`. */
    const pendingAiLangs = computed(() => {
        const have = new Set(available.value.map((t) => t.srclang))
        return (toValue(aiCaptionLangs) || [])
            .flatMap((code) => {
                const m = captionLang(code)
                if (!m || have.has(m.srclang)) return []
                const opts = [
                    { srclang: m.srclang, label: `${m.label}（Google）`, engine: 'google', icon: 'translate' },
                ]
                if (aiEnabled) {
                    opts.unshift({ srclang: m.srclang, label: `${m.label}（AI）`, engine: 'ai', icon: 'auto_awesome' })
                }
                return opts
            })
            .sort((a, b) => captionMenuRank(a) - captionMenuRank(b))
    })
    const hasCaptions = computed(() => available.value.length > 0 || pendingAiLangs.value.length > 0)

    const tracks = ref([])
    const selectedLang = ref(null)
    const activeCaptionText = ref('')
    const aiLoadingLang = ref(null)
    const aiError = ref('')
    const nativeVideoFs = ref(false)
    const captionLabel = computed(() =>
        selectedLang.value
            ? (findMeta(available.value, selectedLang.value)?.label || selectedLang.value)
            : '關閉',
    )

    const cache = new Map()
    let gen = 0
    let onCueChange = null
    let unbindNativeFs = null

    function revokeCache() {
        for (const url of cache.values()) {
            try { URL.revokeObjectURL(url) } catch { /* ignore */ }
        }
        cache.clear()
    }

    function clearCueListeners() {
        const list = videoRef.value?.textTracks
        if (!onCueChange || !list) return
        for (const t of list) t.removeEventListener('cuechange', onCueChange)
    }

    function syncCues() {
        activeCaptionText.value = ''
        const video = videoRef.value
        const lang = selectedLang.value
        if (nativeVideoFs.value || !video?.textTracks || !lang) return
        for (const track of video.textTracks) {
            if (!sameLang(track.language, lang)) continue
            const cues = track.activeCues
            if (cues?.length) activeCaptionText.value = Array.from(cues).map(cueText).filter(Boolean).join('\n')
            return
        }
    }

    function applyModes() {
        const list = videoRef.value?.textTracks
        if (!list) return
        clearCueListeners()
        onCueChange = syncCues
        const lang = selectedLang.value
        const onMode = nativeVideoFs.value ? 'showing' : 'hidden'
        for (const track of list) {
            if (track.kind !== 'subtitles' && track.kind !== 'captions') continue
            track.mode = lang && sameLang(track.language, lang) ? onMode : 'disabled'
            track.addEventListener('cuechange', onCueChange)
        }
        syncCues()
    }

    /** Call before `webkitEnterFullscreen` so the selected track is already showing. */
    function setNativeVideoFullscreen(active) {
        if (nativeVideoFs.value === Boolean(active)) return
        nativeVideoFs.value = Boolean(active)
        applyModes()
    }

    async function ensure(lang) {
        if (!lang || cache.has(lang)) return
        const meta = findMeta(available.value, lang)
        if (!meta) return
        const g = gen
        try {
            let blob = meta.vttText ? new Blob([meta.vttText], { type: VTT_TYPE }) : null
            if (!blob) {
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

    function revokeLang(lang) {
        const url = cache.get(lang)
        if (!url) return
        try { URL.revokeObjectURL(url) } catch { /* ignore */ }
        cache.delete(lang)
    }

    /** Apply AI VTT locally; `persist` merges into parent only on final ready. */
    async function applyAiCaption(caption, { persist = false, notifyReady = false } = {}) {
        if (!caption?.vttText || !caption?.srclang) return null
        const srclang = String(caption.srclang)
        const track = {
            srclang,
            label: captionDisplayLabel(srclang, caption.label),
            vttText: String(caption.vttText),
        }
        const rest = localExtras.value.filter((t) => !sameLang(t.srclang, srclang))
        localExtras.value = [...rest, track]
        revokeLang(srclang)
        if (persist) onCaptionAdded?.(track)
        storageSet(LANG_KEY, srclang)
        storageSet(LAST_KEY, srclang)
        if (notifyReady) notify?.(`字幕 ${track.label}`, 'closed_caption')
        await nextTick()
        await show(srclang)
        return track
    }

    async function requestAiCaption(langOrOpt, { silent = false } = {}) {
        const engine = langOrOpt?.engine === 'google' ? 'google' : 'ai'
        const lang = typeof langOrOpt === 'object' ? langOrOpt.srclang : langOrOpt
        const meta = captionLang(lang)
        const token = String(toValue(episodeToken) || '').trim()
        if (!meta || !token || aiLoadingLang.value) return false
        if (findMeta(available.value, meta.srclang)) {
            setCaptionLang(meta.srclang)
            return true
        }

        const source = pickAiSourceTrack(available.value, meta.srclang)
        if (!source?.src) {
            aiError.value = '找不到可翻譯的原始字幕'
            if (!silent) notify?.(aiError.value, 'error')
            return false
        }

        // Disambiguate loading when both AI + Google share the same srclang.
        const loadingKey = `${engine}:${meta.srclang}`
        aiLoadingLang.value = loadingKey
        aiError.value = ''
        const g = gen
        const startedAt = Date.now()
        const failMsg = engine === 'google' ? 'Google 字幕翻譯失敗' : 'AI 字幕產生失敗'
        const req = {
            method: 'POST',
            timeout: 30_000,
            body: {
                token,
                lang: meta.srclang,
                engine,
                sourceSrc: source.src,
                sourceLang: source.srclang,
            },
        }

        try {
            let res = await $fetch('/api/captions', req)
            let applied = false
            while (res?.status === 'pending') {
                if (res?.caption?.vttText) {
                    await applyAiCaption(res.caption)
                    applied = true
                }
                if (Date.now() - startedAt > AI_POLL_MAX_MS) {
                    throw new Error(engine === 'google' ? 'Google 字幕翻譯逾時，請稍後再試' : 'AI 字幕產生逾時，請稍後再試')
                }
                await sleep(engine === 'google' ? GOOGLE_POLL_MS : AI_POLL_MS)
                if (g !== gen) return false
                res = await $fetch('/api/captions', req)
            }
            if (!res?.caption?.vttText || !res?.caption?.srclang) throw new Error('empty caption')
            await applyAiCaption(res.caption, { persist: true, notifyReady: !silent && !applied })
            return true
        } catch (err) {
            const msg = err?.data?.message || err?.statusMessage || err?.message || failMsg
            aiError.value = msg
            if (!silent) notify?.(msg, 'error')
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
        // No 繁中 → auto AI when enabled (unless captions off). Google stays manual.
        const canAiTw = aiEnabled && (toValue(aiCaptionLangs) || []).some((c) => captionLang(c)?.srclang === 'TW')
        if (storageGet(LANG_KEY) !== OFF && !list.some(isTwCaptionTrack) && canAiTw) {
            requestAiCaption({ srclang: 'TW', engine: 'ai' }, { silent: true })
        }
    }, { immediate: true })

    watch(() => videoRef.value, (video) => {
        unbindNativeFs?.()
        unbindNativeFs = null
        if (!video) return
        const onBegin = () => setNativeVideoFullscreen(true)
        const onEnd = () => setNativeVideoFullscreen(false)
        video.addEventListener('webkitbeginfullscreen', onBegin)
        video.addEventListener('webkitendfullscreen', onEnd)
        unbindNativeFs = () => {
            video.removeEventListener('webkitbeginfullscreen', onBegin)
            video.removeEventListener('webkitendfullscreen', onEnd)
        }
    }, { immediate: true })

    onScopeDispose(() => {
        gen++
        unbindNativeFs?.()
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
        nativeVideoFullscreen: nativeVideoFs,
        applyCaptionTracks: applyModes,
        setCaptionLang,
        toggleCaptions,
        requestAiCaption,
        setNativeVideoFullscreen,
    }
}
