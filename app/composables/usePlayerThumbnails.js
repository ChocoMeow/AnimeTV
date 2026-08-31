const VTT_CACHE_LIMIT = 20
const SHEET_LIMIT = 48
const THUMB_PREVIEW_W = 280
const THUMB_PREVIEW_H = Math.round(THUMB_PREVIEW_W * 9 / 16)
const BUNNY_SEEK_GRID = Object.freeze({ cols: 6, rows: 6 })
const BUNNY_SEEK_SHEET = /\/seek\/_\d+\.jpg/i

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

function isBunnySeekSheet(url) {
    return BUNNY_SEEK_SHEET.test(String(url || ''))
}

/** twxgct only: re-map stale Bunny VTT crops once the loaded sheet size is known. */
function resolveXywh(xywh, sheetSize, src) {
    if (!isBunnySeekSheet(src) || !xywh?.w || !xywh?.h || !sheetSize?.w || !sheetSize?.h) return xywh
    const cellW = Math.floor(sheetSize.w / BUNNY_SEEK_GRID.cols)
    const cellH = Math.floor(sheetSize.h / BUNNY_SEEK_GRID.rows)
    if (!cellW || !cellH || (cellW === xywh.w && cellH === xywh.h)) return xywh
    const col = Math.min(BUNNY_SEEK_GRID.cols - 1, Math.max(0, Math.floor((xywh.x + xywh.w / 2) / xywh.w)))
    const row = Math.min(BUNNY_SEEK_GRID.rows - 1, Math.max(0, Math.floor((xywh.y + xywh.h / 2) / xywh.h)))
    return { x: col * cellW, y: row * cellH, w: cellW, h: cellH }
}

/** Scale one sprite cell into a fixed 16:9 preview box with letterboxing. */
function spritePreviewStyles(crop, sheet, boxW, boxH) {
    const scale = Math.min(boxW / crop.w, boxH / crop.h)
    const viewportW = Math.round(crop.w * scale)
    const viewportH = Math.round(crop.h * scale)
    return {
        viewport: {
            left: `${Math.round((boxW - viewportW) / 2)}px`,
            top: `${Math.round((boxH - viewportH) / 2)}px`,
            width: `${viewportW}px`,
            height: `${viewportH}px`,
        },
        image: {
            left: `${Math.round(-crop.x * scale)}px`,
            top: `${Math.round(-crop.y * scale)}px`,
            width: `${Math.round(sheet.w * scale)}px`,
            height: `${Math.round(sheet.h * scale)}px`,
            maxWidth: 'none',
        },
    }
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
    /** @type {Map<string, { w: number, h: number }>} */
    const sheetSizes = new Map()
    const sheetSizesVersion = ref(0)

    const meta = computed(() => toValue(animeMeta) || {})
    const videoId = computed(() => {
        const id = meta.value.videoId
        return id != null ? String(id).trim() || null : null
    })
    const jpgUrl = computed(() => meta.value.thumbnailJpgUrl || null)

    const activeThumbnailSrc = computed(() => activeThumbnail.value?.src || jpgUrl.value || null)

    const thumbnailPreview = computed(() => {
        sheetSizesVersion.value
        const seg = activeThumbnail.value
        if (!seg?.xywh) return null
        const src = seg.src || jpgUrl.value
        const crop = resolveXywh(seg.xywh, src ? sheetSizes.get(src) : null, src)
        const sheet = src ? sheetSizes.get(src) : null
        if (!crop?.w || !crop?.h || !sheet?.w || !sheet?.h) return null
        return spritePreviewStyles(crop, sheet, THUMB_PREVIEW_W, THUMB_PREVIEW_H)
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
            img.onload = () => {
                if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                    sheetSizes.set(url, { w: img.naturalWidth, h: img.naturalHeight })
                    sheetSizesVersion.value++
                }
                resolve(true)
            }
            img.onerror = () => resolve(false)
            img.src = url
        })
        sheets.set(url, p)
        while (sheets.size > SHEET_LIMIT) {
            const stale = sheets.keys().next().value
            sheets.delete(stale)
            sheetSizes.delete(stale)
        }
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
            if (segments.value.length && jpgUrl.value) preload(jpgUrl.value)
            return
        }

        const url = meta.value.thumbnailsVttUrl
        if (!videoId.value || !url) return

        if (vttCache.has(url)) {
            segments.value = vttCache.get(url)
            if (segments.value.length && jpgUrl.value) preload(jpgUrl.value)
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
        THUMB_PREVIEW_H,
        activeThumbnail,
        activeThumbnailSrc,
        thumbnailPreview,
        updateActiveThumbnailForTime,
        clearActiveThumbnail,
    }
}
