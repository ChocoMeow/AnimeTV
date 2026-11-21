<script setup>
/** Vaul / iOS sheet motion — snappy without bounce. */
const SHEET_MS = 400
const SHEET_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)'
const CLOSE_THRESHOLD = 100
const VELOCITY_THRESHOLD = 0.5

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
const isDragging = ref(false)
const startY = ref(0)
const currentTranslateY = ref(0)
const drawerHeight = ref(0)
const initialHeight = ref(0)
const maxDrawerHeight = ref(0)
const teleportTo = shallowRef('body')

let lastY = 0
let lastTime = 0
let velocity = 0

const sheetTransition = `transform ${SHEET_MS}ms ${SHEET_EASE}`

function syncTeleportTarget() {
    teleportTo.value = document.fullscreenElement || 'body'
}

function close() {
    if (!props.persistent) emit('update:modelValue', false)
}

function handleEscape(event) {
    if (event.key === 'Escape' && !props.persistent) close()
}

function setScrollLocked(locked) {
    if (import.meta.client) document.body.style.overflow = locked ? 'hidden' : ''
}

function measureHeights() {
    if (!drawerRef.value) return
    const rect = drawerRef.value.getBoundingClientRect()
    drawerHeight.value = rect.height
    initialHeight.value = rect.height
    maxDrawerHeight.value = window.innerHeight * 0.9
}

function startDrag(event) {
    if (props.persistent || !drawerRef.value) return

    isDragging.value = true
    const clientY = event.touches ? event.touches[0].clientY : event.clientY
    startY.value = clientY
    lastY = clientY
    lastTime = Date.now()
    velocity = 0
    currentTranslateY.value = 0
    measureHeights()
    drawerRef.value.style.transition = 'none'
    event.preventDefault()
}

function handleDrag(event) {
    if (!isDragging.value || !drawerRef.value) return

    const clientY = event.touches ? event.touches[0].clientY : event.clientY
    const now = Date.now()
    const deltaY = clientY - startY.value
    const dt = now - lastTime
    if (dt > 0) velocity = (clientY - lastY) / dt
    lastY = clientY
    lastTime = now

    if (deltaY < 0) {
        const newHeight = Math.min(initialHeight.value + Math.abs(deltaY), maxDrawerHeight.value)
        const hasMore = contentRef.value && contentRef.value.scrollHeight > contentRef.value.clientHeight
        if (hasMore || newHeight <= maxDrawerHeight.value) {
            drawerRef.value.style.height = `${newHeight}px`
            drawerRef.value.style.transform = ''
            currentTranslateY.value = deltaY
        } else {
            const resistance = Math.abs(deltaY) * 0.2
            drawerRef.value.style.transform = `translate3d(0, ${-resistance}px, 0)`
            currentTranslateY.value = -resistance
        }
    } else {
        currentTranslateY.value = deltaY
        drawerRef.value.style.transform = `translate3d(0, ${deltaY}px, 0)`
        drawerRef.value.style.height = ''
    }

    event.preventDefault()
}

function endDrag() {
    if (!isDragging.value || !drawerRef.value) return

    const shouldClose =
        (currentTranslateY.value > CLOSE_THRESHOLD || velocity > VELOCITY_THRESHOLD) && !props.persistent

    drawerRef.value.style.transition = sheetTransition

    if (shouldClose) {
        drawerRef.value.style.transform = `translate3d(0, ${drawerHeight.value}px, 0)`
        setTimeout(() => emit('update:modelValue', false), SHEET_MS)
    } else {
        drawerRef.value.style.transform = 'translate3d(0, 0, 0)'
        drawerRef.value.style.height = ''
        setTimeout(() => {
            if (drawerRef.value && !isDragging.value) drawerRef.value.style.height = ''
        }, SHEET_MS)
    }

    isDragging.value = false
    startY.value = 0
    currentTranslateY.value = 0
    velocity = 0
}

function resetDrawer() {
    if (!drawerRef.value) return
    drawerRef.value.style.transform = ''
    drawerRef.value.style.transition = ''
    drawerRef.value.style.height = ''
}

function bindDragListeners() {
    document.addEventListener('mousemove', handleDrag)
    document.addEventListener('mouseup', endDrag)
    document.addEventListener('touchmove', handleDrag, { passive: false })
    document.addEventListener('touchend', endDrag)
}

function unbindDragListeners() {
    document.removeEventListener('mousemove', handleDrag)
    document.removeEventListener('mouseup', endDrag)
    document.removeEventListener('touchmove', handleDrag)
    document.removeEventListener('touchend', endDrag)
}

watch(
    () => props.modelValue,
    (open) => {
        if (open) {
            syncTeleportTarget()
            setScrollLocked(true)
            bindDragListeners()
            nextTick(() => {
                resetDrawer()
                measureHeights()
            })
        } else {
            unbindDragListeners()
            setScrollLocked(false)
            nextTick(resetDrawer)
        }
    },
    { immediate: true },
)

onMounted(() => {
    document.addEventListener('keydown', handleEscape)
    document.addEventListener('fullscreenchange', syncTeleportTarget)
})

onBeforeUnmount(() => {
    document.removeEventListener('keydown', handleEscape)
    document.removeEventListener('fullscreenchange', syncTeleportTarget)
    unbindDragListeners()
    setScrollLocked(false)
})
</script>

<template>
    <Teleport :to="teleportTo">
        <Transition name="drawer">
            <div
                v-if="modelValue"
                data-no-ptr
                class="fixed inset-0 flex items-end justify-center bg-black/60"
                :class="zClass"
                @click.self="persistent ? undefined : close()"
            >
                <div
                    ref="drawerRef"
                    class="drawer-sheet bg-white dark:bg-gray-950 rounded-t-3xl shadow-2xl ring-1 ring-black/5 dark:ring-white/10 w-full flex flex-col md:max-w-[500px] md:mx-auto"
                    :class="maxHeight"
                    @click.stop
                >
                    <div
                        v-if="showDragHandle"
                        class="shrink-0 flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing select-none touch-none"
                        @mousedown="startDrag"
                        @touchstart="startDrag"
                    >
                        <div class="w-12 h-1.5 bg-black/15 dark:bg-white/20 rounded-full" />
                    </div>

                    <div
                        class="shrink-0 flex items-center justify-between px-4 pt-2 pb-4 cursor-grab active:cursor-grabbing select-none touch-none"
                        @mousedown="startDrag"
                        @touchstart="startDrag"
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
/* Vaul sheet: opacity on overlay, transform-only on panel with iOS-like ease */
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
