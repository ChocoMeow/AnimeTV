<script setup>
/**
 * Video player orchestrator — UI lives in sibling components.
 */
const { isNarrow } = useMobile()
const { formatShortcutKey } = useUserSettings()

const props = defineProps({
    src: { type: String, default: '' },
    isHls: { type: Boolean, default: false },
    startTime: { type: Number, default: 0 },
    autoplay: { type: Boolean, default: false },
    preload: { type: String, default: 'metadata' },
    hasNextEpisode: { type: Boolean, default: true },
    theaterMode: { type: Boolean, default: false },
    shortcuts: { type: Object, default: () => null },
    animeMeta: { type: Object, default: () => ({}) },
    loading: { type: Boolean, default: false },
})

const emit = defineEmits([
    'play', 'pause', 'ended', 'volumechange', 'loadstart', 'loadeddata', 'timeupdate',
    'next-episode', 'previous-episode', 'toggle-theater-mode', 'stream-error',
    'caption-added',
])

const videoRef = ref(null)
const containerRef = ref(null)
const controlsRef = ref(null)

const isPlaying = ref(false)
const isEnded = ref(false)
const currentTime = ref(0)
const duration = ref(0)
const isFullscreen = ref(false)
const buffered = ref(0)
const isLoading = ref(false)
const isBuffering = ref(false)
/** Playing: stall spinner only. Idle: full load overlay. */
const showLoading = computed(() =>
    isPlaying.value
        ? isBuffering.value || props.loading
        : props.loading || isLoading.value || isBuffering.value,
)
const isInitialLoading = computed(() => !isPlaying.value && (props.loading || isLoading.value))
const showRemainingTime = ref(false)

const autoFullscreenEnabled = ref(false)
const showSettings = ref(false)
const settingsPage = ref('main')

let streamErrorTimeout = null
let isUnmounted = false
let startTimeApplied = false

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const clearTimer = (timer) => {
    if (timer) clearTimeout(timer)
    return null
}

function applyStartTimeIfNeeded() {
    if (startTimeApplied) return
    const t = Number(props.startTime)
    if (!(t > 0)) return
    const video = videoRef.value
    if (!video) return
    // canplay also fires after skip/scrub. If playback is already past the
    // resume point, lock it in instead of pulling the playhead backward.
    if (video.currentTime > t + 1) {
        startTimeApplied = true
        return
    }
    seekTo(t)
}

function seekTo(time) {
    const video = videoRef.value
    if (!video) return
    startTimeApplied = true
    const maxTime = Number.isFinite(video.duration) ? video.duration : Infinity
    video.currentTime = clamp(Number(time) || 0, 0, maxTime)
    currentTime.value = video.currentTime
}

function shortcutEntry(action) {
    return props.shortcuts?.[action]
}
function shortcutKey(action) {
    const entry = shortcutEntry(action)
    return typeof entry === 'string' ? entry : entry?.key
}
function shortcutLabel(action, fallback) {
    const entry = shortcutEntry(action)
    return (typeof entry === 'object' && entry?.label) || fallback
}

function togglePlay() {
    const video = videoRef.value
    if (!video) return
    if (isEnded.value) {
        isEnded.value = false
        seekTo(0)
        video.play().catch(() => {})
        return
    }
    if (video.paused) video.play().catch(() => {})
    else video.pause()
}

function skip(seconds) {
    const video = videoRef.value
    if (!video) return
    seekTo(video.currentTime + seconds)
}

async function toggleFullscreen() {
    const video = videoRef.value
    try {
        // iOS Safari: native player — flip selected track to `showing` first (YouTube-style sync).
        if (typeof video?.webkitEnterFullscreen === 'function' && !document.fullscreenEnabled) {
            setNativeVideoFullscreen(true)
            video.webkitEnterFullscreen()
            return
        }
        if (!document.fullscreenElement) await containerRef.value?.requestFullscreen()
        else await document.exitFullscreen()
    } catch {
        setNativeVideoFullscreen(false)
    }
}

function handleFullscreenChange() { isFullscreen.value = !!document.fullscreenElement }
function toggleTheaterMode() { emit('toggle-theater-mode') }

// Seek preview = thumbnail VTT/sprites only (no second video decoder).
const {
    THUMB_PREVIEW_W,
    THUMB_PREVIEW_H,
    hasThumbnails,
    activeThumbnail,
    activeThumbnailSrc,
    thumbnailPreview,
    updateActiveThumbnailForTime,
    clearActiveThumbnail,
} = usePlayerThumbnails({ animeMeta: computed(() => props.animeMeta) })

const {
    AUTOPLAY_COUNTDOWN_SECS,
    PLAYBACK_SPEEDS,
    volume,
    isMuted,
    showControls,
    showVolumeSlider,
    isDraggingProgress,
    isHoveringProgress,
    hoverPreviewTime,
    hoverPreviewPosition,
    playbackRate,
    notification,
    autoplayVisible,
    autoplaySecsLeft,
    autoplayEnabled,
    progress,
    displayTime,
    showNotification,
    resetControlsTimeout,
    handleMouseLeave,
    setPlaybackRate,
    setVolume,
    handleVolumeChange,
    toggleMute,
    handleVolumeAreaEnter,
    handleVolumeAreaLeave,
    syncVolumeFromVideo,
    syncPlaybackRateFromVideo,
    resetAutoplayCountdown,
    dismissAutoplay,
    toggleAutoplay,
    tickAutoplay,
    skipOP,
    handleNextEpisode,
    handleProgressPointerDown,
    handleProgressPointerMove,
    handleProgressPointerUp,
    handleProgressMouseEnter,
    handleProgressMouseLeaveBar,
    loadControlsPreferences,
    bindKeyboardListeners,
    resetForSourceChange,
    dispose: disposeControls,
    applyRateToVideo,
} = usePlayerControls({
    videoRef,
    controlsRef,
    currentTime,
    duration,
    isPlaying,
    isEnded,
    showSettings,
    hasThumbnails,
    updateActiveThumbnailForTime,
    clearActiveThumbnail,
    THUMB_PREVIEW_W,
    getSrc: () => props.src,
    getHasNextEpisode: () => props.hasNextEpisode,
    getShortcuts: () => props.shortcuts,
    shortcutKey,
    shortcutLabel,
    seekTo,
    togglePlay,
    skip,
    toggleFullscreen,
    toggleTheaterMode,
    emit,
})

const {
    hasCaptions,
    captionTracks,
    pendingAiLangs,
    aiLoadingLang,
    aiError,
    resolvedCaptionTracks,
    selectedCaptionLang,
    captionLabel,
    activeCaptionText,
    applyCaptionTracks,
    setCaptionLang: selectCaptionLang,
    toggleCaptions,
    requestAiCaption,
    nativeVideoFullscreen,
    setNativeVideoFullscreen,
} = useVideoCaptions({
    videoRef,
    captions: computed(() => props.animeMeta?.captions),
    aiCaptionLangs: computed(() => props.animeMeta?.aiCaptionLangs),
    episodeToken: computed(() => props.animeMeta?.episodeToken),
    notify: showNotification,
    onCaptionAdded: (track) => emit('caption-added', track),
})

const positionLabel = computed(() => {
    const total = formatDuration(duration.value)
    if (!showRemainingTime.value) return `${formatDuration(displayTime.value)} / ${total}`
    const remaining = Math.max(0, duration.value - displayTime.value)
    return `-${formatDuration(remaining)} / ${total}`
})

const tooltipLabels = computed(() => {
    const tooltip = (action, fallback, transform = (label) => label) => {
        const entry = shortcutEntry(action)
        if (!entry) return fallback
        return `${transform(shortcutLabel(action, fallback))} (${formatShortcutKey(entry)})`
    }
    return {
        playPause: tooltip('playPause', '播放/暫停'),
        replay: tooltip('playPause', '重新播放', () => '重新播放'),
        skipOP: tooltip('skipOP', '跳過片頭'),
        mute: tooltip('mute', '靜音', (label) => label.split('/')[0]),
        nextEpisode: tooltip('nextEpisode', '下一集'),
        fullscreen: tooltip('fullscreen', '全螢幕', (label) => label.split('/')[0]),
        theaterMode: shortcutEntry('theaterMode')
            ? `${props.theaterMode ? '關閉劇院模式' : '劇院模式'} (${formatShortcutKey(shortcutEntry('theaterMode'))})`
            : (props.theaterMode ? '關閉劇院模式' : '劇院模式'),
    }
})

const hidePlaybackCursor = computed(
    () => !!props.src && isPlaying.value && !showControls.value && !autoplayVisible.value,
)

function toggleAutoFullscreen() {
    autoFullscreenEnabled.value = !autoFullscreenEnabled.value
    if (import.meta.client) localStorage.setItem('autoFullscreenEnabled', autoFullscreenEnabled.value)
}

function closeSettings() {
    showSettings.value = false
    settingsPage.value = 'main'
}

function toggleSettings() {
    showSettings.value = !showSettings.value
    if (showSettings.value) settingsPage.value = 'main'
    resetControlsTimeout()
}

function openSettingsPage(page) {
    showSettings.value = true
    settingsPage.value = page
    resetControlsTimeout()
}

function setCaptionLang(lang) {
    selectCaptionLang(lang)
    settingsPage.value = 'main'
    resetControlsTimeout()
}

async function handleRequestAiCaption(lang) {
    const ok = await requestAiCaption(lang)
    if (ok) {
        settingsPage.value = 'main'
        resetControlsTimeout()
    }
}

function onPlay() {
    isPlaying.value = true
    isEnded.value = false
    isLoading.value = false
    isBuffering.value = false
    resetControlsTimeout()
    if (autoFullscreenEnabled.value && !document.fullscreenElement) toggleFullscreen()
    emit('play')
}
function onPause() { isPlaying.value = false; showControls.value = true; emit('pause') }
function onEnded() { isPlaying.value = false; isEnded.value = true; showControls.value = true; resetAutoplayCountdown(); emit('ended') }
function onVolumeChange() {
    syncVolumeFromVideo()
    emit('volumechange')
}
function onRateChange() { syncPlaybackRateFromVideo() }
function onLoadedMetadata() {
    const nextDuration = videoRef.value?.duration
    duration.value = Number.isFinite(nextDuration) ? nextDuration : 0
    applyCaptionTracks()
    applyStartTimeIfNeeded()
}
function onLoadedData() { isLoading.value = false; isBuffering.value = false; emit('loadeddata') }
function onLoadStart() { isLoading.value = true; emit('loadstart') }
function onWaiting() { if (isPlaying.value) isBuffering.value = true }
function onCanPlay() {
    isLoading.value = false
    isBuffering.value = false
    applyStartTimeIfNeeded()
}

function onTimeUpdate() {
    const video = videoRef.value
    if (!video || isDraggingProgress.value) return
    currentTime.value = Number.isFinite(video.currentTime) ? video.currentTime : 0
    if (video.buffered.length && Number.isFinite(video.duration) && video.duration > 0) {
        const end = video.buffered.end(video.buffered.length - 1)
        buffered.value = clamp((end / video.duration) * 100, 0, 100)
    } else {
        buffered.value = 0
    }
    tickAutoplay(video.currentTime)
    emit('timeupdate')
}

function requestStreamRecovery() {
    if (!props.src) return
    streamErrorTimeout = clearTimer(streamErrorTimeout)
    streamErrorTimeout = setTimeout(() => emit('stream-error'), 300)
}

const {
    effectiveVideoSrc,
    qualityLevels,
    selectedQuality,
    qualityLabel,
    setQuality,
    applyVideoSource,
    destroyHls,
    resetRecoveryAttempts,
    bumpSourceGeneration,
    loadPreferredQualityFromStorage,
} = usePlayerHls({
    videoRef,
    startTime: () => props.startTime,
    isLoading,
    isBuffering,
    getIsUnmounted: () => isUnmounted,
    onStartTimeApplied: () => { startTimeApplied = true },
    requestStreamRecovery,
    notify: showNotification,
    onAfterQualityChange: () => {
        settingsPage.value = 'main'
        resetControlsTimeout()
    },
})

function resetPlayerForSource() {
    videoRef.value?.pause()
    streamErrorTimeout = clearTimer(streamErrorTimeout)
    resetForSourceChange()
    resetRecoveryAttempts()
    currentTime.value = 0
    duration.value = 0
    buffered.value = 0
    isPlaying.value = false
    isEnded.value = false
    isLoading.value = !!props.src
    isBuffering.value = false
    closeSettings()
    startTimeApplied = false
}

let activeSource
watch([() => props.src, () => props.isHls, videoRef], ([src, isHls, video]) => {
    if (src !== activeSource) {
        activeSource = src
        resetPlayerForSource()
    }
    if (video) {
        video.playsInline = true
        video.setAttribute('playsinline', '')
        video.setAttribute('webkit-playsinline', '')
        applyRateToVideo()
    }
    applyVideoSource(src, isHls, video)
}, { immediate: true })

function handleDocumentPointerDown(e) {
    if (!showSettings.value || isNarrow.value) return // drawer dismisses itself
    const settingsEl = controlsRef.value?.settingsEl
    const clickedInside = e.composedPath?.().includes(settingsEl) ?? settingsEl?.contains?.(e.target)
    if (!clickedInside) closeSettings()
}

defineExpose({
    videoElement: computed(() => videoRef.value),
    currentTime: computed(() => currentTime.value),
    duration: computed(() => duration.value),
    isPlaying: computed(() => isPlaying.value),
    volume: computed(() => volume.value),
    play: () => videoRef.value?.play().catch(() => {}),
    pause: () => videoRef.value?.pause(),
    seek: (time) => seekTo(time),
    setVolume,
})

onMounted(() => {
    loadControlsPreferences()
    if (import.meta.client) {
        const savedAutoFullscreen = localStorage.getItem('autoFullscreenEnabled')
        if (savedAutoFullscreen !== null) autoFullscreenEnabled.value = savedAutoFullscreen === 'true'
    }
    loadPreferredQualityFromStorage()
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    document.addEventListener('pointerdown', handleDocumentPointerDown)
    bindKeyboardListeners()
})

watch(showControls, (v) => { if (!v) closeSettings() })

onUnmounted(() => {
    isUnmounted = true
    bumpSourceGeneration()
    destroyHls()
    streamErrorTimeout = clearTimer(streamErrorTimeout)
    disposeControls()
    document.removeEventListener('fullscreenchange', handleFullscreenChange)
    document.removeEventListener('pointerdown', handleDocumentPointerDown)
})
</script>

<template>
    <div
        ref="containerRef"
        data-no-ptr
        :class="[
            'relative w-full rounded-lg',
            showSettings ? 'overflow-visible' : 'overflow-hidden',
            hidePlaybackCursor ? 'cursor-none' : 'cursor-default',
            nativeVideoFullscreen ? 'native-video-fs' : 'custom-caption-overlay',
            theaterMode
                ? 'aspect-video bg-black lg:max-h-[calc(100vh-8rem)]'
                : 'aspect-video bg-black/5 dark:bg-white/10',
        ]"
        @mousemove="resetControlsTimeout"
        @mouseleave="handleMouseLeave"
    >
        <video
            v-if="src"
            ref="videoRef"
            playsinline
            webkit-playsinline
            :src="effectiveVideoSrc || undefined"
            :autoplay="autoplay"
            :preload="preload"
            :class="[
                'w-full h-full block',
                hidePlaybackCursor ? 'cursor-none' : 'cursor-pointer',
                theaterMode ? 'object-contain bg-black' : '',
            ]"
            @play="onPlay"
            @pause="onPause"
            @timeupdate="onTimeUpdate"
            @loadedmetadata="onLoadedMetadata"
            @loadeddata="onLoadedData"
            @loadstart="onLoadStart"
            @ended="onEnded"
            @volumechange="onVolumeChange"
            @ratechange="onRateChange"
            @waiting="onWaiting"
            @canplay="onCanPlay"
            @canplaythrough="onCanPlay"
            @error="requestStreamRecovery"
            @click="togglePlay"
        >
            <track
                v-for="cap in resolvedCaptionTracks"
                :key="`${cap.srclang}:${cap.src}`"
                kind="subtitles"
                :label="cap.label"
                :srclang="cap.srclang"
                :src="cap.src"
                @load="applyCaptionTracks"
            />
        </video>

        <PlayerCaptionOverlay
            v-if="!nativeVideoFullscreen"
            :text="activeCaptionText"
            :controls-visible="showControls"
        />

        <PlayerOverlays
            :src="src"
            :is-loading="showLoading"
            :is-buffering="isBuffering && !isInitialLoading"
            :is-playing="isPlaying"
            :show-controls="showControls"
            :is-fullscreen="isFullscreen"
            :anime-meta="animeMeta"
            :has-next-episode="hasNextEpisode"
            :autoplay-visible="autoplayVisible"
            :autoplay-secs-left="autoplaySecsLeft"
            :autoplay-countdown-secs="AUTOPLAY_COUNTDOWN_SECS"
            :next-episode-label="tooltipLabels.nextEpisode"
            :notification="notification"
            @toggle-play="togglePlay"
            @next-episode="handleNextEpisode"
            @dismiss-autoplay="dismissAutoplay"
        />

        <transition name="slide-up">
            <PlayerControls
                v-show="!isInitialLoading && showControls && src"
                ref="controlsRef"
                :progress="progress"
                :buffered="buffered"
                :duration="duration"
                :is-dragging-progress="isDraggingProgress"
                :is-hovering-progress="isHoveringProgress"
                :hover-preview-time="hoverPreviewTime"
                :hover-preview-position="hoverPreviewPosition"
                :thumb-preview-w="THUMB_PREVIEW_W"
                :thumb-preview-h="THUMB_PREVIEW_H"
                :active-thumbnail="activeThumbnail"
                :active-thumbnail-src="activeThumbnailSrc"
                :thumbnail-preview="thumbnailPreview"
                :chapters="animeMeta?.chapters"
                :is-playing="isPlaying"
                :is-ended="isEnded"
                :is-muted="isMuted"
                :volume="volume"
                :show-volume-slider="showVolumeSlider"
                :position-label="positionLabel"
                :show-remaining-time="showRemainingTime"
                :tooltip-labels="tooltipLabels"
                :is-fullscreen="isFullscreen"
                :theater-mode="theaterMode"
                :show-settings="showSettings"
                :settings-page="settingsPage"
                :autoplay-enabled="autoplayEnabled"
                :auto-fullscreen-enabled="autoFullscreenEnabled"
                :playback-rate="playbackRate"
                :playback-speeds="PLAYBACK_SPEEDS"
                :quality-label="qualityLabel"
                :quality-levels="qualityLevels"
                :selected-quality="selectedQuality"
                :has-captions="hasCaptions"
                :caption-label="captionLabel"
                :caption-tracks="captionTracks"
                :selected-caption-lang="selectedCaptionLang || ''"
                :pending-ai-langs="pendingAiLangs"
                :ai-loading-lang="aiLoadingLang || ''"
                :ai-error="aiError || ''"
                @progress-pointerdown="handleProgressPointerDown"
                @progress-pointermove="handleProgressPointerMove"
                @progress-pointerup="handleProgressPointerUp"
                @progress-pointercancel="handleProgressPointerUp"
                @progress-pointerenter="handleProgressMouseEnter"
                @progress-pointerleave="handleProgressMouseLeaveBar"
                @toggle-play="togglePlay"
                @skip-op="skipOP"
                @toggle-mute="toggleMute"
                @volume-change="handleVolumeChange"
                @volume-enter="handleVolumeAreaEnter"
                @volume-leave="handleVolumeAreaLeave"
                @toggle-time-display="showRemainingTime = !showRemainingTime"
                @toggle-captions="toggleCaptions"
                @toggle-settings="toggleSettings"
                @toggle-theater="toggleTheaterMode"
                @toggle-fullscreen="toggleFullscreen"
                @update:settings-page="settingsPage = $event"
                @toggle-autoplay="toggleAutoplay"
                @toggle-auto-fullscreen="toggleAutoFullscreen"
                @open-settings-page="openSettingsPage"
                @set-speed="setPlaybackRate"
                @set-quality="setQuality"
                @set-caption="setCaptionLang"
                @request-ai-caption="handleRequestAiCaption"
            />
        </transition>
    </div>
</template>

<style scoped>
.slide-up-enter-active, .slide-up-leave-active { transition: all 0.3s ease; }
.slide-up-enter-from, .slide-up-leave-to { opacity: 0; transform: translateY(1rem); }

/* Inline only: custom overlay owns captions. Off during iOS native FS so Safari paints the track. */
.custom-caption-overlay :deep(video::cue) {
    opacity: 0;
    color: transparent;
}
.custom-caption-overlay :deep(video::-webkit-media-text-track-container),
.custom-caption-overlay :deep(video::-webkit-media-text-track-display),
.custom-caption-overlay :deep(video::-webkit-media-text-track-background) {
    display: none !important;
    opacity: 0 !important;
    visibility: hidden !important;
}
</style>
