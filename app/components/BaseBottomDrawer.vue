<script setup>
const props = defineProps({
    modelValue: {
        type: Boolean,
        required: true,
    },
    title: {
        type: String,
        default: "",
    },
    persistent: {
        type: Boolean,
        default: false,
    },
    maxHeight: {
        type: String,
        default: "max-h-[90vh]",
    },
    showDragHandle: {
        type: Boolean,
        default: true,
    },
})

const emit = defineEmits(["update:modelValue"])

const drawerRef = ref(null)
const contentRef = ref(null)
const isDragging = ref(false)
const startY = ref(0)
const currentTranslateY = ref(0)
const drawerHeight = ref(0)
const initialHeight = ref(0)
const maxDrawerHeight = ref(0)
const contentHeight = ref(0)

const CLOSE_THRESHOLD = 100
const VELOCITY_THRESHOLD = 0.5

let lastY = 0
let lastTime = 0
let velocity = 0

function close() {
    if (!props.persistent) {
        emit("update:modelValue", false)
    }
}

function handleBackdropClick() {
    if (!props.persistent) {
        close()
    }
}

function handleEscape(event) {
    if (event.key === "Escape" && !props.persistent) {
        close()
    }
}

function lockScroll() {
    document.body.style.overflow = "hidden"
}

function unlockScroll() {
    document.body.style.overflow = ""
}

function measureHeights() {
    if (drawerRef.value) {
        const rect = drawerRef.value.getBoundingClientRect()
        drawerHeight.value = rect.height
        initialHeight.value = rect.height
        maxDrawerHeight.value = window.innerHeight * 0.9
    }
    
    if (contentRef.value) {
        // Get the full scrollable content height
        contentHeight.value = contentRef.value.scrollHeight
    }
}

function startDrag(event) {
    if (props.persistent) return
    
    isDragging.value = true
    const clientY = event.touches ? event.touches[0].clientY : event.clientY
    startY.value = clientY
    lastY = clientY
    lastTime = Date.now()
    velocity = 0
    currentTranslateY.value = 0
    
    measureHeights()
    
    if (drawerRef.value) {
        drawerRef.value.style.transition = 'none'
    }
    
    event.preventDefault()
}

function handleDrag(event) {
    if (!isDragging.value || !drawerRef.value) return
    
    const clientY = event.touches ? event.touches[0].clientY : event.clientY
    const currentTime = Date.now()
    const deltaY = clientY - startY.value
    
    // Calculate velocity
    const timeDelta = currentTime - lastTime
    if (timeDelta > 0) {
        velocity = (clientY - lastY) / timeDelta
    }
    lastY = clientY
    lastTime = currentTime
    
    if (deltaY < 0) {
        // Dragging up - expand the drawer
        const expandAmount = Math.abs(deltaY)
        const newHeight = Math.min(initialHeight.value + expandAmount, maxDrawerHeight.value)
        
        // Check if content has overflow (more content to show)
        const hasMoreContent = contentRef.value && contentRef.value.scrollHeight > contentRef.value.clientHeight
        
        if (hasMoreContent || newHeight <= maxDrawerHeight.value) {
            drawerRef.value.style.height = `${newHeight}px`
            currentTranslateY.value = deltaY
        } else {
            // Add resistance if at max height
            const resistance = Math.abs(deltaY) * 0.2
            drawerRef.value.style.transform = `translateY(-${resistance}px)`
            currentTranslateY.value = -resistance
        }
    } else {
        // Dragging down - translate down for closing
        currentTranslateY.value = deltaY
        drawerRef.value.style.transform = `translateY(${deltaY}px)`
        drawerRef.value.style.height = ''
    }
    
    event.preventDefault()
}

function endDrag() {
    if (!isDragging.value || !drawerRef.value) return
    
    const draggedDown = currentTranslateY.value > 0
    const shouldClose = (currentTranslateY.value > CLOSE_THRESHOLD || velocity > VELOCITY_THRESHOLD) && !props.persistent
    
    if (shouldClose) {
        // Close animation
        const remainingDistance = drawerHeight.value - currentTranslateY.value
        const duration = Math.min(300, Math.max(150, remainingDistance / 2))
        
        drawerRef.value.style.transition = `transform ${duration}ms cubic-bezier(0.4, 0, 0.2, 1), height ${duration}ms cubic-bezier(0.4, 0, 0.2, 1)`
        drawerRef.value.style.transform = `translateY(${drawerHeight.value}px)`
        
        setTimeout(() => {
            emit("update:modelValue", false)
        }, duration)
    } else {
        // Snap back to original state
        drawerRef.value.style.transition = 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), height 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)'
        drawerRef.value.style.transform = 'translateY(0)'
        drawerRef.value.style.height = ''
        
        // Reset height after animation
        setTimeout(() => {
            if (drawerRef.value && !isDragging.value) {
                drawerRef.value.style.height = ''
            }
        }, 300)
    }
    
    isDragging.value = false
    startY.value = 0
    currentTranslateY.value = 0
    velocity = 0
}

function resetDrawer() {
    if (drawerRef.value) {
        drawerRef.value.style.transform = ''
        drawerRef.value.style.transition = ''
        drawerRef.value.style.height = ''
    }
}

onMounted(() => {
    watch(
        () => props.modelValue,
        (val) => {
            if (val) {
                lockScroll()
                nextTick(() => {
                    resetDrawer()
                    measureHeights()
                })
            } else {
                unlockScroll()
                nextTick(() => {
                    resetDrawer()
                })
            }
        },
        { immediate: true }
    )
    
    document.addEventListener("keydown", handleEscape)
    document.addEventListener("mousemove", handleDrag)
    document.addEventListener("mouseup", endDrag)
    document.addEventListener("touchmove", handleDrag, { passive: false })
    document.addEventListener("touchend", endDrag)
})

onBeforeUnmount(() => {
    document.removeEventListener("keydown", handleEscape)
    document.removeEventListener("mousemove", handleDrag)
    document.removeEventListener("mouseup", endDrag)
    document.removeEventListener("touchmove", handleDrag)
    document.removeEventListener("touchend", endDrag)
    unlockScroll()
})
</script>

<template>
    <Teleport to="body">
        <Transition name="drawer">
            <div 
                v-if="modelValue" 
                class="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm" 
                @click.self="handleBackdropClick"
            >
                <!-- Drawer Container -->
                <div 
                    ref="drawerRef"
                    class="bg-white dark:bg-gray-950 rounded-t-3xl shadow-2xl w-full will-change-transform" 
                    :class="maxHeight"
                    @click.stop
                >
                    <!-- Drag Handle -->
                    <div 
                        v-if="showDragHandle" 
                        class="flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing select-none touch-none" 
                        @mousedown="startDrag"
                        @touchstart="startDrag"
                    >
                        <div class="w-12 h-1.5 bg-gray-300 dark:bg-gray-600 rounded-full"></div>
                    </div>

                    <!-- Header -->
                    <div 
                        class="flex items-center justify-between px-4 pt-2 pb-4 cursor-grab active:cursor-grabbing select-none touch-none"
                        @mousedown="startDrag"
                        @touchstart="startDrag"
                    >
                        <slot name="header">
                            <h3 v-if="title" class="text-xl font-bold text-gray-900 dark:text-white">
                                {{ title }}
                            </h3>
                        </slot>
                    </div>

                    <!-- Content -->
                    <div 
                        ref="contentRef"
                        class="overflow-y-auto custom-scrollbar px-4 py-4"
                        style="max-height: calc(90vh - 120px);"
                    >
                        <slot />
                    </div>

                    <!-- Footer -->
                    <div v-if="$slots.footer" class="px-4 py-4">
                        <slot name="footer" />
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<style scoped>
.drawer-enter-active,
.drawer-leave-active {
    transition: opacity 0.3s ease-out;
}

.drawer-enter-active > div,
.drawer-leave-active > div {
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.drawer-enter-from {
    opacity: 0;
}

.drawer-enter-from > div {
    transform: translateY(100%);
}

.drawer-leave-to {
    opacity: 0;
}

.drawer-leave-to > div {
    transform: translateY(100%);
}

.custom-scrollbar::-webkit-scrollbar {
    width: 6px;
}

.custom-scrollbar::-webkit-scrollbar-track {
    @apply bg-gray-100 dark:bg-gray-900 rounded-full;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
    @apply bg-gray-300 dark:bg-gray-600 rounded-full;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
    @apply bg-gray-400 dark:bg-gray-500;
}

/* Mobile-first: Hide on larger screens by default, but can be overridden */
@media (min-width: 768px) {
    .drawer-enter-active > div,
    .drawer-leave-active > div {
        max-width: 500px;
        margin: 0 auto;
    }
}
</style>