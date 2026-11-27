<script setup>
/** Vaul / iOS sheet — pull down to dismiss (handle, header, or content-at-top). */
const MS = 400
const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)'
const CLOSE_Y = 100
const CLOSE_V = 0.5

const props = defineProps({
    modelValue: { type: Boolean, required: true },
    title: { type: String, default: '' },
    persistent: { type: Boolean, default: false },
    maxHeight: { type: String, default: 'max-h-[90vh]' },
    showDragHandle: { type: Boolean, default: true },
    zClass: { type: String, default: 'z-50' },
})

const emit = defineEmits(['update:modelValue'])

const drawerRef = ref(null)
const contentRef = ref(null)
const teleportTo = shallowRef('body')

let dragging = false
let fromContent = false
let tracking = false
let startX = 0
let startY = 0
let lastY = 0
let lastT = 0
let velocity = 0
let ty = 0
let sheetH = 0

const yOf = (e) => (e.touches ? e.touches[0].clientY : e.clientY)

function close() {
    if (!props.persistent) emit('update:modelValue', false)
}

function lockScroll(on) {
    if (import.meta.client) document.body.style.overflow = on ? 'hidden' : ''
}

function setSheet(y, transition = 'none') {
    const el = drawerRef.value
    if (!el) return
    el.style.transition = transition
    el.style.transform = `translate3d(0, ${y}px, 0)`
}

function begin(y, content = false) {
    if (props.persistent || !drawerRef.value) return
    dragging = true
    fromContent = content
    startY = lastY = y
    lastT = Date.now()
    velocity = ty = 0
    sheetH = drawerRef.value.getBoundingClientRect().height
    setSheet(0)
}

function move(y, e) {
    if (!dragging) return
    const now = Date.now()
    if (now > lastT) velocity = (y - lastY) / (now - lastT)
    lastY = y
    lastT = now
    ty = Math.max(0, y - startY)
    setSheet(ty)
    if (e?.cancelable) e.preventDefault()
}

function end() {
    if (!dragging || !drawerRef.value) return
    const dismiss = !props.persistent && (ty > CLOSE_Y || velocity > CLOSE_V)
    setSheet(dismiss ? sheetH : 0, `transform ${MS}ms ${EASE}`)
    if (dismiss) setTimeout(() => emit('update:modelValue', false), MS)
    dragging = fromContent = tracking = false
    ty = velocity = 0
}

function onHandleStart(e) {
    begin(yOf(e))
    e.preventDefault()
}

function onContentStart(e) {
    if (props.persistent || e.touches?.length !== 1) return
    const { clientX, clientY } = e.touches[0]
    startX = clientX
    startY = lastY = clientY
    lastT = Date.now()
    tracking = true
}

function onContentMove(e) {
    if (!tracking || props.persistent || e.touches?.length !== 1) return
    const t = e.touches[0]
    if (!dragging) {
        const dx = t.clientX - startX
        const dy = t.clientY - startY
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) return (tracking = false)
        if (dy < 8 || (contentRef.value?.scrollTop ?? 0) > 1) {
            if (dy >= 8) tracking = false
            return
        }
        begin(t.clientY, true)
    }
    move(t.clientY, e)
}

function onDocMove(e) {
    if (dragging && !fromContent) move(yOf(e), e)
}

function onDocEnd() {
    if (dragging && !fromContent) end()
}

function onContentEnd() {
    tracking = false
    if (dragging && fromContent) end()
}

function reset() {
    if (!drawerRef.value) return
    drawerRef.value.style.transform = drawerRef.value.style.transition = ''
}

function onKey(e) {
    if (e.key === 'Escape') close()
}

function syncTeleport() {
    teleportTo.value = document.fullscreenElement || 'body'
}

watch(
    () => props.modelValue,
    (open) => {
        if (open) {
            syncTeleport()
            lockScroll(true)
            document.addEventListener('mousemove', onDocMove)
            document.addEventListener('mouseup', onDocEnd)
            document.addEventListener('touchmove', onDocMove, { passive: false })
            document.addEventListener('touchend', onDocEnd)
            nextTick(reset)
        } else {
            document.removeEventListener('mousemove', onDocMove)
            document.removeEventListener('mouseup', onDocEnd)
            document.removeEventListener('touchmove', onDocMove)
            document.removeEventListener('touchend', onDocEnd)
            lockScroll(false)
            dragging = fromContent = tracking = false
            nextTick(reset)
        }
    },
    { immediate: true },
)

onMounted(() => {
    document.addEventListener('keydown', onKey)
    document.addEventListener('fullscreenchange', syncTeleport)
})

onBeforeUnmount(() => {
    document.removeEventListener('keydown', onKey)
    document.removeEventListener('fullscreenchange', syncTeleport)
    document.removeEventListener('mousemove', onDocMove)
    document.removeEventListener('mouseup', onDocEnd)
    document.removeEventListener('touchmove', onDocMove)
    document.removeEventListener('touchend', onDocEnd)
    lockScroll(false)
})
</script>

<template>
    <Teleport :to="teleportTo">
        <Transition name="drawer" appear>
            <div
                v-if="modelValue"
                data-no-ptr
                class="fixed inset-0 flex items-end justify-center bg-black/60"
                :class="zClass"
                @click.self="close()"
            >
                <div
                    ref="drawerRef"
                    class="drawer-sheet flex w-full flex-col rounded-t-3xl bg-white shadow-2xl ring-1 ring-black/5 dark:bg-gray-950 dark:ring-white/10 md:mx-auto md:max-w-[500px]"
                    :class="maxHeight"
                    @click.stop
                >
                    <div
                        v-if="showDragHandle"
                        class="flex shrink-0 cursor-grab touch-none select-none justify-center pb-2 pt-3 active:cursor-grabbing"
                        @mousedown="onHandleStart"
                        @touchstart="onHandleStart"
                    >
                        <div class="h-1.5 w-12 rounded-full bg-black/15 dark:bg-white/20" />
                    </div>

                    <div
                        class="flex shrink-0 cursor-grab touch-none select-none items-center justify-between px-4 pb-4 pt-2 active:cursor-grabbing"
                        @mousedown="onHandleStart"
                        @touchstart="onHandleStart"
                    >
                        <slot name="header">
                            <h3 v-if="title" class="text-xl font-bold text-gray-900 dark:text-white">
                                {{ title }}
                            </h3>
                        </slot>
                    </div>

                    <div
                        ref="contentRef"
                        class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-4"
                        :class="$slots.footer ? 'pb-4' : 'pb-[calc(1rem+env(safe-area-inset-bottom,0px))]'"
                        @touchstart.passive="onContentStart"
                        @touchmove="onContentMove"
                        @touchend="onContentEnd"
                        @touchcancel="onContentEnd"
                    >
                        <slot />
                    </div>

                    <div
                        v-if="$slots.footer"
                        class="shrink-0 px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]"
                    >
                        <slot name="footer" />
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<style scoped>
.drawer-sheet {
    will-change: transform;
    backface-visibility: hidden;
}

.drawer-enter-active,
.drawer-leave-active {
    transition: opacity 400ms cubic-bezier(0.32, 0.72, 0, 1);
}

.drawer-enter-active > .drawer-sheet,
.drawer-leave-active > .drawer-sheet {
    transition: transform 400ms cubic-bezier(0.32, 0.72, 0, 1);
}

.drawer-enter-from,
.drawer-leave-to {
    opacity: 0;
}

.drawer-enter-from > .drawer-sheet,
.drawer-leave-to > .drawer-sheet {
    transform: translate3d(0, 100%, 0);
}

@media (prefers-reduced-motion: reduce) {
    .drawer-enter-active,
    .drawer-leave-active,
    .drawer-enter-active > .drawer-sheet,
    .drawer-leave-active > .drawer-sheet {
        transition-duration: 1ms;
    }
}
</style>
