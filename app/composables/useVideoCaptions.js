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

/**
 * twxgct / external WebVTT captions. Native tracks stay `hidden`; UI reads active cues.
 */
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

    let blobUrls = []
    let loadId = 0
    let onCueChange = null

    function clearBlobs() {
        for (const url of blobUrls) {
            try { URL.revokeObjectURL(url) } catch { /* ignore */ }
        }
        blobUrls = []
    }

    function syncCues() {
        const video = videoRef.value
        const lang = selectedLang.value
        if (!video?.textTracks || !lang) {
            activeCaptionText.value = ''
            return
        }
        for (const track of video.textTracks) {
            if (track.language !== lang) continue
            const cues = track.activeCues
            activeCaptionText.value = cues?.length
                ? Array.from(cues).map(cueText).filter(Boolean).join('\n')
                : ''
            return
        }
        activeCaptionText.value = ''
    }

    function applyModes() {
        const video = videoRef.value
        if (!video?.textTracks) return

        if (onCueChange) {
            for (const track of video.textTracks) track.removeEventListener('cuechange', onCueChange)
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

    async function loadTracks(list) {
        const id = ++loadId
        clearBlobs()
        tracks.value = []
        activeCaptionText.value = ''
        if (!list.length) {
            selectedLang.value = null
            return
        }

        const loaded = []
        await Promise.all(list.map(async (item) => {
            try {
                const res = await fetch(item.src)
                if (!res.ok) return
                const blob = await res.blob()
                if (id !== loadId) return
                const src = URL.createObjectURL(blob)
                blobUrls.push(src)
                loaded.push({ ...item, src })
            } catch { /* skip */ }
        }))
        if (id !== loadId) return

        const order = new Map(list.map((t, i) => [t.srclang, i]))
        loaded.sort((a, b) => (order.get(a.srclang) ?? 0) - (order.get(b.srclang) ?? 0))
        tracks.value = loaded

        if (!(selectedLang.value && loaded.some((t) => t.srclang === selectedLang.value))) {
            selectedLang.value = pickLang(loaded)
        }
        await nextTick()
        applyModes()
    }

    function setCaptionLang(lang) {
        selectedLang.value = lang || null
        if (lang) {
            storageSet(LANG_KEY, lang)
            storageSet(LAST_KEY, lang)
        } else {
            storageSet(LANG_KEY, OFF)
            activeCaptionText.value = ''
        }
        applyModes()
        const label = lang
            ? (available.value.find((c) => c.srclang === lang)?.label || lang)
            : '關閉'
        notify?.(`字幕 ${label}`, lang ? 'closed_caption' : 'closed_caption_disabled')
    }

    function toggleCaptions() {
        const list = tracks.value.length ? tracks.value : available.value
        if (!list.length) return
        if (selectedLang.value) setCaptionLang(null)
        else setCaptionLang(pickLang(list, false))
    }

    watch(available, loadTracks, { immediate: true })

    onScopeDispose(() => {
        loadId++
        const video = videoRef.value
        if (onCueChange && video?.textTracks) {
            for (const track of video.textTracks) track.removeEventListener('cuechange', onCueChange)
        }
        clearBlobs()
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
