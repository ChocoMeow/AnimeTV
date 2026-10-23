const MD = 768

const isMobile = ref(false)
const isNarrow = ref(false)
let listening = false

function sync() {
    if (typeof window === 'undefined') return
    const narrow = window.innerWidth < MD
    isNarrow.value = narrow
    // Touch OR narrow — PWA chrome, pull-to-refresh, etc.
    isMobile.value = narrow || 'ontouchstart' in window
}

/** Prefer isNarrow for layout that must match Tailwind `md`. */
export function useMobile() {
    if (import.meta.client && !listening) {
        sync()
        window.addEventListener('resize', sync)
        listening = true
    }
    return {
        isMobile: readonly(isMobile),
        isNarrow: readonly(isNarrow),
    }
}
