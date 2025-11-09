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
const isDragging = ref(false)
const dragStartY = ref(0)
const currentY = ref(0)
const initialHeight = ref(0)
const currentHeight = ref(0)

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

function startDrag(event) {
    if (props.persistent) return
    
    isDragging.value = true
    const clientY = event.touches ? event.touches[0].clientY : event.clientY
    dragStartY.value = clientY
    currentY.value = clientY
    
    if (drawerRef.value) {
        const rect = drawerRef.value.getBoundingClientRect()
        initialHeight.value = rect.height
        currentHeight.value = rect.height
    }
    
    // Prevent scrolling while dragging
    event.preventDefault()
}

function handleDrag(event) {
    if (!isDragging.value) return
    
    const clientY = event.touches ? event.touches[0].clientY : event.clientY
    const deltaY = clientY - dragStartY.value
    currentY.value = clientY
    
    if (drawerRef.value) {
        const windowHeight = window.innerHeight
        // Calculate new height: dragging down reduces height, dragging up increases it
        const newHeight = Math.max(200, Math.min(windowHeight * 0.9, initialHeight.value - deltaY))
        currentHeight.value = newHeight
        
        // Apply transform for visual feedback when dragging down
        const translateY = Math.max(0, deltaY)
        drawerRef.value.style.transform = `translateY(${translateY}px)`
        drawerRef.value.style.height = `${newHeight}px`
        drawerRef.value.style.transition = 'none'
        
        // Prevent scrolling while dragging
        event.preventDefault()
    }
}

function endDrag(event) {
    if (!isDragging.value) return
    
    const clientY = event.touches ? (event.changedTouches ? event.changedTouches[0].clientY : event.touches[0].clientY) : event.clientY
    const deltaY = clientY - dragStartY.value
    const threshold = 100 // pixels to drag before closing
    
    if (drawerRef.value) {
        drawerRef.value.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), height 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
        
        // If dragged down significantly, close the drawer
        if (deltaY > threshold && !props.persistent) {
            drawerRef.value.style.transform = 'translateY(100%)'
            setTimeout(() => {
                close()
                resetDrawer()
            }, 300)
        } else {
            const windowHeight = window.innerHeight
            
            // If dragged up significantly, expand to max height
            if (deltaY < -50) {
                drawerRef.value.style.height = `${windowHeight * 0.9}px`
                drawerRef.value.style.transform = 'translateY(0)'
                initialHeight.value = windowHeight * 0.9
            } else {
                // Snap back to original position
                drawerRef.value.style.transform = 'translateY(0)'
                drawerRef.value.style.height = ''
                // Reset to natural height after transition
                setTimeout(() => {
                    if (drawerRef.value && !isDragging.value) {
                        drawerRef.value.style.height = ''
                    }
                }, 300)
            }
        }
    }
    
    isDragging.value = false
    dragStartY.value = 0
    currentY.value = 0
}

function resetDrawer() {
    if (drawerRef.value) {
        drawerRef.value.style.transform = ''
        drawerRef.value.style.height = ''
        drawerRef.value.style.transition = ''
    }
    currentHeight.value = 0
    initialHeight.value = 0
}

onMounted(() => {
    watch(
        () => props.modelValue,
        (val) => {
            if (val) {
                lockScroll()
                // Reset drawer position when opened and capture initial height
                nextTick(() => {
                    resetDrawer()
                    if (drawerRef.value) {
                        const rect = drawerRef.value.getBoundingClientRect()
                        initialHeight.value = rect.height
                        currentHeight.value = rect.height
                    }
                })
            } else {
                unlockScroll()
                resetDrawer()
            }
        },
        { immediate: true }
    )
    document.addEventListener("keydown", handleEscape)
    
    // Add global mouse/touch event listeners for dragging
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
            <div v-if="modelValue" class="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm" @click.self="handleBackdropClick">
                <!-- Drawer Container -->
                <div 
                    ref="drawerRef"
                    class="bg-white dark:bg-gray-800 rounded-t-3xl shadow-2xl w-full transform transition-all" 
                    :class="[maxHeight, { 'transition-none': isDragging }]"
                    @click.stop
                    :style="isDragging ? { height: `${currentHeight}px` } : {}"
                >
                    <!-- Drag Handle -->
                    <div 
                        v-if="showDragHandle" 
                        class="flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing select-none" 
                        @mousedown="startDrag"
                        @touchstart="startDrag"
                    >
                        <div class="w-12 h-1.5 bg-gray-300 dark:bg-gray-600 rounded-full"></div>
                    </div>

                    <!-- Header -->
                    <div 
                        class="flex items-center justify-between px-4 pt-2 pb-4 cursor-grab active:cursor-grabbing select-none"
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
                    <div class="overflow-y-auto custom-scrollbar px-4 py-4" :class="maxHeight">
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

