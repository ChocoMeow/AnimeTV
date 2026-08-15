<script setup>
const props = defineProps({
    listening: { type: Boolean, default: false },
    error: { type: String, default: '' },
    disabled: { type: Boolean, default: false },
    supported: { type: Boolean, default: true },
    /** inset = absolute inside a search field; inline = flex action button */
    variant: { type: String, default: 'inset' },
    idleTitle: { type: String, default: '語音搜尋' },
    /** Tailwind classes for idle pill surface (bg / text / ring). Passed by parent. */
    idleClass: {
        type: String,
        default: 'bg-black/10 text-gray-900 dark:bg-white/15 dark:text-white',
    },
    /** Tailwind hover classes for idle pill. Passed by parent. */
    hoverClass: {
        type: String,
        default: 'hover:bg-black/20 dark:hover:bg-white/30',
    },
})

defineEmits(['toggle'])

const shaking = ref(false)
const isInline = computed(() => props.variant === 'inline')
const isIdle = computed(() => !props.listening && !props.error)
const micIcon = computed(() => (props.supported ? 'mic' : 'mic_alert'))
const idleLabel = computed(() => (props.supported ? props.idleTitle : '此瀏覽器不支援語音輸入'))

watch(
    () => props.error,
    (msg) => {
        shaking.value = false
        if (!msg) return
        nextTick(() => {
            shaking.value = true
        })
    },
)
</script>

<template>
    <div class="search-mic-root" :class="isInline ? 'is-inline' : 'is-inset'">
        <button
            type="button"
            class="search-mic-pill"
            :class="[
                listening && !error
                    ? 'is-listening bg-gray-900 text-white shadow-[0_0_0_1px_rgba(0,0,0,0.08)] dark:bg-white dark:text-gray-950 dark:shadow-[0_0_0_1px_rgba(255,255,255,0.14)]'
                    : '',
                error
                    ? 'is-error bg-red-500 text-white shadow-none hover:bg-red-600'
                    : '',
                isIdle ? idleClass : '',
                isIdle ? hoverClass : '',
            ]"
            :disabled="disabled"
            :title="error ? undefined : listening ? '停止語音輸入' : idleLabel"
            :aria-pressed="listening"
            @pointerdown.prevent.stop="!disabled && $emit('toggle')"
        >
            <span v-if="!listening" class="material-symbols-rounded text-[1.25rem] leading-none" :class="{ 'search-mic-shake': shaking }">{{ micIcon }}</span>
            <span v-else class="search-mic-wave" aria-hidden="true"><i /><i /><i /><i /></span>
        </button>
        <transition name="mic-tip">
            <div
                v-if="error"
                class="search-mic-tooltip bg-gray-950 text-white shadow-[0_8px_24px_rgba(0,0,0,0.28)] dark:bg-white dark:text-gray-950 dark:shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
                :class="{ 'is-inline': isInline }"
                role="alert"
            >
                {{ error }}
            </div>
        </transition>
    </div>
</template>

<style scoped>
.search-mic-root {
    position: relative;
    z-index: 10;
}
.search-mic-root.is-inset {
    position: absolute;
    top: 50%;
    right: 0.15rem;
    transform: translateY(-50%);
}
.search-mic-root.is-inline {
    flex-shrink: 0;
    align-self: flex-end;
}

.search-mic-pill {
    position: relative;
    width: 2rem;
    height: 2rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 0;
    padding: 0;
    border-radius: 9999px;
    cursor: pointer;
    outline: none;
    transition:
        background-color 0.15s ease,
        color 0.15s ease,
        box-shadow 0.15s ease,
        transform 0.15s ease;
}
.search-mic-root.is-inline .search-mic-pill {
    width: 2.25rem;
    height: 2.25rem;
}
.search-mic-pill:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}
.search-mic-pill:not(:disabled):active {
    transform: scale(0.94);
}

.search-mic-shake {
    display: inline-block;
    animation: search-mic-shake 0.5s ease-in-out;
}
@keyframes search-mic-shake {
    0%,
    100% {
        transform: translateX(0);
    }
    20% {
        transform: translateX(-3px) rotate(-6deg);
    }
    40% {
        transform: translateX(3px) rotate(6deg);
    }
    60% {
        transform: translateX(-2px) rotate(-4deg);
    }
    80% {
        transform: translateX(2px) rotate(4deg);
    }
}

/* Grow left from the mic so the tip stays inside overflow-hidden parents */
.search-mic-tooltip {
    position: absolute;
    top: calc(100% + 0.35rem);
    right: 0;
    left: auto;
    z-index: 80;
    width: max-content;
    max-width: min(16rem, calc(100vw - 2rem));
    padding: 0.45rem 0.75rem;
    border-radius: 9999px;
    font-size: 0.75rem;
    line-height: 1.35;
    pointer-events: none;
    white-space: normal;
    text-align: left;
    box-sizing: border-box;
}
/* Inline (AI chat): tip above the mic */
.search-mic-tooltip.is-inline {
    top: auto;
    bottom: calc(100% + 0.4rem);
    max-width: min(14rem, calc(100vw - 2rem));
}
/* Arrow centered on the mic (half of 2rem / 2.25rem button) */
.search-mic-tooltip::before {
    content: '';
    position: absolute;
    top: -4px;
    right: 1rem;
    left: auto;
    width: 8px;
    height: 8px;
    background: inherit;
    transform: translateX(50%) rotate(45deg);
}
.search-mic-tooltip.is-inline::before {
    top: auto;
    bottom: -4px;
    right: 1.125rem;
}

.mic-tip-enter-active,
.mic-tip-leave-active {
    transition: opacity 0.18s ease, transform 0.18s ease;
}
.mic-tip-enter-from,
.mic-tip-leave-to {
    opacity: 0;
    transform: translateY(-4px);
}
.search-mic-tooltip.is-inline.mic-tip-enter-from,
.search-mic-tooltip.is-inline.mic-tip-leave-to {
    transform: translateY(4px);
}

.search-mic-wave {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 2px;
    height: 0.9rem;
}
.search-mic-wave i {
    display: block;
    width: 2px;
    height: 100%;
    border-radius: 9999px;
    background: currentColor;
    animation: search-mic-wave 0.9s ease-in-out infinite;
}
.search-mic-wave i:nth-child(1) {
    animation-delay: 0s;
    height: 45%;
}
.search-mic-wave i:nth-child(2) {
    animation-delay: 0.12s;
    height: 85%;
}
.search-mic-wave i:nth-child(3) {
    animation-delay: 0.24s;
    height: 60%;
}
.search-mic-wave i:nth-child(4) {
    animation-delay: 0.36s;
    height: 100%;
}
@keyframes search-mic-wave {
    0%,
    100% {
        transform: scaleY(0.45);
        opacity: 0.65;
    }
    50% {
        transform: scaleY(1);
        opacity: 1;
    }
}
</style>
