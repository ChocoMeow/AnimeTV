<script setup>
/**
 * App open splash for all visitors: centered logo, then zoom-in dismiss after load.
 * Instant coverage comes from an inline head script in nuxt.config (#app-splash-inline); this component
 * hands off from that layer and runs the exit animation.
 */
const INLINE_SPLASH_ID = 'app-splash-inline'
const SPLASH_PENDING_CLASS = 'app-splash-pending'

const splashDone = useState('animehub-app-splash-done', () => false)

function shouldShowSplash() {
    return !splashDone.value
}

const show = ref(false)

onBeforeMount(() => {
    if (shouldShowSplash()) show.value = true
})

function waitForWindowLoad() {
    return new Promise((resolve) => {
        if (typeof document === 'undefined') {
            resolve()
            return
        }
        if (document.readyState === 'complete') resolve()
        else window.addEventListener('load', () => resolve(), { once: true })
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
    await Promise.all([waitForWindowLoad(), new Promise((r) => setTimeout(r, minVisibleMs))])
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
                    class="app-splash-logo block h-[72px] w-[72px] object-cover"
                    src="/icons/icon_512x512.webp"
                    width="72"
                    height="72"
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
    border-radius: 0.875rem;
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
