<script setup>
const { formatShortcutKey } = useUserSettings()

const props = defineProps({
    src: { type: String, required: true },
    isHls: { type: Boolean, default: false },
    autoplay: { type: Boolean, default: false },
    preload: { type: String, default: "metadata" },
    hasNextEpisode: { type: Boolean, default: true },
    theaterMode: { type: Boolean, default: false },
    shortcuts: { type: Object, default: () => null },
    // Thumbnail strip: thumbnailJpgUrl + thumbnailsVttUrl from API, or offline thumbnailVttText + thumbnailJpgUrl (blob).
    animeMeta: { type: Object, default: () => ({}) },
})

const emit = defineEmits(["play", "pause", "ended", "volumechange", "loadstart", "loadeddata", "timeupdate", "next-episode", "previous-episode", "toggle-theater-mode", "stream-error"])

// Refs
const videoRef = ref(null)
const containerRef = ref(null)
const progressRef = ref(null)
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
const isDraggingProgress = ref(false)
const dragPreviewTime = ref(0)
const isHoveringProgress = ref(false)
const hoverPreviewTime = ref(0)
const hoverPreviewPosition = ref(0)
const playbackRate = ref(1)
const notification = ref({ show: false, message: "", icon: "" })

// Auto-play next episode
const AUTOPLAY_TRIGGER_SECS = 100
const AUTOPLAY_COUNTDOWN_SECS = 100
const THUMB_PREVIEW_W = 280
const THUMB_CACHE_LIMIT = 20
const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3]
const autoplayVisible = ref(false)
const autoplaySecsLeft = ref(AUTOPLAY_COUNTDOWN_SECS)
const autoplayDismissed = ref(false)

// Settings panel
const showSettings = ref(false)
const settingsPage = ref("main")
const autoplayEnabled = ref(true)
const settingsRef = ref(null)

// Thumbnail state
const thumbnailsSegments = ref([])
const activeThumbnail = ref(null)
let thumbnailsAbortController = null
const thumbnailsVttCache = new Map()

// Non-reactive lifecycle state
let controlsTimeout = null
let notificationTimeout = null
let spacePressTimeout = null
let autoplayNextTimeout = null
let streamErrorTimeout = null
let sourceGeneration = 0
let thumbnailGeneration = 0
let lastAutoplaySecond = null
let isUnmounted = false
let spaceBoostActive = false
let hlsInstance = null
let isHoveringVolume = false
let isSpaceHeld = false
let originalPlaybackRate = 1
const streamRecoveryAttempts = { network: 0, media: 0 }

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const clearTimer = (timer) => {
    if (timer) clearTimeout(timer)
    return null
}

function shortcutEntry(action) {
    return props.shortcuts?.[action]
}

function shortcutKey(action) {
    const entry = shortcutEntry(action)
    return typeof entry === "string" ? entry : entry?.key
}

function shortcutLabel(action, fallback) {
    const entry = shortcutEntry(action)
    return (typeof entry === "object" && entry?.label) || fallback
}

// ─── Computed ────────────────────────────────────────────────────────────────

const normalizedVideoId = computed(() => {
    const id = props.animeMeta?.videoId
    return id != null ? String(id).trim() || null : null
})

const thumbnailJpgUrl = computed(() => props.animeMeta?.thumbnailJpgUrl || null)

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
    return duration.value > 0 ? clamp((time / duration.value) * 100, 0, 100) : 0
})

const displayTime = computed(() => isDraggingProgress.value ? dragPreviewTime.value : currentTime.value)

const showRemainingTime = ref(false)

const positionLabel = computed(() => {
    const total = formatTime(duration.value)
    if (!showRemainingTime.value) return `${formatTime(displayTime.value)} / ${total}`
    const remaining = Math.max(0, duration.value - displayTime.value)
    return `-${formatTime(remaining)} / ${total}`
})

function toggleTimeDisplay() {
    showRemainingTime.value = !showRemainingTime.value
}

const tooltipLabels = computed(() => {
    const tooltip = (action, fallback, transform = label => label) => {
        const entry = shortcutEntry(action)
        if (!entry) return fallback
        return `${transform(shortcutLabel(action, fallback))} (${formatShortcutKey(entry)})`
    }
    return {
        playPause: tooltip("playPause", "播放/暫停"),
        skipOP: tooltip("skipOP", "跳過片頭"),
        mute: tooltip("mute", "靜音", label => label.split("/")[0]),
        nextEpisode: tooltip("nextEpisode", "下一集"),
        fullscreen: tooltip("fullscreen", "全螢幕", label => label.split("/")[0]),
        theaterMode: shortcutEntry("theaterMode")
            ? `${props.theaterMode ? "關閉劇院模式" : "劇院模式"} (${formatShortcutKey(shortcutEntry("theaterMode"))})`
            : (props.theaterMode ? "關閉劇院模式" : "劇院模式"),
    }
})

const playbackSpeeds = PLAYBACK_SPEEDS

/** Hide cursor over the chrome while playback is active and chrome auto-hides */
const hidePlaybackCursor = computed(
    () => !!props.src && isPlaying.value && !showControls.value && !autoplayVisible.value
)

// ─── Controls visibility ─────────────────────────────────────────────────────

function resetControlsTimeout() {
    showControls.value = true
    controlsTimeout = clearTimer(controlsTimeout)
    if (showSettings.value) return
    if (isPlaying.value) {
        controlsTimeout = setTimeout(() => {
            if (!isHoveringVolume) {
                showControls.value = false
                showVolumeSlider.value = false
            }
        }, 3000)
    }
}

function handleMouseLeave() {
    if (isPlaying.value && !isHoveringVolume) {
        showControls.value = false
        showVolumeSlider.value = false
    }
}

// ─── Notification ────────────────────────────────────────────────────────────

function showNotification(message, icon, persistent = false) {
    notification.value = { message, icon, show: true }
    notificationTimeout = clearTimer(notificationTimeout)
    if (!persistent) {
        notificationTimeout = setTimeout(() => {
            notification.value.show = false
            notificationTimeout = null
        }, 800)
    }
}

// ─── Playback ────────────────────────────────────────────────────────────────

function togglePlay() {
    const video = videoRef.value
    if (!video) return
    if (video.paused) video.play().catch(() => {})
    else video.pause()
}

function skip(seconds) {
    const video = videoRef.value
    if (!video) return
    const maxTime = Number.isFinite(video.duration) ? video.duration : Infinity
    video.currentTime = clamp(video.currentTime + seconds, 0, maxTime)
}

function skipOP() {
    skip(85)
    showNotification(shortcutLabel("skipOP", "跳過片頭"), "fast_forward")
}

function handleNextEpisode() {
    autoplayNextTimeout = clearTimer(autoplayNextTimeout)
    emit("next-episode")
    showNotification(shortcutLabel("nextEpisode", "下一集"), "skip_next")
}

function setPlaybackRate(rate) {
    const video = videoRef.value
    if (!video) return
    playbackRate.value = rate
    video.playbackRate = rate
    showNotification(`${rate}x 速度`, "speed")
}

function adjustPlaybackRate(direction) {
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

async function toggleFullscreen() {
    try {
        if (!document.fullscreenElement) await containerRef.value?.requestFullscreen()
        else await document.exitFullscreen()
    } catch {}
}

function handleFullscreenChange() { isFullscreen.value = !!document.fullscreenElement }
function toggleTheaterMode() { emit("toggle-theater-mode") }

// ─── Volume ──────────────────────────────────────────────────────────────────

function setVolume(value, persist = true) {
    const nextVolume = clamp(Number(value) || 0, 0, 1)
    const video = videoRef.value
    volume.value = nextVolume
    isMuted.value = nextVolume === 0
    if (video) {
        video.volume = nextVolume
        video.muted = nextVolume === 0
    }
    if (persist && typeof localStorage !== "undefined")
        localStorage.setItem("videoVolume", String(nextVolume))
}

function handleVolumeChange(e) { setVolume(e.target.value) }

function toggleMute() {
    const video = videoRef.value
    if (!video) return
    video.muted = !video.muted
    isMuted.value = video.muted || video.volume === 0
}

function handleVolumeAreaEnter() { isHoveringVolume = true; showVolumeSlider.value = true }
function handleVolumeAreaLeave() { isHoveringVolume = false; showVolumeSlider.value = false }

// ─── Auto-play next episode ───────────────────────────────────────────────────

function updateAutoplayCountdown(remainingSecs) {
    if (remainingSecs > 0.5) {
        autoplayNextTimeout = clearTimer(autoplayNextTimeout)
    }
    if (!autoplayEnabled.value || autoplayDismissed.value) {
        autoplayNextTimeout = clearTimer(autoplayNextTimeout)
        resetAutoplayCountdown()
        return
    }

    if (remainingSecs <= 0) {
        if (autoplayNextTimeout) return
        resetAutoplayCountdown()
        autoplayNextTimeout = setTimeout(() => {
            autoplayNextTimeout = null
            handleNextEpisode()
        }, 1000)
        return
    }

    if (remainingSecs <= AUTOPLAY_TRIGGER_SECS) {
        autoplayVisible.value = true
        autoplaySecsLeft.value = clamp(Math.ceil(remainingSecs), 0, AUTOPLAY_COUNTDOWN_SECS)
    } else {
        resetAutoplayCountdown()
    }
}

function resetAutoplayCountdown() {
    autoplayVisible.value = false
    autoplaySecsLeft.value = AUTOPLAY_COUNTDOWN_SECS
    lastAutoplaySecond = null
}

function dismissAutoplay() {
    autoplayDismissed.value = true
    autoplayNextTimeout = clearTimer(autoplayNextTimeout)
    resetAutoplayCountdown()
}

function toggleAutoplay() {
    autoplayEnabled.value = !autoplayEnabled.value
    if (typeof localStorage !== "undefined")
        localStorage.setItem("autoplayEnabled", autoplayEnabled.value)
    if (!autoplayEnabled.value) {
        autoplayNextTimeout = clearTimer(autoplayNextTimeout)
        resetAutoplayCountdown()
    }
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
    const clickedInside = e.composedPath?.().includes(settingsRef.value)
        ?? settingsRef.value?.contains(e.target)
    if (!clickedInside) {
        closeSettings()
    }
}

// ─── Progress bar ────────────────────────────────────────────────────────────

function calculateTimeFromPosition(e) {
    if (!progressRef.value || !videoRef.value || duration.value <= 0) return null
    const rect = progressRef.value.getBoundingClientRect()
    if (!rect.width) return null
    return clamp((e.clientX - rect.left) / rect.width, 0, 1) * duration.value
}

function handleProgressPointerDown(e) {
    if (e.pointerType === "mouse" && e.button !== 0) return
    e.preventDefault()
    progressRef.value?.setPointerCapture?.(e.pointerId)
    isDraggingProgress.value = true
    isHoveringProgress.value = false
    activeThumbnail.value = null
    const t = calculateTimeFromPosition(e)
    if (t !== null) dragPreviewTime.value = t
    showControls.value = true
    controlsTimeout = clearTimer(controlsTimeout)
}

function handleProgressPointerMove(e) {
    if (!isDraggingProgress.value) {
        handleProgressHover(e)
        return
    }
    e.preventDefault()
    const t = calculateTimeFromPosition(e)
    if (t !== null) dragPreviewTime.value = t
}

function handleProgressPointerUp(e) {
    if (!isDraggingProgress.value) return
    const video = videoRef.value
    const t = e.type === "pointercancel"
        ? dragPreviewTime.value
        : calculateTimeFromPosition(e) ?? dragPreviewTime.value
    progressRef.value?.releasePointerCapture?.(e.pointerId)
    if (video && Number.isFinite(t)) {
        currentTime.value = t
        video.currentTime = t
    }
    isDraggingProgress.value = false
    if (isPlaying.value) resetControlsTimeout()
}

function handleProgressHover(e) {
    if (isDraggingProgress.value || !progressRef.value) return
    const rect = progressRef.value.getBoundingClientRect()
    if (!rect.width) return
    const pos = clamp((e.clientX - rect.left) / rect.width, 0, 1)
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
    const generation = ++thumbnailGeneration
    thumbnailsAbortController?.abort()
    thumbnailsAbortController = null
    activeThumbnail.value = null
    thumbnailsSegments.value = []
    if (!videoId || typeof window === "undefined") return

    const vttText = props.animeMeta?.thumbnailVttText
    if (vttText) {
        thumbnailsSegments.value = parseThumbnailsVtt(vttText)
        return
    }

    const vttFetchUrl = props.animeMeta?.thumbnailsVttUrl
    if (!vttFetchUrl) return

    if (thumbnailsVttCache.has(vttFetchUrl)) {
        const cached = thumbnailsVttCache.get(vttFetchUrl)
        thumbnailsVttCache.delete(vttFetchUrl)
        thumbnailsVttCache.set(vttFetchUrl, cached)
        thumbnailsSegments.value = cached
        return
    }

    try {
        const controller = new AbortController()
        thumbnailsAbortController = controller
        const res = await fetch(vttFetchUrl, { signal: controller.signal })
        if (!res.ok) throw new Error(`${res.status}`)
        const segments = parseThumbnailsVtt(await res.text())
        if (generation !== thumbnailGeneration || isUnmounted) return
        thumbnailsSegments.value = segments
        thumbnailsVttCache.set(vttFetchUrl, segments)
        if (thumbnailsVttCache.size > THUMB_CACHE_LIMIT)
            thumbnailsVttCache.delete(thumbnailsVttCache.keys().next().value)
        if (segments.length && thumbnailJpgUrl.value) {
            const img = new Image()
            img.crossOrigin = "anonymous"
            img.src = thumbnailJpgUrl.value
        }
    } catch (error) {
        if (error?.name === "AbortError" || generation !== thumbnailGeneration || isUnmounted) return
        thumbnailsSegments.value = []
        activeThumbnail.value = null
    } finally {
        if (generation === thumbnailGeneration) thumbnailsAbortController = null
    }
}

watch(
    [() => normalizedVideoId.value, () => props.animeMeta?.thumbnailVttText, () => props.animeMeta?.thumbnailsVttUrl],
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
function onVolumeChange() {
    const video = videoRef.value
    if (video) {
        volume.value = clamp(video.volume, 0, 1)
        isMuted.value = video.muted || video.volume === 0
    }
    emit("volumechange")
}
function onRateChange() {
    if (videoRef.value && !isSpaceHeld)
        playbackRate.value = videoRef.value.playbackRate
}
function onLoadedMetadata() {
    const nextDuration = videoRef.value?.duration
    duration.value = Number.isFinite(nextDuration) ? nextDuration : 0
}
function onLoadedData() { isLoading.value = false; emit("loadeddata") }
function onLoadStart() { isLoading.value = true; emit("loadstart") }
function onWaiting() { if (isPlaying.value) isLoading.value = true }
function onCanPlay() { isLoading.value = false }

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

    if (props.hasNextEpisode && duration.value > 0 && autoplayEnabled.value && !autoplayDismissed.value) {
        const remaining = Math.max(0, duration.value - video.currentTime)
        if (remaining <= AUTOPLAY_TRIGGER_SECS || autoplayVisible.value) {
            const second = Math.ceil(remaining)
            if (second !== lastAutoplaySecond) {
                lastAutoplaySecond = second
                updateAutoplayCountdown(remaining)
            }
        }
    } else if (autoplayVisible.value) {
        resetAutoplayCountdown()
    }

    emit("timeupdate")
}

// ─── Keyboard shortcuts ──────────────────────────────────────────────────────

function isEditableTarget(target) {
    return target?.tagName === "INPUT"
        || target?.tagName === "TEXTAREA"
        || target?.tagName === "SELECT"
        || target?.isContentEditable
}

function releaseSpaceHold(toggleOnTap = false, notify = true) {
    spacePressTimeout = clearTimer(spacePressTimeout)
    if (!isSpaceHeld) return
    const video = videoRef.value
    if (spaceBoostActive && video) {
        video.playbackRate = originalPlaybackRate
        playbackRate.value = originalPlaybackRate
        if (notify) showNotification("正常速度", "play_arrow")
        else notification.value.show = false
    } else if (toggleOnTap) {
        togglePlay()
    }
    spaceBoostActive = false
    isSpaceHeld = false
}

function handleKeydown(e) {
    if (!videoRef.value || !props.src || isEditableTarget(e.target)) return
    const action = Object.keys(props.shortcuts || {}).find(key => shortcutKey(key) === e.key)
    if (!action) return
    e.preventDefault()

    if (action === "playPause") {
        if (!isSpaceHeld) {
            isSpaceHeld = true
            originalPlaybackRate = videoRef.value.playbackRate || 1
            spacePressTimeout = setTimeout(() => {
                if (isSpaceHeld && videoRef.value) {
                    spaceBoostActive = true
                    videoRef.value.playbackRate = 2
                    showNotification("2x 速度", "fast_forward", true)
                }
            }, 300)
        }
        return
    }

    const seeks = {
        seekBackward5: [-5, "fast_rewind"],
        seekForward5: [5, "fast_forward"],
        seekBackward10: [-10, "fast_rewind"],
        seekForward10: [10, "fast_forward"],
    }
    if (seeks[action]) {
        const [seconds, icon] = seeks[action]
        skip(seconds)
        showNotification(shortcutLabel(action, `${seconds > 0 ? "+" : ""}${seconds} 秒`), icon)
    } else if (action === "decreasePlaybackSpeed") adjustPlaybackRate(-1)
    else if (action === "increasePlaybackSpeed") adjustPlaybackRate(1)
    else if (action === "skipOP") skipOP()
    else if (action === "previousEpisode") {
        emit("previous-episode")
        showNotification(shortcutLabel(action, "上一集"), "skip_previous")
    } else if (action === "nextEpisode") handleNextEpisode()
    else if (action === "fullscreen") toggleFullscreen()
    else if (action === "theaterMode") toggleTheaterMode()
    else if (action === "mute") {
        const wasMuted = isMuted.value
        toggleMute()
        const labels = shortcutLabel("mute", "靜音/取消靜音").split("/")
        showNotification(wasMuted ? (labels[1] || "取消靜音") : labels[0], wasMuted ? "volume_up" : "volume_off")
    } else if (action === "volumeUp" || action === "volumeDown") {
        const newVolume = clamp(volume.value + (action === "volumeUp" ? 0.1 : -0.1), 0, 1)
        setVolume(newVolume)
        const icon = newVolume === 0 ? "volume_off" : newVolume < 0.5 ? "volume_down" : "volume_up"
        showNotification(`音量 ${Math.round(newVolume * 100)}%`, icon)
    }
}

function handleKeyup(e) {
    if (!videoRef.value || !props.src || shortcutKey("playPause") !== e.key) return
    e.preventDefault()
    releaseSpaceHold(true)
}

function requestStreamRecovery() {
    streamErrorTimeout = clearTimer(streamErrorTimeout)
    streamErrorTimeout = setTimeout(() => emit("stream-error"), 300)
}

// ─── HLS setup ───────────────────────────────────────────────────────────────

function destroyHls() {
    hlsInstance?.destroy()
    hlsInstance = null
}

function resetRecoveryAttempts() {
    streamRecoveryAttempts.network = 0
    streamRecoveryAttempts.media = 0
}

function resetPlayerForSource() {
    videoRef.value?.pause()
    controlsTimeout = clearTimer(controlsTimeout)
    notificationTimeout = clearTimer(notificationTimeout)
    streamErrorTimeout = clearTimer(streamErrorTimeout)
    autoplayNextTimeout = clearTimer(autoplayNextTimeout)
    releaseSpaceHold(false, false)
    resetRecoveryAttempts()
    Object.assign(notification.value, { show: false, message: "", icon: "" })
    currentTime.value = 0
    duration.value = 0
    buffered.value = 0
    isPlaying.value = false
    isLoading.value = !!props.src
    showControls.value = true
    showVolumeSlider.value = false
    closeSettings()
    originalPlaybackRate = 1
    playbackRate.value = 1
    autoplayDismissed.value = false
    resetAutoplayCountdown()
}

async function applyVideoSource(src, isHls, video) {
    const generation = ++sourceGeneration
    destroyHls()
    effectiveVideoSrc.value = ""

    if (!src || !video || isUnmounted) return
    if (!isHls) {
        effectiveVideoSrc.value = src
        return
    }

    let Hls
    try {
        Hls = (await import("hls.js")).default
    } catch {
        if (generation === sourceGeneration) requestStreamRecovery()
        return
    }
    if (generation !== sourceGeneration || video !== videoRef.value || isUnmounted) return
    if (!Hls.isSupported()) {
        effectiveVideoSrc.value = src
        return
    }

    try {
        const hls = new Hls({
            fragLoadingMaxRetry: 4,
            manifestLoadingMaxRetry: 4,
            levelLoadingMaxRetry: 4,
        })
        hlsInstance = hls
        hls.on(Hls.Events.ERROR, (_, data) => {
            if (!data.fatal || hlsInstance !== hls || generation !== sourceGeneration) return
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR && streamRecoveryAttempts.network < 2) {
                streamRecoveryAttempts.network++
                isLoading.value = true
                hls.startLoad()
            } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR && streamRecoveryAttempts.media < 2) {
                streamRecoveryAttempts.media++
                isLoading.value = true
                hls.recoverMediaError()
            } else {
                requestStreamRecovery()
            }
        })
        hls.loadSource(src)
        hls.attachMedia(video)
    } catch {
        if (generation === sourceGeneration) requestStreamRecovery()
    }
}

let activeSource
watch([() => props.src, () => props.isHls, videoRef], ([src, isHls, video]) => {
    if (src !== activeSource) {
        activeSource = src
        resetPlayerForSource()
    }
    if (video) {
        video.volume = volume.value
        video.muted = isMuted.value
        video.playbackRate = playbackRate.value
    }
    applyVideoSource(src, isHls, video)
}, { immediate: true })

// ─── Lifecycle ───────────────────────────────────────────────────────────────

defineExpose({
    videoElement: computed(() => videoRef.value),
    currentTime: computed(() => currentTime.value),
    duration: computed(() => duration.value),
    isPlaying: computed(() => isPlaying.value),
    volume: computed(() => volume.value),
    play: () => videoRef.value?.play().catch(() => {}),
    pause: () => videoRef.value?.pause(),
    seek: (time) => {
        const video = videoRef.value
        if (!video) return
        const maxTime = Number.isFinite(video.duration) ? video.duration : Infinity
        video.currentTime = clamp(Number(time) || 0, 0, maxTime)
    },
    setVolume,
})

onMounted(() => {
    const savedVolume = localStorage.getItem("videoVolume")
    if (savedVolume !== null && Number.isFinite(Number(savedVolume)))
        setVolume(Number(savedVolume), false)
    const savedAutoplay = localStorage.getItem("autoplayEnabled")
    if (savedAutoplay !== null) {
        autoplayEnabled.value = savedAutoplay !== "false"
    }
    document.addEventListener("fullscreenchange", handleFullscreenChange)
    document.addEventListener("pointerdown", handleDocumentPointerDown)
    window.addEventListener("keydown", handleKeydown)
    window.addEventListener("keyup", handleKeyup)
    window.addEventListener("blur", handleWindowBlur)
})

// Close settings panel when controls hide
watch(showControls, (v) => { if (!v) closeSettings() })

function handleWindowBlur() { releaseSpaceHold(false) }

onUnmounted(() => {
    isUnmounted = true
    sourceGeneration++
    thumbnailGeneration++
    destroyHls()
    thumbnailsAbortController?.abort()
    controlsTimeout = clearTimer(controlsTimeout)
    notificationTimeout = clearTimer(notificationTimeout)
    spacePressTimeout = clearTimer(spacePressTimeout)
    autoplayNextTimeout = clearTimer(autoplayNextTimeout)
    streamErrorTimeout = clearTimer(streamErrorTimeout)
    document.removeEventListener("fullscreenchange", handleFullscreenChange)
    document.removeEventListener("pointerdown", handleDocumentPointerDown)
    window.removeEventListener("keydown", handleKeydown)
    window.removeEventListener("keyup", handleKeyup)
    window.removeEventListener("blur", handleWindowBlur)
})
</script>

<template>
    <div ref="containerRef" :class="[
        'relative w-full rounded-lg overflow-hidden',
        hidePlaybackCursor ? 'cursor-none' : 'cursor-default',
        props.theaterMode
            ? 'aspect-video bg-black lg:max-h-[calc(100vh-8rem)]'
            : 'aspect-video bg-black/5 dark:bg-white/10'
    ]" @mousemove="resetControlsTimeout" @mouseleave="handleMouseLeave">

        <!-- Video Element -->
        <video v-if="src" ref="videoRef" :src="effectiveVideoSrc || undefined" :autoplay="autoplay" :preload="preload"
            :class="[
                'w-full h-full block',
                hidePlaybackCursor ? 'cursor-none' : 'cursor-pointer',
                props.theaterMode ? 'object-contain bg-black' : '',
            ]" @play="onPlay" @pause="onPause" @timeupdate="onTimeUpdate" @loadedmetadata="onLoadedMetadata"
            @loadeddata="onLoadedData" @loadstart="onLoadStart" @ended="onEnded" @volumechange="onVolumeChange"
            @ratechange="onRateChange" @waiting="onWaiting" @canplay="onCanPlay" @canplaythrough="onCanPlay"
            @error="requestStreamRecovery"
            @click="togglePlay" />

        <!-- No Video Message -->
        <div v-else class="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
            <span class="material-symbols-rounded outlined text-4xl sm:text-6xl mb-4 opacity-50">play_circle</span>
            <p class="text-base sm:text-lg">無可用影片</p>
        </div>

        <!-- Loading Indicator -->
        <div v-if="isLoading && src"
            class="absolute inset-0 flex flex-col items-center justify-center bg-black/50 z-10">
            <div
                class="w-10 h-10 sm:w-12 sm:h-12 border-[6px] border-white/25 border-t-white rounded-full animate-spin mb-3" />
            <p class="text-white/90 text-sm">載入影片中...</p>
        </div>

        <!-- Center Play/Pause Button -->
        <transition name="fade">
            <div v-show="!isLoading && showControls && src"
                class="absolute inset-0 flex items-center justify-center pointer-events-none z-[2]">
                <button @click="togglePlay"
                    class="w-14 h-14 sm:w-[4.25rem] sm:h-[4.25rem] rounded-full bg-black/55 backdrop-blur-md text-white flex items-center justify-center cursor-pointer pointer-events-auto transition-all duration-200 hover:bg-black/70 active:scale-95 focus:outline-none">
                    <span class="material-symbols-rounded text-3xl sm:text-[2.5rem]">{{ isPlaying ? 'pause' :
                        'play_arrow' }}</span>
                </button>
            </div>
        </transition>

        <!-- Fullscreen: Anime title + episode overlay (top-left) -->
        <transition name="fade">
            <div v-if="isFullscreen && showControls && src && animeMeta?.title"
                class="absolute top-0 left-0 z-[3] px-4 pt-4 pointer-events-none">
                <p
                    class="text-white font-semibold text-sm sm:text-base leading-tight [text-shadow:0_2px_10px_rgba(0,0,0,0.7)]">
                    {{ animeMeta.title }}
                </p>
                <p v-if="animeMeta.episode"
                    class="text-white/75 text-xs sm:text-sm mt-0.5 [text-shadow:0_2px_8px_rgba(0,0,0,0.7)]">
                    第 {{ animeMeta.episode }} 集
                </p>
            </div>
        </transition>

        <!-- Auto-play next episode countdown -->
        <transition name="autoplay-btn">
            <div v-if="autoplayVisible && hasNextEpisode && src"
                class="absolute right-3 sm:right-5 z-[8] transition-all duration-300"
                :class="showControls ? 'bottom-[5.25rem] sm:bottom-[6.5rem]' : 'bottom-3 sm:bottom-4'">
                <div class="relative flex items-stretch overflow-hidden rounded-full bg-black/55 backdrop-blur-md">
                    <div class="absolute inset-0 bg-white/15 origin-right"
                        :style="{ transform: `scaleX(${autoplaySecsLeft / AUTOPLAY_COUNTDOWN_SECS})`, transition: 'transform 1s linear' }" />
                    <button @click="handleNextEpisode"
                        class="relative z-[1] inline-flex h-10 items-center gap-1.5 px-3.5 text-sm font-medium text-white cursor-pointer leading-none focus:outline-none">
                        <span class="material-symbols-rounded text-xl leading-none flex-shrink-0">skip_next</span>
                        <span class="whitespace-nowrap leading-none">{{ tooltipLabels.nextEpisode }}</span>
                    </button>
                    <button @click="dismissAutoplay"
                        class="relative z-[1] h-10 w-10 flex items-center justify-center text-white/60 hover:text-white transition-colors cursor-pointer focus:outline-none"
                        title="關閉" aria-label="關閉自動播放">
                        <span class="material-symbols-rounded text-lg">close</span>
                    </button>
                </div>
            </div>
        </transition>

        <!-- Custom Controls -->
        <transition name="slide-up">
            <div v-show="!isLoading && showControls && src"
                class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/75 via-black/40 to-transparent z-[9] pb-3 sm:pb-4 pointer-events-auto"
                @click.stop>

                <!-- Progress Bar -->
                <div class="px-3 sm:px-4 pt-1">
                    <div ref="progressRef"
                        class="relative h-6 sm:h-7 cursor-pointer group flex items-center touch-none"
                        @pointerdown="handleProgressPointerDown" @pointermove="handleProgressPointerMove"
                        @pointerup="handleProgressPointerUp" @pointercancel="handleProgressPointerUp"
                        @pointerenter="handleProgressMouseEnter" @pointerleave="handleProgressMouseLeaveBar">
                        <div class="relative w-full h-1.5 bg-white/30 rounded-full transition-all duration-150 group-hover:h-2"
                            :class="{ 'h-2': isDraggingProgress }">
                            <div class="absolute h-full bg-white/40 rounded-full transition-all duration-300 pointer-events-none"
                                :style="{ width: `${buffered}%` }" />
                            <div class="absolute h-full bg-white rounded-full pointer-events-none"
                                :class="isDraggingProgress ? 'transition-none' : 'transition-all duration-100'"
                                :style="{ width: `${progress}%` }">
                                <div class="absolute right-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-white rounded-full shadow transition-transform duration-150 scale-0 group-hover:scale-100"
                                    :class="{ 'scale-100': isDraggingProgress || isHoveringProgress }" />
                            </div>
                            <transition name="fade">
                                <div v-if="isHoveringProgress && !isDraggingProgress && duration > 0"
                                    class="absolute bottom-full mb-2.5 -translate-x-1/2 pointer-events-none z-[9]"
                                    :style="{ left: `${hoverPreviewPosition}%` }">
                                    <div v-if="activeThumbnail && thumbnailJpgUrl" class="flex flex-col items-center"
                                        :style="{ width: `${THUMB_PREVIEW_W}px` }">
                                        <div class="thumb-preview-frame relative overflow-hidden rounded-lg shadow-xl"
                                            :style="{ width: `${THUMB_PREVIEW_W}px`, height: `${thumbnailPreviewHeight}px` }">
                                            <img :src="thumbnailJpgUrl"
                                                class="absolute top-0 left-0 block w-auto h-auto"
                                                :style="thumbnailImageStyle" alt="Thumbnail preview" />
                                        </div>
                                        <div
                                            class="mt-1.5 bg-black/70 backdrop-blur-md text-white px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap tabular-nums text-center">
                                            {{ formatTime(hoverPreviewTime) }}
                                        </div>
                                    </div>
                                    <div v-else
                                        class="bg-black/70 backdrop-blur-md text-white px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap tabular-nums">
                                        {{ formatTime(hoverPreviewTime) }}
                                    </div>
                                </div>
                            </transition>
                        </div>
                    </div>
                </div>

                <!-- Control Buttons -->
                <div class="flex items-center justify-between px-3 sm:px-4 gap-2 mt-1">
                    <div class="flex items-center gap-1.5 sm:gap-2 min-w-0">
                        <div class="player-pill-group">
                            <button @click="togglePlay" :title="tooltipLabels.playPause" class="player-group-btn">
                                <span class="material-symbols-rounded text-[1.35rem]">{{ isPlaying ? 'pause' :
                                    'play_arrow' }}</span>
                            </button>
                            <button @click="skipOP" :title="tooltipLabels.skipOP" class="player-group-btn">
                                <span class="material-symbols-rounded text-[1.35rem]">fast_forward</span>
                            </button>
                        </div>

                        <div class="player-pill-group player-volume-group" :class="{ 'is-expanded': showVolumeSlider }"
                            @mouseenter="handleVolumeAreaEnter" @mouseleave="handleVolumeAreaLeave">
                            <span class="player-volume-hover" aria-hidden="true" />
                            <button @click="toggleMute" :title="tooltipLabels.mute"
                                class="player-group-btn player-volume-btn">
                                <span class="material-symbols-rounded text-[1.35rem]">
                                    {{ isMuted || volume === 0 ? 'volume_off' : volume < 0.5 ? 'volume_down'
                                        : 'volume_up' }} </span>
                            </button>
                            <div class="player-volume-slider">
                                <input type="range" min="0" max="1" step="0.01" :value="isMuted ? 0 : volume"
                                    @input="handleVolumeChange" @mousedown.stop class="player-volume-range"
                                    :style="{ '--volume-pct': `${(isMuted ? 0 : volume) * 100}%` }" />
                            </div>
                        </div>

                        <div class="player-pill-group">
                            <button type="button" @click="toggleTimeDisplay"
                                :title="showRemainingTime ? '顯示已播放時間' : '顯示剩餘時間'"
                                class="player-group-btn player-group-btn--time text-[0.7rem] sm:text-xs font-medium tabular-nums whitespace-nowrap"
                                :class="{ 'text-white/60': isDraggingProgress }">
                                {{ positionLabel }}
                            </button>
                        </div>
                    </div>

                    <div ref="settingsRef" class="relative flex items-center shrink-0">
                        <div class="player-pill-group">
                            <button @click="toggleSettings" title="設定" class="player-group-btn"
                                :class="{ 'bg-white/15': showSettings }">
                                <span class="material-symbols-rounded text-[1.35rem]">settings</span>
                            </button>
                            <button @click="toggleTheaterMode" :title="tooltipLabels.theaterMode"
                                class="player-group-btn hidden sm:inline-flex">
                                <span class="material-symbols-rounded text-[1.35rem]" :class="{ outlined: !props.theaterMode }">developer_mode_tv</span>
                            </button>
                            <button @click="toggleFullscreen" :title="tooltipLabels.fullscreen"
                                class="player-group-btn">
                                <span class="material-symbols-rounded text-[1.35rem]">{{ isFullscreen ?
                                    'fullscreen_exit' : 'fullscreen' }}</span>
                            </button>
                        </div>

                        <div v-if="showSettings" @click.stop
                            class="absolute bottom-full right-0 mb-2 bg-black/80 backdrop-blur-xl rounded-2xl shadow-2xl py-1.5 z-[10] min-w-[11.5rem] max-w-[min(92vw,18rem)] origin-bottom-right">
                            <transition name="settings-page" mode="out-in">
                                <div :key="settingsPage">
                                    <template v-if="settingsPage === 'main'">
                                        <button @click="toggleAutoplay"
                                            class="w-full flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm text-left text-white hover:bg-white/10 transition-colors">
                                            <span>自動播放下一集</span>
                                            <span class="text-xs text-white/55">{{ autoplayEnabled ? '開啟' : '關閉'
                                                }}</span>
                                        </button>
                                        <button @click="toggleTheaterMode"
                                            class="w-full flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm text-left text-white hover:bg-white/10 transition-colors sm:hidden">
                                            <span>劇院模式</span>
                                            <span class="text-xs text-white/55">{{ props.theaterMode ? '開啟' : '關閉'
                                                }}</span>
                                        </button>
                                        <button @click.stop="openSpeedSettings"
                                            class="w-full flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm text-left text-white hover:bg-white/10 transition-colors">
                                            <span>播放速度</span>
                                            <span
                                                class="inline-flex items-center gap-0.5 text-xs text-white/55 leading-none">
                                                {{ playbackRate }}x
                                                <span
                                                    class="material-symbols-rounded text-base leading-none">chevron_right</span>
                                            </span>
                                        </button>
                                    </template>
                                    <template v-else>
                                        <button @click="settingsPage = 'main'"
                                            class="w-full flex items-center gap-1 px-3.5 py-2.5 text-sm text-left text-white hover:bg-white/10 transition-colors">
                                            <span class="material-symbols-rounded text-lg">chevron_left</span>
                                            <span>播放速度</span>
                                        </button>
                                        <button v-for="speed in playbackSpeeds" :key="speed"
                                            @click="setPlaybackRate(speed)"
                                            class="w-full flex items-center justify-between px-3.5 py-2.5 text-sm text-left text-white hover:bg-white/10 transition-colors"
                                            :class="{ 'bg-white/10 font-medium': playbackRate === speed }">
                                            <span>{{ speed }}x</span>
                                            <span v-if="playbackRate === speed"
                                                class="material-symbols-rounded text-base">check</span>
                                        </button>
                                    </template>
                                </div>
                            </transition>
                        </div>
                    </div>
                </div>
            </div>
        </transition>

        <!-- Top Gradient -->
        <transition name="fade">
            <div v-show="showControls && src"
                class="absolute top-0 left-0 right-0 h-14 sm:h-20 bg-gradient-to-b from-black/45 to-transparent z-[1] pointer-events-none" />
        </transition>

        <!-- Shortcut Notification -->
        <transition name="fade-scale">
            <div v-if="notification.show"
                class="absolute top-14 left-1/2 -translate-x-1/2 z-[20] pointer-events-none sm:top-16">
                <div
                    class="bg-black/55 backdrop-blur-md text-white px-3 py-1.5 sm:px-4 rounded-full flex items-center justify-center gap-2 min-w-0 max-w-[min(90vw,20rem)]">
                    <span class="material-symbols-rounded shrink-0 text-lg sm:text-xl">{{ notification.icon }}</span>
                    <span class="text-xs sm:text-sm font-medium truncate">{{ notification.message }}</span>
                </div>
            </div>
        </transition>
    </div>
</template>

<style scoped>
.player-pill-group {
    height: 2.5rem; display: inline-flex; align-items: center;
    gap: 0.125rem; padding: 0 0.25rem; border-radius: 9999px;
    background: rgba(0, 0, 0, 0.55);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
}

.player-group-btn {
    width: 3rem; height: 2rem; display: inline-flex;
    align-items: center; justify-content: center; border-radius: 9999px;
    color: white; border: 0; cursor: pointer; outline: none;
    transition: background-color 0.2s ease, transform 0.2s ease;
}
.player-group-btn:hover { background: rgba(255, 255, 255, 0.15); }
.player-group-btn:active { transform: scale(0.95); }
.player-group-btn--time { width: auto; padding: 0 0.625rem; }
.player-volume-group { position: relative; align-items: center; }
.player-volume-hover {
    position: absolute; left: 0.25rem; top: 50%; z-index: 0;
    width: 2rem; height: 2rem;
    border-radius: 9999px;
    pointer-events: none;
    transform: translateY(-50%);
    transition: width 0.28s cubic-bezier(0.22, 1, 0.36, 1), background-color 0.2s ease;
}
.player-volume-group:hover .player-volume-hover,
.player-volume-group.is-expanded .player-volume-hover { background: rgba(255, 255, 255, 0.15); }
.player-volume-group.is-expanded .player-volume-hover { width: calc(100% - 0.5rem); }
.player-volume-btn,
.player-volume-slider { position: relative; z-index: 1; }
.player-volume-btn:hover { background: transparent !important; }
.player-volume-slider {
    display: none; align-items: center; align-self: center;
    width: 0; height: 2rem; opacity: 0; overflow: hidden;
    transition: width 0.28s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.2s ease;
}

.player-volume-range {
    -webkit-appearance: none; appearance: none;
    display: block; width: 5rem; height: 100%;
    margin: 0; padding: 0 0.2rem;
    background: transparent; outline: none; cursor: pointer;
}

.player-volume-range::-webkit-slider-runnable-track {
    height: 4px; border-radius: 9999px;
    background: linear-gradient(to right, #fff var(--volume-pct, 0%), rgba(255, 255, 255, 0.3) var(--volume-pct, 0%));
}
.player-volume-range::-moz-range-track {
    height: 4px; border-radius: 9999px; background: rgba(255, 255, 255, 0.3);
}
.player-volume-range::-moz-range-progress {
    height: 4px; border-radius: 9999px; background: #fff;
}

.player-volume-range::-webkit-slider-thumb {
    -webkit-appearance: none; appearance: none;
    width: 12px; height: 12px; margin-top: -4px;
    border-radius: 9999px; background: #fff;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.25);
    cursor: pointer;
}
.player-volume-range::-moz-range-thumb {
    width: 12px; height: 12px; border: none;
    border-radius: 9999px; background: #fff;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.25);
    cursor: pointer;
}

@media (min-width: 640px) {
    .player-volume-slider { display: flex; }
    .player-volume-group.is-expanded .player-volume-slider {
        width: 5.9rem; opacity: 1; overflow: visible;
    }
}

.thumb-preview-frame { clip-path: inset(0 round 0.5rem); }
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.slide-up-enter-active, .slide-up-leave-active { transition: all 0.3s ease; }
.slide-up-enter-from, .slide-up-leave-to { opacity: 0; transform: translateY(1rem); }
.fade-scale-enter-active, .fade-scale-leave-active { transition: all 0.2s ease; }
.fade-scale-enter-from, .fade-scale-leave-to { opacity: 0; transform: translateX(-50%) translateY(-0.35rem) scale(0.92); }
.settings-page-enter-active, .settings-page-leave-active { transition: all 0.18s ease; }
.settings-page-enter-from { opacity: 0; transform: translateX(0.6rem); }
.settings-page-leave-to { opacity: 0; transform: translateX(-0.6rem); }
.autoplay-btn-enter-active, .autoplay-btn-leave-active { transition: opacity 0.2s ease; }
.autoplay-btn-enter-from, .autoplay-btn-leave-to { opacity: 0; }
</style>