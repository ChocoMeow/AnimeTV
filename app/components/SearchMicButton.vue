<script setup>
const props = defineProps({
    listening: { type: Boolean, default: false },
    error: { type: String, default: '' },
    disabled: { type: Boolean, default: false },
    supported: { type: Boolean, default: true },
    /** inset = absolute inside a search field; inline = flex action button */
    variant: { type: String, default: 'inset' },
    idleTitle: { type: String, default: '語音搜尋' },
})

defineEmits(['toggle'])

const shaking = ref(false)
const isInline = computed(() => props.variant === 'inline')
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
    <div :class="isInline ? 'relative shrink-0 self-end' : 'contents'">
        <button
            type="button"
            class="search-mic-pill"
            :class="{
                'is-inline': isInline,
                'is-listening': listening && !error,
                'is-error': !!error,
            }"
            :disabled="disabled"
            :title="error ? undefined : listening ? '停止語音輸入' : idleLabel"
            :aria-pressed="listening"
            @pointerdown.prevent.stop="!disabled && $emit('toggle')"
        >
            <span v-if="!listening" class="material-symbols-rounded text-[1.15rem]" :class="{ 'search-mic-shake': shaking }">{{ micIcon }}</span>
            <span v-else class="search-mic-wave" aria-hidden="true"><i /><i /><i /><i /></span>
        </button>
        <transition name="mic-tip">
            <div v-if="error" class="search-mic-tooltip" :class="{ 'is-inline': isInline }" role="alert">{{ error }}</div>
        </transition>
    </div>
</template>

<style scoped>
.contents {
    display: contents;
}

.search-mic-pill {
    position: absolute;
    top: 0.25rem;
    right: 0.25rem;
    bottom: 0.25rem;
    z-index: 10;
    width: 2.75rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 0;
    padding: 0;
    border-radius: 9999px;
    cursor: pointer;
    outline: none;
    color: #fff;
    background: rgba(0, 0, 0, 0.55);
    transition:
        background-color 0.15s ease,
        color 0.15s ease,
        box-shadow 0.15s ease;
}
.search-mic-pill.is-inline {
    position: relative;
    top: auto;
    right: auto;
    bottom: auto;
    z-index: auto;
    width: 2.25rem;
    height: 2.25rem;
}
.search-mic-pill:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}
.search-mic-pill.is-listening {
    color: #0a0a0a;
    background: #fff;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.08);
}
.search-mic-pill.is-error,
.search-mic-pill.is-error:hover {
    color: #fff;
    background: #ef4444;
    box-shadow: none;
}
:global(html:not(.dark)) .search-mic-pill:not(.is-listening):not(.is-error) {
    color: #0a0a0a;
    background: rgba(0, 0, 0, 0.1);
}

/* Clear hover feedback (skip on coarse touch where :hover sticks) */
@media (hover: hover) and (pointer: fine) {
    .search-mic-pill:not(:disabled):not(.is-listening):not(.is-error):hover {
        background: rgba(255, 255, 255, 0.32);
        color: #fff;
        box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.2);
    }
    :global(html:not(.dark)) .search-mic-pill:not(:disabled):not(.is-listening):not(.is-error):hover {
        background: rgba(0, 0, 0, 0.28);
        color: #0a0a0a;
        box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.12);
    }
    .search-mic-pill.is-listening:not(:disabled):not(.is-error):hover {
        background: #e5e5e5;
        box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.12);
    }
    .search-mic-pill.is-error:not(:disabled):hover {
        background: #dc2626;
    }
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

.search-mic-tooltip {
    position: absolute;
    top: calc(100% + 0.35rem);
    right: 0.25rem;
    z-index: 80;
    width: max-content;
    max-width: min(16rem, 70vw);
    padding: 0.45rem 0.75rem;
    border-radius: 9999px;
    background: #0a0a0a;
    color: #fff;
    font-size: 0.75rem;
    line-height: 1.35;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
    pointer-events: none;
    white-space: normal;
    text-align: left;
    box-sizing: border-box;
}
/* Inline (AI chat): parent is only as wide as the mic — force horizontal tip above it */
.search-mic-tooltip.is-inline {
    top: auto;
    right: 0;
    bottom: calc(100% + 0.4rem);
    left: auto;
    width: max-content;
    max-width: min(14rem, 70vw);
}
.search-mic-tooltip::before {
    content: '';
    position: absolute;
    top: -4px;
    right: 1rem;
    width: 8px;
    height: 8px;
    background: #0a0a0a;
    transform: rotate(45deg);
}
.search-mic-tooltip.is-inline::before {
    top: auto;
    bottom: -4px;
    right: 0.85rem;
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
