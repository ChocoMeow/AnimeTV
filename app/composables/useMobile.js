const isMobile = ref(false)
/** Width-only breakpoint (<768). Use for hover UI that should still work on touch laptops. */
const isNarrow = ref(false)
let resizeListenerAdded = false

function checkMobile() {
    if (typeof window !== 'undefined') {
        const narrow = window.innerWidth < 768
        isNarrow.value = narrow
        // Touch devices still use compact chrome, but hover tooltips key off isNarrow instead.
        isMobile.value = narrow || 'ontouchstart' in window
    }
}

export const useMobile = () => {
    // Set up global resize listener only once
    if (import.meta.client && !resizeListenerAdded) {
        checkMobile()
        window.addEventListener('resize', checkMobile)
        resizeListenerAdded = true
    }

    return {
        isMobile: readonly(isMobile),
        isNarrow: readonly(isNarrow),
        checkMobile,
    }
}
