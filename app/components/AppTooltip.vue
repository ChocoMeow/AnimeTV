<script setup>
const props = defineProps({
    text: { type: String, required: true },
    placement: { type: String, default: 'top' },
    delay: { type: Number, default: 280 },
})

const visible = ref(false)
const ready = ref(false)
const anchorRef = ref(null)
const tipRef = ref(null)
const pos = ref({ left: 0, top: 0 })
let showTimer = null
let hideTimer = null

function placeTip() {
    const anchor = anchorRef.value
    const tip = tipRef.value
    if (!anchor || !tip) return

    const gap = 8
    const pad = 8
    const rect = anchor.getBoundingClientRect()
    const tw = tip.offsetWidth
    const th = tip.offsetHeight
    const vw = window.innerWidth
    const vh = window.innerHeight

    let placement = props.placement
    if (placement === 'top' && rect.top < th + gap + pad) placement = 'bottom'
    else if (placement === 'bottom' && vh - rect.bottom < th + gap + pad) placement = 'top'
    else if (placement === 'left' && rect.left < tw + gap + pad) placement = 'right'
    else if (placement === 'right' && vw - rect.right < tw + gap + pad) placement = 'left'

    let left = rect.left + rect.width / 2 - tw / 2
    let top = rect.top - gap - th
    if (placement === 'bottom') top = rect.bottom + gap
    else if (placement === 'left') {
        left = rect.left - gap - tw
        top = rect.top + rect.height / 2 - th / 2
    } else if (placement === 'right') {
        left = rect.right + gap
        top = rect.top + rect.height / 2 - th / 2
    }

    left = Math.min(Math.max(pad, left), vw - tw - pad)
    top = Math.min(Math.max(pad, top), vh - th - pad)
    pos.value = { left, top }
    ready.value = true
}

function onEnter() {
    clearTimeout(hideTimer)
    showTimer = setTimeout(async () => {
        ready.value = false
        visible.value = true
        await nextTick()
        placeTip()
    }, props.delay)
}

function onLeave() {
    clearTimeout(showTimer)
    hideTimer = setTimeout(() => {
        visible.value = false
        ready.value = false
    }, 80)
}

onUnmounted(() => {
    clearTimeout(showTimer)
    clearTimeout(hideTimer)
})
</script>

<template>
    <span ref="anchorRef" class="inline-flex" @mouseenter="onEnter" @mouseleave="onLeave" @focusin="onEnter" @focusout="onLeave">
        <slot />
        <Teleport to="body">
            <Transition name="app-tip">
                <div
                    v-if="visible"
                    ref="tipRef"
                    class="pointer-events-none fixed z-[10050] max-w-[min(24rem,calc(100vw-1rem))] whitespace-pre-line rounded-md bg-gray-900 px-2.5 py-1.5 text-xs leading-relaxed text-white shadow-lg dark:bg-gray-100 dark:text-gray-900"
                    :class="{ 'opacity-0': !ready }"
                    :style="{ left: pos.left + 'px', top: pos.top + 'px' }"
                    role="tooltip"
                >
                    {{ text }}
                </div>
            </Transition>
        </Teleport>
    </span>
</template>

<style scoped>
.app-tip-enter-active,
.app-tip-leave-active {
    transition: opacity 0.12s ease;
}
.app-tip-enter-from,
.app-tip-leave-to {
    opacity: 0;
}
</style>
