<script setup>
const {
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
} = useWelcomeAppPreview()
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
                        <div class="discover-layout">
                            <article class="feature-card">
                                <Transition name="spot-fade" mode="out-in">
                                    <div :key="activeSpotlight.refId" class="feature-stage">
                                        <div class="feature-photo">
                                            <AppImage
                                                :src="activeSpotlight.image"
                                                :alt="activeSpotlight.title"
                                                class="absolute inset-0"
                                                img-class="object-cover object-top"
                                            />
                                        </div>
                                        <div class="feature-scrim" />
                                        <div class="feature-top">
                                            <span class="feature-kicker">
                                                <span class="kicker-dot" aria-hidden="true" />
                                                焦點新番
                                            </span>
                                            <span v-if="activeSpotlight.episode" class="feature-ep">{{ activeSpotlight.episode }}</span>
                                        </div>
                                        <div class="feature-copy">
                                            <h3 class="feature-title">{{ activeSpotlight.title }}</h3>
                                            <span class="feature-cta">
                                                <span class="play-orb" aria-hidden="true">
                                                    <span class="material-symbols-rounded text-[18px]">play_arrow</span>
                                                </span>
                                                立即觀看
                                            </span>
                                        </div>
                                    </div>
                                </Transition>
                            </article>
                            <div v-if="sideSpotlight.length" class="spot-panel">
                                <div class="spot-rail" :class="{ 'spot-rail-fill': sideSpotlight.length >= 3 }">
                                    <article
                                        v-for="(item, index) in sideSpotlight"
                                        :key="item.refId"
                                        class="spot-card"
                                    >
                                        <div class="spot-media">
                                            <AppImage
                                                :src="item.image"
                                                :alt="item.title"
                                                class="absolute inset-0"
                                                img-class="object-cover object-top"
                                            />
                                            <span v-if="item.episode" class="spot-ep">{{ item.episode }}</span>
                                        </div>
                                        <div class="spot-copy">
                                            <span class="spot-index" aria-hidden="true">{{ padIndex(index + 1) }}</span>
                                            <p class="spot-title">{{ item.title }}</p>
                                            <span class="spot-go">
                                                觀看
                                                <span class="material-symbols-rounded text-base" aria-hidden="true">arrow_forward</span>
                                            </span>
                                        </div>
                                    </article>
                                </div>
                            </div>
                        </div>

                        <div class="home-schedule">
                            <div class="home-schedule-head">
                                <h4 class="home-schedule-label">每日新番</h4>
                                <p class="home-schedule-sub">這週每天更新的動畫都在這裡。</p>
                            </div>
                            <div class="daily-layout">
                                <nav class="day-rail" aria-hidden="true">
                                    <div class="day-rail-list">
                                        <div
                                            class="day-rail-pill"
                                            :style="{ transform: `translateY(calc(${weekRail.findIndex((d) => d.code === selectedDay)} * (var(--day-step) + var(--day-gap))))` }"
                                        />
                                        <span
                                            v-for="day in weekRail"
                                            :key="day.code"
                                            class="day-rail-btn"
                                            :class="{ 'is-active': selectedDay === day.code }"
                                        >{{ day.label }}</span>
                                    </div>
                                </nav>
                                <div class="home-schedule-stage">
                                    <Transition name="schedule-day" mode="out-in">
                                        <div :key="selectedDay" class="daily-stack">
                                            <article
                                                v-for="(item, index) in displayedItems"
                                                :key="item.refId"
                                                class="daily-card"
                                                :style="{ '--card-i': index }"
                                            >
                                                <AppImage
                                                    :src="item.thumbnail || item.image"
                                                    :alt="item.title"
                                                    class="absolute inset-0"
                                                    img-class="h-full w-full object-cover object-top"
                                                />
                                                <div class="daily-scrim" />
                                                <span v-if="item.episode" class="daily-badge">{{ item.episode }}</span>
                                                <div class="daily-copy">
                                                    <p class="daily-title">{{ item.title }}</p>
                                                </div>
                                            </article>
                                            <p v-if="!displayedItems.length" class="daily-empty">
                                                {{ weekRail.find((d) => d.code === selectedDay)?.zh }}暫無更新
                                            </p>
                                        </div>
                                    </Transition>
                                </div>
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
                                <AppImage
                                    :src="demoPlayer.image"
                                    :alt="demoPlayer.title"
                                    class="absolute inset-0"
                                    img-class="object-cover"
                                />
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
                                    <AppChip size="sm" :active="relatedTab === 'related'" @click="relatedTab = 'related'">
                                        相關動漫
                                    </AppChip>
                                    <AppChip size="sm" :active="relatedTab === 'recommended'" @click="relatedTab = 'recommended'">
                                        為你推薦
                                    </AppChip>
                                </div>
                                <div class="related-grid-wrap">
                                    <div class="related-grid" role="list">
                                        <article
                                            v-for="item in demoRelatedItems"
                                            :key="item.refId"
                                            class="related-card group"
                                            role="listitem"
                                        >
                                            <AppImage
                                                :src="item.image"
                                                :alt="item.title"
                                                class="aspect-[2/3]"
                                                img-class="w-full h-full object-cover group-hover:scale-105"
                                            >
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
                                            </AppImage>
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
                                    <AppImage
                                        :src="item.image"
                                        :alt="item.title"
                                        class="history-thumb"
                                        icon-class="text-2xl"
                                    >
                                        <div class="history-progress">
                                            <div class="history-progress-fill" :style="{ width: `${item.progress}%` }" />
                                        </div>
                                    </AppImage>
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
                                    <AppImage
                                        :src="friend.anime.image"
                                        alt=""
                                        class="absolute inset-0"
                                        img-class="object-cover scale-110"
                                    />
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

<style scoped src="../styles/WelcomeAppPreviewGrid.css"></style>
