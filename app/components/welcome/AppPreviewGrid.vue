<script setup>
const appConfig = useAppConfig()

const weekdayLabel = {
    0: '全部',
    1: '週一',
    2: '週二',
    3: '週三',
    4: '週四',
    5: '週五',
    6: '週六',
    7: '週日',
}

const views = [
    { id: 'home', label: '每日新番', icon: 'home' },
    { id: 'player', label: '播放器', icon: 'play_circle' },
    { id: 'history', label: '觀看紀錄', icon: 'history' },
    { id: 'social', label: '好友狀態', icon: 'group' },
]

const previewDomain = computed(() => useRequestURL().hostname)

const activeView = ref('home')
const loading = ref(true)
const byDay = ref({})
const browse = ref([])
const spotlight = ref([])
const selectedDay = ref('0')
const spotlightIndex = ref(0)

const dayKeys = computed(() => Object.keys(weekdayLabel))

const displayedItems = computed(() => {
    const pool =
        selectedDay.value === '0'
            ? Object.values(byDay.value || {}).flat()
            : byDay.value[selectedDay.value] || []
    return pool.slice(0, 8)
})

const activeSpotlight = computed(() => {
    if (!spotlight.value.length) return null
    return spotlight.value[spotlightIndex.value % spotlight.value.length]
})

const sideSpotlight = computed(() => {
    if (spotlight.value.length < 2) return []
    const start = (spotlightIndex.value + 1) % spotlight.value.length
    return Array.from({ length: Math.min(4, spotlight.value.length - 1) }, (_, i) =>
        spotlight.value[(start + i) % spotlight.value.length],
    )
})

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
        const keys = dayKeys.value
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
</script>

<template>
    <div class="preview-shell" :aria-label="`${appConfig.siteName} 實際介面預覽`">
        <!-- Browser chrome -->
        <div class="preview-chrome">
            <div class="preview-dots" aria-hidden="true">
                <span /><span /><span />
            </div>
            <div class="preview-url" aria-hidden="true">
                <span class="material-symbols-rounded text-sm">lock</span>
                {{ previewDomain }}
            </div>
            <div class="preview-tabs" role="tablist" aria-label="介面預覽">
                <button
                    v-for="view in views"
                    :key="view.id"
                    type="button"
                    role="tab"
                    class="preview-tab"
                    :class="{ 'preview-tab-active': activeView === view.id }"
                    :aria-selected="activeView === view.id"
                    @click="selectView(view.id)"
                >
                    <span class="material-symbols-rounded text-base" aria-hidden="true">{{ view.icon }}</span>
                    <span class="preview-tab-label">{{ view.label }}</span>
                </button>
            </div>
        </div>

        <!-- Viewport -->
        <div class="preview-viewport">
            <Transition name="view-fade" mode="out-in">
                <!-- Home -->
                <div v-if="activeView === 'home'" key="home" class="preview-pane preview-pane-light">
                    <div v-if="loading" class="preview-skeleton">
                        <div class="skeleton-bento" />
                        <div class="skeleton-row" />
                    </div>
                    <template v-else-if="activeSpotlight">
                        <div class="home-bento-grid">
                            <article class="home-spotlight">
                                <Transition name="spot-fade" mode="out-in">
                                    <div :key="activeSpotlight.refId" class="home-spotlight-inner">
                                        <NuxtImg
                                            :src="activeSpotlight.image"
                                            :alt="activeSpotlight.title"
                                            class="home-spotlight-img"
                                            loading="lazy"
                                        />
                                        <div class="home-spotlight-scrim" />
                                        <div class="home-spotlight-copy">
                                            <span class="home-badge">
                                                <span class="material-symbols-rounded text-sm">bolt</span>
                                                焦點新番
                                            </span>
                                            <h3 class="home-spotlight-title">{{ activeSpotlight.title }}</h3>
                                            <span class="home-spotlight-cta">
                                                <span class="material-symbols-rounded text-base">play_arrow</span>
                                                立即觀看
                                            </span>
                                        </div>
                                    </div>
                                </Transition>
                            </article>

                            <article
                                v-for="item in sideSpotlight"
                                :key="item.refId"
                                class="home-tile"
                            >
                                <NuxtImg :src="item.image" :alt="item.title" class="home-tile-img" loading="lazy" />
                                <div class="home-tile-scrim" />
                                <p class="home-tile-title">{{ item.title }}</p>
                            </article>
                        </div>

                        <div class="home-schedule">
                            <div class="home-schedule-head">
                                <h4 class="home-schedule-label">每日新番</h4>
                                <div class="home-day-tabs" aria-hidden="true">
                                    <span
                                        v-for="d in dayKeys"
                                        :key="d"
                                        class="home-day-tab"
                                        :class="{ 'home-day-tab-active': selectedDay === d }"
                                    >{{ weekdayLabel[d] }}</span>
                                </div>
                            </div>
                            <div class="home-schedule-stage">
                                <Transition name="schedule-day" mode="out-in">
                                    <div :key="selectedDay" class="home-schedule-grid">
                                        <article
                                            v-for="(item, index) in displayedItems"
                                            :key="item.refId"
                                            class="home-schedule-card"
                                            :style="{ '--card-i': index }"
                                        >
                                            <div class="home-schedule-thumb">
                                                <NuxtImg :src="item.thumbnail || item.image" :alt="item.title" loading="lazy" />
                                            </div>
                                            <p class="home-schedule-title">{{ item.title }}</p>
                                        </article>
                                    </div>
                                </Transition>
                            </div>
                        </div>
                    </template>
                    <p v-else class="preview-empty">暫無預覽資料</p>
                </div>

                <!-- Player -->
                <div v-else-if="activeView === 'player'" key="player" class="preview-pane preview-pane-light">
                    <div v-if="loading" class="preview-skeleton">
                        <div class="skeleton-player" />
                    </div>
                    <div v-else-if="demoPlayer" class="player-layout">
                        <div class="player-main-col">
                            <section
                                class="player-video-wrap"
                                aria-label="Video player"
                                @mousemove="onPlayerStageMove"
                            >
                                <NuxtImg :src="demoPlayer.image" :alt="demoPlayer.title" class="player-poster" loading="lazy" />
                                <Transition name="preview-slide-up">
                                    <PlayerControls
                                        v-show="showControls"
                                        :progress="progress"
                                        :buffered="playerBuffered"
                                        :duration="PLAYER_DURATION_SEC"
                                        :is-dragging-progress="isDraggingProgress"
                                        :is-hovering-progress="isHoveringProgress"
                                        :hover-preview-time="hoverPreviewTime"
                                        :hover-preview-position="hoverPreviewPosition"
                                        :is-playing="isPlaying"
                                        :is-ended="isEnded"
                                        :is-muted="isMuted"
                                        :volume="volume"
                                        :show-volume-slider="showVolumeSlider"
                                        :position-label="positionLabel"
                                        :show-remaining-time="showRemainingTime"
                                        :tooltip-labels="PLAYER_TOOLTIPS"
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
                                        :has-captions="false"
                                        caption-label="關閉"
                                        selected-caption-lang=""
                                        @progress-pointerdown="handleProgressPointerDown"
                                        @progress-pointermove="handleProgressPointerMove"
                                        @progress-pointerup="handleProgressPointerUp"
                                        @progress-pointercancel="handleProgressPointerUp"
                                        @progress-pointerenter="handleProgressPointerEnter"
                                        @progress-pointerleave="handleProgressPointerLeave"
                                        @toggle-play="togglePlay"
                                        @skip-op="skipOp"
                                        @toggle-mute="toggleMute"
                                        @volume-change="handleVolumeChange"
                                        @volume-enter="handleVolumeEnter"
                                        @volume-leave="handleVolumeLeave"
                                        @toggle-time-display="showRemainingTime = !showRemainingTime"
                                        @toggle-settings="showSettings = !showSettings"
                                        @toggle-theater="theaterMode = !theaterMode"
                                        @toggle-fullscreen="isFullscreen = !isFullscreen"
                                        @update:settings-page="settingsPage = $event"
                                        @toggle-autoplay="autoplayEnabled = !autoplayEnabled"
                                        @toggle-auto-fullscreen="autoFullscreenEnabled = !autoFullscreenEnabled"
                                        @set-speed="setPlaybackSpeed"
                                        @set-quality="setQuality"
                                    />
                                </Transition>
                            </section>

                            <section class="player-info-block" aria-label="Anime information">
                                <h4 class="player-info-title">{{ demoPlayer.title }}</h4>
                                <div class="player-stats">
                                    <div class="player-stat">
                                        <span class="material-symbols-rounded text-base" aria-hidden="true">visibility</span>
                                        <span class="player-stat-value">{{ formatViews(demoPlayer.views) }}</span>
                                        <span>觀看</span>
                                    </div>
                                    <div class="player-stat">
                                        <span class="material-symbols-rounded text-base" aria-hidden="true">favorite</span>
                                        <span class="player-stat-value">{{ formatViews(demoPlayer.likes) }}</span>
                                        <span>喜歡</span>
                                    </div>
                                    <div class="player-stat">
                                        <span class="material-symbols-rounded text-base text-yellow-400" aria-hidden="true">star</span>
                                        <span class="player-stat-value">{{ demoPlayer.score }}</span>
                                    </div>
                                </div>
                            </section>
                        </div>

                        <aside class="player-aside" aria-label="Episode list and related content">
                            <section aria-label="Episode selector">
                                <div class="flex items-center justify-between mb-4">
                                    <h2 class="text-xl font-bold text-gray-900 dark:text-white">選擇集數</h2>
                                    <span class="text-sm text-gray-600 dark:text-gray-400">
                                        共 <span class="font-semibold text-gray-900 dark:text-white">12</span> 集
                                    </span>
                                </div>
                                <EpisodesPicker
                                    :episodes="demoEpisodesMap"
                                    :watch-progress="demoWatchProgress"
                                    :compact="true"
                                    :model-value="selectedEpisode"
                                    @update:model-value="selectEpisode"
                                    @select="selectEpisode"
                                />
                            </section>

                            <section v-if="demoRelatedItems.length" aria-label="Related anime">
                                <div class="flex flex-wrap gap-2 mb-4">
                                    <button
                                        type="button"
                                        class="chip-pill chip-pill--sm"
                                        :class="relatedTab === 'related' ? 'chip-pill--active' : 'chip-pill--idle'"
                                        @click="relatedTab = 'related'"
                                    >
                                        相關動漫
                                    </button>
                                    <button
                                        type="button"
                                        class="chip-pill chip-pill--sm"
                                        :class="relatedTab === 'recommended' ? 'chip-pill--active' : 'chip-pill--idle'"
                                        @click="relatedTab = 'recommended'"
                                    >
                                        為你推薦
                                    </button>
                                </div>
                                <div class="related-grid-wrap">
                                    <div class="related-grid" role="list">
                                        <article
                                            v-for="item in demoRelatedItems"
                                            :key="item.refId"
                                            class="related-card group"
                                            role="listitem"
                                        >
                                            <div class="relative aspect-[2/3] overflow-hidden bg-gray-200 dark:bg-white/5">
                                                <NuxtImg
                                                    :src="item.image"
                                                    :alt="item.title"
                                                    loading="lazy"
                                                    class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                                />
                                                <div class="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
                                                <div class="absolute bottom-0 left-0 right-0 p-2.5 space-y-1.5">
                                                    <p class="text-[11px] font-medium text-gray-100 line-clamp-2 leading-snug">{{ item.title }}</p>
                                                    <div class="flex items-center justify-between gap-2 text-xs text-gray-200">
                                                        <span class="inline-flex items-center gap-1 leading-none">
                                                            <span class="material-symbols-rounded text-[14px] leading-none text-yellow-400">star</span>
                                                            <span class="tabular-nums">{{ item.score }}</span>
                                                        </span>
                                                        <span v-if="item.year" class="leading-none tabular-nums">{{ item.year }}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </article>
                                    </div>
                                </div>
                            </section>
                        </aside>
                    </div>
                    <p v-else class="preview-empty">暫無預覽資料</p>
                </div>

                <!-- History -->
                <div v-else-if="activeView === 'history'" key="history" class="preview-pane preview-pane-light">
                    <div v-if="loading" class="preview-skeleton">
                        <div class="skeleton-history" />
                    </div>
                    <div v-else-if="demoHistoryItems.length" class="history-panel">
                        <div class="history-head">
                            <h4 class="history-heading">觀看紀錄</h4>
                            <div class="history-filters" aria-hidden="true">
                                <span class="history-filter history-filter-active">全部</span>
                                <span class="history-filter">今天</span>
                                <span class="history-filter">本週</span>
                            </div>
                        </div>
                        <div v-for="group in ['今天', '昨天']" :key="group" class="history-group">
                            <div class="history-group-head">
                                <span class="history-group-label">{{ group }}</span>
                                <span class="history-group-line" />
                            </div>
                            <div class="history-cards">
                                <article
                                    v-for="item in demoHistoryItems.filter((i) => i.group === group)"
                                    :key="item.refId"
                                    class="history-card"
                                >
                                    <div class="history-thumb">
                                        <NuxtImg :src="item.image" :alt="item.title" loading="lazy" />
                                        <div class="history-progress">
                                            <div class="history-progress-fill" :style="{ width: `${item.progress}%` }" />
                                        </div>
                                    </div>
                                    <div class="history-info">
                                        <h5 class="history-title">{{ item.title }}</h5>
                                        <p class="history-detail">
                                            <span class="material-symbols-rounded text-xs">play_circle</span>
                                            第 {{ item.episode }} 集 · 已看 {{ item.watched }}
                                        </p>
                                        <p class="history-detail">
                                            <span class="material-symbols-rounded text-xs">timer</span>
                                            進度 {{ item.progress }}%
                                        </p>
                                    </div>
                                </article>
                            </div>
                        </div>
                    </div>
                    <p v-else class="preview-empty">暫無預覽資料</p>
                </div>

                <!-- Social / friend status -->
                <div v-else key="social" class="preview-pane preview-pane-light">
                    <div v-if="loading" class="preview-skeleton">
                        <div class="skeleton-social" />
                    </div>
                    <div v-else-if="demoFriends.length" class="social-panel">
                        <div class="social-head">
                            <h4 class="social-heading">好友狀態</h4>
                            <div class="social-stats">
                                <span class="social-stat">
                                    <span class="social-stat-dot social-stat-dot-green" />
                                    {{ socialStats.online }} 在線
                                </span>
                                <span class="social-stat">
                                    <span class="material-symbols-rounded text-sm text-emerald-500">play_circle</span>
                                    {{ socialStats.watching }} 正在觀看
                                </span>
                            </div>
                        </div>
                        <ul class="social-list">
                            <li
                                v-for="friend in demoFriends"
                                :key="friend.id"
                                class="social-row"
                                :class="{
                                    'social-row-watching': friend.status === 'watching' && friend.anime,
                                    'social-row-plain': friend.status !== 'watching' || !friend.anime,
                                }"
                            >
                                <div v-if="friend.status === 'watching' && friend.anime" class="social-row-bg" aria-hidden="true">
                                    <NuxtImg :src="friend.anime.image" alt="" class="social-row-bg-img" loading="lazy" />
                                    <div class="social-row-bg-scrim" />
                                </div>
                                <div class="social-row-content">
                                    <div
                                        class="social-avatar"
                                        :class="[
                                            `social-avatar-${friend.status}`,
                                            `social-avatar-tint-${friend.id}`,
                                        ]"
                                    >
                                        <span class="social-avatar-logo" aria-hidden="true" />
                                        <span class="social-status-dot" :class="`social-dot-${friend.status}`" />
                                    </div>
                                    <div class="social-body">
                                        <p class="social-name">{{ friend.name }}</p>
                                        <p v-if="friend.status === 'watching'" class="social-activity social-activity-watching">
                                            <span class="material-symbols-rounded text-sm">play_circle</span>
                                            正在看《{{ friend.anime.title }}》第 {{ friend.episode }} 集
                                        </p>
                                        <p v-else-if="friend.status === 'online'" class="social-activity">線上 · 可一起追番</p>
                                        <p v-else class="social-activity social-activity-muted">閒置中</p>
                                    </div>
                                    <span
                                        v-if="friend.status === 'watching'"
                                        class="social-chevron material-symbols-rounded"
                                        aria-hidden="true"
                                    >chevron_right</span>
                                </div>
                            </li>
                        </ul>
                    </div>
                    <p v-else class="preview-empty">暫無預覽資料</p>
                </div>
            </Transition>
        </div>
    </div>
</template>

<style scoped>
.preview-shell {
    margin-top: 2.5rem;
    border-radius: 1.25rem;
    overflow: hidden;
    background: #f5f5f3;
    border: 1px solid rgba(13, 13, 13, 0.1);
    box-shadow:
        0 0 0 1px rgba(255, 255, 255, 0.6) inset,
        0 32px 64px -24px rgba(13, 13, 13, 0.18),
        0 12px 32px -16px rgba(13, 13, 13, 0.1);
}

.dark .preview-shell {
    background: #141414;
    border-color: rgba(255, 255, 255, 0.1);
    box-shadow:
        0 0 0 1px rgba(255, 255, 255, 0.04) inset,
        0 32px 64px -24px rgba(0, 0, 0, 0.6);
}

@media (min-width: 640px) {
    .preview-shell {
        border-radius: 1.5rem;
    }
}

/* Chrome bar */
.preview-chrome {
    display: grid;
    grid-template-columns: auto 1fr;
    grid-template-rows: auto auto;
    align-items: center;
    gap: 0.75rem 1rem;
    padding: 0.875rem 1rem;
    background: linear-gradient(180deg, #ececea 0%, #e4e4e0 100%);
    border-bottom: 1px solid rgba(13, 13, 13, 0.08);
}

.dark .preview-chrome {
    background: linear-gradient(180deg, #1c1c1c 0%, #161616 100%);
    border-bottom-color: rgba(255, 255, 255, 0.08);
}

@media (min-width: 768px) {
    .preview-chrome {
        grid-template-columns: auto 1fr auto;
        grid-template-rows: auto;
        padding: 0.75rem 1.25rem;
    }
}

.preview-dots {
    display: flex;
    gap: 0.4rem;
}

.preview-dots span {
    width: 0.625rem;
    height: 0.625rem;
    border-radius: 9999px;
    background: rgba(13, 13, 13, 0.12);
}

.dark .preview-dots span {
    background: rgba(255, 255, 255, 0.15);
}

.preview-dots span:nth-child(1) { background: #ff5f57; opacity: 0.85; }
.preview-dots span:nth-child(2) { background: #febc2e; opacity: 0.85; }
.preview-dots span:nth-child(3) { background: #28c840; opacity: 0.85; }

.preview-url {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    justify-self: stretch;
    padding: 0.45rem 0.85rem;
    border-radius: 0.5rem;
    font-size: 0.75rem;
    font-weight: 500;
    font-family: ui-monospace, monospace;
    color: #6b7280;
    background: rgba(255, 255, 255, 0.65);
    border: 1px solid rgba(13, 13, 13, 0.06);
}

.dark .preview-url {
    color: #9ca3af;
    background: rgba(0, 0, 0, 0.35);
    border-color: rgba(255, 255, 255, 0.08);
}

.preview-tabs {
    grid-column: 1 / -1;
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
}

@media (min-width: 768px) {
    .preview-tabs {
        grid-column: auto;
        justify-self: end;
    }
}

.preview-tab {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.45rem 0.75rem;
    border-radius: 0.5rem;
    font-size: 0.8125rem;
    font-weight: 600;
    color: #6b7280;
    transition: color 0.2s ease, background 0.2s ease;
}

.dark .preview-tab {
    color: #9ca3af;
}

.preview-tab:hover {
    color: #111;
    background: rgba(255, 255, 255, 0.5);
}

.dark .preview-tab:hover {
    color: #f3f4f6;
    background: rgba(255, 255, 255, 0.06);
}

.preview-tab-active {
    color: #111;
    background: #fff;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
}

.dark .preview-tab-active {
    color: #f5f5f0;
    background: rgba(255, 255, 255, 0.12);
}

.preview-tab:focus-visible {
    outline: 2px solid #111;
    outline-offset: 2px;
}

.dark .preview-tab:focus-visible {
    outline-color: #f5f5f0;
}

@media (max-width: 479px) {
    .preview-tab-label {
        display: none;
    }

    .preview-tab {
        padding: 0.5rem;
    }
}

/* Viewport */
.preview-viewport {
    position: relative;
    min-height: 0;
}

.preview-pane {
    padding: 1rem;
}

@media (min-width: 640px) {
    .preview-pane {
        padding: 1.25rem 1.5rem 1.5rem;
    }
}

.preview-pane-light {
    background: #fafaf8;
}

.dark .preview-pane-light {
    background: #0d0d0d;
}

.preview-pane-dark {
    padding: 0;
    background: #0a0a0a;
}

.view-fade-enter-active,
.view-fade-leave-active,
.spot-fade-enter-active,
.spot-fade-leave-active {
    transition: opacity 0.3s ease, transform 0.3s ease;
}

.view-fade-enter-from,
.view-fade-leave-to {
    opacity: 0;
    transform: translateY(4px);
}

.spot-fade-enter-from,
.spot-fade-leave-to {
    opacity: 0;
}

.preview-empty {
    padding: 3rem 1rem;
    text-align: center;
    font-size: 0.875rem;
    color: #9ca3af;
}

.preview-skeleton {
    display: flex;
    flex-direction: column;
    gap: 1rem;
}

.preview-skeleton-dark {
    min-height: 380px;
}

@media (min-width: 640px) {
    .preview-skeleton-dark {
        min-height: 440px;
    }
}

.skeleton-bento,
.skeleton-player,
.skeleton-history,
.skeleton-social,
.skeleton-row {
    border-radius: 1rem;
    background: linear-gradient(90deg, rgba(0, 0, 0, 0.04) 25%, rgba(0, 0, 0, 0.08) 50%, rgba(0, 0, 0, 0.04) 75%);
    background-size: 200% 100%;
    animation: shimmer 1.4s infinite;
}

.dark .skeleton-bento,
.dark .skeleton-player,
.dark .skeleton-history,
.dark .skeleton-social,
.dark .skeleton-row {
    background: linear-gradient(90deg, rgba(255, 255, 255, 0.03) 25%, rgba(255, 255, 255, 0.08) 50%, rgba(255, 255, 255, 0.03) 75%);
    background-size: 200% 100%;
}

.skeleton-bento {
    height: 280px;
}

@media (min-width: 640px) {
    .skeleton-bento {
        height: 360px;
    }
}

.skeleton-row {
    height: 120px;
}

.skeleton-player {
    height: 320px;
}

.skeleton-history,
.skeleton-social {
    height: 360px;
}

@keyframes shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
}

/* Home bento — matches index.vue row heights */
.home-bento-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-auto-rows: 120px;
    gap: 0.75rem;
}

@media (min-width: 640px) {
    .home-bento-grid {
        grid-template-columns: repeat(4, minmax(0, 1fr));
        grid-auto-rows: 180px;
        gap: 1rem;
    }
}

@media (min-width: 1024px) {
    .home-bento-grid {
        grid-auto-rows: 200px;
    }
}

.home-spotlight {
    grid-column: span 2;
    grid-row: span 2;
    position: relative;
    overflow: hidden;
    border-radius: 1rem;
    border: 1px solid rgba(0, 0, 0, 0.06);
    box-shadow: 0 16px 40px -12px rgba(0, 0, 0, 0.2);
}

@media (min-width: 640px) {
    .home-spotlight {
        border-radius: 1.25rem;
    }
}

.home-spotlight-inner {
    position: absolute;
    inset: 0;
}

.home-spotlight-img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: top;
}

.home-spotlight-scrim {
    position: absolute;
    inset: 0;
    background: linear-gradient(to top, rgba(0, 0, 0, 0.88) 0%, rgba(0, 0, 0, 0.35) 45%, rgba(0, 0, 0, 0.05) 75%);
}

.home-spotlight-copy {
    position: absolute;
    inset: auto 1rem 1rem;
    z-index: 1;
}

@media (min-width: 640px) {
    .home-spotlight-copy {
        inset: auto 1.5rem 1.5rem;
    }
}

.home-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.35rem 0.7rem;
    border-radius: 9999px;
    font-size: 0.75rem;
    font-weight: 600;
    color: #fff;
    background: rgba(255, 255, 255, 0.15);
    backdrop-filter: blur(8px);
    border: 1px solid rgba(255, 255, 255, 0.2);
}

.home-spotlight-title {
    margin-top: 0.75rem;
    font-size: 1.25rem;
    font-weight: 800;
    line-height: 1.15;
    letter-spacing: -0.02em;
    color: #fff;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    text-shadow: 0 2px 16px rgba(0, 0, 0, 0.35);
}

@media (min-width: 640px) {
    .home-spotlight-title {
        font-size: 1.75rem;
    }
}

.home-spotlight-cta {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    margin-top: 0.875rem;
    padding: 0.5rem 1rem;
    border-radius: 9999px;
    font-size: 0.8125rem;
    font-weight: 700;
    color: #111;
    background: #fff;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.2);
}

.home-tile {
    position: relative;
    overflow: hidden;
    border-radius: 0.875rem;
    border: 1px solid rgba(0, 0, 0, 0.06);
    background: rgba(0, 0, 0, 0.03);
}

@media (min-width: 640px) {
    .home-tile {
        border-radius: 1rem;
    }
}

.home-tile-img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: top;
}

.home-tile-scrim {
    position: absolute;
    inset: 0;
    background: linear-gradient(to top, rgba(0, 0, 0, 0.82) 0%, transparent 55%);
}

.home-tile-title {
    position: absolute;
    left: 0.75rem;
    right: 0.75rem;
    bottom: 0.75rem;
    z-index: 1;
    font-size: 0.75rem;
    font-weight: 600;
    line-height: 1.25;
    color: #fff;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}

@media (min-width: 640px) {
    .home-tile-title {
        font-size: 0.8125rem;
    }
}

/* Schedule — grid like real app */
.home-schedule {
    margin-top: 1.5rem;
}

.home-schedule-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    margin-bottom: 0.875rem;
}

.home-schedule-label {
    font-size: 1rem;
    font-weight: 700;
    color: #111;
}

.dark .home-schedule-label {
    color: #f9fafb;
}

.home-day-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
}

.home-day-tab {
    padding: 0.4rem 0.75rem;
    border-radius: 9999px;
    font-size: 0.75rem;
    font-weight: 600;
    color: #6b7280;
    background: rgba(0, 0, 0, 0.05);
    transition: color 0.3s ease, background 0.3s ease, transform 0.3s ease, box-shadow 0.3s ease;
}

.dark .home-day-tab {
    color: #d1d5db;
    background: rgba(255, 255, 255, 0.08);
}

.home-day-tab-active {
    color: #fff;
    background: #111;
    transform: scale(1.04);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
}

.dark .home-day-tab-active {
    color: #111;
    background: #f5f5f0;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
}

.home-schedule-stage {
    position: relative;
    overflow: hidden;
}

.schedule-day-enter-active,
.schedule-day-leave-active {
    transition: opacity 0.35s ease, transform 0.35s ease;
}

.schedule-day-enter-from {
    opacity: 0;
    transform: translateY(10px);
}

.schedule-day-leave-to {
    opacity: 0;
    transform: translateY(-8px);
}

.schedule-day-enter-active .home-schedule-card {
    animation: schedule-card-in 0.42s cubic-bezier(0.22, 1, 0.36, 1) backwards;
    animation-delay: calc(var(--card-i, 0) * 45ms);
}

@keyframes schedule-card-in {
    from {
        opacity: 0;
        transform: translateY(12px) scale(0.96);
    }
    to {
        opacity: 1;
        transform: translateY(0) scale(1);
    }
}

.home-schedule-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
}

@media (min-width: 640px) {
    .home-schedule-grid {
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 1rem;
    }
}

.home-schedule-thumb {
    aspect-ratio: 16 / 9;
    border-radius: 0.75rem;
    overflow: hidden;
    background: rgba(0, 0, 0, 0.06);
    border: 1px solid rgba(0, 0, 0, 0.05);
}

.home-schedule-thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.home-schedule-title {
    margin-top: 0.5rem;
    font-size: 0.8125rem;
    font-weight: 600;
    line-height: 1.3;
    color: #374151;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}

.dark .home-schedule-title {
    color: #e5e7eb;
}

/* Player — matches anime/[id] normal layout */
.player-layout {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    min-width: 0;
}

@media (min-width: 1024px) {
    .player-layout {
        flex-direction: row;
        align-items: flex-start;
        gap: 1rem;
    }
}

.player-main-col {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1rem;
}

@media (min-width: 1024px) {
    .player-main-col {
        width: 75%;
    }
}

.player-video-wrap {
    position: relative;
    aspect-ratio: 16 / 9;
    border-radius: 0.5rem;
    overflow: hidden;
    background: #111827;
}

.player-poster {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.player-info-block {
    min-width: 0;
}

.player-info-title {
    font-size: 1.25rem;
    font-weight: 700;
    line-height: 1.25;
    color: #111827;
}

.dark .player-info-title {
    color: #f9fafb;
}

@media (min-width: 640px) {
    .player-info-title {
        font-size: 1.5rem;
    }
}

.player-info-ep {
    margin-top: 0.25rem;
    font-size: 0.875rem;
    color: #6b7280;
}

.dark .player-info-ep {
    color: #9ca3af;
}

.player-stats {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 1rem;
    margin-top: 0.75rem;
    font-size: 0.875rem;
    color: #6b7280;
}

.dark .player-stats {
    color: #9ca3af;
}

.player-stat {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
}

.player-stat-value {
    font-weight: 500;
    color: #111827;
}

.dark .player-stat-value {
    color: #f9fafb;
}

.player-aside {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
}

@media (min-width: 1024px) {
    .player-aside {
        width: 25%;
        position: sticky;
        top: 0;
        align-self: flex-start;
    }
}

.related-grid-wrap {
    min-width: 0;
}

.related-grid {
    display: grid;
    gap: 0.75rem;
    grid-template-columns: repeat(2, minmax(0, 1fr));
}

.related-card {
    overflow: hidden;
    border-radius: 0.75rem;
    background: rgba(0, 0, 0, 0.02);
    border: 1px solid rgba(0, 0, 0, 0.05);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
    transition: box-shadow 0.2s ease, border-color 0.2s ease;
}

.dark .related-card {
    background: rgba(255, 255, 255, 0.02);
    border-color: rgba(255, 255, 255, 0.05);
}

.related-card:hover {
    border-color: rgba(0, 0, 0, 0.15);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.dark .related-card:hover {
    border-color: rgba(255, 255, 255, 0.15);
}

.preview-slide-up-enter-active,
.preview-slide-up-leave-active {
    transition: opacity 0.3s ease, transform 0.3s ease;
}

.preview-slide-up-enter-from,
.preview-slide-up-leave-to {
    opacity: 0;
    transform: translateY(1rem);
}

/* History */
.history-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    margin-bottom: 1.25rem;
}

.history-heading {
    font-size: 1rem;
    font-weight: 700;
    color: #111;
}

.dark .history-heading {
    color: #f9fafb;
}

.history-filters {
    display: flex;
    gap: 0.35rem;
}

.history-filter {
    padding: 0.4rem 0.75rem;
    border-radius: 9999px;
    font-size: 0.75rem;
    font-weight: 600;
    color: #6b7280;
    background: rgba(0, 0, 0, 0.05);
}

.dark .history-filter {
    color: #d1d5db;
    background: rgba(255, 255, 255, 0.08);
}

.history-filter-active {
    color: #fff;
    background: #111;
}

.dark .history-filter-active {
    color: #111;
    background: #f5f5f0;
}

.history-group + .history-group {
    margin-top: 1.25rem;
}

.history-group-head {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
}

.history-group-label {
    font-size: 0.875rem;
    font-weight: 600;
    color: #111;
}

.dark .history-group-label {
    color: #f3f4f6;
}

.history-group-line {
    flex: 1;
    height: 1px;
    background: rgba(0, 0, 0, 0.08);
}

.dark .history-group-line {
    background: rgba(255, 255, 255, 0.1);
}

.history-cards {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.75rem;
}

@media (min-width: 640px) {
    .history-cards {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
}

.history-card {
    display: flex;
    gap: 0.875rem;
    padding: 0.875rem;
    border-radius: 0.875rem;
    background: #fff;
    border: 1px solid rgba(0, 0, 0, 0.06);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.dark .history-card {
    background: rgba(255, 255, 255, 0.04);
    border-color: rgba(255, 255, 255, 0.08);
}

.history-thumb {
    position: relative;
    flex-shrink: 0;
    width: 4.5rem;
    height: 6rem;
    border-radius: 0.625rem;
    overflow: hidden;
    background: rgba(0, 0, 0, 0.06);
}

.history-thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.history-progress {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 3px;
    background: rgba(0, 0, 0, 0.4);
}

.history-progress-fill {
    height: 100%;
    background: #fff;
}

.history-info {
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
}

.history-title {
    font-size: 0.875rem;
    font-weight: 600;
    color: #111;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}

.dark .history-title {
    color: #f3f4f6;
}

.history-detail {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    margin-top: 0.35rem;
    font-size: 0.75rem;
    color: #6b7280;
}

.dark .history-detail {
    color: #9ca3af;
}

/* Social */
.social-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    margin-bottom: 1rem;
}

.social-heading {
    font-size: 1rem;
    font-weight: 700;
    color: #111;
}

.dark .social-heading {
    color: #f9fafb;
}

.social-stats {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
}

.social-stat {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.75rem;
    font-weight: 600;
    color: #6b7280;
}

.dark .social-stat {
    color: #9ca3af;
}

.social-stat-dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 9999px;
}

.social-stat-dot-green {
    background: #22c55e;
}

.social-list {
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
}

.social-row {
    position: relative;
    overflow: hidden;
    border-radius: 0.875rem;
    min-height: 4.25rem;
}

.social-row-plain {
    background: #fff;
    border: 1px solid rgba(0, 0, 0, 0.06);
}

.dark .social-row-plain {
    background: rgba(255, 255, 255, 0.04);
    border-color: rgba(255, 255, 255, 0.08);
}

.social-row-watching {
    border: 1px solid rgba(16, 185, 129, 0.25);
}

.social-row-bg {
    position: absolute;
    inset: 0;
    pointer-events: none;
}

.social-row-bg-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transform: scale(1.1);
    filter: blur(12px);
}

.social-row-bg-scrim {
    position: absolute;
    inset: 0;
    background: linear-gradient(to right, rgba(0, 0, 0, 0.82) 0%, rgba(0, 0, 0, 0.65) 55%, rgba(0, 0, 0, 0.45) 100%);
}

.social-row-content {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: 0.875rem;
    padding: 0.75rem 0.875rem;
}

.social-row-watching .social-name {
    color: #fff;
}

.social-row-watching .social-activity-watching {
    color: rgba(167, 243, 208, 0.95);
}

.social-chevron {
    flex-shrink: 0;
    margin-left: auto;
    font-size: 1.25rem;
    color: rgba(255, 255, 255, 0.5);
}

.social-avatar {
    position: relative;
    flex-shrink: 0;
    width: 2.5rem;
    height: 2.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 9999px;
    background: rgba(255, 255, 255, 0.92);
    border: 1px solid rgba(13, 13, 13, 0.08);
}

.dark .social-avatar {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.12);
}

.social-avatar-logo {
    display: block;
    width: 1.65rem;
    height: 1.65rem;
    background: linear-gradient(135deg, #fef08a 0%, #eab308 100%);
    mask: url(/icons/icon.svg) center / contain no-repeat;
    -webkit-mask: url(/icons/icon.svg) center / contain no-repeat;
}

.social-avatar-tint-1 .social-avatar-logo {
    background: linear-gradient(135deg, #6ee7b7 0%, #059669 100%);
}

.social-avatar-tint-2 .social-avatar-logo {
    background: linear-gradient(135deg, #93c5fd 0%, #2563eb 100%);
}

.social-avatar-tint-3 .social-avatar-logo {
    background: linear-gradient(135deg, #f9a8d4 0%, #db2777 100%);
}

.social-avatar-tint-4 .social-avatar-logo {
    background: linear-gradient(135deg, #c4b5fd 0%, #7c3aed 100%);
}

.social-avatar-watching {
    box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.35);
}

.social-avatar-online {
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.35);
}

.social-status-dot {
    position: absolute;
    right: -1px;
    bottom: -1px;
    width: 0.625rem;
    height: 0.625rem;
    border-radius: 9999px;
    border: 2px solid #fff;
}

.dark .social-status-dot {
    border-color: #0d0d0d;
}

.social-dot-watching,
.social-dot-online {
    background: #22c55e;
}

.social-dot-idle {
    background: #9ca3af;
}

.social-body {
    flex: 1;
    min-width: 0;
}

.social-name {
    font-size: 0.875rem;
    font-weight: 600;
    color: #111;
}

.dark .social-name {
    color: #f3f4f6;
}

.social-activity {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    margin-top: 0.2rem;
    font-size: 0.75rem;
    color: #6b7280;
}

.social-activity-watching {
    color: #059669;
}

.social-activity-muted {
    color: #9ca3af;
}

@media (prefers-reduced-motion: reduce) {
    .view-fade-enter-active,
    .view-fade-leave-active,
    .spot-fade-enter-active,
    .spot-fade-leave-active,
    .schedule-day-enter-active,
    .schedule-day-leave-active {
        animation: none !important;
        transition: none !important;
    }

    .schedule-day-enter-active .home-schedule-card {
        animation: none !important;
    }

    .home-day-tab,
    .home-day-tab-active {
        transform: none !important;
        transition: none !important;
    }

    .preview-slide-up-enter-active,
    .preview-slide-up-leave-active {
        animation: none !important;
        transition: none !important;
    }
}
</style>
