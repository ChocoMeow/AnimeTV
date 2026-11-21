<script setup>
const LABELS = Object.freeze({ intro: '片頭', outro: '片尾' })

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

const emit = defineEmits([
    'pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'pointerenter', 'pointerleave',
])

const progressRef = ref(null)

/** Split [0, duration] on chapter edges; each slice gets local played/buffered %. */
const segments = computed(() => {
    const d = props.duration
    if (!(d > 0)) return []

    const chapters = Object.entries(props.chapters || {}).flatMap(([id, r]) => {
        const start = Math.max(0, +r?.start || 0)
        const end = Math.min(d, +r?.end || 0)
        return end > start ? [{ start, end, label: LABELS[id] || id }] : []
    })

    const cuts = chapters.length
        ? [...new Set([0, d, ...chapters.flatMap((c) => [c.start, c.end])])].sort((a, b) => a - b)
        : [0, d]

    const at = (pct) => (pct / 100) * d
    const t = at(props.progress)
    const b = at(props.buffered)
    const fill = (start, end, time) => {
        const span = end - start
        return span > 0 ? Math.min(100, Math.max(0, ((time - start) / span) * 100)) : 0
    }

    return cuts.slice(0, -1).flatMap((start, i) => {
        const end = cuts[i + 1]
        if (!(end > start)) return []
        return [{
            start,
            end,
            flex: end - start,
            label: chapters.find((c) => start >= c.start && end <= c.end)?.label ?? null,
            played: fill(start, end, t),
            buffered: fill(start, end, b),
        }]
    })
})

const showPreview = computed(() => (props.isHovering || props.isDragging) && props.duration > 0)

/** Index of the segment under the pointer; only that slice thickens. */
const hoverSeg = computed(() => {
    if (!showPreview.value) return -1
    const t = props.hoverPreviewTime
    return segments.value.findIndex((s) => t >= s.start && t <= s.end)
})

const previewTimeLabel = computed(() => {
    const time = formatDuration(props.hoverPreviewTime)
    const hit = hoverSeg.value >= 0 ? segments.value[hoverSeg.value] : null
    return hit?.label ? `${hit.label} · ${time}` : time
})

/** Hold last sprite frame until the next sheet decodes (avoids blank flashes). */
const painted = ref(null)
const fullFrameSrc = ref(null)
const hasThumbPreview = computed(() => !!(painted.value || fullFrameSrc.value))
let paintGen = 0

watch(
    () => ({
        src: props.activeThumbnailSrc,
        preview: props.thumbnailPreview,
        thumb: props.activeThumbnail,
        show: showPreview.value,
    }),
    ({ src, preview, thumb, show }) => {
        if (!show || !thumb || !src) {
            paintGen++
            painted.value = null
            fullFrameSrc.value = null
            return
        }

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
        if (painted.value?.src === src || !painted.value) {
            paintGen++
            painted.value = frame
            return
        }

        const gen = ++paintGen
        const img = new Image()
        img.onload = () => { if (gen === paintGen) painted.value = frame }
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
            <div class="relative w-full h-2.5 flex items-center">
                <div class="flex w-full items-center" :class="segments.length > 1 ? 'gap-[3px]' : ''">
                    <div
                        v-for="(seg, i) in segments"
                        :key="i"
                        class="relative min-w-0 overflow-hidden rounded-full bg-white/30 transition-[height] duration-150"
                        :class="i === hoverSeg ? 'h-2.5' : 'h-1.5'"
                        :style="{ flex: `${seg.flex} 1 0%` }"
                        :title="seg.label || undefined"
                    >
                        <div class="absolute inset-y-0 left-0 bg-white/40" :style="{ width: `${seg.buffered}%` }" />
                        <div
                            class="absolute inset-y-0 left-0 bg-white"
                            :class="isDragging ? '' : 'transition-[width] duration-100'"
                            :style="{ width: `${seg.played}%` }"
                        />
                    </div>
                </div>

                <div
                    class="absolute top-1/2 z-[1] -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                    :class="isDragging ? '' : 'transition-[left] duration-100'"
                    :style="{ left: `${progress}%` }"
                >
                    <div
                        class="w-3.5 h-3.5 bg-white rounded-full shadow transition-transform duration-150 scale-0 group-hover:scale-100"
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
                            class="thumb-preview-frame relative overflow-hidden rounded-xl shadow-xl bg-black"
                            :style="{ width: `${thumbPreviewW}px`, height: `${thumbPreviewH}px` }"
                        >
                            <div v-if="painted" class="absolute overflow-hidden" :style="painted.viewport">
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
.thumb-preview-frame { clip-path: inset(0 round 0.75rem); }
</style>
