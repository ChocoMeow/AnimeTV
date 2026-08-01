<script setup>
const props = defineProps({
    progress: { type: Number, required: true },
    buffered: { type: Number, required: true },
    duration: { type: Number, required: true },
    isDragging: { type: Boolean, default: false },
    isHovering: { type: Boolean, default: false },
    hoverPreviewTime: { type: Number, default: 0 },
    hoverPreviewPosition: { type: Number, default: 0 },
    thumbPreviewW: { type: Number, default: 280 },
    activeThumbnail: { type: Object, default: null },
    activeThumbnailSrc: { type: String, default: null },
    thumbnailPreviewHeight: { type: Number, default: 158 },
    thumbnailImageStyle: { type: Object, default: () => ({}) },
})

const emit = defineEmits([
    'pointerdown',
    'pointermove',
    'pointerup',
    'pointercancel',
    'pointerenter',
    'pointerleave',
])

const progressRef = ref(null)

defineExpose({
    el: computed(() => progressRef.value),
    getBoundingClientRect: () => progressRef.value?.getBoundingClientRect?.() ?? null,
    setPointerCapture: (id) => progressRef.value?.setPointerCapture?.(id),
    releasePointerCapture: (id) => progressRef.value?.releasePointerCapture?.(id),
})
</script>

<template>
    <div class="px-3 sm:px-4 pt-1">
        <div
            ref="progressRef"
            class="relative h-6 sm:h-7 cursor-pointer group flex items-center touch-none"
            @pointerdown="emit('pointerdown', $event)"
            @pointermove="emit('pointermove', $event)"
            @pointerup="emit('pointerup', $event)"
            @pointercancel="emit('pointercancel', $event)"
            @pointerenter="emit('pointerenter')"
            @pointerleave="emit('pointerleave')"
        >
            <div
                class="relative w-full h-1.5 bg-white/30 rounded-full transition-all duration-150 group-hover:h-2"
                :class="{ 'h-2': isDragging }"
            >
                <div
                    class="absolute h-full bg-white/40 rounded-full transition-all duration-300 pointer-events-none"
                    :style="{ width: `${buffered}%` }"
                />
                <div
                    class="absolute h-full bg-white rounded-full pointer-events-none"
                    :class="isDragging ? 'transition-none' : 'transition-all duration-100'"
                    :style="{ width: `${progress}%` }"
                >
                    <div
                        class="absolute right-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-white rounded-full shadow transition-transform duration-150 scale-0 group-hover:scale-100"
                        :class="{ 'scale-100': isDragging || isHovering }"
                    />
                </div>

                <transition name="player-fade">
                    <div
                        v-if="isHovering && !isDragging && duration > 0"
                        class="absolute bottom-full mb-2.5 -translate-x-1/2 pointer-events-none z-[9]"
                        :style="{ left: `${hoverPreviewPosition}%` }"
                    >
                        <div
                            v-if="activeThumbnail && activeThumbnailSrc"
                            class="flex flex-col items-center"
                            :style="{ width: `${thumbPreviewW}px` }"
                        >
                            <div
                                class="thumb-preview-frame relative overflow-hidden rounded-lg shadow-xl"
                                :style="{ width: `${thumbPreviewW}px`, height: `${thumbnailPreviewHeight}px` }"
                            >
                                <img
                                    :src="activeThumbnailSrc"
                                    class="absolute top-0 left-0 block w-auto h-auto"
                                    :style="thumbnailImageStyle"
                                    alt="Thumbnail preview"
                                />
                            </div>
                            <div class="mt-1.5 bg-black/70 backdrop-blur-md text-white px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap tabular-nums text-center">
                                {{ formatTime(hoverPreviewTime) }}
                            </div>
                        </div>
                        <div
                            v-else
                            class="bg-black/70 backdrop-blur-md text-white px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap tabular-nums"
                        >
                            {{ formatTime(hoverPreviewTime) }}
                        </div>
                    </div>
                </transition>
            </div>
        </div>
    </div>
</template>

<style scoped>
.thumb-preview-frame { clip-path: inset(0 round 0.5rem); }
.player-fade-enter-active, .player-fade-leave-active { transition: opacity 0.3s ease; }
.player-fade-enter-from, .player-fade-leave-to { opacity: 0; }
</style>
