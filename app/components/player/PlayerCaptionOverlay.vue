<script setup>
/** Draggable caption overlay — style saved in localStorage. */
defineProps({ text: { type: String, default: '' } })

const { style: captionStyle, sizeClass } = useCaptionStyle()

const el = ref(null)
const pos = ref({ x: 50, y: 88 })

let drag = null
const clamp = (n) => Math.min(95, Math.max(5, n))

function onDown(e) {
    if (e.button != null && e.button !== 0) return
    const box = el.value?.parentElement?.getBoundingClientRect()
    if (!box?.width) return
    e.preventDefault()
    e.stopPropagation()
    drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, ox: pos.value.x, oy: pos.value.y, w: box.width, h: box.height }
    el.value.setPointerCapture?.(e.pointerId)
}

function onMove(e) {
    if (!drag || e.pointerId !== drag.id) return
    pos.value = {
        x: clamp(drag.ox + ((e.clientX - drag.x0) / drag.w) * 100),
        y: clamp(drag.oy + ((e.clientY - drag.y0) / drag.h) * 100),
    }
}

function onUp(e) {
    if (!drag || e.pointerId !== drag.id) return
    drag = null
}
</script>

<template>
    <div
        v-show="text"
        ref="el"
        class="absolute z-[6] max-w-[min(92%,44rem)] px-3.5 py-2 rounded-lg text-center leading-snug select-none touch-none cursor-grab active:cursor-grabbing"
        :class="[sizeClass, captionStyle.background ? '' : '[text-shadow:0_1px_3px_rgba(0,0,0,0.9),0_0_6px_rgba(0,0,0,0.7)]']"
        :style="{
            left: `${pos.x}%`,
            top: `${pos.y}%`,
            transform: 'translate(-50%, -50%)',
            color: captionStyle.color,
            opacity: captionStyle.opacity,
            background: captionStyle.background ? 'rgba(0,0,0,0.65)' : 'transparent',
        }"
        title="拖曳移動字幕位置"
        @pointerdown="onDown"
        @pointermove="onMove"
        @pointerup="onUp"
        @pointercancel="onUp"
        @click.stop
    >
        <span class="whitespace-pre-line">{{ text }}</span>
    </div>
</template>
