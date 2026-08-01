const THUMB_CACHE_LIMIT = 20
const THUMB_PREVIEW_W = 280

function parseVttTimeToSeconds(timeStr) {
    const parts = String(timeStr).trim().split(':')
    if (parts.length === 3) {
        const [hh, mm, ssms] = parts
        const [ss, ms] = ssms.split('.')
        return +hh * 3600 + +mm * 60 + +ss + +(ms || 0) / 1000
    }
    const [mm, ssms] = parts
    const [ss, ms] = ssms.split('.')
    return +mm * 60 + +ss + +(ms || 0) / 1000
}

function parseXywh(text) {
    const m = String(text).match(/#xywh=(\d+),(\d+),(\d+),(\d+)/)
    return m ? { x: +m[1], y: +m[2], w: +m[3], h: +m[4] } : null
}

/** Supports anime1 (#xywh on shared jpg) and twxgct (per-cue https URL + optional #xywh). */
function parseThumbnailsVtt(vttText) {
    const segments = []
    for (const block of String(vttText || '').replace(/\r/g, '').split(/\n\s*\n/)) {
        const timeMatch = block.match(/((?:\d{2}:)?\d{2}:\d{2}\.\d{3})\s*-->\s*((?:\d{2}:)?\d{2}:\d{2}\.\d{3})/)
        if (!timeMatch) continue
        const src = block.match(/(https?:\/\/[^\s#]+)/i)?.[1]
        const xywh = parseXywh(block)
        if (!src && !xywh) continue
        const seg = {
            start: parseVttTimeToSeconds(timeMatch[1]),
            end: parseVttTimeToSeconds(timeMatch[2]),
        }
        if (src) seg.src = src
        if (xywh) seg.xywh = xywh
        segments.push(seg)
    }
    return segments
        .filter((s) => Number.isFinite(s.start) && Number.isFinite(s.end) && s.end >= s.start)
        .sort((a, b) => a.start - b.start)
}

/**
 * Seek-bar thumbnail strip for VideoPlayer.
 * @param {{ animeMeta: import('vue').Ref|import('vue').ComputedRef }} options
 */
export function usePlayerThumbnails({ animeMeta }) {
    const segments = ref([])
    const activeThumbnail = ref(null)
    let abortController = null
    let loadId = 0
    const cache = new Map()

    const meta = computed(() => toValue(animeMeta) || {})
    const videoId = computed(() => {
        const id = meta.value.videoId
        return id != null ? String(id).trim() || null : null
    })
    const thumbnailJpgUrl = computed(() => meta.value.thumbnailJpgUrl || null)

    const activeThumbnailSrc = computed(() => activeThumbnail.value?.src || thumbnailJpgUrl.value || null)
    const thumbnailCrop = computed(() => activeThumbnail.value?.xywh ?? null)

    const thumbnailPreviewHeight = computed(() => {
        const crop = thumbnailCrop.value
        if (!crop?.w || !crop?.h) return Math.round(THUMB_PREVIEW_W * 9 / 16)
        return Math.max(1, Math.round(crop.h * (THUMB_PREVIEW_W / crop.w)))
    })

    const thumbnailImageStyle = computed(() => {
        const crop = thumbnailCrop.value
        if (!crop?.w || !crop?.h) {
            if (activeThumbnail.value?.src) {
                return { width: '100%', height: '100%', objectFit: 'cover' }
            }
            return {}
        }
        const scale = THUMB_PREVIEW_W / crop.w
        return {
            transformOrigin: 'top left',
            transform: `translate(${-crop.x * scale}px, ${-crop.y * scale}px) scale(${scale})`,
            maxWidth: 'none',
        }
    })

    function findAtTime(t) {
        const list = segments.value
        if (!list?.length) return null
        let lo = 0
        let hi = list.length - 1
        let ans = -1
        while (lo <= hi) {
            const mid = (lo + hi) >> 1
            if (list[mid].start <= t) {
                ans = mid
                lo = mid + 1
            } else {
                hi = mid - 1
            }
        }
        if (ans === -1) return null
        const seg = list[ans]
        return t >= seg.start && t <= seg.end ? seg : null
    }

    function updateActiveThumbnailForTime(t) {
        activeThumbnail.value = segments.value?.length ? findAtTime(t) : null
    }

    async function load() {
        const id = ++loadId
        abortController?.abort()
        abortController = null
        activeThumbnail.value = null
        segments.value = []
        if (typeof window === 'undefined') return

        const vttText = meta.value.thumbnailVttText
        if (vttText) {
            segments.value = parseThumbnailsVtt(vttText)
            return
        }

        const currentVideoId = videoId.value
        const vttFetchUrl = meta.value.thumbnailsVttUrl
        if (!currentVideoId || !vttFetchUrl) return

        if (cache.has(vttFetchUrl)) {
            const cached = cache.get(vttFetchUrl)
            cache.delete(vttFetchUrl)
            cache.set(vttFetchUrl, cached)
            segments.value = cached
            return
        }

        try {
            const controller = new AbortController()
            abortController = controller
            const res = await fetch(vttFetchUrl, { signal: controller.signal })
            if (!res.ok) throw new Error(String(res.status))
            const parsed = parseThumbnailsVtt(await res.text())
            if (id !== loadId) return
            segments.value = parsed
            cache.set(vttFetchUrl, parsed)
            if (cache.size > THUMB_CACHE_LIMIT) cache.delete(cache.keys().next().value)
            if (parsed.length && thumbnailJpgUrl.value) {
                const img = new Image()
                img.crossOrigin = 'anonymous'
                img.src = thumbnailJpgUrl.value
            }
        } catch (error) {
            if (error?.name === 'AbortError' || id !== loadId) return
            segments.value = []
            activeThumbnail.value = null
        } finally {
            if (id === loadId) abortController = null
        }
    }

    watch(
        [videoId, () => meta.value.thumbnailVttText, () => meta.value.thumbnailsVttUrl],
        () => { load() },
        { immediate: true },
    )

    onScopeDispose(() => {
        loadId++
        abortController?.abort()
    })

    return {
        THUMB_PREVIEW_W,
        activeThumbnail,
        activeThumbnailSrc,
        thumbnailCrop,
        thumbnailPreviewHeight,
        thumbnailImageStyle,
        updateActiveThumbnailForTime,
        clearActiveThumbnail: () => { activeThumbnail.value = null },
    }
}
