const STYLE_KEY = 'videoCaptionStyle.v2'

/** Size ≈ player height × heightRatio (scales in fullscreen). */
export const CAPTION_SIZES = Object.freeze([
    { id: 'sm', label: '小', heightRatio: 0.032 },
    { id: 'md', label: '中', heightRatio: 0.042 },
    { id: 'lg', label: '大', heightRatio: 0.055 },
    { id: 'xl', label: '特大', heightRatio: 0.07 },
])

export const CAPTION_COLORS = Object.freeze([
    { id: '#ffffff', label: '白' },
    { id: '#ffe566', label: '黃' },
    { id: '#ffb020', label: '橙' },
    { id: '#ff6b6b', label: '紅' },
    { id: '#7dd3fc', label: '藍' },
    { id: '#86efac', label: '綠' },
    { id: '#e9d5ff', label: '紫' },
    { id: '#000000', label: '黑' },
])

const DEFAULTS = Object.freeze({
    size: 'md',
    background: true,
    color: '#ffffff',
    opacity: 1,
})

const MIN_PX = 12
const MAX_PX = 96

function load() {
    if (!import.meta.client) return { ...DEFAULTS }
    try {
        const raw = JSON.parse(localStorage.getItem(STYLE_KEY) || '')
        if (!raw || typeof raw !== 'object') return { ...DEFAULTS }
        return {
            size: CAPTION_SIZES.some((s) => s.id === raw.size) ? raw.size : DEFAULTS.size,
            background: raw.background !== false,
            color: CAPTION_COLORS.some((c) => c.id === raw.color) ? raw.color : DEFAULTS.color,
            opacity: Math.min(1, Math.max(0.3, Number(raw.opacity) || DEFAULTS.opacity)),
        }
    } catch {
        return { ...DEFAULTS }
    }
}

function save(next) {
    if (!import.meta.client) return
    try { localStorage.setItem(STYLE_KEY, JSON.stringify(next)) } catch { /* ignore */ }
}

const style = ref(load())
/** Session drag override; null = auto Y (lifts with controls). */
const customPos = ref(null)

function fontSizePx(box, sizeId = style.value.size) {
    const s = CAPTION_SIZES.find((x) => x.id === sizeId)
        || CAPTION_SIZES.find((x) => x.id === DEFAULTS.size)
    const w = Number(box?.width) || 0
    const h = Number(box?.height) || (w ? w * 9 / 16 : 360)
    return Math.min(MAX_PX, Math.max(MIN_PX, Math.round(h * s.heightRatio)))
}

/** Shared by overlay + settings menu. */
export function useCaptionStyle() {
    const hasCustomPos = computed(() => !!customPos.value)

    function patch(partial) {
        style.value = { ...style.value, ...partial }
        save(style.value)
    }

    function setCustomPos(pos) {
        customPos.value = pos ? { x: pos.x, y: pos.y } : null
    }

    function resetPos() {
        customPos.value = null
    }

    function resetStyle() {
        style.value = { ...DEFAULTS }
        save(style.value)
        resetPos()
    }

    return {
        style,
        customPos,
        hasCustomPos,
        patch,
        setCustomPos,
        resetPos,
        resetStyle,
        fontSizePx,
        CAPTION_SIZES,
        CAPTION_COLORS,
    }
}
