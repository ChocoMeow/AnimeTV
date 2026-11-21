<script setup>
const {
    router,
    userShortcuts,
    formatShortcutKey,
    isMac,
    formatRating,
    anime,
    selectedEpisode,
    videoUrl,
    videoIsHls,
    error,
    loading,
    episodesLoading,
    isOfflineView,
    coverSrc,
    offlineCoverUrl,
    videoPlayer,
    isTheaterMode,
    episodeLoading,
    videoPlayerMeta,
    playerStartTime,
    hasNextEpisode,
    handlePlay,
    handlePause,
    handleEnded,
    handleNextEpisode,
    handlePreviousEpisode,
    onVideoReady,
    handleStreamError,
    handleCaptionAdded,
    showContinuePrompt,
    lastWatchedData,
    allWatchProgress,
    continueLast,
    toolbarHeaderRef,
    animeToolbarActions,
    toolbarActionsSplit,
    showToolbarOverflowMenu,
    toolbarOverflowRoot,
    additionalDetails,
    hoveredAnime,
    animeDetails,
    tooltipLoading,
    tooltipError,
    tooltipPosition,
    handleTooltipMouseEnter,
    handleTooltipMouseLeave,
    handleTooltipEnter,
    handleTooltipLeave,
    setFavoriteStatus,
    showShareDialog,
    shareUrl,
    showDetailDialog,
    showShortcutsModal,
    showOfflineDownloadDialog,
    sortedEpisodeKeys,
    offlineDownloadedKeys,
    isOfflineDownloading,
    offlineDownloadProgress,
    offlineDownloadLabel,
    handleOfflineDownload,
    handleOfflineRemoveEpisode,
    refreshOfflineEpisodeList,
} = useAnimeDetailPage()
</script>

<template>
    <!-- Loading -->
    <SkeletonAnimeDetail v-if="loading" />

    <!-- Error -->
    <div v-else-if="error" class="flex flex-col justify-center items-center min-h-screen text-center px-4">
        <div class="w-20 h-20 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-6">
            <span class="material-symbols-rounded text-5xl text-red-500 dark:text-red-400">error_outline</span>
        </div>
        <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">載入失敗</h2>
        <p class="text-red-600 dark:text-red-400 mb-6 max-w-md">{{ error }}</p>
        <button @click="router.back()" class="px-6 py-3 bg-gray-900 dark:bg-white hover:opacity-90 text-white dark:text-black rounded-full font-semibold shadow-lg transition-all transform hover:-translate-y-0.5">返回上一頁</button>
    </div>

    <!-- Empty -->
    <div v-else-if="!anime" class="flex flex-col justify-center items-center min-h-screen">
        <span class="material-symbols-rounded text-6xl text-gray-400 mb-4">movie_filter</span>
        <p class="text-gray-600 dark:text-gray-400">無可用的動漫資料</p>
    </div>

    <!-- Content -->
    <div v-else class="bg-white dark:bg-gray-950 overflow-x-hidden">
        <div class="space-y-8 max-w-[96rem] mx-auto px-3 sm:px-4 py-4 sm:py-8 min-w-0">
            <div :class="isTheaterMode
                ? 'flex flex-col gap-4 min-w-0 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start'
                : 'flex flex-col lg:flex-row gap-4 min-w-0'">

                <div :class="isTheaterMode ? 'space-y-4 lg:space-y-0 min-w-0 lg:contents' : 'flex-1 min-w-0 lg:w-[75%] space-y-4'">
                    <!-- Video Player -->
                    <section aria-label="Video player" :class="isTheaterMode ? 'lg:col-span-2' : ''">
                        <!-- Thumbnail placeholder (no episode selected) -->
                        <div v-if="!selectedEpisode && coverSrc"
                            class="aspect-video relative rounded-xl overflow-hidden bg-gray-900 dark:bg-gray-950">
                            <div class="absolute inset-0">
                                <AppImage
                                    :src="offlineCoverUrl || coverSrc"
                                    alt="Anime thumbnail"
                                    class="absolute inset-0"
                                    loading="eager"
                                    img-style="filter: blur(2px);"
                                />
                            </div>
                            <div class="absolute inset-0 bg-gradient-to-b from-black/70 via-black/60 to-black/80" />
                            <div class="absolute inset-0 flex flex-col items-center justify-center z-[1] px-4 sm:px-8">
                                <span class="material-symbols-rounded outlined text-white text-4xl sm:text-5xl pb-4">play_circle</span>
                                <div class="text-center space-y-2 sm:space-y-3">
                                    <h3 class="text-xl sm:text-2xl font-bold text-white mb-2">選擇集數開始播放</h3>
                                    <p class="text-sm sm:text-base text-white/80 max-w-md">請從右側（或下方）選擇您想觀看的集數</p>
                                </div>
                            </div>
                        </div>

                        <VideoPlayer
                            v-else-if="selectedEpisode"
                            ref="videoPlayer"
                            :src="videoUrl || ''"
                            :is-hls="videoIsHls"
                            :start-time="playerStartTime"
                            :loading="episodeLoading"
                            :anime-meta="videoPlayerMeta"
                            preload="metadata"
                            :has-next-episode="hasNextEpisode && !episodeLoading"
                            :shortcuts="userShortcuts"
                            :theater-mode="isTheaterMode"
                            autoplay
                            @play="handlePlay"
                            @pause="handlePause"
                            @ended="handleEnded"
                            @next-episode="handleNextEpisode"
                            @previous-episode="handlePreviousEpisode"
                            @loadeddata="onVideoReady"
                            @stream-error="handleStreamError"
                            @toggle-theater-mode="isTheaterMode = !isTheaterMode"
                            @caption-added="handleCaptionAdded"
                        />
                    </section>

                    <!-- Offline Banner -->
                    <div v-if="isOfflineView"
                        :class="['flex items-center gap-3 p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50 text-amber-900 dark:text-amber-100 text-sm', isTheaterMode ? 'lg:col-span-2' : '']"
                        role="status">
                        <span class="material-symbols-rounded flex-shrink-0 text-xl">wifi_off</span>
                        <p>離線模式：已從本機載入先前快取的動漫資料。請選擇已下載的集數觀看；重新整理前請勿關閉此分頁。</p>
                    </div>

                    <AnimeContinueEpisodePanel class="lg:hidden"
                        :show-continue-prompt="showContinuePrompt"
                        :last-watched-data="lastWatchedData"
                        :episodes-loading="episodesLoading"
                        :episodes="anime?.episodes"
                        :watch-progress="allWatchProgress"
                        :anime-image="coverSrc"
                        :offline="isOfflineView"
                        :model-value="selectedEpisode"
                        @update:model-value="(n) => (selectedEpisode = n)"
                        @continue-last="continueLast" />

                    <!-- Anime Information -->
                    <section class="space-y-4" aria-label="Anime information">
                        <!-- Title + Actions -->
                        <div ref="toolbarHeaderRef" class="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                            <h1 class="min-w-0 md:flex-1 text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white leading-tight">{{ anime.title }}</h1>
                            <div v-if="!isOfflineView && animeToolbarActions.length" class="flex flex-wrap items-center gap-2 w-full md:w-auto md:flex-shrink-0 md:justify-end">
                                <button v-for="action in toolbarActionsSplit.primary" :key="action.key"
                                    type="button"
                                    class="inline-flex items-center gap-1.5 h-10 px-3 bg-black/5 dark:bg-white/10 rounded-full ring-1 ring-black/5 dark:ring-white/10 hover:bg-black/10 dark:hover:bg-white/20 transition-all focus:outline-none"
                                    :aria-label="action.label"
                                    @click="action.run()">
                                    <span class="material-symbols-rounded text-xl" :class="action.iconClass">{{ action.icon }}</span>
                                    <span class="text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap">{{ action.label }}</span>
                                </button>
                                <div v-if="toolbarActionsSplit.overflow.length" ref="toolbarOverflowRoot" class="relative">
                                    <button type="button"
                                        class="w-10 h-10 bg-black/5 dark:bg-white/10 rounded-full ring-1 ring-black/5 dark:ring-white/10 hover:bg-black/10 dark:hover:bg-white/20 transition-all flex items-center justify-center focus:outline-none"
                                        title="更多" aria-label="更多操作"
                                        :aria-expanded="showToolbarOverflowMenu"
                                        @click.stop="showToolbarOverflowMenu = !showToolbarOverflowMenu">
                                        <span class="material-symbols-rounded text-xl text-gray-900 dark:text-white">more_vert</span>
                                    </button>
                                    <div v-show="showToolbarOverflowMenu"
                                        class="absolute right-0 top-full mt-2 min-w-[11rem] py-1 rounded-xl ring-1 ring-black/5 dark:ring-white/10 bg-white dark:bg-gray-950 shadow-xl z-10"
                                        role="menu" @click.stop>
                                        <button v-for="action in toolbarActionsSplit.overflow" :key="action.key"
                                            type="button"
                                            class="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left text-gray-900 dark:text-white hover:bg-black/5 dark:hover:bg-white/10"
                                            role="menuitem"
                                            @click="action.run(); showToolbarOverflowMenu = false">
                                            <span class="material-symbols-rounded text-lg flex-shrink-0" :class="action.iconClass">{{ action.icon }}</span>
                                            <span>{{ action.label }}</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                    <!-- Stats -->
                    <div class="flex flex-wrap items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                        <div class="flex items-center gap-1.5">
                            <span class="material-symbols-rounded text-base">visibility</span>
                            <span class="text-gray-900 dark:text-white">{{ formatViews(anime.views) }}</span>
                            <span>觀看</span>
                        </div>
                        <div class="flex items-center gap-1.5">
                            <span class="material-symbols-rounded text-base">favorite</span>
                            <span class="text-gray-900 dark:text-white">{{ formatViews(anime.userRating.votes) }}</span>
                            <span>喜歡</span>
                        </div>
                        <div v-if="anime.userRating?.score" class="flex items-center gap-1.5">
                            <span class="material-symbols-rounded text-base text-yellow-400">star</span>
                            <span class="text-gray-900 dark:text-white">{{ formatRating(anime.userRating.score) }}</span>
                        </div>
                    </div>

                    <!-- Description -->
                    <div class="text-gray-700 dark:text-gray-200 leading-relaxed">{{ anime.description || "暫無簡介" }}</div>

                    <!-- Tags -->
                    <div v-if="anime.tags?.length" class="flex flex-wrap items-center gap-2">
                        <NuxtLink v-for="tag in anime.tags" :key="tag"
                            :to="`/show-all-anime?tags=${encodeURIComponent(tag)}`"
                            class="px-3 py-1.5 bg-black/5 dark:bg-white/10 rounded-full ring-1 ring-black/5 dark:ring-white/10 text-sm font-medium text-gray-900 dark:text-white hover:bg-black/10 dark:hover:bg-white/20 hover:ring-black/10 dark:hover:ring-white/20 transition-all flex items-center gap-1.5 focus:outline-none">
                            <span class="material-symbols-rounded text-xs">tag</span>
                            {{ tag }}
                        </NuxtLink>
                    </div>

                    <!-- Additional Details -->
                    <div v-if="additionalDetails.length" class="pt-4 border-t border-black/10 dark:border-white/10">
                        <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4">詳細資訊</h3>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div v-for="detail in additionalDetails" :key="detail.label"
                                class="bg-black/[0.02] dark:bg-white/5 rounded-xl ring-1 ring-black/5 dark:ring-white/10 p-4">
                                <div class="flex items-start gap-3">
                                    <div class="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" :class="detail.iconBg">
                                        <span class="material-symbols-rounded text-xl" :class="detail.iconColor">{{ detail.icon }}</span>
                                    </div>
                                    <div class="flex-1 min-w-0">
                                        <p class="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{{ detail.label }}</p>
                                        <p class="text-sm font-semibold text-gray-900 dark:text-white">{{ detail.value }}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    </section>
                </div>

                <!-- Right Column / Sidebar (sticky on desktop, inline on mobile) -->
                <aside :class="['space-y-6 min-w-0', isTheaterMode ? '' : 'lg:w-[25%] lg:sticky lg:self-start']" aria-label="Episode list and related content">

                    <AnimeContinueEpisodePanel class="hidden lg:block"
                        :show-continue-prompt="showContinuePrompt"
                        :last-watched-data="lastWatchedData"
                        :episodes-loading="episodesLoading"
                        :episodes="anime?.episodes"
                        :watch-progress="allWatchProgress"
                        :anime-image="coverSrc"
                        :offline="isOfflineView"
                        :model-value="selectedEpisode"
                        @update:model-value="(n) => (selectedEpisode = n)"
                        @continue-last="continueLast" />

                    <AnimeRelatedSection
                        v-if="anime && !isOfflineView"
                        :related-anime="anime.relatedAnime || []"
                        :tags="anime.tags || []"
                        :current-ref-id="anime.refId"
                        @tooltip-enter="handleTooltipMouseEnter"
                        @tooltip-leave="handleTooltipMouseLeave" />
                </aside>

            </div>
        </div>
    </div>

    <!-- Dialogs -->
    <LazyAnimeTooltip
        :hovered-anime="hoveredAnime" :anime-details="animeDetails"
        :tooltip-loading="tooltipLoading" :tooltip-error="tooltipError"
        :tooltip-position="tooltipPosition"
        :on-tooltip-enter="handleTooltipEnter" :on-tooltip-leave="handleTooltipLeave"
        :on-favorite-toggled="({ refId, isFavorite }) => setFavoriteStatus(refId, isFavorite)" />

    <LazyShareDialog v-model="showShareDialog" :share-url="shareUrl" :anime-title="anime?.title" :has-episode="!!selectedEpisode" />
    <LazyAnimeDetailDialog v-if="anime" v-model="showDetailDialog" :anime-id="anime.detailId" />

    <LazyOfflineDownloadDialog
        v-model="showOfflineDownloadDialog"
        :episode-keys="sortedEpisodeKeys"
        :episodes="anime?.episodes || {}"
        :downloaded-keys="offlineDownloadedKeys"
        :is-downloading="isOfflineDownloading"
        :download-progress="offlineDownloadProgress"
        :download-label="offlineDownloadLabel"
        @download="handleOfflineDownload"
        @download-all="handleOfflineDownload"
        @remove="handleOfflineRemoveEpisode"
        @refresh="refreshOfflineEpisodeList" />

    <!-- Shortcuts Modal -->
    <LazyBaseDialog v-model="showShortcutsModal" max-width="max-w-2xl">
        <template #header>
            <div class="flex items-center gap-3">
                <span class="material-symbols-rounded text-3xl text-gray-600 dark:text-gray-400">keyboard</span>
                <h3 class="text-2xl font-bold text-gray-900 dark:text-white">鍵盤快捷鍵</h3>
            </div>
        </template>
        <div class="space-y-4">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div class="space-y-2">
                    <div class="flex items-center justify-between py-2 border-b border-black/10 dark:border-white/10">
                        <span class="text-sm text-gray-600 dark:text-gray-400">{{ userShortcuts.playPause?.label || "播放/暫停" }}</span>
                        <kbd class="px-2 py-1 text-xs font-semibold text-gray-800 dark:text-gray-200 bg-black/5 dark:bg-white/10 border border-black/5 dark:border-white/10 rounded">{{ formatShortcutKey(userShortcuts.playPause) }}</kbd>
                    </div>
                    <div class="flex items-center justify-between py-2 border-b border-black/10 dark:border-white/10">
                        <span class="text-sm text-gray-600 dark:text-gray-400">長按 {{ formatShortcutKey(userShortcuts.playPause) }} (2x 速度)</span>
                        <kbd class="px-2 py-1 text-xs font-semibold text-gray-800 dark:text-gray-200 bg-black/5 dark:bg-white/10 border border-black/5 dark:border-white/10 rounded">{{ formatShortcutKey(userShortcuts.playPause) }} (長按)</kbd>
                    </div>
                </div>
                <div class="space-y-2">
                    <div class="flex items-center justify-between py-2">
                        <span class="text-sm text-gray-600 dark:text-gray-400">顯示快捷鍵</span>
                        <div class="flex items-center gap-1">
                            <kbd class="px-2 py-1 text-xs font-semibold text-gray-800 dark:text-gray-200 bg-black/5 dark:bg-white/10 border border-black/5 dark:border-white/10 rounded">{{ isMac ? '⌘' : 'Ctrl' }}</kbd>
                            <span class="text-xs text-gray-400">+</span>
                            <kbd class="px-2 py-1 text-xs font-semibold text-gray-800 dark:text-gray-200 bg-black/5 dark:bg-white/10 border border-black/5 dark:border-white/10 rounded">/</kbd>
                        </div>
                    </div>
                </div>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
                <template v-for="(shortcut, action) in userShortcuts" :key="action">
                    <div v-if="action !== 'playPause' && shortcut?.label"
                        class="flex items-center justify-between py-2 border-b border-black/10 dark:border-white/10">
                        <span class="text-sm text-gray-600 dark:text-gray-400">{{ shortcut.label }}</span>
                        <kbd class="px-2 py-1 text-xs font-semibold text-gray-800 dark:text-gray-200 bg-black/5 dark:bg-white/10 border border-black/5 dark:border-white/10 rounded">{{ formatShortcutKey(shortcut) }}</kbd>
                    </div>
                </template>
            </div>
            <div class="pt-4">
                <p class="text-xs text-gray-500 dark:text-gray-400 text-center">提示：在輸入框中輸入時，快捷鍵將不會生效</p>
            </div>
        </div>
    </LazyBaseDialog>
</template>

<style scoped>
.slide-down-enter-active, .slide-down-leave-active { transition: all 0.4s ease-out; }
.slide-down-enter-from, .slide-down-leave-to { opacity: 0; transform: translateY(-20px); }

*:focus-visible { @apply outline-none ring-2 ring-gray-900 dark:ring-white ring-offset-2 dark:ring-offset-gray-950; }
</style>
