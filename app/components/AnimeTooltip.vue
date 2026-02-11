<script setup>
const props = defineProps({
    hoveredAnime: {
        type: [String, Number],
        default: null,
    },
    animeDetails: {
        type: Object,
        default: null,
    },
    tooltipLoading: {
        type: Boolean,
        default: false,
    },
    tooltipError: {
        type: String,
        default: null,
    },
    tooltipPosition: {
        type: Object,
        default: () => ({ x: 0, y: 0, placement: "top" }),
    },
})

const { isMobile } = useMobile()
</script>

<template>
    <Teleport to="body">
        <!-- Main Tooltip with Anime Details -->
        <Transition name="tooltip-fade">
            <div
                v-if="hoveredAnime && animeDetails && !isMobile"
                :class="['anime-tooltip', `tooltip-${tooltipPosition.placement}`]"
                :style="{
                    left: tooltipPosition.x + 'px',
                    top: tooltipPosition.y + 'px',
                }"
            >
                <div class="tooltip-content">
                    <!-- Header with Image -->
                    <div class="flex gap-3 mb-3">
                        <img 
                            :src="animeDetails.image" 
                            :alt="animeDetails.title" 
                            class="w-20 sm:w-24 h-28 sm:h-32 object-cover rounded-lg shadow-lg flex-shrink-0" 
                        />
                        <div class="flex-1 min-w-0">
                            <h3 class="font-bold text-base sm:text-lg text-gray-900 dark:text-white mb-2 line-clamp-2">
                                {{ animeDetails.title }}
                            </h3>
                            <div class="space-y-1 text-xs sm:text-sm">
                                <div class="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                                    <span class="material-icons text-sm text-yellow-400">star</span>
                                    <span class="font-bold text-sm">{{ animeDetails.userRating?.score }}</span>
                                    <span class="text-sm text-gray-300">({{ formatViews(animeDetails.userRating.votes) }})</span>
                                </div>
                                <div class="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                                    <span class="material-icons text-sm">visibility</span>
                                    <span>{{ formatViews(animeDetails.views) }}</span>
                                </div>
                                <div class="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                                    <span class="material-icons text-sm">movie</span>
                                    <span>{{ animeDetails.episodeCount ?? Object.keys(animeDetails.episodes || {}).length }}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Description -->
                    <div v-if="animeDetails.description" class="mb-3">
                        <p class="text-xs sm:text-sm text-gray-700 dark:text-gray-300 line-clamp-3">
                            {{ animeDetails.description }}
                        </p>
                    </div>

                    <!-- Meta Info -->
                    <div class="space-y-1.5 text-xs">
                        <div v-if="animeDetails.premiereDate" class="flex gap-2">
                            <span class="font-semibold text-gray-900 dark:text-white whitespace-nowrap">首播:</span>
                            <span class="text-gray-600 dark:text-gray-300 truncate">{{ animeDetails.premiereDate }}</span>
                        </div>
                        <div v-if="animeDetails.director" class="flex gap-2">
                            <span class="font-semibold text-gray-900 dark:text-white whitespace-nowrap">導演:</span>
                            <span class="text-gray-600 dark:text-gray-300 truncate">{{ animeDetails.director }}</span>
                        </div>
                        <div v-if="animeDetails.productionCompany" class="flex gap-2">
                            <span class="font-semibold text-gray-900 dark:text-white whitespace-nowrap">製作:</span>
                            <span class="text-gray-600 dark:text-gray-300 truncate">{{ animeDetails.productionCompany }}</span>
                        </div>
                    </div>

                    <!-- Tags -->
                    <div v-if="animeDetails.tags && animeDetails.tags.length" class="mt-3 flex flex-wrap gap-1.5">
                        <span
                            v-for="tag in animeDetails.tags.slice(0, 5)"
                            :key="tag"
                            class="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-full text-xs font-medium"
                        >
                            {{ tag }}
                        </span>
                    </div>

                    <!-- Tooltip Arrow -->
                    <div class="tooltip-arrow"></div>
                </div>
            </div>
        </Transition>

        <!-- Loading Tooltip -->
        <Transition name="tooltip-fade">
            <div
                v-if="hoveredAnime && tooltipLoading && !animeDetails && !isMobile"
                :class="['anime-tooltip-loading', `tooltip-${tooltipPosition.placement}`]"
                :style="{
                    left: tooltipPosition.x + 'px',
                    top: tooltipPosition.y + 'px',
                }"
            >
                <div class="flex items-center gap-2">
                    <div class="w-4 h-4 border-2 border-gray-300 dark:border-gray-600 border-t-gray-900 dark:border-t-gray-100 rounded-full animate-spin"></div>
                    <span class="text-xs sm:text-sm text-gray-600 dark:text-gray-300">載入詳情...</span>
                </div>
            </div>
        </Transition>

        <!-- Error Tooltip -->
        <Transition name="tooltip-fade">
            <div
                v-if="hoveredAnime && tooltipError && !animeDetails && !isMobile"
                :class="['anime-tooltip-error', `tooltip-${tooltipPosition.placement}`]"
                :style="{
                    left: tooltipPosition.x + 'px',
                    top: tooltipPosition.y + 'px',
                }"
            >
                <div class="flex items-center gap-2">
                    <span class="material-icons text-red-500 text-base">error_outline</span>
                    <span class="text-xs sm:text-sm text-gray-600 dark:text-gray-300">{{ tooltipError }}</span>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<style scoped>
/* Anime Tooltip Styles */
.anime-tooltip {
    position: fixed;
    z-index: 9999;
    max-width: min(360px, calc(100vw - 32px));
    width: max-content;
}

.anime-tooltip.tooltip-top {
    transform: translate(-50%, -100%);
    margin-top: -16px;
}

.anime-tooltip.tooltip-bottom {
    transform: translate(-50%, 0);
    margin-top: 16px;
}

.anime-tooltip.tooltip-left {
    transform: translate(-100%, -50%);
    margin-left: -16px;
}

.anime-tooltip.tooltip-right {
    transform: translate(0, -50%);
    margin-left: 16px;
}

/* Mobile specific styles */
@media (max-width: 767px) {
    .anime-tooltip {
        position: fixed;
        top: 50% !important;
        left: 50% !important;
        transform: translate(-50%, -50%) !important;
        max-width: calc(100vw - 32px);
        max-height: calc(100vh - 64px);
        overflow-y: auto;
        margin: 0 !important;
    }

    .anime-tooltip .tooltip-arrow {
        display: none;
    }
}

.tooltip-content {
    @apply bg-white dark:bg-gray-950 rounded-xl shadow-2xl border border-gray-200 dark:border-white/10 p-3 sm:p-4;
    position: relative;
}

.tooltip-arrow {
    position: absolute;
    width: 0;
    height: 0;
}

.tooltip-top .tooltip-arrow {
    bottom: -8px;
    left: 50%;
    transform: translateX(-50%);
    border-left: 8px solid transparent;
    border-right: 8px solid transparent;
    border-top: 8px solid white;
}

.tooltip-bottom .tooltip-arrow {
    top: -8px;
    left: 50%;
    transform: translateX(-50%);
    border-left: 8px solid transparent;
    border-right: 8px solid transparent;
    border-bottom: 8px solid white;
}

.tooltip-left .tooltip-arrow {
    right: -8px;
    top: 50%;
    transform: translateY(-50%);
    border-top: 8px solid transparent;
    border-bottom: 8px solid transparent;
    border-left: 8px solid white;
}

.tooltip-right .tooltip-arrow {
    left: -8px;
    top: 50%;
    transform: translateY(-50%);
    border-top: 8px solid transparent;
    border-bottom: 8px solid transparent;
    border-right: 8px solid white;
}

.dark .tooltip-top .tooltip-arrow {
    border-top-color: rgb(3, 7, 18);
}

.dark .tooltip-bottom .tooltip-arrow {
    border-bottom-color: rgb(3, 7, 18);
}

.dark .tooltip-left .tooltip-arrow {
    border-left-color: rgb(3, 7, 18);
}

.dark .tooltip-right .tooltip-arrow {
    border-right-color: rgb(3, 7, 18);
}

.anime-tooltip-loading {
    position: fixed;
    z-index: 9999;
    @apply bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 px-3 sm:px-4 py-2;
}

.anime-tooltip-loading.tooltip-top {
    transform: translate(-50%, -100%);
    margin-top: -16px;
}

.anime-tooltip-loading.tooltip-bottom {
    transform: translate(-50%, 0);
    margin-top: 16px;
}

.anime-tooltip-loading.tooltip-left {
    transform: translate(-100%, -50%);
    margin-left: -16px;
}

.anime-tooltip-loading.tooltip-right {
    transform: translate(0, -50%);
    margin-left: 16px;
}

/* Error Tooltip */
.anime-tooltip-error {
    position: fixed;
    z-index: 9999;
    @apply bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-red-300 dark:border-red-700 px-3 sm:px-4 py-2;
}

.anime-tooltip-error.tooltip-top {
    transform: translate(-50%, -100%);
    margin-top: -16px;
}

.anime-tooltip-error.tooltip-bottom {
    transform: translate(-50%, 0);
    margin-top: 16px;
}

.anime-tooltip-error.tooltip-left {
    transform: translate(-100%, -50%);
    margin-left: -16px;
}

.anime-tooltip-error.tooltip-right {
    transform: translate(0, -50%);
    margin-left: 16px;
}

/* Tooltip Transitions */
.tooltip-fade-enter-active,
.tooltip-fade-leave-active {
    transition: opacity 0.3s ease, transform 0.3s ease;
}

.tooltip-fade-enter-from,
.tooltip-fade-leave-to {
    opacity: 0;
}

@media (min-width: 768px) {
    .tooltip-fade-enter-from.tooltip-top,
    .tooltip-fade-leave-to.tooltip-top {
        transform: translate(-50%, -100%) scale(0.95);
    }

    .tooltip-fade-enter-from.tooltip-bottom,
    .tooltip-fade-leave-to.tooltip-bottom {
        transform: translate(-50%, 0) scale(0.95);
    }

    .tooltip-fade-enter-from.tooltip-left,
    .tooltip-fade-leave-to.tooltip-left {
        transform: translate(-100%, -50%) scale(0.95);
    }

    .tooltip-fade-enter-from.tooltip-right,
    .tooltip-fade-leave-to.tooltip-right {
        transform: translate(0, -50%) scale(0.95);
    }
}

@media (max-width: 767px) {
    .tooltip-fade-enter-from,
    .tooltip-fade-leave-to {
        transform: translate(-50%, -50%) scale(0.95) !important;
    }
}

/* Line Clamp Utility */
.line-clamp-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}

.line-clamp-3 {
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
}
</style>
