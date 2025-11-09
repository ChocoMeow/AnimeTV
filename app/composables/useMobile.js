const isMobile = ref(false)
let resizeListenerAdded = false

function checkMobile() {
    if (typeof window !== 'undefined') {
        isMobile.value = window.innerWidth < 768 || "ontouchstart" in window
    }
}

export const useMobile = () => {
    // Set up global resize listener only once
    if (process.client && !resizeListenerAdded) {
        checkMobile()
        window.addEventListener('resize', checkMobile)
        resizeListenerAdded = true
    }

    return {
        isMobile: readonly(isMobile),
        checkMobile
    }
}

