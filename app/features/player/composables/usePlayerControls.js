/**
 * Player UI controls: progress scrubbing, volume, speed, autoplay,
 * keyboard shortcuts, controls visibility, and toast notifications.
 */
export function usePlayerControls({
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
    getSrc,
    getHasNextEpisode,
    getShortcuts,
    shortcutKey,
    shortcutLabel,
    seekTo,
    togglePlay,
    skip,
    toggleFullscreen,
    toggleTheaterMode,
    emit,
}) {
    const AUTOPLAY_TRIGGER_SECS = 100
    const AUTOPLAY_COUNTDOWN_SECS = 100
    const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3]

    const volume = ref(1)
    const isMuted = ref(false)
    const showControls = ref(true)
    const showVolumeSlider = ref(false)
    const isDraggingProgress = ref(false)
    const dragPreviewTime = ref(0)
    const isHoveringProgress = ref(false)
    const hoverPreviewTime = ref(0)
    const hoverPreviewPosition = ref(0)
    const playbackRate = ref(1)
    const notification = ref({ show: false, message: '', icon: '' })

    const autoplayVisible = ref(false)
    const autoplaySecsLeft = ref(AUTOPLAY_COUNTDOWN_SECS)
    const autoplayDismissed = ref(false)
    const autoplayEnabled = ref(true)

    let controlsTimeout = null
    let notificationTimeout = null
    let spacePressTimeout = null
    let autoplayNextTimeout = null
    let lastAutoplaySecond = null
    let spaceBoostActive = false
    let isHoveringVolume = false
    let isSpaceHeld = false
    let originalPlaybackRate = 1

    const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
    const clearTimer = (timer) => {
        if (timer) clearTimeout(timer)
        return null
    }

    const progress = computed(() => {
        const time = isDraggingProgress.value ? dragPreviewTime.value : currentTime.value
        return duration.value > 0 ? clamp((time / duration.value) * 100, 0, 100) : 0
    })
    const displayTime = computed(() => (isDraggingProgress.value ? dragPreviewTime.value : currentTime.value))

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
        if (showSettings.value || !isPlaying.value || isHoveringVolume) return
        showControls.value = false
        showVolumeSlider.value = false
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

    function setVolume(value, persist = true) {
        const nextVolume = clamp(Number(value) || 0, 0, 1)
        const video = videoRef.value
        volume.value = nextVolume
        isMuted.value = nextVolume === 0
        if (video) {
            video.volume = nextVolume
            video.muted = nextVolume === 0
        }
        if (persist && import.meta.client) {
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

    function syncVolumeFromVideo() {
        const video = videoRef.value
        if (!video) return
        volume.value = clamp(video.volume, 0, 1)
        isMuted.value = video.muted || video.volume === 0
    }

    function syncPlaybackRateFromVideo() {
        if (videoRef.value && !isSpaceHeld) playbackRate.value = videoRef.value.playbackRate
    }

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
        if (import.meta.client) localStorage.setItem('autoplayEnabled', autoplayEnabled.value)
        if (!autoplayEnabled.value) {
            autoplayNextTimeout = clearTimer(autoplayNextTimeout)
            resetAutoplayCountdown()
        }
    }

    /** Drive autoplay UI from the playhead; call on each timeupdate. */
    function tickAutoplay(videoCurrentTime) {
        if (getHasNextEpisode() && duration.value > 0 && autoplayEnabled.value && !autoplayDismissed.value) {
            const remaining = Math.max(0, duration.value - videoCurrentTime)
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

    function clearSeekPreview() {
        isHoveringProgress.value = false
        clearActiveThumbnail()
    }

    function syncSeekPreview(t, barRect) {
        if (t == null || !Number.isFinite(t)) return
        hoverPreviewTime.value = t
        if (hasThumbnails.value) updateActiveThumbnailForTime(t)
        const rect = barRect || progressApi()?.getBoundingClientRect?.()
        if (!rect?.width || duration.value <= 0) return
        const pos = clamp(t / duration.value, 0, 1)
        const halfThumb = THUMB_PREVIEW_W / 2
        const centerPx = pos * rect.width
        const clampedPx = Math.max(halfThumb, Math.min(centerPx, rect.width - halfThumb))
        hoverPreviewPosition.value = (clampedPx / rect.width) * 100
    }

    function scrubToPointer(e) {
        const t = calculateTimeFromPosition(e)
        if (t === null) return null
        dragPreviewTime.value = t
        syncSeekPreview(t)
        return t
    }

    function handleProgressPointerDown(e) {
        if (e.pointerType === 'mouse' && e.button !== 0) return
        e.preventDefault()
        progressApi()?.setPointerCapture?.(e.pointerId)
        isDraggingProgress.value = true
        isHoveringProgress.value = true
        scrubToPointer(e)
        showControls.value = true
        controlsTimeout = clearTimer(controlsTimeout)
    }

    function handleProgressPointerMove(e) {
        if (!isDraggingProgress.value) {
            handleProgressHover(e)
            return
        }
        e.preventDefault()
        scrubToPointer(e)
    }

    function handleProgressPointerUp(e) {
        if (!isDraggingProgress.value) return
        const video = videoRef.value
        const t = e.type === 'pointercancel'
            ? dragPreviewTime.value
            : calculateTimeFromPosition(e) ?? dragPreviewTime.value
        progressApi()?.releasePointerCapture?.(e.pointerId)
        if (video && Number.isFinite(t)) {
            isEnded.value = false
            seekTo(t)
        }
        isDraggingProgress.value = false
        const rect = progressApi()?.getBoundingClientRect?.()
        const overBar = !!rect &&
            e.clientX >= rect.left && e.clientX <= rect.right &&
            e.clientY >= rect.top && e.clientY <= rect.bottom
        if (!overBar) clearSeekPreview()
        if (isPlaying.value) resetControlsTimeout()
    }

    function handleProgressHover(e) {
        if (isDraggingProgress.value) return
        const rect = progressApi()?.getBoundingClientRect?.()
        if (!rect?.width) return
        isHoveringProgress.value = true
        syncSeekPreview(clamp((e.clientX - rect.left) / rect.width, 0, 1) * duration.value, rect)
    }

    function handleProgressMouseEnter() { isHoveringProgress.value = true }
    function handleProgressMouseLeaveBar() {
        // Pointer capture during drag can fire leave while scrubbing — keep the preview up.
        if (!isDraggingProgress.value) clearSeekPreview()
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
        if (!videoRef.value || !getSrc() || isEditableTarget(e.target)) return
        const shortcuts = getShortcuts() || {}
        const action = Object.keys(shortcuts).find((key) => shortcutKey(key) === e.key)
        if (!action) return
        e.preventDefault()

        if (action === 'playPause') {
            if (isEnded.value) return togglePlay()
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
        if (!videoRef.value || !getSrc() || shortcutKey('playPause') !== e.key) return
        e.preventDefault()
        releaseSpaceHold(true)
    }

    function handleWindowBlur() { releaseSpaceHold(false) }

    function loadControlsPreferences() {
        if (!import.meta.client) return
        const savedVolume = localStorage.getItem('videoVolume')
        if (savedVolume !== null && Number.isFinite(Number(savedVolume))) setVolume(Number(savedVolume), false)
        const savedAutoplay = localStorage.getItem('autoplayEnabled')
        if (savedAutoplay !== null) autoplayEnabled.value = savedAutoplay !== 'false'
    }

    function bindKeyboardListeners() {
        window.addEventListener('keydown', handleKeydown)
        window.addEventListener('keyup', handleKeyup)
        window.addEventListener('blur', handleWindowBlur)
    }

    function unbindKeyboardListeners() {
        window.removeEventListener('keydown', handleKeydown)
        window.removeEventListener('keyup', handleKeyup)
        window.removeEventListener('blur', handleWindowBlur)
    }

    function resetForSourceChange() {
        controlsTimeout = clearTimer(controlsTimeout)
        notificationTimeout = clearTimer(notificationTimeout)
        autoplayNextTimeout = clearTimer(autoplayNextTimeout)
        releaseSpaceHold(false, false)
        Object.assign(notification.value, { show: false, message: '', icon: '' })
        showControls.value = true
        showVolumeSlider.value = false
        originalPlaybackRate = 1
        playbackRate.value = 1
        autoplayDismissed.value = false
        resetAutoplayCountdown()
    }

    function dispose() {
        controlsTimeout = clearTimer(controlsTimeout)
        notificationTimeout = clearTimer(notificationTimeout)
        spacePressTimeout = clearTimer(spacePressTimeout)
        autoplayNextTimeout = clearTimer(autoplayNextTimeout)
        unbindKeyboardListeners()
    }

    function applyRateToVideo() {
        const video = videoRef.value
        if (!video) return
        video.volume = volume.value
        video.muted = isMuted.value
        video.playbackRate = playbackRate.value
    }

    return {
        AUTOPLAY_COUNTDOWN_SECS,
        PLAYBACK_SPEEDS,
        volume,
        isMuted,
        showControls,
        showVolumeSlider,
        isDraggingProgress,
        dragPreviewTime,
        isHoveringProgress,
        hoverPreviewTime,
        hoverPreviewPosition,
        playbackRate,
        notification,
        autoplayVisible,
        autoplaySecsLeft,
        autoplayDismissed,
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
        releaseSpaceHold,
        loadControlsPreferences,
        bindKeyboardListeners,
        resetForSourceChange,
        dispose,
        applyRateToVideo,
    }
}
