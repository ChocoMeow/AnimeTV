<template>
    <div
        class="toast-viewport fixed z-50 pointer-events-none inset-x-3 bottom-[calc(4.25rem+(env(safe-area-inset-bottom,0px)/2))] md:inset-x-auto md:right-5 md:bottom-5 md:w-[380px]">
        <TransitionGroup name="toast" tag="div" class="toast-stack"
            :class="{ 'has-toasts': toasts.length, 'is-expanded': expanded }" @mouseenter="expanded = toasts.length > 0"
            @mouseleave="expanded = false">
            <div v-for="(toast, i) in toasts" :key="toast.id" class="toast-layer" :style="layerStyle(i)">
                <div class="toast flex items-center gap-3 pl-3.5 pr-3 py-3 w-full" :class="toast.type" role="status"
                    aria-live="polite">
                    <span class="toast-icon grid place-items-center size-9 rounded-full shrink-0" aria-hidden="true">
                        <span class="material-symbols-rounded toast-glyph">{{ ICONS[toast.type] || ICONS.info }}</span>
                    </span>

                    <div class="flex-1 min-w-0">
                        <p class="text-[14px] font-semibold text-white leading-snug truncate">{{ toast.title }}</p>
                        <p v-if="toast.message" class="text-[12.5px] text-white/70 leading-snug mt-0.5 line-clamp-2">
                            {{ toast.message }}
                        </p>
                    </div>

                    <button type="button" class="toast-close grid place-items-center size-8 rounded-full shrink-0"
                        aria-label="Dismiss" @click="hideToast(toast.id)">
                        <span class="material-symbols-rounded toast-glyph toast-glyph--close">close</span>
                    </button>
                </div>
            </div>
        </TransitionGroup>
    </div>
</template>

<script setup>
const ICONS = {
    info: 'info',
    success: 'check',
    error: 'close',
    warning: 'warning'
}

const { toasts, hideToast } = useToast()
const expanded = ref(false)

watch(
    () => toasts.value.length,
    (n) => {
        if (!n) expanded.value = false
    }
)

const layerStyle = (i) => {
    const depth = expanded.value ? 0 : toasts.value.length - 1 - i
    return {
        '--d': depth,
        zIndex: expanded.value ? 1 : i + 1,
        pointerEvents: expanded.value || depth === 0 ? 'auto' : 'none'
    }
}
</script>

<style scoped>
.toast-stack.has-toasts {
    pointer-events: auto;
}

.toast-stack {
    display: grid;
    width: 100%;
    position: relative;
}

.toast-stack.is-expanded {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
}

.toast-layer {
    grid-area: 1 / 1;
    width: 100%;
    transform-origin: bottom center;
    transition: transform 0.32s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.28s ease;
    transform: translateY(calc(var(--d, 0) * -12px)) scale(calc(1 - var(--d, 0) * 0.05));
    opacity: max(0.5, calc(1 - var(--d, 0) * 0.22));
}

.toast-stack.is-expanded .toast-layer {
    grid-area: auto;
    transform: none;
    opacity: 1;
}

.toast {
    border-radius: 9999px;
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.28), 0 2px 8px rgba(0, 0, 0, 0.16);
}

.toast.info {
    --bg: #1e2f4d;
    --icon: #4f8fd8;
}

.toast.success {
    --bg: #1a3528;
    --icon: #3d9b62;
}

.toast.error {
    --bg: #3d2428;
    --icon: #c45c5c;
}

.toast.warning {
    --bg: #3d2e1a;
    --icon: #c9a03a;
}

.toast {
    background: var(--bg);
}

.toast-icon {
    background: var(--icon);
}

.toast-glyph {
    display: grid;
    place-items: center;
    font-size: 20px;
    line-height: 1;
    width: 1em;
    height: 1em;
    color: #fff;
    font-variation-settings: 'FILL' 1, 'wght' 500, 'GRAD' 0, 'opsz' 20;
}

.toast-glyph--close {
    font-size: 18px;
    color: rgba(255, 255, 255, 0.8);
    font-variation-settings: 'FILL' 0, 'wght' 500, 'GRAD' 0, 'opsz' 20;
}

.toast-close {
    padding: 0;
    border: 1.5px solid transparent;
    background: transparent;
    color: inherit;
    line-height: 0;
    transition: border-color 0.15s, background 0.15s, color 0.15s;
}

.toast-close:hover {
    border-color: rgba(255, 255, 255, 0.55);
    background: rgba(255, 255, 255, 0.06);
}

.toast-close:hover .toast-glyph--close {
    color: #fff;
}

.toast-enter-active,
.toast-leave-active,
.toast-move {
    transition: opacity 0.32s ease, transform 0.36s cubic-bezier(0.22, 1, 0.36, 1);
}

.toast-enter-from {
    opacity: 0 !important;
    transform: translateY(18px) scale(0.96) !important;
}

.toast-leave-to {
    opacity: 0 !important;
    transform: translateY(12px) scale(0.94) !important;
}

.toast-leave-active {
    position: absolute;
    inset-inline: 0;
    bottom: 0;
    pointer-events: none !important;
}

.toast-stack.is-expanded .toast-leave-active {
    bottom: auto;
}
</style>
