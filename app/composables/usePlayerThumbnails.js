const VTT_CACHE_LIMIT = 20
const SHEET_LIMIT = 48
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

/** anime1: shared jpg + #xywh · twxgct: per-cue sheet URL + #xywh */
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
 * Seek-bar thumbnails. Sheet images are cached (never aborted on hover).
 * @param {{ animeMeta: import('vue').Ref|import('vue').ComputedRef }} options
 */
export function usePlayerThumbnails({ animeMeta }) {
    const segments = ref([])
    const activeThumbnail = ref(null)
    let wantSrc = null
    let loadId = 0
    const vttCache = new Map()
    /** @type {Map<string, Promise<boolean>>} */
    const sheets = new Map()

    const meta = computed(() => toValue(animeMeta) || {})
    const videoId = computed(() => {
        const id = meta.value.videoId
        return id != null ? String(id).trim() || null : null
    })
    const jpgUrl = computed(() => meta.value.thumbnailJpgUrl || null)

    const activeThumbnailSrc = computed(() => activeThumbnail.value?.src || jpgUrl.value || null)
    const thumbnailCrop = computed(() => activeThumbnail.value?.xywh ?? null)

    const thumbnailPreviewHeight = computed(() => {
        const c = thumbnailCrop.value
        if (!c?.w || !c?.h) return Math.round(THUMB_PREVIEW_W * 9 / 16)
        return Math.max(1, Math.round(c.h * (THUMB_PREVIEW_W / c.w)))
    })

    const thumbnailImageStyle = computed(() => {
        const c = thumbnailCrop.value
        if (!c?.w || !c?.h) {
            return activeThumbnail.value?.src ? { width: '100%', height: '100%', objectFit: 'cover' } : {}
        }
        const s = THUMB_PREVIEW_W / c.w
        return {
            transformOrigin: 'top left',
            transform: `translate(${-c.x * s}px, ${-c.y * s}px) scale(${s})`,
            maxWidth: 'none',
        }
    })

    function findAtTime(t) {
        const list = segments.value
        if (!list.length) return null
        let lo = 0
        let hi = list.length - 1
        let ans = -1
        while (lo <= hi) {
            const mid = (lo + hi) >> 1
            if (list[mid].start <= t) {
                ans = mid
                lo = mid + 1
            } else hi = mid - 1
        }
        if (ans < 0) return null
        const seg = list[ans]
        return t >= seg.start && t <= seg.end ? seg : null
    }

    function preload(url) {
        if (!url) return null
        let p = sheets.get(url)
        if (p) return p
        p = new Promise((resolve) => {
            const img = new Image()
            img.onload = () => resolve(true)
            img.onerror = () => resolve(false)
            img.src = url
        })
        sheets.set(url, p)
        while (sheets.size > SHEET_LIMIT) sheets.delete(sheets.keys().next().value)
        return p
    }

    function updateActiveThumbnailForTime(t) {
        const seg = findAtTime(t)
        if (!seg) return
        const src = seg.src || jpgUrl.value
        if (!src) {
            activeThumbnail.value = seg.xywh ? seg : null
            return
        }
        wantSrc = src
        // Warm current + nearby cues (same sheet is a cache hit).
        const i = segments.value.indexOf(seg)
        for (const j of [i - 1, i, i + 1]) {
            const u = segments.value[j]?.src || jpgUrl.value
            if (u) preload(u)
        }
        preload(src)?.then((ok) => {
            if (ok && wantSrc === src) activeThumbnail.value = { ...seg, src }
        })
    }

    function clearActiveThumbnail() {
        wantSrc = null
        activeThumbnail.value = null
    }

    async function load() {
        const id = ++loadId
        clearActiveThumbnail()
        segments.value = []
        if (typeof window === 'undefined') return

        const inline = meta.value.thumbnailVttText
        if (inline) {
            segments.value = parseThumbnailsVtt(inline)
            return
        }

        const url = meta.value.thumbnailsVttUrl
        if (!videoId.value || !url) return

        if (vttCache.has(url)) {
            segments.value = vttCache.get(url)
            return
        }

        try {
            const res = await fetch(url)
            if (!res.ok) throw new Error(String(res.status))
            const parsed = parseThumbnailsVtt(await res.text())
            if (id !== loadId) return
            segments.value = parsed
            vttCache.set(url, parsed)
            while (vttCache.size > VTT_CACHE_LIMIT) vttCache.delete(vttCache.keys().next().value)
            if (parsed.length && jpgUrl.value) preload(jpgUrl.value)
        } catch {
            if (id === loadId) segments.value = []
        }
    }

    watch(
        [videoId, () => meta.value.thumbnailVttText, () => meta.value.thumbnailsVttUrl],
        load,
        { immediate: true },
    )

    onScopeDispose(() => {
        loadId++
        wantSrc = null
    })

    return {
        THUMB_PREVIEW_W,
        activeThumbnail,
        activeThumbnailSrc,
        thumbnailCrop,
        thumbnailPreviewHeight,
        thumbnailImageStyle,
        updateActiveThumbnailForTime,
        clearActiveThumbnail,
    }
}
