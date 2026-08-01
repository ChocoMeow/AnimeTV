<script setup>
/**
 * Video player orchestrator — UI lives in sibling player/* components.
 */
const { formatShortcutKey } = useUserSettings()

const props = defineProps({
    src: { type: String, required: true },
    isHls: { type: Boolean, default: false },
    autoplay: { type: Boolean, default: false },
    preload: { type: String, default: 'metadata' },
    hasNextEpisode: { type: Boolean, default: true },
    theaterMode: { type: Boolean, default: false },
    shortcuts: { type: Object, default: () => null },
    animeMeta: { type: Object, default: () => ({}) },
})

const emit = defineEmits([
    'play', 'pause', 'ended', 'volumechange', 'loadstart', 'loadeddata', 'timeupdate',
    'next-episode', 'previous-episode', 'toggle-theater-mode', 'stream-error',
])

const AUTOPLAY_TRIGGER_SECS = 100
const AUTOPLAY_COUNTDOWN_SECS = 100
const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3]

const videoRef = ref(null)
const containerRef = ref(null)
const controlsRef = ref(null)
const effectiveVideoSrc = ref('')

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
const notification = ref({ show: false, message: '', icon: '' })
const showRemainingTime = ref(false)

const autoplayVisible = ref(false)
const autoplaySecsLeft = ref(AUTOPLAY_COUNTDOWN_SECS)
const autoplayDismissed = ref(false)
const autoplayEnabled = ref(true)

const showSettings = ref(false)
const settingsPage = ref('main')

const qualityLevels = ref([])
const selectedQuality = ref(-1)
const activeQualityIndex = ref(-1)

let controlsTimeout = null
let notificationTimeout = null
let spacePressTimeout = null
let autoplayNextTimeout = null
let streamErrorTimeout = null
let sourceGeneration = 0
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
    return typeof entry === 'string' ? entry : entry?.key
}
function shortcutLabel(action, fallback) {
    const entry = shortcutEntry(action)
    return (typeof entry === 'object' && entry?.label) || fallback
}

const {
    THUMB_PREVIEW_W,
    activeThumbnail,
    activeThumbnailSrc,
    thumbnailPreviewHeight,
    thumbnailImageStyle,
    updateActiveThumbnailForTime,
    clearActiveThumbnail,
} = usePlayerThumbnails({ animeMeta: computed(() => props.animeMeta) })

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

const {
    hasCaptions,
    captionTracks,
    resolvedCaptionTracks,
    selectedCaptionLang,
    captionLabel,
    activeCaptionText,
    applyCaptionTracks,
    setCaptionLang: selectCaptionLang,
    toggleCaptions,
} = useVideoCaptions({
    videoRef,
    captions: computed(() => props.animeMeta?.captions),
    notify: showNotification,
})

const progress = computed(() => {
    const time = isDraggingProgress.value ? dragPreviewTime.value : currentTime.value
    return duration.value > 0 ? clamp((time / duration.value) * 100, 0, 100) : 0
})
const displayTime = computed(() => (isDraggingProgress.value ? dragPreviewTime.value : currentTime.value))
const positionLabel = computed(() => {
    const total = formatTime(duration.value)
    if (!showRemainingTime.value) return `${formatTime(displayTime.value)} / ${total}`
    const remaining = Math.max(0, duration.value - displayTime.value)
    return `-${formatTime(remaining)} / ${total}`
})

const tooltipLabels = computed(() => {
    const tooltip = (action, fallback, transform = (label) => label) => {
        const entry = shortcutEntry(action)
        if (!entry) return fallback
        return `${transform(shortcutLabel(action, fallback))} (${formatShortcutKey(entry)})`
    }
    return {
        playPause: tooltip('playPause', '播放/暫停'),
        skipOP: tooltip('skipOP', '跳過片頭'),
        mute: tooltip('mute', '靜音', (label) => label.split('/')[0]),
        nextEpisode: tooltip('nextEpisode', '下一集'),
        fullscreen: tooltip('fullscreen', '全螢幕', (label) => label.split('/')[0]),
        theaterMode: shortcutEntry('theaterMode')
            ? `${props.theaterMode ? '關閉劇院模式' : '劇院模式'} (${formatShortcutKey(shortcutEntry('theaterMode'))})`
            : (props.theaterMode ? '關閉劇院模式' : '劇院模式'),
    }
})

const qualityLabel = computed(() => {
    if (selectedQuality.value === -1) {
        const active = qualityLevels.value.find((l) => l.index === activeQualityIndex.value)
        return active?.label ? `自動 · ${active.label}` : '自動'
    }
    return qualityLevels.value.find((l) => l.index === selectedQuality.value)?.label || '自動'
})

const hidePlaybackCursor = computed(
    () => !!props.src && isPlaying.value && !showControls.value && !autoplayVisible.value,
)

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
    showNotification(shortcutLabel('skipOP', '跳過片頭'), 'fast_forward')
}

function handleNextEpisode() {
    autoplayNextTimeout = clearTimer(autoplayNextTimeout)
    emit('next-episode')
    showNotification(shortcutLabel('nextEpisode', '下一集'), 'skip_next')
}

function setPlaybackRate(rate) {
    const video = videoRef.value
    if (!video) return
    playbackRate.value = rate
    video.playbackRate = rate
    showNotification(`${rate}x 速度`, 'speed')
}

function adjustPlaybackRate(direction) {
    const currentIndex = PLAYBACK_SPEEDS.indexOf(playbackRate.value)
    const safeIndex = currentIndex >= 0
        ? currentIndex
        : PLAYBACK_SPEEDS.reduce((best, speed, index) =>
            Math.abs(speed - playbackRate.value) < Math.abs(PLAYBACK_SPEEDS[best] - playbackRate.value) ? index : best
        , 0)
    const nextIndex = Math.min(PLAYBACK_SPEEDS.length - 1, Math.max(0, safeIndex + direction))
    if (nextIndex === safeIndex) return
    setPlaybackRate(PLAYBACK_SPEEDS[nextIndex])
}

async function toggleFullscreen() {
    try {
        if (!document.fullscreenElement) await containerRef.value?.requestFullscreen()
        else await document.exitFullscreen()
    } catch { /* ignore */ }
}

function handleFullscreenChange() { isFullscreen.value = !!document.fullscreenElement }
function toggleTheaterMode() { emit('toggle-theater-mode') }

function setVolume(value, persist = true) {
    const nextVolume = clamp(Number(value) || 0, 0, 1)
    const video = videoRef.value
    volume.value = nextVolume
    isMuted.value = nextVolume === 0
    if (video) {
        video.volume = nextVolume
        video.muted = nextVolume === 0
    }
    if (persist && typeof localStorage !== 'undefined') {
        localStorage.setItem('videoVolume', String(nextVolume))
    }
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

function updateAutoplayCountdown(remainingSecs) {
    if (remainingSecs > 0.5) autoplayNextTimeout = clearTimer(autoplayNextTimeout)
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
    if (typeof localStorage !== 'undefined') localStorage.setItem('autoplayEnabled', autoplayEnabled.value)
    if (!autoplayEnabled.value) {
        autoplayNextTimeout = clearTimer(autoplayNextTimeout)
        resetAutoplayCountdown()
    }
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

function formatQualityLabel(level, index) {
    if (level?.height) return `${level.height}p`
    const res = level?.attrs?.RESOLUTION || level?.attrs?.resolution
    if (typeof res === 'string' && res.includes('x')) {
        const h = Number(res.split('x')[1])
        return h > 0 ? `${h}p` : res
    }
    if (level?.bitrate) return `${Math.round(level.bitrate / 1000)} kbps`
    return `來源 ${index + 1}`
}

function resetQualityState() {
    qualityLevels.value = []
    selectedQuality.value = -1
    activeQualityIndex.value = -1
}

function syncQualityLevelsFromHls(hls) {
    const levels = hls?.levels
    if (!levels?.length) {
        resetQualityState()
        return
    }
    qualityLevels.value = levels
        .map((level, index) => ({
            index,
            label: formatQualityLabel(level, index),
            height: Number(level.height) || 0,
            bitrate: Number(level.bitrate) || 0,
        }))
        .sort((a, b) => b.height - a.height || b.bitrate - a.bitrate)

    if (selectedQuality.value !== -1 && !qualityLevels.value.some((l) => l.index === selectedQuality.value)) {
        selectedQuality.value = -1
        hls.currentLevel = -1
    }
}

function setQuality(levelIndex) {
    if (!hlsInstance) return
    selectedQuality.value = levelIndex
    hlsInstance.currentLevel = levelIndex
    if (levelIndex >= 0) activeQualityIndex.value = levelIndex
    settingsPage.value = 'main'
    resetControlsTimeout()
    const label = levelIndex === -1
        ? '自動'
        : qualityLevels.value.find((l) => l.index === levelIndex)?.label
    if (label) showNotification(`畫質 ${label}`, 'high_quality')
}

function progressApi() {
    return controlsRef.value?.progressBar
}

function calculateTimeFromPosition(e) {
    const bar = progressApi()
    if (!bar || !videoRef.value || duration.value <= 0) return null
    const rect = bar.getBoundingClientRect?.()
    if (!rect?.width) return null
    return clamp((e.clientX - rect.left) / rect.width, 0, 1) * duration.value
}

function handleProgressPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.preventDefault()
    progressApi()?.setPointerCapture?.(e.pointerId)
    isDraggingProgress.value = true
    isHoveringProgress.value = false
    clearActiveThumbnail()
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
    const t = e.type === 'pointercancel'
        ? dragPreviewTime.value
        : calculateTimeFromPosition(e) ?? dragPreviewTime.value
    progressApi()?.releasePointerCapture?.(e.pointerId)
    if (video && Number.isFinite(t)) {
        currentTime.value = t
        video.currentTime = t
    }
    isDraggingProgress.value = false
    if (isPlaying.value) resetControlsTimeout()
}

function handleProgressHover(e) {
    if (isDraggingProgress.value) return
    const bar = progressApi()
    const rect = bar?.getBoundingClientRect?.()
    if (!rect?.width) return
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
function handleProgressMouseLeaveBar() {
    isHoveringProgress.value = false
    clearActiveThumbnail()
}

function onPlay() { isPlaying.value = true; resetControlsTimeout(); emit('play') }
function onPause() { isPlaying.value = false; showControls.value = true; emit('pause') }
function onEnded() { isPlaying.value = false; showControls.value = true; resetAutoplayCountdown(); emit('ended') }
function onVolumeChange() {
    const video = videoRef.value
    if (video) {
        volume.value = clamp(video.volume, 0, 1)
        isMuted.value = video.muted || video.volume === 0
    }
    emit('volumechange')
}
function onRateChange() {
    if (videoRef.value && !isSpaceHeld) playbackRate.value = videoRef.value.playbackRate
}
function onLoadedMetadata() {
    const nextDuration = videoRef.value?.duration
    duration.value = Number.isFinite(nextDuration) ? nextDuration : 0
    applyCaptionTracks()
}
function onLoadedData() { isLoading.value = false; emit('loadeddata') }
function onLoadStart() { isLoading.value = true; emit('loadstart') }
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

    emit('timeupdate')
}

function isEditableTarget(target) {
    return target?.tagName === 'INPUT'
        || target?.tagName === 'TEXTAREA'
        || target?.tagName === 'SELECT'
        || target?.isContentEditable
}

function releaseSpaceHold(toggleOnTap = false, notify = true) {
    spacePressTimeout = clearTimer(spacePressTimeout)
    if (!isSpaceHeld) return
    const video = videoRef.value
    if (spaceBoostActive && video) {
        video.playbackRate = originalPlaybackRate
        playbackRate.value = originalPlaybackRate
        if (notify) showNotification('正常速度', 'play_arrow')
        else notification.value.show = false
    } else if (toggleOnTap) {
        togglePlay()
    }
    spaceBoostActive = false
    isSpaceHeld = false
}

function handleKeydown(e) {
    if (!videoRef.value || !props.src || isEditableTarget(e.target)) return
    const action = Object.keys(props.shortcuts || {}).find((key) => shortcutKey(key) === e.key)
    if (!action) return
    e.preventDefault()

    if (action === 'playPause') {
        if (!isSpaceHeld) {
            isSpaceHeld = true
            originalPlaybackRate = videoRef.value.playbackRate || 1
            spacePressTimeout = setTimeout(() => {
                if (isSpaceHeld && videoRef.value) {
                    spaceBoostActive = true
                    videoRef.value.playbackRate = 2
                    showNotification('2x 速度', 'fast_forward', true)
                }
            }, 300)
        }
        return
    }

    const seeks = {
        seekBackward5: [-5, 'fast_rewind'],
        seekForward5: [5, 'fast_forward'],
        seekBackward10: [-10, 'fast_rewind'],
        seekForward10: [10, 'fast_forward'],
    }
    if (seeks[action]) {
        const [seconds, icon] = seeks[action]
        skip(seconds)
        showNotification(shortcutLabel(action, `${seconds > 0 ? '+' : ''}${seconds} 秒`), icon)
    } else if (action === 'decreasePlaybackSpeed') adjustPlaybackRate(-1)
    else if (action === 'increasePlaybackSpeed') adjustPlaybackRate(1)
    else if (action === 'skipOP') skipOP()
    else if (action === 'previousEpisode') {
        emit('previous-episode')
        showNotification(shortcutLabel(action, '上一集'), 'skip_previous')
    } else if (action === 'nextEpisode') handleNextEpisode()
    else if (action === 'fullscreen') toggleFullscreen()
    else if (action === 'theaterMode') toggleTheaterMode()
    else if (action === 'mute') {
        const wasMuted = isMuted.value
        toggleMute()
        const labels = shortcutLabel('mute', '靜音/取消靜音').split('/')
        showNotification(wasMuted ? (labels[1] || '取消靜音') : labels[0], wasMuted ? 'volume_up' : 'volume_off')
    } else if (action === 'volumeUp' || action === 'volumeDown') {
        const newVolume = clamp(volume.value + (action === 'volumeUp' ? 0.1 : -0.1), 0, 1)
        setVolume(newVolume)
        const icon = newVolume === 0 ? 'volume_off' : newVolume < 0.5 ? 'volume_down' : 'volume_up'
        showNotification(`音量 ${Math.round(newVolume * 100)}%`, icon)
    }
}

function handleKeyup(e) {
    if (!videoRef.value || !props.src || shortcutKey('playPause') !== e.key) return
    e.preventDefault()
    releaseSpaceHold(true)
}

function requestStreamRecovery() {
    streamErrorTimeout = clearTimer(streamErrorTimeout)
    streamErrorTimeout = setTimeout(() => emit('stream-error'), 300)
}

function destroyHls() {
    hlsInstance?.destroy()
    hlsInstance = null
    resetQualityState()
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
    Object.assign(notification.value, { show: false, message: '', icon: '' })
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
    effectiveVideoSrc.value = ''

    if (!src || !video || isUnmounted) return
    if (!isHls) {
        effectiveVideoSrc.value = src
        return
    }

    let Hls
    try {
        Hls = (await import('hls.js')).default
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
        selectedQuality.value = -1
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
            if (hlsInstance !== hls || generation !== sourceGeneration) return
            syncQualityLevelsFromHls(hls)
        })
        hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
            if (hlsInstance !== hls || generation !== sourceGeneration) return
            activeQualityIndex.value = data.level
        })
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

function handleDocumentPointerDown(e) {
    if (!showSettings.value) return
    const settingsEl = controlsRef.value?.settingsEl
    const clickedInside = e.composedPath?.().includes(settingsEl) ?? settingsEl?.contains?.(e.target)
    if (!clickedInside) closeSettings()
}

function handleWindowBlur() { releaseSpaceHold(false) }

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
    const savedVolume = localStorage.getItem('videoVolume')
    if (savedVolume !== null && Number.isFinite(Number(savedVolume))) setVolume(Number(savedVolume), false)
    const savedAutoplay = localStorage.getItem('autoplayEnabled')
    if (savedAutoplay !== null) autoplayEnabled.value = savedAutoplay !== 'false'
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    document.addEventListener('pointerdown', handleDocumentPointerDown)
    window.addEventListener('keydown', handleKeydown)
    window.addEventListener('keyup', handleKeyup)
    window.addEventListener('blur', handleWindowBlur)
})

watch(showControls, (v) => { if (!v) closeSettings() })

onUnmounted(() => {
    isUnmounted = true
    sourceGeneration++
    destroyHls()
    controlsTimeout = clearTimer(controlsTimeout)
    notificationTimeout = clearTimer(notificationTimeout)
    spacePressTimeout = clearTimer(spacePressTimeout)
    autoplayNextTimeout = clearTimer(autoplayNextTimeout)
    streamErrorTimeout = clearTimer(streamErrorTimeout)
    document.removeEventListener('fullscreenchange', handleFullscreenChange)
    document.removeEventListener('pointerdown', handleDocumentPointerDown)
    window.removeEventListener('keydown', handleKeydown)
    window.removeEventListener('keyup', handleKeyup)
    window.removeEventListener('blur', handleWindowBlur)
})
</script>

<template>
    <div
        ref="containerRef"
        :class="[
            'relative w-full rounded-lg',
            showSettings ? 'overflow-visible' : 'overflow-hidden',
            hidePlaybackCursor ? 'cursor-none' : 'cursor-default',
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

        <PlayerCaptionOverlay :text="activeCaptionText" />

        <PlayerOverlays
            :src="src"
            :is-loading="isLoading"
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
                v-show="!isLoading && showControls && src"
                ref="controlsRef"
                :progress="progress"
                :buffered="buffered"
                :duration="duration"
                :is-dragging-progress="isDraggingProgress"
                :is-hovering-progress="isHoveringProgress"
                :hover-preview-time="hoverPreviewTime"
                :hover-preview-position="hoverPreviewPosition"
                :thumb-preview-w="THUMB_PREVIEW_W"
                :active-thumbnail="activeThumbnail"
                :active-thumbnail-src="activeThumbnailSrc"
                :thumbnail-preview-height="thumbnailPreviewHeight"
                :thumbnail-image-style="thumbnailImageStyle"
                :is-playing="isPlaying"
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
                :playback-rate="playbackRate"
                :playback-speeds="PLAYBACK_SPEEDS"
                :quality-label="qualityLabel"
                :quality-levels="qualityLevels"
                :selected-quality="selectedQuality"
                :has-captions="hasCaptions"
                :caption-label="captionLabel"
                :caption-tracks="captionTracks"
                :selected-caption-lang="selectedCaptionLang || ''"
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
                @open-settings-page="openSettingsPage"
                @set-speed="setPlaybackRate"
                @set-quality="setQuality"
                @set-caption="setCaptionLang"
            />
        </transition>
    </div>
</template>

<style scoped>
.slide-up-enter-active, .slide-up-leave-active { transition: all 0.3s ease; }
.slide-up-enter-from, .slide-up-leave-to { opacity: 0; transform: translateY(1rem); }
</style>
