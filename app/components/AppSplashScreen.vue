<script setup>
/**
 * App open splash: animated logo WebP.
 * Instant coverage comes from an inline head script in nuxt.config (#app-splash-inline);
 * this component hands off and runs the exit animation. Does not wait for window.load.
 */
const INLINE_SPLASH_ID = 'app-splash-inline'
const SPLASH_PENDING_CLASS = 'app-splash-pending'
const SPLASH_ICON = '/icons/animated_icon_400x400.webp'
const SPLASH_VISIBLE_MS = 450

const splashDone = useState('app-splash-done', () => false)
const show = ref(false)

function shouldShowSplash() {
    return !splashDone.value
}

function removeBootstrapSplash() {
    if (typeof document === 'undefined') return
    document.documentElement.classList.remove(SPLASH_PENDING_CLASS)
    document.getElementById(INLINE_SPLASH_ID)?.remove()
}

onMounted(async () => {
    await nextTick()
    requestAnimationFrame(() => removeBootstrapSplash())

    if (!shouldShowSplash()) return
    show.value = true
    await new Promise((r) => setTimeout(r, SPLASH_VISIBLE_MS))
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
                <AppImage
                    class="app-splash-logo h-36 w-36"
                    :src="SPLASH_ICON"
                    img-class="object-contain"
                    alt=""
                    loading="eager"
                    fetchpriority="high"
                    :placeholder="false"
                    :reveal="false"
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
}

.app-splash-root.app-splash-leave-active {
    transition: opacity 0.42s cubic-bezier(0.4, 0, 0.2, 1);
}

.app-splash-root.app-splash-leave-to {
    opacity: 0;
}

.app-splash-root.app-splash-leave-active .app-splash-logo {
    transform: scale(1.32);
    animation: none;
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
