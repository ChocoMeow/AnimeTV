<script setup>
/** Champagne / platinum markers on the glass seek track. */
const CHAPTER_UI = Object.freeze({
    intro: ['bg-[#E8DCC8]/65', '片頭'],
    outro: ['bg-[#B7C0CC]/55', '片尾'],
})

const props = defineProps({
    progress: { type: Number, required: true },
    buffered: { type: Number, required: true },
    duration: { type: Number, required: true },
    isDragging: { type: Boolean, default: false },
    isHovering: { type: Boolean, default: false },
    hoverPreviewTime: { type: Number, default: 0 },
    hoverPreviewPosition: { type: Number, default: 0 },
    thumbPreviewW: { type: Number, default: 280 },
    thumbPreviewH: { type: Number, default: 158 },
    activeThumbnail: { type: Object, default: null },
    activeThumbnailSrc: { type: String, default: null },
    thumbnailPreview: { type: Object, default: null },
    /** `{ intro?: { start, end }, outro?: { start, end } }` seconds */
    chapters: { type: Object, default: null },
})

const chapterSegments = computed(() => {
    const d = props.duration
    if (!(d > 0) || !props.chapters) return []
    return Object.entries(props.chapters).flatMap(([id, range]) => {
        const start = Math.max(0, Number(range?.start) || 0)
        const end = Math.min(d, Number(range?.end) || 0)
        if (!(end > start)) return []
        const [cls, label] = CHAPTER_UI[id] || ['bg-white/50', id]
        return [{ id, label, class: cls, start, end, left: (start / d) * 100, width: ((end - start) / d) * 100 }]
    })
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

/** Hold last sprite frame until the next sheet decodes (avoids blank flashes). */
const painted = ref(null)
const fullFrameSrc = ref(null)
let paintGen = 0

const showPreview = computed(() =>
    (props.isHovering || props.isDragging) && props.duration > 0,
)
const hasThumbPreview = computed(() => !!(painted.value || fullFrameSrc.value))
const previewTimeLabel = computed(() => {
    const time = formatDuration(props.hoverPreviewTime)
    const hit = chapterSegments.value.find((s) => props.hoverPreviewTime >= s.start && props.hoverPreviewTime <= s.end)
    return hit ? `${hit.label} · ${time}` : time
})

function clearLayers() {
    paintGen++
    painted.value = null
    fullFrameSrc.value = null
}

watch(
    () => ({
        src: props.activeThumbnailSrc,
        preview: props.thumbnailPreview,
        thumb: props.activeThumbnail,
        show: showPreview.value,
    }),
    ({ src, preview, thumb, show }) => {
        if (!show || !thumb || !src) {
            clearLayers()
            return
        }

        // Full-frame thumbs (no #xywh).
        if (!preview) {
            if (thumb.xywh) {
                fullFrameSrc.value = null
                return
            }
            paintGen++
            painted.value = null
            fullFrameSrc.value = src
            return
        }

        fullFrameSrc.value = null
        const frame = { src, viewport: preview.viewport, image: preview.image }

        // Same sheet — crop-only update.
        if (painted.value?.src === src) {
            paintGen++
            painted.value = frame
            return
        }

        const gen = ++paintGen
        if (!painted.value) {
            painted.value = frame
            return
        }

        // Keep current frame until the next sprite sheet is ready.
        const img = new Image()
        img.onload = () => {
            if (gen === paintGen) painted.value = frame
        }
        img.src = src
        if (img.complete && img.naturalWidth > 0) painted.value = frame
    },
    { flush: 'post' },
)

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
                    v-for="seg in chapterSegments"
                    :key="seg.id"
                    class="absolute top-0 h-full rounded-full pointer-events-none"
                    :class="seg.class"
                    :style="{ left: `${seg.left}%`, width: `${seg.width}%` }"
                    :title="seg.label"
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

                <div
                    v-show="showPreview"
                    class="absolute bottom-full mb-2.5 -translate-x-1/2 pointer-events-none z-[9]"
                    :style="{ left: `${hoverPreviewPosition}%` }"
                >
                    <div
                        class="flex flex-col items-center"
                        :style="hasThumbPreview ? { width: `${thumbPreviewW}px` } : undefined"
                    >
                        <div
                            v-if="hasThumbPreview"
                            class="thumb-preview-frame relative overflow-hidden rounded-lg shadow-xl bg-black"
                            :style="{ width: `${thumbPreviewW}px`, height: `${thumbPreviewH}px` }"
                        >
                            <div
                                v-if="painted"
                                class="absolute overflow-hidden"
                                :style="painted.viewport"
                            >
                                <img
                                    :src="painted.src"
                                    class="absolute left-0 top-0 block max-w-none select-none"
                                    :style="painted.image"
                                    alt=""
                                    draggable="false"
                                >
                            </div>
                            <AppImage
                                v-if="fullFrameSrc"
                                :src="fullFrameSrc"
                                alt=""
                                class="absolute inset-0"
                                :placeholder="false"
                                :reveal="false"
                            />
                        </div>
                        <div
                            class="bg-black/70 backdrop-blur-md text-white px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap tabular-nums text-center"
                            :class="{ 'mt-1.5': hasThumbPreview }"
                        >
                            {{ previewTimeLabel }}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.thumb-preview-frame { clip-path: inset(0 round 0.5rem); }
</style>
