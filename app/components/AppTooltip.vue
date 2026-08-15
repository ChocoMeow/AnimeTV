<script setup>
const props = defineProps({
    text: { type: String, required: true },
    placement: { type: String, default: 'top' },
    delay: { type: Number, default: 280 },
})

const visible = ref(false)
const anchorRef = ref(null)
const pos = ref({ x: 0, y: 0 })
let showTimer = null
let hideTimer = null

function updatePos() {
    const el = anchorRef.value
    if (!el) return
    const rect = el.getBoundingClientRect()
    const gap = 8
    let x = rect.left + rect.width / 2
    let y = rect.top
    if (props.placement === 'bottom') y = rect.bottom + gap
    else if (props.placement === 'top') y = rect.top - gap
    else if (props.placement === 'left') {
        x = rect.left - gap
        y = rect.top + rect.height / 2
    } else if (props.placement === 'right') {
        x = rect.right + gap
        y = rect.top + rect.height / 2
    }
    pos.value = { x, y }
}

function onEnter() {
    clearTimeout(hideTimer)
    showTimer = setTimeout(() => {
        updatePos()
        visible.value = true
    }, props.delay)
}

function onLeave() {
    clearTimeout(showTimer)
    hideTimer = setTimeout(() => {
        visible.value = false
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
                    class="pointer-events-none fixed z-[10050] max-w-xs rounded-md bg-gray-900 px-2 py-1 text-xs text-white shadow-lg dark:bg-gray-100 dark:text-gray-900"
                    :class="{
                        '-translate-x-1/2 -translate-y-full': placement === 'top',
                        '-translate-x-1/2': placement === 'bottom',
                        '-translate-x-full -translate-y-1/2': placement === 'left',
                        '-translate-y-1/2': placement === 'right',
                    }"
                    :style="{ left: pos.x + 'px', top: pos.y + 'px' }"
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
    transition:
        opacity 0.12s ease,
        transform 0.12s ease;
}
.app-tip-enter-from,
.app-tip-leave-to {
    opacity: 0;
}
</style>
