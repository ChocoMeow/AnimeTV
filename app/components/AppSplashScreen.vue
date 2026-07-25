<script setup>
/**
 * App open splash for all visitors: centered logo, then zoom-in dismiss after load or a short cap (offline-safe).
 * Instant coverage comes from an inline head script in nuxt.config (#app-splash-inline); this component
 * hands off from that layer and runs the exit animation.
 */
const INLINE_SPLASH_ID = 'app-splash-inline'
const SPLASH_PENDING_CLASS = 'app-splash-pending'

const splashDone = useState('app-splash-done', () => false)

function shouldShowSplash() {
    return !splashDone.value
}

const show = ref(false)

onBeforeMount(() => {
    if (shouldShowSplash()) show.value = true
})

/** `load` can hang forever offline if a cross-origin stylesheet never completes — cap wait time. */
function waitForWindowLoadOrTimeout(maxMs) {
    return new Promise((resolve) => {
        if (typeof document === 'undefined') {
            resolve()
            return
        }
        if (document.readyState === 'complete') {
            resolve()
            return
        }
        let settled = false
        const done = () => {
            if (settled) return
            settled = true
            resolve()
        }
        window.addEventListener('load', done, { once: true })
        setTimeout(done, maxMs)
    })
}

function removeBootstrapSplash() {
    if (typeof document === 'undefined') return
    document.documentElement.classList.remove(SPLASH_PENDING_CLASS)
    document.getElementById(INLINE_SPLASH_ID)?.remove()
}

onMounted(async () => {
    await nextTick()
    requestAnimationFrame(() => removeBootstrapSplash())

    if (!show.value) return
    const minVisibleMs = 450
    const loadCapMs = 4000
    await Promise.all([
        waitForWindowLoadOrTimeout(loadCapMs),
        new Promise((r) => setTimeout(r, minVisibleMs)),
    ])
    await nextTick()
    show.value = false
})

function onAfterLeave() {
    splashDone.value = true
}
</script>

<template>
    <Teleport to="body">
        <Transition name="app-splash" @after-leave="onAfterLeave">
            <div
                v-if="show"
                class="app-splash-root flex items-center justify-center bg-white dark:bg-gray-950"
                role="status"
                aria-live="polite"
                aria-busy="true"
            >
                <img
                    class="app-splash-logo block h-36 w-36 object-contain"
                    src="/icons/animated_icon_400x400.webp"
                    width="144"
                    height="144"
                    alt=""
                    fetchpriority="high"
                />
            </div>
        </Transition>
    </Teleport>
</template>

<style scoped>
.app-splash-root {
    position: fixed;
    inset: 0;
    z-index: 2147483647;
}

.app-splash-logo {
    transform: scale(1);
    /* border-radius: 1rem; */
}

.app-splash-root.app-splash-leave-active {
    transition: opacity 0.42s cubic-bezier(0.4, 0, 0.2, 1);
}

.app-splash-root.app-splash-leave-to {
    opacity: 0;
}

.app-splash-root.app-splash-leave-active .app-splash-logo {
    transform: scale(1.32);
    transition: transform 0.42s cubic-bezier(0.4, 0, 0.2, 1);
}

@media (prefers-reduced-motion: reduce) {
    .app-splash-root.app-splash-leave-active {
        transition: opacity 0.2s ease-out;
    }

    .app-splash-root.app-splash-leave-active .app-splash-logo {
        transform: none;
        transition: none;
    }
}
</style>
