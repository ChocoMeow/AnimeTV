<script setup>
const props = defineProps({
    src: {
        type: String,
        required: true,
    },
    autoplay: {
        type: Boolean,
        default: false,
    },
    preload: {
        type: String,
        default: "metadata",
    },
})

const emit = defineEmits(["play", "pause", "ended", "volumechange", "loadstart", "loadeddata", "timeupdate"])

// Refs
const videoRef = ref(null)
const containerRef = ref(null)
const progressRef = ref(null)

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

// Notification state
const notification = ref({
    show: false,
    message: "",
    icon: "",
})

// Timeout refs
let controlsTimeout = null
let notificationTimeout = null

// Computed
const progress = computed(() => {
    return duration.value > 0 ? (currentTime.value / duration.value) * 100 : 0
})

// Format time helper
function formatTime(time) {
    if (isNaN(time)) return "0:00"
    const minutes = Math.floor(time / 60)
    const seconds = Math.floor(time % 60)
    return `${minutes}:${seconds.toString().padStart(2, "0")}`
}

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
    }, 1000)
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

function handleProgressClick(e) {
    if (!progressRef.value || !videoRef.value) return

    const rect = progressRef.value.getBoundingClientRect()
    const pos = (e.clientX - rect.left) / rect.width
    videoRef.value.currentTime = Math.max(0, Math.min(pos * duration.value, duration.value))
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

    currentTime.value = videoRef.value.currentTime

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

    // Prevent default for handled keys
    const handledKeys = [" ", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "m", "f", "k", "j", "l"]
    if (handledKeys.includes(e.key)) {
        e.preventDefault()
    }

    switch (e.key) {
        case " ": // Space - play/pause
        case "k": // K - play/pause (YouTube style)
            {
                const wasPlaying = isPlaying.value
                togglePlay()
                if (wasPlaying) {
                    showNotification("已暫停", "pause")
                } else {
                    showNotification("播放中", "play_arrow")
                }
            }
            break
        case "ArrowLeft": // Left arrow - rewind 5 seconds
            skip(-5)
            showNotification("後退 5 秒", "fast_rewind")
            break
        case "ArrowRight": // Right arrow - forward 5 seconds
            skip(5)
            showNotification("前進 5 秒", "fast_forward")
            break
        case "ArrowUp": // Up arrow - increase volume
            {
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
            }
            break
        case "ArrowDown": // Down arrow - decrease volume
            {
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
            }
            break
        case "m": // M - toggle mute
            {
                const wasMuted = isMuted.value
                toggleMute()
                showNotification(wasMuted ? "取消靜音" : "已靜音", wasMuted ? "volume_up" : "volume_off")
            }
            break
        case "f": // F - toggle fullscreen
            {
                const wasFullscreen = isFullscreen.value
                toggleFullscreen()
                showNotification(wasFullscreen ? "退出全螢幕" : "全螢幕", wasFullscreen ? "fullscreen_exit" : "fullscreen")
            }
            break
        case "j": // J - rewind 10 seconds
            skip(-10)
            showNotification("後退 10 秒", "fast_rewind")
            break
        case "l": // L - forward 10 seconds
            skip(10)
            showNotification("前進 10 秒", "fast_forward")
            break
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
})

// Watch for video element ready and apply saved volume
watch(videoRef, (newVideo) => {
    if (newVideo && volume.value !== 1) {
        newVideo.volume = volume.value
        newVideo.muted = isMuted.value
    }
})

onUnmounted(() => {
    if (controlsTimeout) {
        clearTimeout(controlsTimeout)
    }
    if (notificationTimeout) {
        clearTimeout(notificationTimeout)
    }
    document.removeEventListener("fullscreenchange", handleFullscreenChange)
    window.removeEventListener("keydown", handleKeydown)
})

// Watch for src changes
watch(
    () => props.src,
    () => {
        currentTime.value = 0
        duration.value = 0
        isPlaying.value = false
        buffered.value = 0
    }
)
</script>

<template>
    <div ref="containerRef" class="relative w-full aspect-video bg-black rounded-lg overflow-hidden cursor-default" @mousemove="handleMouseMove" @mouseleave="handleMouseLeave">
        <!-- Video Element -->
        <video
            v-if="src"
            ref="videoRef"
            :src="src"
            :autoplay="autoplay"
            :preload="preload"
            class="w-full h-full block cursor-pointer"
            @play="onPlay"
            @pause="onPause"
            @timeupdate="onTimeUpdate"
            @loadedmetadata="onLoadedMetadata"
            @loadeddata="onLoadedData"
            @loadstart="onLoadStart"
            @ended="onEnded"
            @volumechange="onVolumeChange"
            @click="togglePlay"
        />

        <!-- No Video Message -->
        <div v-else class="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
            <span class="material-icons text-4xl sm:text-6xl mb-4 opacity-50">play_circle_outline</span>
            <p class="text-base sm:text-lg">無可用影片</p>
        </div>

        <!-- Loading Indicator -->
        <div v-if="isLoading && src" class="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-10">
            <div class="w-10 h-10 sm:w-12 sm:h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-4"></div>
            <p class="text-white text-sm sm:text-base">載入影片中...</p>
        </div>

        <!-- Center Play/Pause Button -->
        <transition name="fade">
            <div v-show="!isLoading && showControls && src" class="absolute inset-0 flex items-center justify-center pointer-events-none z-[2]">
                <button
                    @click="togglePlay"
                    class="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white/20 backdrop-blur-md border-2 border-white/40 flex items-center justify-center cursor-pointer pointer-events-auto transition-all duration-300 hover:bg-white/30 hover:scale-110 active:scale-95"
                >
                    <span v-if="isPlaying" class="material-icons text-white text-3xl sm:text-[2.5rem]">pause</span>
                    <span v-else class="material-icons text-white text-3xl sm:text-[2.5rem]">play_arrow</span>
                </button>
            </div>
        </transition>

        <!-- Custom Controls -->
        <transition name="slide-up">
            <div v-show="!isLoading && showControls && src" class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/70 to-transparent z-[3] pb-2 sm:pb-4">
                <!-- Progress Bar -->
                <div class="px-3 sm:px-6 pt-4 sm:pt-8 pb-2 sm:pb-3">
                    <div
                        ref="progressRef"
                        class="relative h-1 sm:h-1.5 bg-white/20 rounded-full cursor-pointer transition-all duration-200 hover:h-1.5 sm:hover:h-2 group"
                        @click="handleProgressClick"
                    >
                        <!-- Buffered Progress -->
                        <div class="absolute h-full bg-white/30 rounded-full transition-all duration-300 pointer-events-none" :style="{ width: `${buffered}%` }" />

                        <!-- Played Progress -->
                        <div
                            class="absolute h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-100 pointer-events-none"
                            :style="{ width: `${progress}%` }"
                        >
                            <div
                                class="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 sm:w-3 sm:h-3 bg-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                            />
                        </div>
                    </div>
                </div>

                <!-- Control Buttons -->
                <div class="flex items-center justify-between px-2 sm:px-6 gap-1 sm:gap-0">
                    <div class="flex items-center gap-1 sm:gap-3">
                        <!-- Play/Pause -->
                        <button
                            @click="togglePlay"
                            class="text-white bg-transparent border-none cursor-pointer transition-all duration-200 p-1 sm:p-2 rounded-md flex items-center justify-center hover:text-indigo-500 hover:bg-white/10"
                            title="播放/暫停 (Space)"
                        >
                            <span v-if="isPlaying" class="material-icons text-xl sm:text-2xl">pause</span>
                            <span v-else class="material-icons text-xl sm:text-2xl">play_arrow</span>
                        </button>

                        <!-- Skip Back -->
                        <button
                            @click="skip(-10)"
                            class="text-white bg-transparent border-none cursor-pointer transition-all duration-200 p-1 sm:p-2 rounded-md flex items-center justify-center hover:text-indigo-500 hover:bg-white/10"
                            title="後退10秒 (J / ←)"
                        >
                            <span class="material-icons text-xl sm:text-2xl">replay_10</span>
                        </button>

                        <!-- Skip Forward -->
                        <button
                            @click="skip(10)"
                            class="text-white bg-transparent border-none cursor-pointer transition-all duration-200 p-1 sm:p-2 rounded-md flex items-center justify-center hover:text-indigo-500 hover:bg-white/10"
                            title="前進10秒 (L / →)"
                        >
                            <span class="material-icons text-xl sm:text-2xl">forward_10</span>
                        </button>

                        <!-- Volume Control -->
                        <div class="relative flex items-center gap-1 sm:gap-2" @mouseenter="handleVolumeAreaEnter" @mouseleave="handleVolumeAreaLeave">
                            <button
                                @click="toggleMute"
                                class="text-white bg-transparent border-none cursor-pointer transition-all duration-200 p-1 sm:p-2 rounded-md flex items-center justify-center hover:text-indigo-500 hover:bg-white/10"
                                title="靜音 (M)"
                            >
                                <span v-if="isMuted || volume === 0" class="material-icons text-xl sm:text-2xl">volume_off</span>
                                <span v-else-if="volume < 0.5" class="material-icons text-xl sm:text-2xl">volume_down</span>
                                <span v-else class="material-icons text-xl sm:text-2xl">volume_up</span>
                            </button>

                            <transition name="fade-slide">
                                <input
                                    v-show="showVolumeSlider"
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.1"
                                    :value="isMuted ? 0 : volume"
                                    @input="handleVolumeChange"
                                    @mousedown.stop
                                    class="hidden sm:block w-20 h-1 bg-white/20 rounded-full outline-none appearance-none cursor-pointer z-[2] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-none [&::-moz-range-thumb]:cursor-pointer"
                                />
                            </transition>
                        </div>

                        <!-- Time Display -->
                        <span class="text-white text-xs sm:text-sm font-medium whitespace-nowrap"> {{ formatTime(currentTime) }} / {{ formatTime(duration) }} </span>
                    </div>

                    <div class="flex items-center gap-1 sm:gap-3">
                        <!-- Fullscreen -->
                        <button
                            @click="toggleFullscreen"
                            class="text-white bg-transparent border-none cursor-pointer transition-all duration-200 p-1 sm:p-2 rounded-md flex items-center justify-center hover:text-indigo-500 hover:bg-white/10"
                            title="全螢幕 (F)"
                        >
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
                <div
                    class="bg-black/90 backdrop-blur-md text-white px-4 py-3 sm:px-6 sm:py-4 rounded-2xl shadow-2xl border border-white/20 flex items-center justify-center gap-3 sm:gap-4 min-w-[160px] sm:min-w-[200px]"
                >
                    <span class="material-icons text-2xl sm:text-3xl text-indigo-400">{{ notification.icon }}</span>
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
