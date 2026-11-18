<script setup>
/**
 * Draggable captions. Auto-lifts above the control bar unless the user set a custom position
 * (double-click or 設定 → 重設位置 to clear).
 */
const props = defineProps({
    text: { type: String, default: '' },
    controlsVisible: { type: Boolean, default: false },
})

const { style: captionStyle, customPos, setCustomPos, resetPos, fontSizePx } = useCaptionStyle()

const DEFAULT_X = 50
const DEFAULT_Y = 88
/** Fixed px lift so fullscreen doesn't jump by a large % of the viewport. */
const CONTROLS_LIFT_PX = 56
const DRAG_THRESHOLD_PX = 6

const el = ref(null)
const playerBox = ref({ width: 0, height: 0 })
const draftPos = ref(null)

let drag = null
let ro = null

const clampPct = (n) => Math.min(95, Math.max(5, n))
const fontSize = computed(() => `${fontSizePx(playerBox.value, captionStyle.value.size)}px`)

const autoY = computed(() => {
    const h = playerBox.value.height || 360
    const lift = props.controlsVisible ? CONTROLS_LIFT_PX : 0
    return clampPct(DEFAULT_Y - (lift / h) * 100)
})

const displayPos = computed(() => {
    if (draftPos.value) return draftPos.value
    if (customPos.value) return customPos.value
    return { x: DEFAULT_X, y: autoY.value }
})

function parentBox() {
    return el.value?.parentElement?.getBoundingClientRect?.() || null
}

function syncPlayerBox() {
    const box = parentBox()
    if (!box?.width || !box?.height) return
    playerBox.value = { width: box.width, height: box.height }
}

function onDown(e) {
    if (e.button != null && e.button !== 0) return
    const box = parentBox()
    if (!box?.width) return
    e.preventDefault()
    e.stopPropagation()
    const origin = displayPos.value
    drag = {
        id: e.pointerId,
        x0: e.clientX,
        y0: e.clientY,
        ox: origin.x,
        oy: origin.y,
        w: box.width,
        h: box.height,
        moved: false,
    }
    draftPos.value = { ...origin }
    el.value.setPointerCapture?.(e.pointerId)
}

function onMove(e) {
    if (!drag || e.pointerId !== drag.id) return
    const dx = e.clientX - drag.x0
    const dy = e.clientY - drag.y0
    if (!drag.moved && dx * dx + dy * dy < DRAG_THRESHOLD_PX ** 2) return
    drag.moved = true
    draftPos.value = {
        x: clampPct(drag.ox + (dx / drag.w) * 100),
        y: clampPct(drag.oy + (dy / drag.h) * 100),
    }
}

function onUp(e) {
    if (!drag || e.pointerId !== drag.id) return
    if (drag.moved && draftPos.value) setCustomPos(draftPos.value)
    draftPos.value = null
    drag = null
}

function onDblClick(e) {
    e.preventDefault()
    e.stopPropagation()
    resetPos()
}

onMounted(() => {
    syncPlayerBox()
    const parent = el.value?.parentElement
    if (parent && typeof ResizeObserver !== 'undefined') {
        ro = new ResizeObserver(syncPlayerBox)
        ro.observe(parent)
    }
    document.addEventListener('fullscreenchange', syncPlayerBox)
})

onBeforeUnmount(() => {
    ro?.disconnect()
    ro = null
    document.removeEventListener('fullscreenchange', syncPlayerBox)
})
</script>

<template>
    <div
        v-show="text"
        ref="el"
        class="absolute z-[6] max-w-[92%] text-center leading-snug select-none touch-none cursor-grab active:cursor-grabbing"
        :class="{
            '[text-shadow:0_1px_3px_rgba(0,0,0,0.9),0_0_6px_rgba(0,0,0,0.7)]': !captionStyle.background,
            'transition-[top] duration-200 ease-out': !draftPos,
        }"
        :style="{
            left: `${displayPos.x}%`,
            top: `${displayPos.y}%`,
            transform: 'translate(-50%, -50%)',
            color: captionStyle.color,
            opacity: captionStyle.opacity,
            fontSize,
        }"
        title="拖曳移動；雙擊重設位置"
        @pointerdown="onDown"
        @pointermove="onMove"
        @pointerup="onUp"
        @pointercancel="onUp"
        @dblclick="onDblClick"
        @click.stop
    >
        <span
            class="whitespace-pre-line"
            :class="{ 'caption-bg': captionStyle.background }"
        >{{ text }}</span>
    </div>
</template>

<style scoped>
/* Per-line bg hugs glyphs — no padded box over the video. */
.caption-bg {
    background: rgba(0, 0, 0, 0.55);
    box-decoration-break: clone;
    -webkit-box-decoration-break: clone;
}
</style>
