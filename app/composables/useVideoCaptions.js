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
    return raw.filter((c) => c?.src && c?.srclang).map((c) => ({
        srclang: String(c.srclang),
        label: String(c.label || c.srclang),
        src: String(c.src),
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

function cueText(cue) {
    return String(cue?.text || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/?[^>]+>/g, '').trim()
}

/** External WebVTT captions — fetch only the selected language. */
export function useVideoCaptions({ videoRef, captions, notify }) {
    const available = computed(() => normalizeList(toValue(captions)))
    const hasCaptions = computed(() => available.value.length > 0)
    const tracks = ref([])
    const selectedLang = ref(null)
    const activeCaptionText = ref('')
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
            tracks.value = src && meta ? [{ ...meta, src }] : []
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

    watch(available, (list) => {
        gen++
        revokeCache()
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
        resolvedCaptionTracks: tracks,
        selectedCaptionLang: selectedLang,
        captionLabel,
        activeCaptionText,
        applyCaptionTracks: applyModes,
        setCaptionLang,
        toggleCaptions,
    }
}
