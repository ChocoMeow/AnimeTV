/** Demo shell state for the welcome marketing preview. */
export function useWelcomeAppPreview() {
    const appConfig = useAppConfig()

    const views = [
        { id: 'home', label: '每日新番', icon: 'home' },
        { id: 'player', label: '播放器', icon: 'play_circle' },
        { id: 'history', label: '觀看紀錄', icon: 'history' },
        { id: 'social', label: '好友狀態', icon: 'group' },
    ]

    const requestURL = useRequestURL()
    const previewDomain = computed(() => requestURL.hostname)

    const activeView = ref('home')
    const loading = ref(true)
    const byDay = ref({})
    const browse = ref([])
    const spotlight = ref([])
    const todayCode = String(new Date().getDay() || 7)
    const selectedDay = ref(todayCode)
    const spotlightIndex = ref(0)

    const weekRail = computed(() => {
        const days = [...'一二三四五六日'].map((label, index) => ({
            code: String(index + 1),
            label,
            zh: `週${label}`,
            items: byDay.value[String(index + 1)] ?? [],
        }))
        const start = Number(todayCode) - 1
        return [...days.slice(start), ...days.slice(0, start)]
    })

    const displayedItems = computed(() => (byDay.value[selectedDay.value] || []).slice(0, 6))

    const activeSpotlight = computed(() => {
        if (!spotlight.value.length) return null
        return spotlight.value[spotlightIndex.value % spotlight.value.length]
    })

    const sideSpotlight = computed(() => {
        if (spotlight.value.length < 2) return []
        const start = (spotlightIndex.value + 1) % spotlight.value.length
        return Array.from({ length: Math.min(3, spotlight.value.length - 1) }, (_, i) =>
            spotlight.value[(start + i) % spotlight.value.length],
        )
    })

    const padIndex = (index) => String(index).padStart(2, '0')

    const playerProgress = ref(38)
    const playerBuffered = ref(62)
    const isPlaying = ref(true)
    const isEnded = ref(false)
    const isMuted = ref(false)
    const volume = ref(0.85)
    const showVolumeSlider = ref(false)
    const showControls = ref(true)
    const isDraggingProgress = ref(false)
    const isHoveringProgress = ref(false)
    const hoverPreviewTime = ref(0)
    const hoverPreviewPosition = ref(0)
    const selectedEpisode = ref('5')
    const showRemainingTime = ref(false)
    const showSettings = ref(false)
    const settingsPage = ref('main')
    const playbackRate = ref(1.25)
    const autoplayEnabled = ref(true)
    const autoFullscreenEnabled = ref(false)
    const isFullscreen = ref(false)
    const theaterMode = ref(false)
    const selectedQuality = ref(-1)
    const relatedTab = ref('related')

    const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3]
    const PLAYER_DURATION_SEC = 24 * 60

    const qualityLevels = [
        { index: -1, label: '自動' },
        { index: 0, label: '1080p' },
        { index: 1, label: '720p' },
        { index: 2, label: '480p' },
    ]

    const PLAYER_TOOLTIPS = {
        playPause: '播放/暫停',
        replay: '重新播放',
        skipOP: '跳過片頭',
        mute: '靜音',
        fullscreen: '全螢幕',
        theaterMode: '劇院模式',
        nextEpisode: '下一集',
    }

    const demoEpisodesMap = computed(() => {
        const map = {}
        for (let i = 1; i <= 12; i++) {
            map[String(i)] = { title: `第 ${i} 集` }
        }
        return map
    })

    const demoWatchProgress = computed(() => ({
        '1': { progress_percentage: 100, playback_time: 1440, video_duration: 1440 },
        '2': { progress_percentage: 100, playback_time: 1380, video_duration: 1380 },
        '3': { progress_percentage: 68, playback_time: 980, video_duration: 1440 },
        '4': { progress_percentage: 34, playback_time: 490, video_duration: 1440 },
        '5': { progress_percentage: 38, playback_time: 552, video_duration: 1440 },
        '6': { progress_percentage: 12, playback_time: 172, video_duration: 1440 },
    }))

    const demoRelatedItems = computed(() => {
        const pool = browse.value.length ? browse.value : spotlight.value
        return pool.slice(0, 2).map((item) => enrichPreviewStats(item))
    })

    function seedFromRefId(refId) {
        const str = String(refId)
        let hash = 0
        for (let i = 0; i < str.length; i++) {
            hash = (hash * 31 + str.charCodeAt(i)) >>> 0
        }
        return hash
    }

    function enrichPreviewStats(item) {
        if (!item?.refId) return item
        const seed = seedFromRefId(item.refId)
        const score = ((35 + (seed % 16)) / 10).toFixed(1)
        const baseViews = Number(item.views) || 0
        const views = baseViews > 0 ? baseViews : 12000 + (seed % 480000)
        const likes = Math.round(views * (0.06 + (seed % 40) / 1000))

        return {
            ...item,
            score,
            views,
            likes,
        }
    }

    const demoPlayer = computed(() => {
        const item = spotlight.value[0] || browse.value[0]
        if (!item) return null
        const stats = enrichPreviewStats(item)
        return {
            title: stats.title,
            image: stats.image,
            episode: selectedEpisode.value,
            year: stats.year,
            score: stats.score,
            views: stats.views,
            likes: stats.likes,
        }
    })

    const progress = computed(() => playerProgress.value)

    const positionLabel = computed(() => {
        const total = formatClock(PLAYER_DURATION_SEC)
        const current = formatClock(Math.round((playerProgress.value / 100) * PLAYER_DURATION_SEC))
        if (!showRemainingTime.value) return `${current} / ${total}`
        const remaining = Math.max(0, PLAYER_DURATION_SEC - (playerProgress.value / 100) * PLAYER_DURATION_SEC)
        return `-${formatClock(Math.round(remaining))} / ${total}`
    })

    const qualityLabel = computed(() => {
        if (selectedQuality.value === -1) return '自動'
        return qualityLevels.find((l) => l.index === selectedQuality.value)?.label || '自動'
    })

    function formatClock(totalSec) {
        const sec = Math.max(0, Math.floor(Number(totalSec) || 0))
        const h = Math.floor(sec / 3600)
        const m = Math.floor((sec % 3600) / 60)
        const s = sec % 60
        if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
        return `${m}:${String(s).padStart(2, '0')}`
    }

    function clamp(n, min, max) {
        return Math.min(max, Math.max(min, n))
    }

    function togglePlay() {
        if (isEnded.value) {
            isEnded.value = false
            playerProgress.value = 0
        }
        isPlaying.value = !isPlaying.value
        showControls.value = true
    }

    function toggleMute() {
        isMuted.value = !isMuted.value
        if (!isMuted.value && volume.value === 0) volume.value = 0.85
    }

    function skipOp() {
        playerProgress.value = Math.min(playerProgress.value + 18, 96)
    }

    function selectEpisode(ep) {
        selectedEpisode.value = String(ep)
        playerProgress.value = Number(ep) === 5 ? 38 : 8 + (Number(ep) % 5) * 11
        isPlaying.value = true
        isEnded.value = false
    }

    function updateProgressFromPointer(event) {
        const bar = event.currentTarget
        const rect = bar.getBoundingClientRect()
        const pct = clamp((event.clientX - rect.left) / rect.width, 0, 1)
        playerProgress.value = pct * 100
        hoverPreviewPosition.value = pct * 100
        hoverPreviewTime.value = pct * PLAYER_DURATION_SEC
        if (playerProgress.value >= 99.5) {
            isEnded.value = true
            isPlaying.value = false
        } else {
            isEnded.value = false
        }
    }

    function handleProgressPointerDown(event) {
        isDraggingProgress.value = true
        updateProgressFromPointer(event)
    }

    function handleProgressPointerMove(event) {
        const bar = event.currentTarget
        const rect = bar.getBoundingClientRect()
        const pct = clamp((event.clientX - rect.left) / rect.width, 0, 1)
        hoverPreviewPosition.value = pct * 100
        hoverPreviewTime.value = pct * PLAYER_DURATION_SEC
        if (isDraggingProgress.value) updateProgressFromPointer(event)
    }

    function handleProgressPointerUp() {
        isDraggingProgress.value = false
    }

    function handleProgressPointerEnter() {
        isHoveringProgress.value = true
    }

    function handleProgressPointerLeave() {
        isHoveringProgress.value = false
        if (!isDraggingProgress.value) hoverPreviewPosition.value = 0
    }

    function handleVolumeChange(event) {
        volume.value = Number(event.target.value)
        isMuted.value = volume.value === 0
    }

    function handleVolumeEnter() {
        showVolumeSlider.value = true
    }

    function handleVolumeLeave() {
        showVolumeSlider.value = false
    }

    function setPlaybackSpeed(speed) {
        playbackRate.value = speed
        showSettings.value = false
    }

    function setQuality(index) {
        selectedQuality.value = index
        showSettings.value = false
    }

    function onPlayerStageMove() {
        showControls.value = true
    }

    const demoHistoryItems = computed(() => {
        const pool = [...spotlight.value, ...browse.value].filter((item) => item?.refId)
        if (!pool.length) return []
        const meta = [
            { episode: 8, progress: 72, watched: '14:22', group: '今天' },
            { episode: 3, progress: 41, watched: '09:05', group: '今天' },
            { episode: 12, progress: 18, watched: '21:18', group: '昨天' },
        ]
        return pool.slice(0, 3).map((item, i) => ({
            ...item,
            ...meta[i],
        }))
    })

    const demoFriends = computed(() => {
        const anime = spotlight.value
        if (!anime.length) return []
        return [
            { id: 1, name: '夜貓子小林', status: 'watching', anime: anime[0], episode: 5 },
            { id: 2, name: '週末追番人', status: 'watching', anime: anime[1] || anime[0], episode: 2 },
            { id: 3, name: '動畫收藏家', status: 'online' },
            { id: 4, name: '新番雷達', status: 'idle' },
        ]
    })

    const socialStats = computed(() => ({
        online: demoFriends.value.filter((f) => f.status === 'online' || f.status === 'watching').length,
        watching: demoFriends.value.filter((f) => f.status === 'watching').length,
    }))

    let dayTimer = null
    let spotlightTimer = null
    let playerTimer = null
    let viewTimer = null

    const VIEW_CYCLE_MS = 15000

    function cycleToNextView() {
        const ids = views.map((v) => v.id)
        const idx = ids.indexOf(activeView.value)
        activeView.value = ids[(idx + 1) % ids.length]
    }

    function startViewTimer() {
        if (viewTimer) clearInterval(viewTimer)
        if (import.meta.client && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
        viewTimer = setInterval(cycleToNextView, VIEW_CYCLE_MS)
    }

    function selectView(id) {
        activeView.value = id
        startViewTimer()
    }

    async function loadPreviewData() {
        loading.value = true
        try {
            const data = await $fetch('/api/public/welcome-preview')
            byDay.value = data?.byDay || {}
            browse.value = data?.browse || []
            spotlight.value = data?.spotlight || []
        } catch (err) {
            console.error('Welcome preview failed to load:', err)
            byDay.value = {}
            browse.value = []
            spotlight.value = []
        } finally {
            loading.value = false
        }
    }

    function startTimers() {
        dayTimer = setInterval(() => {
            if (activeView.value !== 'home') return
            const keys = weekRail.value.map((d) => d.code)
            const idx = keys.indexOf(selectedDay.value)
            selectedDay.value = keys[(idx + 1) % keys.length]
        }, 4000)

        spotlightTimer = setInterval(() => {
            if (spotlight.value.length > 1) {
                spotlightIndex.value = (spotlightIndex.value + 1) % spotlight.value.length
            }
        }, 5000)

        playerTimer = setInterval(() => {
            if (activeView.value !== 'player' || !isPlaying.value) return
            playerProgress.value = playerProgress.value >= 96 ? 8 : playerProgress.value + 1.2
            playerBuffered.value = Math.min(100, playerBuffered.value + 0.3)
        }, 800)

        startViewTimer()
    }

    onMounted(() => {
        loadPreviewData().then(() => {
            if (!import.meta.client) return
            startTimers()
        })
    })

    onBeforeUnmount(() => {
        if (dayTimer) clearInterval(dayTimer)
        if (spotlightTimer) clearInterval(spotlightTimer)
        if (playerTimer) clearInterval(playerTimer)
        if (viewTimer) clearInterval(viewTimer)
    })

    return {
        appConfig,
        views,
        previewDomain,
        activeView,
        loading,
        byDay,
        browse,
        spotlight,
        todayCode,
        selectedDay,
        spotlightIndex,
        weekRail,
        displayedItems,
        activeSpotlight,
        sideSpotlight,
        padIndex,
        playerProgress,
        playerBuffered,
        isPlaying,
        isEnded,
        isMuted,
        volume,
        showVolumeSlider,
        showControls,
        isDraggingProgress,
        isHoveringProgress,
        hoverPreviewTime,
        hoverPreviewPosition,
        selectedEpisode,
        showRemainingTime,
        showSettings,
        settingsPage,
        playbackRate,
        autoplayEnabled,
        autoFullscreenEnabled,
        isFullscreen,
        theaterMode,
        selectedQuality,
        relatedTab,
        PLAYBACK_SPEEDS,
        PLAYER_DURATION_SEC,
        qualityLevels,
        PLAYER_TOOLTIPS,
        demoEpisodesMap,
        demoWatchProgress,
        demoRelatedItems,
        demoPlayer,
        progress,
        positionLabel,
        qualityLabel,
        formatClock,
        togglePlay,
        toggleMute,
        skipOp,
        selectEpisode,
        handleProgressPointerDown,
        handleProgressPointerMove,
        handleProgressPointerUp,
        handleProgressPointerEnter,
        handleProgressPointerLeave,
        handleVolumeChange,
        handleVolumeEnter,
        handleVolumeLeave,
        setPlaybackSpeed,
        setQuality,
        onPlayerStageMove,
        demoHistoryItems,
        demoFriends,
        socialStats,
        selectView,
    }
}
