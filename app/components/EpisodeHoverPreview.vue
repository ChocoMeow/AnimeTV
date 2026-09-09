<script setup>
const resolvedPreviewMetaCache = new Map()
const PREVIEW_META_CACHE_LIMIT = 30
const META_IDLE = 'idle'
const META_LOADING = 'loading'
const META_READY = 'ready'

const props = defineProps({
    open: { type: Boolean, default: false },
    episode: { type: [String, Number], default: null },
    episodeData: { type: Object, default: null },
    watchData: { type: Object, default: null },
    anchorElement: { type: Object, default: null },
})

const emit = defineEmits(['pointerenter', 'pointerleave', 'unavailable'])

const PLAYBACK_RATE = 18
const PREVIEW_WIDTH = 352
const PREVIEW_HEIGHT = 198
const VIEWPORT_INSET = 12
const ANCHOR_GAP = 10

const timelineRef = ref(null)
const previewTime = ref(0)
const isScrubbing = ref(false)
const placement = ref('top')
const position = ref({ left: VIEWPORT_INSET, top: VIEWPORT_INSET })
const resolvedEpisodeData = ref(null)
const metadataState = ref(META_IDLE)

let animationFrame = 0
let lastFrameTime = 0
let leaveAfterScrub = false
let metadataResolveId = 0

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const hasThumbnailMeta = (data) => !!(data?.thumbnail_vtt_text || data?.thumbnails_vtt_url)

const episodeMeta = computed(() => ({
    ...props.episodeData,
    ...resolvedEpisodeData.value,
}))
const animeMeta = computed(() => ({
    videoId: episodeMeta.value.video_id || null,
    thumbnailJpgUrl: episodeMeta.value.thumbnails_jpg_url || null,
    thumbnailVttText: episodeMeta.value.thumbnail_vtt_text || null,
    thumbnailsVttUrl: episodeMeta.value.thumbnails_vtt_url || null,
}))

const {
    hasThumbnails,
    thumbnailDuration,
    isLoading,
    activeThumbnail,
    activeThumbnailSrc,
    thumbnailPreview,
    updateActiveThumbnailForTime,
    clearActiveThumbnail,
} = usePlayerThumbnails({
    animeMeta,
    previewWidth: PREVIEW_WIDTH,
    previewHeight: PREVIEW_HEIGHT,
})

const isVisible = computed(() => props.open && hasThumbnails.value)
const progress = computed(() => {
    if (!thumbnailDuration.value) return 0
    return clamp((previewTime.value / thumbnailDuration.value) * 100, 0, 100)
})
const watchPercentage = computed(() =>
    clamp(Number(props.watchData?.progress_percentage) || 0, 0, 100),
)
const cardStyle = computed(() => ({
    left: `${position.value.left}px`,
    top: `${position.value.top}px`,
    width: `${PREVIEW_WIDTH}px`,
    transformOrigin: placement.value === 'top' ? 'bottom center' : 'top center',
}))

function updatePosition() {
    if (!props.anchorElement || !import.meta.client) return
    const anchor = props.anchorElement.getBoundingClientRect?.()
    if (!anchor) return

    const maxLeft = Math.max(VIEWPORT_INSET, window.innerWidth - PREVIEW_WIDTH - VIEWPORT_INSET)
    const maxTop = Math.max(VIEWPORT_INSET, window.innerHeight - PREVIEW_HEIGHT - VIEWPORT_INSET)
    const roomAbove = anchor.top - VIEWPORT_INSET
    const roomBelow = window.innerHeight - anchor.bottom - VIEWPORT_INSET
    const showAbove = roomAbove >= PREVIEW_HEIGHT + ANCHOR_GAP || roomAbove >= roomBelow
    const desiredTop = showAbove
        ? anchor.top - PREVIEW_HEIGHT - ANCHOR_GAP
        : anchor.bottom + ANCHOR_GAP

    placement.value = showAbove ? 'top' : 'bottom'
    position.value = {
        left: clamp(anchor.left + anchor.width / 2 - PREVIEW_WIDTH / 2, VIEWPORT_INSET, maxLeft),
        top: clamp(desiredTop, VIEWPORT_INSET, maxTop),
    }
}

function stopAnimation() {
    if (animationFrame) cancelAnimationFrame(animationFrame)
    animationFrame = 0
    lastFrameTime = 0
}

function animate(timestamp) {
    if (!isVisible.value) return
    if (!lastFrameTime) lastFrameTime = timestamp
    if (!isScrubbing.value && thumbnailDuration.value > 0) {
        const elapsed = ((timestamp - lastFrameTime) / 1000) * PLAYBACK_RATE
        previewTime.value = (previewTime.value + elapsed) % thumbnailDuration.value
        updateActiveThumbnailForTime(previewTime.value)
    }
    lastFrameTime = timestamp
    animationFrame = requestAnimationFrame(animate)
}

function seekFromPointer(event) {
    const rect = timelineRef.value?.getBoundingClientRect()
    if (!rect?.width || !thumbnailDuration.value) return
    const ratio = clamp((event.clientX - rect.left) / rect.width, 0, 1)
    previewTime.value = ratio * thumbnailDuration.value
    updateActiveThumbnailForTime(previewTime.value)
}

function onPointerDown(event) {
    if (event.button !== 0) return
    isScrubbing.value = true
    timelineRef.value?.setPointerCapture?.(event.pointerId)
    seekFromPointer(event)
}

function onPointerMove(event) {
    if (isScrubbing.value) seekFromPointer(event)
}

function finishScrubbing(event) {
    if (!isScrubbing.value) return
    seekFromPointer(event)
    isScrubbing.value = false
    lastFrameTime = performance.now()
    if (timelineRef.value?.hasPointerCapture?.(event.pointerId)) {
        timelineRef.value.releasePointerCapture(event.pointerId)
    }
    if (leaveAfterScrub) {
        leaveAfterScrub = false
        emit('pointerleave')
    }
}

function onCardPointerEnter() {
    leaveAfterScrub = false
    emit('pointerenter')
}

function onCardPointerLeave() {
    if (isScrubbing.value) {
        leaveAfterScrub = true
        return
    }
    emit('pointerleave')
}

function fetchPreviewMeta(token) {
    let request = resolvedPreviewMetaCache.get(token)
    if (request) return request

    request = $fetch(`/api/episode/${encodeURIComponent(token)}`).then((result) => ({
        video_id: result?.video_id || null,
        thumbnail_vtt_text: result?.thumbnail_vtt_text || null,
        thumbnails_jpg_url: result?.thumbnails_jpg_url || null,
        thumbnails_vtt_url: result?.thumbnails_vtt_url || null,
    }))
    resolvedPreviewMetaCache.set(token, request)
    if (resolvedPreviewMetaCache.size > PREVIEW_META_CACHE_LIMIT) {
        resolvedPreviewMetaCache.delete(resolvedPreviewMetaCache.keys().next().value)
    }
    return request
}

async function resolvePreviewMetadata() {
    const id = ++metadataResolveId
    resolvedEpisodeData.value = null
    metadataState.value = META_IDLE

    if (!props.open) return

    const token = props.episodeData?.token
    if (hasThumbnailMeta(props.episodeData) || !token) {
        metadataState.value = META_READY
        return
    }

    metadataState.value = META_LOADING
    try {
        const result = await fetchPreviewMeta(token)
        if (id !== metadataResolveId) return
        resolvedEpisodeData.value = result
    } catch {
        resolvedPreviewMetaCache.delete(token)
    } finally {
        if (id === metadataResolveId) metadataState.value = META_READY
    }
}

watch(
    [() => props.open, hasThumbnails, isLoading, metadataState],
    ([open, available, loading, state]) => {
        if (open && !available && !loading && state === META_READY) emit('unavailable')
    },
)

watch(
    () => props.episode,
    () => {
        previewTime.value = 0
        isScrubbing.value = false
        clearActiveThumbnail()
    },
)

watch(
    [() => props.open, () => props.episode, () => props.episodeData],
    resolvePreviewMetadata,
    { immediate: true },
)

watch(isVisible, async (visible) => {
    stopAnimation()
    if (!visible) return

    previewTime.value = 0
    await nextTick()
    updatePosition()
    updateActiveThumbnailForTime(previewTime.value)
    animationFrame = requestAnimationFrame(animate)
})

onMounted(() => {
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
})

onBeforeUnmount(() => {
    metadataResolveId++
    stopAnimation()
    window.removeEventListener('resize', updatePosition)
    window.removeEventListener('scroll', updatePosition, true)
})
</script>

<template>
    <Teleport to="body">
        <Transition :name="placement === 'top' ? 'episode-preview-top' : 'episode-preview-bottom'">
            <div
                v-if="isVisible"
                class="episode-preview fixed z-[100] overflow-hidden rounded-xl bg-gray-950 text-white shadow-2xl ring-1 ring-white/15"
                :style="cardStyle"
                @pointerenter="onCardPointerEnter"
                @pointerleave="onCardPointerLeave"
            >
                <div
                    class="relative overflow-hidden rounded-lg bg-black"
                    :style="{ width: `${PREVIEW_WIDTH}px`, height: `${PREVIEW_HEIGHT}px` }"
                >
                    <div
                        v-if="thumbnailPreview"
                        class="absolute overflow-hidden"
                        :style="thumbnailPreview.viewport"
                    >
                        <img
                            :src="activeThumbnailSrc"
                            class="absolute left-0 top-0 block max-w-none select-none"
                            :style="thumbnailPreview.image"
                            alt=""
                            draggable="false"
                        />
                    </div>
                    <img
                        v-else-if="activeThumbnail && activeThumbnailSrc"
                        :src="activeThumbnailSrc"
                        class="absolute inset-0 block h-full w-full select-none object-cover"
                        alt=""
                        draggable="false"
                    />
                    <div
                        v-if="watchData"
                        class="absolute left-2 top-2 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium tabular-nums shadow-lg ring-1 backdrop-blur-md"
                        :class="watchPercentage >= 90
                            ? 'bg-emerald-900/75 text-emerald-50 ring-emerald-300/35'
                            : 'bg-black/60 text-white/90 ring-white/15'"
                        :aria-label="`已觀看 ${watchPercentage}%，上次看到 ${formatTime(watchData.playback_time)}`"
                        :title="`已觀看 ${watchPercentage}% · 上次 ${formatTime(watchData.playback_time)}`"
                    >
                        <span>{{ watchPercentage }}%</span>
                        <span class="h-3 w-px bg-white/25" aria-hidden="true" />
                        <span class="opacity-75">{{ formatTime(watchData.playback_time) }}</span>
                    </div>

                    <div
                        ref="timelineRef"
                        class="preview-timeline group/timeline absolute inset-x-0 bottom-0 z-10 flex h-5 cursor-pointer touch-none items-end"
                        role="slider"
                        aria-label="Preview position"
                        aria-valuemin="0"
                        :aria-valuemax="Math.round(thumbnailDuration)"
                        :aria-valuenow="Math.round(previewTime)"
                        @pointerdown.prevent="onPointerDown"
                        @pointermove.prevent="onPointerMove"
                        @pointerup.prevent="finishScrubbing"
                        @pointercancel="finishScrubbing"
                    >
                        <div class="preview-track relative h-1 w-full origin-bottom overflow-visible rounded-full bg-white/35 shadow-sm">
                            <span
                                class="preview-time pointer-events-none absolute bottom-full mb-2 -translate-x-1/2 rounded bg-black/75 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white opacity-0 shadow"
                                :class="{ 'opacity-100': isScrubbing }"
                                :style="{ left: `clamp(1.5rem, ${progress}%, calc(100% - 1.5rem))` }"
                            >
                                {{ formatTime(previewTime) }}
                            </span>
                            <div
                                class="absolute inset-y-0 left-0 rounded-full bg-white"
                                :style="{ width: `${progress}%` }"
                            >
                                <span
                                    class="preview-thumb absolute right-0 top-1/2 h-3 w-3 translate-x-1/2 -translate-y-1/2 rounded-full bg-white opacity-0 shadow-md"
                                    :class="{ 'opacity-100': isScrubbing }"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<style scoped>
.preview-track,
.preview-thumb {
    transition: height 160ms ease, transform 160ms ease, opacity 160ms ease;
}
.preview-timeline {
    transition: padding 160ms ease;
}
.preview-timeline:hover,
.preview-timeline:focus-within {
    padding: 0 0.5rem 0.25rem;
}
.preview-timeline:hover .preview-track,
.preview-timeline:focus-within .preview-track {
    height: 0.375rem;
    transform: translateY(-2px);
}
.preview-timeline:hover .preview-thumb,
.preview-timeline:focus-within .preview-thumb,
.preview-timeline:hover .preview-time,
.preview-timeline:focus-within .preview-time {
    opacity: 1;
}

.episode-preview-top-enter-active,
.episode-preview-top-leave-active,
.episode-preview-bottom-enter-active,
.episode-preview-bottom-leave-active {
    transition: opacity 180ms ease, transform 220ms cubic-bezier(0.22, 1, 0.36, 1);
}
.episode-preview-top-enter-from,
.episode-preview-top-leave-to {
    opacity: 0;
    transform: translateY(7px) scale(0.96);
}
.episode-preview-bottom-enter-from,
.episode-preview-bottom-leave-to {
    opacity: 0;
    transform: translateY(-7px) scale(0.96);
}

@media (prefers-reduced-motion: reduce) {
    .preview-timeline,
    .preview-track,
    .preview-thumb,
    .episode-preview-top-enter-active,
    .episode-preview-top-leave-active,
    .episode-preview-bottom-enter-active,
    .episode-preview-bottom-leave-active {
        transition-duration: 1ms;
    }
}
</style>
