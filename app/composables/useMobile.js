const MD = 768 // Tailwind `md`

const isNarrow = ref(false) // width < md — layout, drawer ↔ dialog
const isMobile = ref(false) // narrow OR touch — PWA chrome, pull-to-refresh
let listening = false

function sync() {
    if (typeof window === 'undefined') return
    const narrow = window.innerWidth < MD
    isNarrow.value = narrow
    isMobile.value = narrow || 'ontouchstart' in window
}

export function useMobile() {
    if (import.meta.client && !listening) {
        sync()
        window.addEventListener('resize', sync)
        listening = true
    }
    return {
        isNarrow: readonly(isNarrow),
        isMobile: readonly(isMobile),
    }
}
