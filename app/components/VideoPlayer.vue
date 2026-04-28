<script setup>
const { formatShortcutKey } = useUserSettings()

const props = defineProps({
    src: { type: String, required: true },
    isHls: { type: Boolean, default: false },
    autoplay: { type: Boolean, default: false },
    preload: { type: String, default: "metadata" },
    hasNextEpisode: { type: Boolean, default: true },
    shortcuts: { type: Object, default: () => null },
    // { title?, episode?, videoId?, thumbnailJpgUrl?, thumbnailVttText? }
    animeMeta: { type: Object, default: () => ({}) },
})

const emit = defineEmits(["play", "pause", "ended", "volumechange", "loadstart", "loadeddata", "timeupdate", "next-episode", "previous-episode"])

// Refs
const videoRef = ref(null)
const containerRef = ref(null)
const progressRef = ref(null)
const hlsRef = ref(null)
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
const notification = ref({ show: false, message: "", icon: "" })

// Auto-play next episode
const AUTOPLAY_TRIGGER_SECS = 90
const AUTOPLAY_COUNTDOWN_SECS = 90
const autoplayVisible = ref(false)
const autoplaySecsLeft = ref(AUTOPLAY_COUNTDOWN_SECS)
const autoplayDismissed = ref(false)

// Settings panel
const showSettings = ref(false)
const settingsPage = ref("main")
const autoplayEnabled = ref(true)
const settingsRef = ref(null)

// Thumbnail state
const THUMB_PREVIEW_W = 280
const thumbnailsSegments = ref([])
const activeThumbnail = ref(null)
let thumbnailsAbortController = null
const thumbnailsVttCache = new Map()

// Timers
let controlsTimeout = null
let notificationTimeout = null
let spacePressTimeout = null

// ─── Computed ────────────────────────────────────────────────────────────────

const normalizedVideoId = computed(() => {
    const id = props.animeMeta?.videoId
    return id != null ? String(id).trim() || null : null
})

const thumbnailJpgUrl = computed(() =>
    props.animeMeta?.thumbnailJpgUrl ||
    (normalizedVideoId.value ? `https://pt2.anime1.me/${normalizedVideoId.value}/thumbnails.jpg` : null)
)

const thumbnailCrop = computed(() => activeThumbnail.value?.xywh ?? null)

const thumbnailPreviewHeight = computed(() => {
    const crop = thumbnailCrop.value
    if (!crop?.w || !crop?.h) return Math.round(THUMB_PREVIEW_W * 9 / 16)
    return Math.max(1, Math.round(crop.h * (THUMB_PREVIEW_W / crop.w)))
})

const thumbnailImageStyle = computed(() => {
    const crop = thumbnailCrop.value
    if (!crop?.w || !crop?.h) return {}
    const scale = THUMB_PREVIEW_W / crop.w
    return {
        transformOrigin: "top left",
        transform: `translate(${-crop.x * scale}px, ${-crop.y * scale}px) scale(${scale})`,
        maxWidth: "none",
    }
})

const progress = computed(() => {
    const time = isDraggingProgress.value ? dragPreviewTime.value : currentTime.value
    return duration.value > 0 ? (time / duration.value) * 100 : 0
})

const displayTime = computed(() => isDraggingProgress.value ? dragPreviewTime.value : currentTime.value)

const tooltipLabels = computed(() => {
    const s = props.shortcuts || {}
    return {
        playPause:   s.playPause   ? `${s.playPause.label} (${formatShortcutKey(s.playPause)})` : "播放/暫停",
        skipOP:      s.skipOP      ? `${s.skipOP.label} (${formatShortcutKey(s.skipOP)})`       : "跳過片頭",
        mute:        s.mute        ? `${s.mute.label.split("/")[0]} (${formatShortcutKey(s.mute)})` : "靜音",
        nextEpisode: s.nextEpisode ? `${s.nextEpisode.label} (${formatShortcutKey(s.nextEpisode)})` : "下一集",
        fullscreen:  s.fullscreen  ? `${s.fullscreen.label.split("/")[0]} (${formatShortcutKey(s.fullscreen)})` : "全螢幕",
    }
})

const playbackSpeeds = [0.5, 0.75, 1, 1.25, 1.5, 2, 3]

// ─── Controls visibility ─────────────────────────────────────────────────────

function resetControlsTimeout() {
    showControls.value = true
    clearTimeout(controlsTimeout)
    if (showSettings.value) return
    if (isPlaying.value) {
        controlsTimeout = setTimeout(() => {
            if (!isHoveringVolume.value) {
                showControls.value = false
                showVolumeSlider.value = false
            }
        }, 3000)
    }
}

function handleMouseMove() { resetControlsTimeout() }
function handleMouseLeave() {
    if (isPlaying.value && !isHoveringVolume.value) {
        showControls.value = false
        showVolumeSlider.value = false
    }
}

// ─── Notification ────────────────────────────────────────────────────────────

function showNotification(message, icon, persistent = false) {
    notification.value = { message, icon, show: true }
    clearTimeout(notificationTimeout)
    notificationTimeout = null
    if (!persistent) {
        notificationTimeout = setTimeout(() => {
            notification.value.show = false
            notificationTimeout = null
        }, 800)
    }
}

// ─── Playback ────────────────────────────────────────────────────────────────

function togglePlay() {
    if (!videoRef.value) return
    isPlaying.value ? videoRef.value.pause() : videoRef.value.play()
}

function skip(seconds) {
    if (videoRef.value) videoRef.value.currentTime += seconds
}

function skipOP() {
    skip(85)
    showNotification(props.shortcuts.skipOP.label, "fast_forward")
}

function handleNextEpisode() {
    emit("next-episode")
    showNotification(props.shortcuts.nextEpisode.label, "skip_next")
}

function setPlaybackRate(rate) {
    if (!videoRef.value) return
    playbackRate.value = rate
    videoRef.value.playbackRate = rate
    showNotification(`${rate}x 速度`, "speed")
}

function adjustPlaybackRate(direction) {
    if (!videoRef.value) return
    const currentIndex = playbackSpeeds.indexOf(playbackRate.value)
    const safeIndex = currentIndex >= 0
        ? currentIndex
        : playbackSpeeds.reduce((best, speed, index) =>
            Math.abs(speed - playbackRate.value) < Math.abs(playbackSpeeds[best] - playbackRate.value) ? index : best
        , 0)

    const nextIndex = Math.min(playbackSpeeds.length - 1, Math.max(0, safeIndex + direction))
    if (nextIndex === safeIndex) return
    setPlaybackRate(playbackSpeeds[nextIndex])
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

function handleFullscreenChange() { isFullscreen.value = !!document.fullscreenElement }

// ─── Volume ──────────────────────────────────────────────────────────────────

function handleVolumeChange(e) {
    const newVolume = parseFloat(e.target.value)
    volume.value = newVolume
    isMuted.value = newVolume === 0
    if (videoRef.value) videoRef.value.volume = newVolume
    if (typeof localStorage !== "undefined") localStorage.setItem("videoVolume", newVolume)
}

function toggleMute() {
    if (!videoRef.value) return
    const newMuted = !isMuted.value
    isMuted.value = newMuted
    videoRef.value.muted = newMuted
    videoRef.value.volume = newMuted ? 0 : volume.value
    if (!newMuted && typeof localStorage !== "undefined") localStorage.setItem("videoVolume", volume.value)
}

function handleVolumeAreaEnter() { isHoveringVolume.value = true; showVolumeSlider.value = true }
function handleVolumeAreaLeave() { isHoveringVolume.value = false; showVolumeSlider.value = false }

// ─── Auto-play next episode ───────────────────────────────────────────────────

function startAutoplayCountdown() {
    if (autoplayDismissed.value || !autoplayEnabled.value) return
    autoplayVisible.value = true
}

function updateAutoplayCountdown(remainingSecs) {
    if (!autoplayEnabled.value || autoplayDismissed.value) {
        resetAutoplayCountdown()
        return
    }

    if (remainingSecs <= 0) {
        resetAutoplayCountdown()
        handleNextEpisode()
        return
    }

    if (remainingSecs <= AUTOPLAY_TRIGGER_SECS) {
        startAutoplayCountdown()
        autoplaySecsLeft.value = Math.min(AUTOPLAY_COUNTDOWN_SECS, Math.max(0, Math.ceil(remainingSecs)))
    } else {
        resetAutoplayCountdown()
    }
}

function resetAutoplayCountdown() {
    autoplayVisible.value = false
    autoplaySecsLeft.value = AUTOPLAY_COUNTDOWN_SECS
}

function dismissAutoplay() {
    autoplayDismissed.value = true
    resetAutoplayCountdown()
}

function toggleAutoplay() {
    autoplayEnabled.value = !autoplayEnabled.value
    if (typeof localStorage !== "undefined")
        localStorage.setItem("autoplayEnabled", autoplayEnabled.value)
    if (!autoplayEnabled.value) resetAutoplayCountdown()
}

function closeSettings() {
    showSettings.value = false
    settingsPage.value = "main"
}

function toggleSettings() {
    showSettings.value = !showSettings.value
    if (showSettings.value) settingsPage.value = "main"
    resetControlsTimeout()
}

function openSpeedSettings() {
    settingsPage.value = "speed"
    resetControlsTimeout()
}

function handleDocumentPointerDown(e) {
    if (!showSettings.value) return
    const path = e.composedPath?.() || []
    if (settingsRef.value && !path.includes(settingsRef.value)) {
        closeSettings()
    }
}

// ─── Progress bar ────────────────────────────────────────────────────────────

function calculateTimeFromPosition(e) {
    if (!progressRef.value || !videoRef.value) return null
    const rect = progressRef.value.getBoundingClientRect()
    return Math.max(0, Math.min((e.clientX - rect.left) / rect.width, 1)) * duration.value
}

function handleProgressClick(e) {
    if (isDraggingProgress.value) return
    const t = calculateTimeFromPosition(e)
    if (t !== null && videoRef.value) videoRef.value.currentTime = t
}

function handleProgressMouseDown(e) {
    e.preventDefault()
    isDraggingProgress.value = true
    isHoveringProgress.value = false
    activeThumbnail.value = null
    const t = calculateTimeFromPosition(e)
    if (t !== null) dragPreviewTime.value = t
    showControls.value = true
    clearTimeout(controlsTimeout)
}

function handleProgressMouseMove(e) {
    if (!isDraggingProgress.value) return
    e.preventDefault()
    const t = calculateTimeFromPosition(e)
    if (t !== null) dragPreviewTime.value = t
}

function handleProgressMouseUp(e) {
    if (!isDraggingProgress.value) return
    e.preventDefault()
    const t = calculateTimeFromPosition(e)
    if (t !== null && videoRef.value) {
        currentTime.value = t
        videoRef.value.currentTime = t
    }
    isDraggingProgress.value = false
    if (isPlaying.value) resetControlsTimeout()
}

function handleProgressHover(e) {
    if (isDraggingProgress.value || !progressRef.value) return
    const rect = progressRef.value.getBoundingClientRect()
    const pos = Math.max(0, Math.min((e.clientX - rect.left) / rect.width, 1))
    hoverPreviewTime.value = pos * duration.value
    isHoveringProgress.value = true
    updateActiveThumbnailForTime(hoverPreviewTime.value)
    const halfThumb = THUMB_PREVIEW_W / 2
    const centerPx = pos * rect.width
    const clampedPx = Math.max(halfThumb, Math.min(centerPx, rect.width - halfThumb))
    hoverPreviewPosition.value = rect.width > 0 ? (clampedPx / rect.width) * 100 : pos * 100
}

function handleProgressMouseEnter() { isHoveringProgress.value = true }
function handleProgressMouseLeaveBar() { isHoveringProgress.value = false; activeThumbnail.value = null }

// ─── Thumbnails ──────────────────────────────────────────────────────────────

function parseVttTimeToSeconds(timeStr) {
    const parts = String(timeStr).trim().split(":")
    if (parts.length === 3) {
        const [hh, mm, ssms] = parts
        const [ss, ms] = ssms.split(".")
        return +hh * 3600 + +mm * 60 + +ss + +(ms || 0) / 1000
    }
    const [mm, ssms] = parts
    const [ss, ms] = ssms.split(".")
    return +mm * 60 + +ss + +(ms || 0) / 1000
}

function parseThumbnailsVtt(vttText) {
    const segments = []
    for (const block of String(vttText || "").replace(/\r/g, "").split(/\n\s*\n/)) {
        const timeMatch = block.match(/((?:\d{2}:)?\d{2}:\d{2}\.\d{3})\s*-->\s*((?:\d{2}:)?\d{2}:\d{2}\.\d{3})/)
        const xywhMatch = block.match(/#xywh=(\d+),(\d+),(\d+),(\d+)/)
        if (!timeMatch || !xywhMatch) continue
        const [, x, y, w, h] = xywhMatch
        segments.push({
            start: parseVttTimeToSeconds(timeMatch[1]),
            end: parseVttTimeToSeconds(timeMatch[2]),
            xywh: { x: +x, y: +y, w: +w, h: +h },
        })
    }
    return segments
        .filter(s => Number.isFinite(s.start) && Number.isFinite(s.end) && s.end >= s.start)
        .sort((a, b) => a.start - b.start)
}

function findThumbnailSegmentAtTime(t) {
    const segments = thumbnailsSegments.value
    if (!segments?.length) return null
    let lo = 0, hi = segments.length - 1, ans = -1
    while (lo <= hi) {
        const mid = (lo + hi) >> 1
        if (segments[mid].start <= t) { ans = mid; lo = mid + 1 }
        else hi = mid - 1
    }
    if (ans === -1) return null
    const seg = segments[ans]
    return t >= seg.start && t <= seg.end ? seg : null
}

function updateActiveThumbnailForTime(t) {
    activeThumbnail.value = (normalizedVideoId.value && thumbnailsSegments.value?.length)
        ? findThumbnailSegmentAtTime(t) : null
}

async function loadThumbnailsForVideoId(videoId) {
    activeThumbnail.value = null
    thumbnailsSegments.value = []
    if (!videoId || typeof window === "undefined") return

    const vttText = props.animeMeta?.thumbnailVttText
    if (vttText) { thumbnailsSegments.value = parseThumbnailsVtt(vttText); return }

    if (thumbnailsVttCache.has(videoId)) { thumbnailsSegments.value = thumbnailsVttCache.get(videoId); return }

    try {
        thumbnailsAbortController?.abort()
        thumbnailsAbortController = new AbortController()
        const res = await fetch(`https://pt2.anime1.me/${videoId}/thumbnails.vtt`, { signal: thumbnailsAbortController.signal })
        if (!res.ok) throw new Error(`${res.status}`)
        const segments = parseThumbnailsVtt(await res.text())
        thumbnailsSegments.value = segments
        thumbnailsVttCache.set(videoId, segments)
        if (segments.length) {
            const img = new Image()
            img.crossOrigin = "anonymous"
            img.src = `https://pt2.anime1.me/${videoId}/thumbnails.jpg`
        }
    } catch {
        thumbnailsSegments.value = []
        activeThumbnail.value = null
    }
}

watch(
    [() => normalizedVideoId.value, () => props.animeMeta?.thumbnailVttText],
    async ([newVideoId]) => {
        await loadThumbnailsForVideoId(newVideoId)
        if (isHoveringProgress.value && !isDraggingProgress.value)
            updateActiveThumbnailForTime(hoverPreviewTime.value)
    },
    { immediate: true }
)

// ─── Video event handlers ────────────────────────────────────────────────────

function onPlay() { isPlaying.value = true; resetControlsTimeout(); emit("play") }
function onPause() { isPlaying.value = false; showControls.value = true; emit("pause") }
function onEnded() { isPlaying.value = false; showControls.value = true; resetAutoplayCountdown(); emit("ended") }
function onVolumeChange() { emit("volumechange") }
function onLoadedMetadata() { if (videoRef.value) duration.value = videoRef.value.duration }
function onLoadedData() { isLoading.value = false; emit("loadeddata") }
function onLoadStart() { isLoading.value = true; emit("loadstart") }
function onWaiting() { if (isPlaying.value) isLoading.value = true }
function onCanPlay() { isLoading.value = false }
function onCanPlayThrough() { isLoading.value = false }

function onTimeUpdate() {
    if (!videoRef.value || isDraggingProgress.value) return
    currentTime.value = videoRef.value.currentTime
    if (videoRef.value.buffered.length > 0) {
        buffered.value = (videoRef.value.buffered.end(videoRef.value.buffered.length - 1) / videoRef.value.duration) * 100
    }

    // Auto-play next episode countdown (based on remaining playback time)
    if (props.hasNextEpisode && duration.value > 0) {
        const remaining = duration.value - videoRef.value.currentTime
        updateAutoplayCountdown(remaining)
    }

    emit("timeupdate")
}

// ─── Keyboard shortcuts ──────────────────────────────────────────────────────

function handleKeydown(e) {
    if (!videoRef.value || !props.src) return
    const { tagName, isContentEditable } = e.target
    if (tagName === "INPUT" || tagName === "TEXTAREA" || isContentEditable) return

    const shortcuts = props.shortcuts || {}
    const pressedKey = e.key

    if (Object.values(shortcuts).some(s => (typeof s === 'string' ? s : s.key) === pressedKey))
        e.preventDefault()

    const action = Object.keys(shortcuts).find(key => {
        const s = shortcuts[key]
        return (typeof s === 'string' ? s : s.key) === pressedKey
    })
    if (!action) return

    if (action === 'playPause') {
        if (!isSpaceHeld.value) {
            isSpaceHeld.value = true
            if (videoRef.value) originalPlaybackRate.value = videoRef.value.playbackRate || 1
            spacePressTimeout = setTimeout(() => {
                if (isSpaceHeld.value && videoRef.value) {
                    videoRef.value.playbackRate = 2
                    showNotification("2x 速度", "fast_forward", true)
                }
            }, 300)
        }
    } else if (action === 'seekBackward5')  { skip(-5);  showNotification(shortcuts.seekBackward5.label, "fast_rewind") }
      else if (action === 'seekForward5')   { skip(5);   showNotification(shortcuts.seekForward5.label, "fast_forward") }
      else if (action === 'seekBackward10') { skip(-10); showNotification(shortcuts.seekBackward10.label, "fast_rewind") }
      else if (action === 'seekForward10')  { skip(10);  showNotification(shortcuts.seekForward10.label, "fast_forward") }
      else if (action === 'decreasePlaybackSpeed') { adjustPlaybackRate(-1) }
      else if (action === 'increasePlaybackSpeed') { adjustPlaybackRate(1) }
      else if (action === 'skipOP')         { skipOP() }
      else if (action === 'previousEpisode') { emit("previous-episode"); showNotification(shortcuts.previousEpisode.label, "skip_previous") }
      else if (action === 'nextEpisode')    { handleNextEpisode() }
      else if (action === 'fullscreen')     { toggleFullscreen() }
      else if (action === 'mute') {
        const wasMuted = isMuted.value
        toggleMute()
        const labels = shortcuts.mute.label.split("/")
        showNotification(wasMuted ? labels[1] : labels[0], wasMuted ? "volume_up" : "volume_off")
    } else if (action === 'volumeUp' || action === 'volumeDown') {
        const newVolume = Math.min(1, Math.max(0, volume.value + (action === 'volumeUp' ? 0.1 : -0.1)))
        volume.value = newVolume
        isMuted.value = newVolume === 0
        if (videoRef.value) videoRef.value.volume = newVolume
        if (typeof localStorage !== "undefined") localStorage.setItem("videoVolume", newVolume)
        const icon = newVolume === 0 ? "volume_off" : newVolume < 0.5 ? "volume_down" : "volume_up"
        showNotification(`音量 ${Math.round(newVolume * 100)}%`, icon)
    }
}

function handleKeyup(e) {
    if (!videoRef.value || !props.src) return
    const { tagName, isContentEditable } = e.target
    if (tagName === "INPUT" || tagName === "TEXTAREA" || isContentEditable) return
    const shortcuts = props.shortcuts || {}
    const playPauseKey = typeof shortcuts.playPause === 'string' ? shortcuts.playPause : shortcuts.playPause?.key
    if (playPauseKey !== e.key) return
    e.preventDefault()
    clearTimeout(spacePressTimeout)
    spacePressTimeout = null
    if (isSpaceHeld.value) {
        if (videoRef.value?.playbackRate === 2) {
            videoRef.value.playbackRate = originalPlaybackRate.value
            showNotification("正常速度", "play_arrow")
        } else {
            togglePlay()
        }
        isSpaceHeld.value = false
    }
}

// ─── HLS setup ───────────────────────────────────────────────────────────────

async function applyHlsOrSrc() {
    const { src, isHls } = props
    const video = videoRef.value

    hlsRef.value?.destroy()
    hlsRef.value = null

    if (!src) { effectiveVideoSrc.value = ""; return }
    if (!isHls) { effectiveVideoSrc.value = src; return }
    if (!video) { effectiveVideoSrc.value = ""; return }

    const Hls = (await import("hls.js")).default
    if (Hls.isSupported()) {
        effectiveVideoSrc.value = ""
        const hls = new Hls()
        hlsRef.value = hls
        hls.loadSource(src)
        hls.attachMedia(video)
        hls.on(Hls.Events.ERROR, (_, data) => {
            if (data.fatal) { hls.destroy(); hlsRef.value = null }
        })
    } else {
        // Native HLS (Safari) or fallback
        effectiveVideoSrc.value = src
    }
}

watch([() => props.src, () => props.isHls, videoRef], applyHlsOrSrc, { immediate: true })

watch(() => props.src, () => {
    currentTime.value = 0
    duration.value = 0
    isPlaying.value = false
    buffered.value = 0
    isSpaceHeld.value = false
    originalPlaybackRate.value = 1
    playbackRate.value = 1
    if (videoRef.value) videoRef.value.playbackRate = 1
    clearTimeout(spacePressTimeout)
    spacePressTimeout = null
    autoplayDismissed.value = false
    resetAutoplayCountdown()
})

// ─── Lifecycle ───────────────────────────────────────────────────────────────

defineExpose({
    videoElement: computed(() => videoRef.value),
    currentTime:  computed(() => currentTime.value),
    duration:     computed(() => duration.value),
    isPlaying:    computed(() => isPlaying.value),
    volume:       computed(() => volume.value),
    play:      () => videoRef.value?.play(),
    pause:     () => videoRef.value?.pause(),
    seek:      (time) => { if (videoRef.value) videoRef.value.currentTime = time },
    setVolume: (vol) => { volume.value = vol; if (videoRef.value) videoRef.value.volume = vol },
})

onMounted(() => {
    if (typeof localStorage !== "undefined") {
        const savedVolume = localStorage.getItem("videoVolume")
        if (savedVolume !== null) {
            const vol = parseFloat(savedVolume)
            volume.value = vol
            isMuted.value = vol === 0
        }
        const savedAutoplay = localStorage.getItem("autoplayEnabled")
        if (savedAutoplay !== null) autoplayEnabled.value = savedAutoplay !== "false"
    }
    document.addEventListener("fullscreenchange", handleFullscreenChange)
    document.addEventListener("pointerdown", handleDocumentPointerDown)
    window.addEventListener("keydown", handleKeydown)
    window.addEventListener("keyup", handleKeyup)
    document.addEventListener("mousemove", handleProgressMouseMove)
    document.addEventListener("mouseup", handleProgressMouseUp)
})

// Close settings panel when controls hide
watch(showControls, (v) => { if (!v) closeSettings() })

watch(videoRef, (video) => {
    if (!video) return
    if (volume.value !== 1) { video.volume = volume.value; video.muted = isMuted.value }
    video.playbackRate = playbackRate.value
})

onUnmounted(() => {
    hlsRef.value?.destroy()
    hlsRef.value = null
    clearTimeout(controlsTimeout)
    clearTimeout(notificationTimeout)
    clearTimeout(spacePressTimeout)
    document.removeEventListener("fullscreenchange", handleFullscreenChange)
    document.removeEventListener("pointerdown", handleDocumentPointerDown)
    window.removeEventListener("keydown", handleKeydown)
    window.removeEventListener("keyup", handleKeyup)
    document.removeEventListener("mousemove", handleProgressMouseMove)
    document.removeEventListener("mouseup", handleProgressMouseUp)
})
</script>

<template>
    <div ref="containerRef"
        class="relative w-full aspect-video bg-gray-950/5 dark:bg-white/10 rounded-lg overflow-hidden cursor-default"
        @mousemove="handleMouseMove" @mouseleave="handleMouseLeave">

        <!-- Video Element -->
        <video v-if="src" ref="videoRef" :src="effectiveVideoSrc || undefined" :autoplay="autoplay" :preload="preload"
            class="w-full h-full block cursor-pointer"
            @play="onPlay" @pause="onPause" @timeupdate="onTimeUpdate"
            @loadedmetadata="onLoadedMetadata" @loadeddata="onLoadedData" @loadstart="onLoadStart"
            @ended="onEnded" @volumechange="onVolumeChange"
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
            <div class="w-10 h-10 sm:w-12 sm:h-12 border-4 border-gray-300 dark:border-gray-600 border-t-gray-900 dark:border-t-gray-100 rounded-full animate-spin mb-4" />
            <p class="text-white text-sm sm:text-base">載入影片中...</p>
        </div>

        <!-- Center Play/Pause Button -->
        <transition name="fade">
            <div v-show="!isLoading && showControls && src"
                class="absolute inset-0 flex items-center justify-center pointer-events-none z-[2]">
                <button @click="togglePlay"
                    class="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white/20 backdrop-blur-md border-2 border-white/40 flex items-center justify-center cursor-pointer pointer-events-auto transition-all duration-300 hover:bg-white/30 hover:scale-110 active:scale-95">
                    <span class="material-icons text-white text-3xl sm:text-[2.5rem]">{{ isPlaying ? 'pause' : 'play_arrow' }}</span>
                </button>
            </div>
        </transition>

        <!-- Fullscreen: Anime title + episode overlay (top-left) -->
        <transition name="fade">
            <div v-if="isFullscreen && showControls && src && animeMeta?.title"
                class="absolute top-0 left-0 z-[3] px-4 pt-4 pointer-events-none">
                <p class="text-white font-semibold text-sm sm:text-base leading-tight [text-shadow:0_2px_10px_rgba(0,0,0,0.7)]">
                    {{ animeMeta.title }}
                </p>
                <p v-if="animeMeta.episode" class="text-white/75 text-xs sm:text-sm mt-0.5 [text-shadow:0_2px_8px_rgba(0,0,0,0.7)]">
                    第 {{ animeMeta.episode }} 集
                </p>
            </div>
        </transition>

        <!-- Auto-play next episode countdown -->
        <transition name="autoplay-btn">
            <div v-if="autoplayVisible && hasNextEpisode && src"
                class="absolute right-3 sm:right-6 z-[8] transition-all duration-300"
                :class="showControls ? 'bottom-[5.5rem] sm:bottom-[6.75rem]' : 'bottom-3 sm:bottom-4'">
                <div class="relative flex items-stretch overflow-hidden rounded-xl shadow-2xl border border-white/15 dark:border-gray-900/30">
                    <!-- Base layer (darker, shows when sweep depletes) -->
                    <div class="absolute inset-0 bg-gray-800 dark:bg-gray-200" />
                    <!-- Sweep layer: starts full-width, shrinks left→right over countdown -->
                    <div class="absolute inset-0 bg-gray-900 dark:bg-white origin-right"
                        :style="{ transform: `scaleX(${autoplaySecsLeft / AUTOPLAY_COUNTDOWN_SECS})`, transition: 'transform 1s linear' }" />
                    <!-- Main action -->
                    <button
                        @click="handleNextEpisode"
                        class="relative z-[1] inline-flex h-10 items-center gap-1.5 px-3 text-sm font-semibold text-white dark:text-gray-900 cursor-pointer leading-none">
                        <span class="material-icons text-[1.1rem] leading-none flex-shrink-0">skip_next</span>
                        <span class="whitespace-nowrap leading-none">{{ tooltipLabels.nextEpisode }}</span>
                    </button>
                    <!-- Dismiss -->
                    <button
                        @click="dismissAutoplay"
                        class="relative z-[1] h-10 px-2 flex items-center justify-center text-white/60 dark:text-gray-500 hover:text-white dark:hover:text-gray-900 transition-colors cursor-pointer">
                        <span class="material-icons text-[1rem]">close</span>
                    </button>
                </div>
            </div>
        </transition>

        <!-- Custom Controls -->
        <transition name="slide-up">
            <div v-show="!isLoading && showControls && src"
                class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/70 to-transparent z-[9] pb-2 sm:pb-4 pointer-events-none">

                <!-- Progress Bar -->
                <div class="px-3 sm:px-6 pt-4 sm:pt-8 pb-2 sm:pb-3 pointer-events-none">
                    <div ref="progressRef"
                        class="relative h-6 sm:h-7 cursor-pointer group flex items-center pointer-events-auto"
                        @click="handleProgressClick"
                        @mousedown="handleProgressMouseDown"
                        @mousemove="handleProgressHover"
                        @mouseenter="handleProgressMouseEnter"
                        @mouseleave="handleProgressMouseLeaveBar">
                        <div class="relative w-full h-1 sm:h-1.5 bg-white/20 rounded-full transition-all duration-200 hover:h-1.5 sm:hover:h-2"
                            :class="{ 'h-1.5 sm:h-2': isDraggingProgress }">
                            <!-- Buffered -->
                            <div class="absolute h-full bg-white/30 rounded-full transition-all duration-300 pointer-events-none"
                                :style="{ width: `${buffered}%` }" />
                            <!-- Played -->
                            <div class="absolute h-full bg-white rounded-full pointer-events-none"
                                :class="isDraggingProgress ? 'transition-none' : 'transition-all duration-100'"
                                :style="{ width: `${progress}%` }">
                                <div class="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 sm:w-3 sm:h-3 bg-white rounded-full shadow-lg transition-opacity duration-200"
                                    :class="isDraggingProgress || isHoveringProgress ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'" />
                            </div>
                            <!-- Hover Thumbnail / Time Tooltip -->
                            <transition name="fade">
                                <div v-if="isHoveringProgress && !isDraggingProgress && duration > 0"
                                    class="absolute bottom-full mb-2 -translate-x-1/2 pointer-events-none z-[9]"
                                    :style="{ left: `${hoverPreviewPosition}%` }">
                                    <div v-if="activeThumbnail && thumbnailJpgUrl"
                                        class="flex flex-col items-center"
                                        :style="{ width: `${THUMB_PREVIEW_W}px` }">
                                        <div class="relative overflow-hidden rounded-xl border border-gray-900/20 dark:border-white/20"
                                            :style="{ width: `${THUMB_PREVIEW_W}px`, height: `${thumbnailPreviewHeight}px` }">
                                            <img :src="thumbnailJpgUrl"
                                                class="absolute top-0 left-0 block w-auto h-auto"
                                                :style="thumbnailImageStyle"
                                                alt="Thumbnail preview" />
                                        </div>
                                        <div class="mt-1.5 bg-black/90 backdrop-blur-md text-white px-3 py-1 rounded text-xs font-medium whitespace-nowrap shadow-lg text-center">
                                            {{ formatTime(hoverPreviewTime) }}
                                        </div>
                                    </div>
                                    <div v-else class="bg-black/90 backdrop-blur-md text-white px-2 py-1 rounded text-xs font-medium whitespace-nowrap shadow-lg">
                                        {{ formatTime(hoverPreviewTime) }}
                                    </div>
                                </div>
                            </transition>
                        </div>
                    </div>
                </div>

                <!-- Control Buttons -->
                <div class="flex items-center justify-between px-2 sm:px-6 gap-1 sm:gap-0 pointer-events-none">
                    <div class="flex items-center gap-1 sm:gap-3 pointer-events-auto">
                        <!-- Play/Pause -->
                        <button @click="togglePlay" :title="tooltipLabels.playPause"
                            class="text-white bg-transparent border-none cursor-pointer transition-all duration-200 p-1 sm:p-2 rounded-md flex items-center justify-center hover:text-gray-300 hover:bg-white/10">
                            <span class="material-icons text-xl sm:text-2xl">{{ isPlaying ? 'pause' : 'play_arrow' }}</span>
                        </button>
                        <!-- Skip OP -->
                        <button @click="skipOP" :title="tooltipLabels.skipOP"
                            class="text-white bg-transparent border-none cursor-pointer transition-all duration-200 p-1 sm:p-2 rounded-md flex items-center justify-center hover:text-gray-300 hover:bg-white/10">
                            <span class="material-icons text-xl sm:text-2xl">fast_forward</span>
                        </button>
                        <!-- Volume -->
                        <div class="relative flex items-center gap-1 sm:gap-2"
                            @mouseenter="handleVolumeAreaEnter" @mouseleave="handleVolumeAreaLeave">
                            <button @click="toggleMute" :title="tooltipLabels.mute"
                                class="text-white bg-transparent border-none cursor-pointer transition-all duration-200 p-1 sm:p-2 rounded-md flex items-center justify-center hover:text-gray-300 hover:bg-white/10">
                                <span class="material-icons text-xl sm:text-2xl">
                                    {{ isMuted || volume === 0 ? 'volume_off' : volume < 0.5 ? 'volume_down' : 'volume_up' }}
                                </span>
                            </button>
                            <transition name="fade-slide">
                                <input v-show="showVolumeSlider" type="range" min="0" max="1" step="0.1"
                                    :value="isMuted ? 0 : volume" @input="handleVolumeChange" @mousedown.stop
                                    class="hidden sm:block w-20 h-1 bg-white/20 rounded-full outline-none appearance-none cursor-pointer z-[2] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-none [&::-moz-range-thumb]:cursor-pointer" />
                            </transition>
                        </div>
                        <!-- Time -->
                        <span class="text-white text-xs sm:text-sm font-medium whitespace-nowrap"
                            :class="{ 'text-gray-300': isDraggingProgress }">
                            {{ formatTime(displayTime) }} / {{ formatTime(duration) }}
                        </span>
                    </div>

                    <div class="flex items-center gap-1 sm:gap-3 pointer-events-auto">
                        <!-- Settings -->
                        <div ref="settingsRef" class="relative">
                            <button @click="toggleSettings" title="設定"
                                class="text-white bg-transparent border-none cursor-pointer transition-all duration-200 p-1 sm:p-2 rounded-md flex items-center justify-center hover:text-gray-300 hover:bg-white/10">
                                <span class="material-icons text-xl sm:text-2xl">settings</span>
                            </button>
                            <div v-if="showSettings" @click.stop
                                class="absolute bottom-full right-[-2.5rem] sm:right-[-3.25rem] mb-2 bg-black/90 backdrop-blur-md rounded-lg shadow-2xl border border-white/20 py-2 z-[10] min-w-[200px] max-w-[min(92vw,18rem)] origin-bottom-right">
                                <transition name="settings-page" mode="out-in">
                                    <div :key="settingsPage">
                                        <template v-if="settingsPage === 'main'">
                                            <button @click="toggleAutoplay"
                                                class="w-full px-4 py-2 text-left text-white text-sm hover:bg-white/10 transition-colors flex items-center justify-between">
                                                <span>自動播放下一集</span>
                                                <span class="text-xs text-gray-300">{{ autoplayEnabled ? '開啟' : '關閉' }}</span>
                                            </button>
                                            <button @click.stop="openSpeedSettings"
                                                class="w-full px-4 py-2 text-left text-white text-sm hover:bg-white/10 transition-colors flex items-center justify-between">
                                                <span>播放速度</span>
                                                <span class="inline-flex min-w-[3.25rem] items-center justify-end gap-1 text-xs text-gray-300 leading-none">
                                                    {{ playbackRate }}x
                                                    <span class="material-icons text-sm leading-none translate-y-[0.5px]">chevron_right</span>
                                                </span>
                                            </button>
                                        </template>
                                        <template v-else>
                                            <button @click="settingsPage = 'main'"
                                                class="w-full px-3 py-2 text-left text-white text-sm hover:bg-white/10 transition-colors flex items-center gap-1">
                                                <span class="material-icons text-base">chevron_left</span>
                                                <span>播放速度</span>
                                            </button>
                                            <button v-for="speed in playbackSpeeds" :key="speed" @click="setPlaybackRate(speed)"
                                                class="w-full px-4 py-2 text-left text-white text-sm hover:bg-white/10 transition-colors flex items-center justify-between"
                                                :class="{ 'bg-gray-500/30 text-gray-300': playbackRate === speed }">
                                                <span>{{ speed }}x</span>
                                                <span v-if="playbackRate === speed" class="material-icons text-sm">check</span>
                                            </button>
                                        </template>
                                    </div>
                                </transition>
                            </div>
                        </div>
                        <!-- Fullscreen -->
                        <button @click="toggleFullscreen" :title="tooltipLabels.fullscreen"
                            class="text-white bg-transparent border-none cursor-pointer transition-all duration-200 p-1 sm:p-2 rounded-md flex items-center justify-center hover:text-gray-300 hover:bg-white/10">
                            <span class="material-icons text-xl sm:text-2xl">{{ isFullscreen ? 'fullscreen_exit' : 'fullscreen' }}</span>
                        </button>
                    </div>
                </div>
            </div>
        </transition>

        <!-- Top Gradient -->
        <transition name="fade">
            <div v-show="showControls && src"
                class="absolute top-0 left-0 right-0 h-16 sm:h-24 bg-gradient-to-b from-black/50 to-transparent z-[1] pointer-events-none" />
        </transition>

        <!-- Shortcut Notification -->
        <transition name="fade-scale">
            <div v-if="notification.show"
                class="absolute top-14 left-1/2 -translate-x-1/2 z-[20] pointer-events-none sm:top-16">
                <div class="bg-black/45 backdrop-blur-md text-white px-3 py-1 sm:px-4 sm:py-1.5 rounded-full shadow-lg border border-white/15 flex items-center justify-center gap-2 min-w-0 max-w-[min(90vw,20rem)]">
                    <span class="material-icons shrink-0 text-lg sm:text-xl text-gray-300">{{ notification.icon }}</span>
                    <span class="text-xs sm:text-sm font-semibold truncate">{{ notification.message }}</span>
                </div>
            </div>
        </transition>
    </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.slide-up-enter-active, .slide-up-leave-active { transition: all 0.3s ease; }
.slide-up-enter-from, .slide-up-leave-to { opacity: 0; transform: translateY(1rem); }

.fade-slide-enter-active, .fade-slide-leave-active { transition: all 0.2s ease; }
.fade-slide-enter-from, .fade-slide-leave-to { opacity: 0; transform: translateX(-0.5rem); }

.fade-scale-enter-active, .fade-scale-leave-active { transition: all 0.2s ease; }
.fade-scale-enter-from, .fade-scale-leave-to { opacity: 0; transform: translateX(-50%) translateY(-0.35rem) scale(0.92); }

.settings-page-enter-active, .settings-page-leave-active { transition: all 0.18s ease; }
.settings-page-enter-from { opacity: 0; transform: translateX(0.6rem); }
.settings-page-leave-to { opacity: 0; transform: translateX(-0.6rem); }

.autoplay-btn-enter-active, .autoplay-btn-leave-active { transition: opacity 0.2s ease; }
.autoplay-btn-enter-from, .autoplay-btn-leave-to { opacity: 0; }
</style>