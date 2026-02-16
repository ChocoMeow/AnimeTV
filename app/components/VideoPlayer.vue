<script setup>
const { formatShortcutKey } = useUserSettings()

const props = defineProps({
    src: {
        type: String,
        required: true,
    },
    isHls: {
        type: Boolean,
        default: false,
    },
    autoplay: {
        type: Boolean,
        default: false,
    },
    preload: {
        type: String,
        default: "metadata",
    },
    hasNextEpisode: {
        type: Boolean,
        default: true,
    },
    shortcuts: {
        type: Object,
        default: () => null,
    },
})

const emit = defineEmits(["play", "pause", "ended", "volumechange", "loadstart", "loadeddata", "timeupdate", "next-episode", "previous-episode"])

// Refs
const videoRef = ref(null)
const containerRef = ref(null)
const progressRef = ref(null)
const hlsRef = ref(null)
/** When using HLS via hls.js, we must not set video.src; when using native HLS we set this to props.src */
const effectiveVideoSrc = ref("")

// State
const isPlaying = ref(false)
const currentTime = ref(0)
const duration = ref(0)
const volume = ref(1)
const isMuted = ref(false)
const showControls = ref(true)
const isFullscreen = ref(false)
const buffered = ref(0)
const showVolumeSlider = ref(false)
const isLoading = ref(false)
const isHoveringVolume = ref(false)
const isDraggingProgress = ref(false)
const dragPreviewTime = ref(0)
const isHoveringProgress = ref(false)
const hoverPreviewTime = ref(0)
const hoverPreviewPosition = ref(0)
const isSpaceHeld = ref(false)
const originalPlaybackRate = ref(1)
const playbackRate = ref(1)

// Playback speed options
const playbackSpeeds = [0.5, 0.75, 1, 1.25, 1.5, 2, 3]

// Notification state
const notification = ref({
    show: false,
    message: "",
    icon: "",
})

// Timeout refs
let controlsTimeout = null
let notificationTimeout = null
let spacePressTimeout = null

// Computed
const progress = computed(() => {
    const time = isDraggingProgress.value ? dragPreviewTime.value : currentTime.value
    return duration.value > 0 ? (time / duration.value) * 100 : 0
})

const displayTime = computed(() => {
    return isDraggingProgress.value ? dragPreviewTime.value : currentTime.value
})

// Show notification helper
function showNotification(message, icon) {
    notification.value.message = message
    notification.value.icon = icon
    notification.value.show = true

    if (notificationTimeout) {
        clearTimeout(notificationTimeout)
    }

    notificationTimeout = setTimeout(() => {
        notification.value.show = false
    }, 500)
}

// Auto-hide controls
function resetControlsTimeout() {
    showControls.value = true

    if (controlsTimeout) {
        clearTimeout(controlsTimeout)
    }

    if (isPlaying.value) {
        controlsTimeout = setTimeout(() => {
            if (!isHoveringVolume.value) {
                showControls.value = false
                showVolumeSlider.value = false
            }
        }, 3000)
    }
}

function handleMouseMove() {
    resetControlsTimeout()
}

function handleMouseLeave() {
    if (isPlaying.value && !isHoveringVolume.value) {
        showControls.value = false
        showVolumeSlider.value = false
    }
}

// Video controls
function togglePlay() {
    if (!videoRef.value) return

    if (isPlaying.value) {
        videoRef.value.pause()
    } else {
        videoRef.value.play()
    }
}

function skip(seconds) {
    if (!videoRef.value) return
    videoRef.value.currentTime += seconds
}

function skipOP() {
    skip(85) // Skip forward by 1:25 (85 seconds)
    showNotification(props.shortcuts.skipOP.label, "fast_forward")
}

function handleNextEpisode() {
    emit("next-episode")
    showNotification(props.shortcuts.nextEpisode.label, "skip_next")
}

function calculateTimeFromPosition(e) {
    if (!progressRef.value || !videoRef.value) return null

    const rect = progressRef.value.getBoundingClientRect()
    const pos = Math.max(0, Math.min((e.clientX - rect.left) / rect.width, 1))
    return pos * duration.value
}

function handleProgressClick(e) {
    // Only handle click if not dragging
    if (isDraggingProgress.value) return

    const newTime = calculateTimeFromPosition(e)
    if (newTime !== null && videoRef.value) {
        videoRef.value.currentTime = newTime
    }
}

function handleProgressMouseDown(e) {
    e.preventDefault()
    isDraggingProgress.value = true
    isHoveringProgress.value = false

    const newTime = calculateTimeFromPosition(e)
    if (newTime !== null) {
        dragPreviewTime.value = newTime
    }

    // Keep controls visible while dragging
    showControls.value = true
    if (controlsTimeout) {
        clearTimeout(controlsTimeout)
    }
}

function handleProgressHover(e) {
    if (isDraggingProgress.value || !progressRef.value) return

    const rect = progressRef.value.getBoundingClientRect()
    const pos = Math.max(0, Math.min((e.clientX - rect.left) / rect.width, 1))
    hoverPreviewTime.value = pos * duration.value
    hoverPreviewPosition.value = pos * 100
    isHoveringProgress.value = true
}

function handleProgressMouseEnter() {
    isHoveringProgress.value = true
}

function handleProgressMouseLeaveBar() {
    isHoveringProgress.value = false
}

function handleProgressMouseMove(e) {
    if (!isDraggingProgress.value) return
    e.preventDefault()

    // Only update preview, don't seek the video yet
    const newTime = calculateTimeFromPosition(e)
    if (newTime !== null) {
        dragPreviewTime.value = newTime
    }
}

function handleProgressMouseUp(e) {
    if (!isDraggingProgress.value) return
    e.preventDefault()

    // Now actually seek the video to the final position
    const newTime = calculateTimeFromPosition(e)
    if (newTime !== null && videoRef.value) {
        // Update currentTime immediately to prevent visual jump
        currentTime.value = newTime
        videoRef.value.currentTime = newTime
    }

    isDraggingProgress.value = false

    // Resume auto-hide behavior
    if (isPlaying.value) {
        resetControlsTimeout()
    }
}

function handleVolumeChange(e) {
    const newVolume = parseFloat(e.target.value)
    volume.value = newVolume
    if (videoRef.value) {
        videoRef.value.volume = newVolume
    }
    isMuted.value = newVolume === 0

    // Save to localStorage
    if (typeof localStorage !== "undefined") {
        localStorage.setItem("videoVolume", newVolume.toString())
    }
}

function toggleMute() {
    if (!videoRef.value) return

    const newMuted = !isMuted.value
    isMuted.value = newMuted
    videoRef.value.muted = newMuted

    if (newMuted) {
        videoRef.value.volume = 0
    } else {
        videoRef.value.volume = volume.value
        // Save to localStorage when unmuting
        if (typeof localStorage !== "undefined") {
            localStorage.setItem("videoVolume", volume.value.toString())
        }
    }
}

function setPlaybackRate(rate) {
    if (!videoRef.value) return
    playbackRate.value = rate
    videoRef.value.playbackRate = rate
    showNotification(`${rate}x 速度`, "speed")
}

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        containerRef.value?.requestFullscreen()
        isFullscreen.value = true
    } else {
        document.exitFullscreen()
        isFullscreen.value = false
    }
}

function handleVolumeAreaEnter() {
    isHoveringVolume.value = true
    showVolumeSlider.value = true
}

function handleVolumeAreaLeave() {
    isHoveringVolume.value = false
    showVolumeSlider.value = false
}

// Computed for dynamic tooltip labels
const tooltipLabels = computed(() => {
    const shortcuts = props.shortcuts || {}
    return {
        playPause: shortcuts.playPause ? `${shortcuts.playPause.label} (${formatShortcutKey(shortcuts.playPause)})` : "播放/暫停",
        skipOP: shortcuts.skipOP ? `${shortcuts.skipOP.label} (${formatShortcutKey(shortcuts.skipOP)})` : "跳過片頭",
        mute: shortcuts.mute ? `${shortcuts.mute.label.split("/")[0]} (${formatShortcutKey(shortcuts.mute)})` : "靜音",
        nextEpisode: shortcuts.nextEpisode ? `${shortcuts.nextEpisode.label} (${formatShortcutKey(shortcuts.nextEpisode)})` : "下一集",
        fullscreen: shortcuts.fullscreen ? `${shortcuts.fullscreen.label.split("/")[0]} (${formatShortcutKey(shortcuts.fullscreen)})` : "全螢幕",
    }
})

// Video event handlers
function onPlay() {
    isPlaying.value = true
    resetControlsTimeout()
    emit("play")
}

function onPause() {
    isPlaying.value = false
    showControls.value = true
    emit("pause")
}

function onTimeUpdate() {
    if (!videoRef.value) return

    // Don't update currentTime while dragging to prevent jittery behavior
    if (!isDraggingProgress.value) {
        currentTime.value = videoRef.value.currentTime
    }

    // Update buffered
    if (videoRef.value.buffered.length > 0) {
        const bufferedEnd = videoRef.value.buffered.end(videoRef.value.buffered.length - 1)
        buffered.value = (bufferedEnd / videoRef.value.duration) * 100
    }

    emit("timeupdate")
}

function onLoadedMetadata() {
    if (!videoRef.value) return
    duration.value = videoRef.value.duration
}

function onLoadedData() {
    isLoading.value = false
    emit("loadeddata")
}

function onLoadStart() {
    isLoading.value = true
    emit("loadstart")
}

function onWaiting() {
    // Video is waiting for data (buffering)
    if (isPlaying.value) {
        isLoading.value = true
    }
}

function onCanPlay() {
    isLoading.value = false
}

function onCanPlayThrough() {
    isLoading.value = false
}

function onEnded() {
    isPlaying.value = false
    showControls.value = true
    emit("ended")
}

function onVolumeChange() {
    emit("volumechange")
}

// Fullscreen change handler
function handleFullscreenChange() {
    isFullscreen.value = !!document.fullscreenElement
}

// Keyboard shortcuts handler
function handleKeydown(e) {
    if (!videoRef.value || !props.src) return

    const target = e.target
    const isTying = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable
    if (isTying) return

    // Use shortcuts from props (already merged with defaults from useUserSettings)
    const shortcuts = props.shortcuts || {}
    const pressedKey = e.key

    // Get all handled keys from shortcuts
    const handledKeys = Object.values(shortcuts).map(s => typeof s === 'string' ? s : s.key)
    if (handledKeys.includes(pressedKey)) {
        e.preventDefault()
    }

    // Check which action matches the pressed key
    const action = Object.keys(shortcuts).find(key => {
        const shortcut = shortcuts[key]
        return (typeof shortcut === 'string' ? shortcut : shortcut.key) === pressedKey
    })
    
    if (!action) return // No matching shortcut

    // Handle actions based on the shortcut mapping
    if (action === 'playPause') {
        if (!isSpaceHeld.value) {
            isSpaceHeld.value = true
            // Store original playback rate
            if (videoRef.value) {
                originalPlaybackRate.value = videoRef.value.playbackRate || 1
            }
            
            // Set timeout to detect long press (300ms)
            spacePressTimeout = setTimeout(() => {
                if (isSpaceHeld.value && videoRef.value) {
                    videoRef.value.playbackRate = 2
                    showNotification("2x 速度", "fast_forward")
                }
            }, 300)
        }
    } else if (action === 'seekBackward5') {
        skip(-5)
        showNotification(shortcuts.seekBackward5.label, "fast_rewind")
    } else if (action === 'seekForward5') {
        skip(5)
        showNotification(shortcuts.seekForward5.label, "fast_forward")
    } else if (action === 'skipOP') {
        skipOP()
        showNotification(shortcuts.skipOP.label, "fast_forward")
    } else if (action === 'previousEpisode') {
        emit("previous-episode")
        showNotification(shortcuts.previousEpisode.label, "skip_previous")
    } else if (action === 'nextEpisode') {
        handleNextEpisode()
    } else if (action === 'volumeUp') {
        const newVolume = Math.min(1, volume.value + 0.1)
        volume.value = newVolume
        if (videoRef.value) {
            videoRef.value.volume = newVolume
        }
        isMuted.value = false
        if (typeof localStorage !== "undefined") {
            localStorage.setItem("videoVolume", newVolume.toString())
        }
        showNotification(`音量 ${Math.round(newVolume * 100)}%`, newVolume === 0 ? "volume_off" : newVolume < 0.5 ? "volume_down" : "volume_up")
            
    } else if (action === 'volumeDown') {
        const newVolume = Math.max(0, volume.value - 0.1)
        volume.value = newVolume
        if (videoRef.value) {
            videoRef.value.volume = newVolume
        }
        isMuted.value = newVolume === 0
        if (typeof localStorage !== "undefined") {
            localStorage.setItem("videoVolume", newVolume.toString())
        }
        showNotification(`音量 ${Math.round(newVolume * 100)}%`, newVolume === 0 ? "volume_off" : newVolume < 0.5 ? "volume_down" : "volume_up")
    } else if (action === 'mute') {
        const wasMuted = isMuted.value
        toggleMute()
        const labels = shortcuts.mute.label.split("/")
        showNotification(wasMuted ? labels[1] : labels[0], wasMuted ? "volume_up" : "volume_off")
    } else if (action === 'fullscreen') {
        const wasFullscreen = isFullscreen.value
        toggleFullscreen()
        const labels = shortcuts.fullscreen.label.split("/")
        showNotification(wasFullscreen ? labels[1] : labels[0], wasFullscreen ? "fullscreen_exit" : "fullscreen")
    } else if (action === 'seekBackward10') {
        skip(-10)
        showNotification(shortcuts.seekBackward10.label, "fast_rewind")
    } else if (action === 'seekForward10') {
        skip(10)
        showNotification(shortcuts.seekForward10.label, "fast_forward")
    }
}

// Handle keyup for playPause shortcut (long press release)
function handleKeyup(e) {
    if (!videoRef.value || !props.src) return

    const target = e.target
    const isTying = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable
    if (isTying) return
    
    // Use shortcuts from props (already merged with defaults from useUserSettings)
    const shortcuts = props.shortcuts || {}
    const releasedKey = e.key
    
    // Check if the released key matches the playPause shortcut
    const playPauseKey = typeof shortcuts.playPause === 'string' ? shortcuts.playPause : shortcuts.playPause?.key
    if (playPauseKey === releasedKey) {
        e.preventDefault()
        
        // Clear the long press timeout
        if (spacePressTimeout) {
            clearTimeout(spacePressTimeout)
            spacePressTimeout = null
        }
        
        // If the key was held and speed was changed, reset it
        if (isSpaceHeld.value) {
            const wasLongPress = videoRef.value && videoRef.value.playbackRate === 2
            
            // Reset playback rate to original
            if (videoRef.value && wasLongPress) {
                videoRef.value.playbackRate = originalPlaybackRate.value
                showNotification("正常速度", "play_arrow")
            } else {
                // Single press - toggle play/pause
                togglePlay()
            }
            
            isSpaceHeld.value = false
        }
    }
}

// Expose video element and methods for parent access
defineExpose({
    videoElement: computed(() => videoRef.value),
    currentTime: computed(() => currentTime.value),
    duration: computed(() => duration.value),
    isPlaying: computed(() => isPlaying.value),
    volume: computed(() => volume.value),
    play: () => videoRef.value?.play(),
    pause: () => videoRef.value?.pause(),
    seek: (time) => {
        if (videoRef.value) {
            videoRef.value.currentTime = time
        }
    },
    setVolume: (vol) => {
        volume.value = vol
        if (videoRef.value) {
            videoRef.value.volume = vol
        }
    },
})

// Load saved volume and setup event listeners
onMounted(() => {
    if (typeof localStorage !== "undefined") {
        const savedVolume = localStorage.getItem("videoVolume")
        if (savedVolume !== null) {
            const vol = parseFloat(savedVolume)
            volume.value = vol
            isMuted.value = vol === 0
        }
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange)
    window.addEventListener("keydown", handleKeydown)
    window.addEventListener("keyup", handleKeyup)
    document.addEventListener("mousemove", handleProgressMouseMove)
    document.addEventListener("mouseup", handleProgressMouseUp)
})

// Watch for video element ready and apply saved volume
watch(videoRef, (newVideo) => {
    if (newVideo) {
        if (volume.value !== 1) {
            newVideo.volume = volume.value
            newVideo.muted = isMuted.value
        }
        newVideo.playbackRate = playbackRate.value
    }
})

onUnmounted(() => {
    if (hlsRef.value) {
        hlsRef.value.destroy()
        hlsRef.value = null
    }
    if (controlsTimeout) {
        clearTimeout(controlsTimeout)
    }
    if (notificationTimeout) {
        clearTimeout(notificationTimeout)
    }
    if (spacePressTimeout) {
        clearTimeout(spacePressTimeout)
    }
    document.removeEventListener("fullscreenchange", handleFullscreenChange)
    window.removeEventListener("keydown", handleKeydown)
    window.removeEventListener("keyup", handleKeyup)
    document.removeEventListener("mousemove", handleProgressMouseMove)
    document.removeEventListener("mouseup", handleProgressMouseUp)
})

// HLS setup / teardown when src, isHls, or videoRef change
async function applyHlsOrSrc() {
    const { src, isHls } = props
    const video = videoRef.value

    if (hlsRef.value) {
        hlsRef.value.destroy()
        hlsRef.value = null
    }

    if (!src) {
        effectiveVideoSrc.value = ""
        return
    }

    if (!isHls) {
        effectiveVideoSrc.value = src
        return
    }

    if (!video) {
        effectiveVideoSrc.value = ""
        return
    }

    const Hls = (await import("hls.js")).default
    if (Hls.isSupported()) {
        effectiveVideoSrc.value = ""
        const hls = new Hls()
        hlsRef.value = hls
        hls.loadSource(src)
        hls.attachMedia(video)
        hls.on(Hls.Events.ERROR, (_, data) => {
            if (data.fatal) {
                hls.destroy()
                hlsRef.value = null
            }
        })
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        effectiveVideoSrc.value = src
    } else {
        effectiveVideoSrc.value = src
    }
}

watch(
    [() => props.src, () => props.isHls, videoRef],
    () => { applyHlsOrSrc() },
    { immediate: true }
)

// Watch for src changes (reset playback state)
watch(
    () => props.src,
    () => {
        currentTime.value = 0
        duration.value = 0
        isPlaying.value = false
        buffered.value = 0
        isSpaceHeld.value = false
        originalPlaybackRate.value = 1
        playbackRate.value = 1
        if (videoRef.value) {
            videoRef.value.playbackRate = 1
        }
        // Clear any pending space press timeout
        if (spacePressTimeout) {
            clearTimeout(spacePressTimeout)
            spacePressTimeout = null
        }
    }
)
</script>

<template>
    <div ref="containerRef" class="relative w-full aspect-video bg-gray-950/5 dark:bg-white/10 rounded-lg overflow-hidden cursor-default"
        @mousemove="handleMouseMove" @mouseleave="handleMouseLeave">
        <!-- Video Element -->
        <video v-if="src" ref="videoRef" :src="effectiveVideoSrc || undefined" :autoplay="autoplay" :preload="preload" class="w-full h-full block cursor-pointer"
            @play="onPlay" @pause="onPause" @timeupdate="onTimeUpdate" @loadedmetadata="onLoadedMetadata"
            @loadeddata="onLoadedData" @loadstart="onLoadStart" @ended="onEnded" @volumechange="onVolumeChange"
            @waiting="onWaiting" @canplay="onCanPlay" @canplaythrough="onCanPlayThrough"
            @click="togglePlay" />

        <!-- No Video Message -->
        <div v-else class="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
            <span class="material-icons text-4xl sm:text-6xl mb-4 opacity-50">play_circle_outline</span>
            <p class="text-base sm:text-lg">無可用影片</p>
        </div>

        <!-- Loading Indicator -->
        <div v-if="isLoading && src"
            class="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-10">
            <div
                class="w-10 h-10 sm:w-12 sm:h-12 border-4 border-gray-300 dark:border-gray-600 border-t-gray-900 dark:border-t-gray-100 rounded-full animate-spin mb-4">
            </div>
            <p class="text-white text-sm sm:text-base">載入影片中...</p>
        </div>

        <!-- Center Play/Pause Button -->
        <transition name="fade">
            <div v-show="!isLoading && showControls && src"
                class="absolute inset-0 flex items-center justify-center pointer-events-none z-[2]">
                <button @click="togglePlay"
                    class="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white/20 backdrop-blur-md border-2 border-white/40 flex items-center justify-center cursor-pointer pointer-events-auto transition-all duration-300 hover:bg-white/30 hover:scale-110 active:scale-95">
                    <span v-if="isPlaying" class="material-icons text-white text-3xl sm:text-[2.5rem]">pause</span>
                    <span v-else class="material-icons text-white text-3xl sm:text-[2.5rem]">play_arrow</span>
                </button>
            </div>
        </transition>

        <!-- Custom Controls -->
        <transition name="slide-up">
            <div v-show="!isLoading && showControls && src"
                class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/70 to-transparent z-[3] pb-2 sm:pb-4">
                <!-- Progress Bar -->
                <div class="px-3 sm:px-6 pt-4 sm:pt-8 pb-2 sm:pb-3">
                    <div ref="progressRef"
                        class="relative h-1 sm:h-1.5 bg-white/20 rounded-full cursor-pointer transition-all duration-200 hover:h-1.5 sm:hover:h-2 group"
                        :class="{ 'h-1.5 sm:h-2': isDraggingProgress }" @click="handleProgressClick"
                        @mousedown="handleProgressMouseDown" @mousemove="handleProgressHover"
                        @mouseenter="handleProgressMouseEnter" @mouseleave="handleProgressMouseLeaveBar">
                        <!-- Buffered Progress -->
                        <div class="absolute h-full bg-white/30 rounded-full transition-all duration-300 pointer-events-none"
                            :style="{ width: `${buffered}%` }" />

                        <!-- Played Progress -->
                        <div class="absolute h-full bg-white rounded-full pointer-events-none"
                            :class="isDraggingProgress ? 'transition-none' : 'transition-all duration-100'"
                            :style="{ width: `${progress}%` }">
                            <div class="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 sm:w-3 sm:h-3 bg-white rounded-full shadow-lg transition-opacity duration-200"
                                :class="isDraggingProgress || isHoveringProgress ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'" />
                        </div>

                        <!-- Hover Time Preview Tooltip -->
                        <transition name="fade">
                            <div v-if="isHoveringProgress && !isDraggingProgress && duration > 0"
                                class="absolute bottom-full mb-2 -translate-x-1/2 pointer-events-none"
                                :style="{ left: `${hoverPreviewPosition}%` }">
                                <div
                                    class="bg-black/90 backdrop-blur-md text-white px-2 py-1 rounded text-xs font-medium whitespace-nowrap shadow-lg">
                                    {{ formatTime(hoverPreviewTime) }}
                                </div>
                            </div>
                        </transition>
                    </div>
                </div>

                <!-- Control Buttons -->
                <div class="flex items-center justify-between px-2 sm:px-6 gap-1 sm:gap-0">
                    <div class="flex items-center gap-1 sm:gap-3">
                        <!-- Play/Pause -->
                        <button @click="togglePlay"
                            class="text-white bg-transparent border-none cursor-pointer transition-all duration-200 p-1 sm:p-2 rounded-md flex items-center justify-center hover:text-gray-300 hover:bg-white/10"
                            :title="tooltipLabels.playPause">
                            <span v-if="isPlaying" class="material-icons text-xl sm:text-2xl">pause</span>
                            <span v-else class="material-icons text-xl sm:text-2xl">play_arrow</span>
                        </button>

                        <!-- Skip OP -->
                        <button @click="skipOP"
                            class="text-white bg-transparent border-none cursor-pointer transition-all duration-200 p-1 sm:p-2 rounded-md flex items-center justify-center hover:text-gray-300 hover:bg-white/10"
                            :title="tooltipLabels.skipOP">
                            <span class="material-icons text-xl sm:text-2xl">fast_forward</span>
                        </button>

                        <!-- Volume Control -->
                        <div class="relative flex items-center gap-1 sm:gap-2" @mouseenter="handleVolumeAreaEnter" @mouseleave="handleVolumeAreaLeave">
                            <button @click="toggleMute"
                                class="text-white bg-transparent border-none cursor-pointer transition-all duration-200 p-1 sm:p-2 rounded-md flex items-center justify-center hover:text-gray-300 hover:bg-white/10"
                                :title="tooltipLabels.mute">
                                <span v-if="isMuted || volume === 0"
                                    class="material-icons text-xl sm:text-2xl">volume_off</span>
                                <span v-else-if="volume < 0.5"
                                    class="material-icons text-xl sm:text-2xl">volume_down</span>
                                <span v-else class="material-icons text-xl sm:text-2xl">volume_up</span>
                            </button>

                            <transition name="fade-slide">
                                <input v-show="showVolumeSlider" type="range" min="0" max="1" step="0.1"
                                    :value="isMuted ? 0 : volume" @input="handleVolumeChange" @mousedown.stop
                                    class="hidden sm:block w-20 h-1 bg-white/20 rounded-full outline-none appearance-none cursor-pointer z-[2] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-none [&::-moz-range-thumb]:cursor-pointer" />
                            </transition>
                        </div>

                        <!-- Time Display -->
                        <span class="text-white text-xs sm:text-sm font-medium whitespace-nowrap"
                            :class="{ 'text-gray-300': isDraggingProgress }">
                            {{ formatTime(displayTime) }} / {{ formatTime(duration) }}
                        </span>
                    </div>

                    <div class="flex items-center gap-1 sm:gap-3">
                        <!-- Playback Speed Control -->
                        <div class="relative flex items-center group">
                            <button
                                class="text-white bg-transparent border-none cursor-pointer transition-all duration-200 p-1 sm:p-2 rounded-md flex items-center justify-center hover:text-gray-300 hover:bg-white/10"
                                title="播放速度">
                                <span class="text-xs sm:text-sm font-medium">{{ playbackRate }}x</span>
                            </button>

                            <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-black/90 backdrop-blur-md rounded-lg shadow-2xl border border-white/20 py-2 z-[4] min-w-[80px] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 transform translate-y-2 group-hover:translate-y-0">
                                <button
                                    v-for="speed in playbackSpeeds"
                                    :key="speed"
                                    @click="setPlaybackRate(speed)"
                                    class="w-full px-4 py-2 text-left text-white text-sm hover:bg-white/10 transition-colors flex items-center justify-between"
                                    :class="{ 'bg-gray-500/30 text-gray-300': playbackRate === speed }">
                                    <span>{{ speed }}x</span>
                                    <span v-if="playbackRate === speed" class="material-icons text-sm">check</span>
                                </button>
                            </div>
                        </div>
                        
                        <!-- Next Episode -->
                        <button v-if="hasNextEpisode" @click="handleNextEpisode"
                            class="text-white bg-transparent border-none cursor-pointer transition-all duration-200 p-1 sm:p-2 rounded-md flex items-center justify-center hover:text-gray-300 hover:bg-white/10"
                            :title="tooltipLabels.nextEpisode">
                            <span class="material-icons text-xl sm:text-2xl">skip_next</span>
                        </button>
                        
                        <!-- Fullscreen -->
                        <button @click="toggleFullscreen"
                            class="text-white bg-transparent border-none cursor-pointer transition-all duration-200 p-1 sm:p-2 rounded-md flex items-center justify-center hover:text-gray-300 hover:bg-white/10"
                            :title="tooltipLabels.fullscreen">
                            <span v-if="isFullscreen" class="material-icons text-xl sm:text-2xl">fullscreen_exit</span>
                            <span v-else class="material-icons text-xl sm:text-2xl">fullscreen</span>
                        </button>
                    </div>
                </div>
            </div>
        </transition>

        <!-- Top Gradient (for better visibility) -->
        <transition name="fade">
            <div v-show="showControls && src" class="absolute top-0 left-0 right-0 h-16 sm:h-24 bg-gradient-to-b from-black/50 to-transparent z-[1] pointer-events-none" />
        </transition>

        <!-- Keyboard Shortcut Notification -->
        <transition name="fade-scale">
            <div v-if="notification.show" class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[20] pointer-events-none">
                <div class="bg-black/90 backdrop-blur-md text-white px-4 py-3 sm:px-6 sm:py-4 rounded-2xl shadow-2xl border border-white/20 flex items-center justify-center gap-3 sm:gap-4 min-w-[160px] sm:min-w-[200px]">
                    <span class="material-icons text-2xl sm:text-3xl text-gray-300">{{ notification.icon }}</span>
                    <span class="text-lg sm:text-xl font-semibold">{{ notification.message }}</span>
                </div>
            </div>
        </transition>
    </div>
</template>

<style scoped>
/* Transitions */
.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}

.slide-up-enter-active,
.slide-up-leave-active {
    transition: all 0.3s ease;
}

.slide-up-enter-from,
.slide-up-leave-to {
    opacity: 0;
    transform: translateY(1rem);
}

.fade-slide-enter-active,
.fade-slide-leave-active {
    transition: all 0.2s ease;
}

.fade-slide-enter-from {
    opacity: 0;
    transform: translateX(-0.5rem);
}

.fade-slide-leave-to {
    opacity: 0;
    transform: translateX(-0.5rem);
}

.fade-scale-enter-active,
.fade-scale-leave-active {
    transition: all 0.2s ease;
}

.fade-scale-enter-from,
.fade-scale-leave-to {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.8);
}
</style>
