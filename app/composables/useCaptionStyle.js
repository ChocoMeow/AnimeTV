const STYLE_KEY = 'videoCaptionStyle'

export const CAPTION_SIZES = Object.freeze([
    { id: 'sm', label: '小', class: 'text-xl sm:text-2xl' },
    { id: 'md', label: '中', class: 'text-2xl sm:text-3xl' },
    { id: 'lg', label: '大', class: 'text-3xl sm:text-4xl' },
    { id: 'xl', label: '特大', class: 'text-4xl sm:text-5xl' },
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
    size: 'lg',
    background: true,
    color: '#ffffff',
    opacity: 1,
})

function load() {
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

function save(style) {
    try { localStorage.setItem(STYLE_KEY, JSON.stringify(style)) } catch { /* ignore */ }
}

/** Shared across overlay + settings menu. */
const style = ref(load())

export function useCaptionStyle() {
    function patch(partial) {
        style.value = { ...style.value, ...partial }
        save(style.value)
    }

    function resetStyle() {
        style.value = { ...DEFAULTS }
        save(style.value)
    }

    const sizeClass = computed(
        () => CAPTION_SIZES.find((s) => s.id === style.value.size)?.class || CAPTION_SIZES[2].class,
    )

    return { style, sizeClass, patch, resetStyle, CAPTION_SIZES, CAPTION_COLORS }
}
