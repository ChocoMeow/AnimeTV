<script setup>
const appConfig = useAppConfig()
const loading = ref(false)
const byDay = ref({})
const themes = ref({})
const fetchedAt = ref(null)

const today = new Date()
const jsDay = today.getDay()
const dayMap = { 0: "7", 1: "1", 2: "2", 3: "3", 4: "4", 5: "5", 6: "6" }
const selectedDay = ref(dayMap[jsDay] || "1")

const weekdayLabel = {
    1: "週一",
    2: "週二",
    3: "週三",
    4: "週四",
    5: "週五",
    6: "週六",
    7: "週日",
}

// Tooltip state
const hoveredAnime = ref(null)
const animeDetails = ref(null)
const tooltipLoading = ref(false)
const tooltipPosition = ref({ x: 0, y: 0, placement: "top" })
const isMobile = ref(false)
let hoverTimer = null

// Cache for anime details
const animeCache = ref(new Map())

function formatViews(views) {
    if (!views) return "0"
    if (views >= 1000000) {
        return (views / 1000000).toFixed(1) + "M"
    } else if (views >= 1000) {
        return (views / 1000).toFixed(1) + "K"
    }
    return views
}

async function fetchHomeAnime() {
    loading.value = true
    try {
        const res = await $fetch("/api/anime")
        byDay.value = res.byDay || {}
        themes.value = res.themes || {}
        fetchedAt.value = res.fetchedAt || null
    } catch (err) {
        console.error("Failed to fetch /api/anime:", err)
        byDay.value = {}
        themes.value = {}
    } finally {
        loading.value = false
    }
}

function calculateTooltipPosition(event) {
    const rect = event.currentTarget.getBoundingClientRect()
    const tooltipWidth = 360
    const tooltipHeight = 400
    const padding = 16

    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight

    let x = rect.left + rect.width / 2
    let y = rect.top
    let placement = "top"

    const spaceTop = rect.top
    const spaceBottom = viewportHeight - rect.bottom
    const spaceLeft = rect.left
    const spaceRight = viewportWidth - rect.right

    // Determine best placement based on available space
    if (spaceTop >= tooltipHeight + padding) {
        placement = "top"
        y = rect.top
        x = rect.left + rect.width / 2
    } else if (spaceBottom >= tooltipHeight + padding) {
        placement = "bottom"
        y = rect.bottom
        x = rect.left + rect.width / 2
    } else if (spaceRight >= tooltipWidth + padding) {
        placement = "right"
        x = rect.right
        y = rect.top + rect.height / 2
    } else if (spaceLeft >= tooltipWidth + padding) {
        placement = "left"
        x = rect.left
        y = rect.top + rect.height / 2
    } else {
        // Default to top if no good space
        placement = "top"
        y = rect.top
        x = rect.left + rect.width / 2
    }

    // Adjust horizontal position for top/bottom placements
    if (placement === "top" || placement === "bottom") {
        const halfTooltipWidth = tooltipWidth / 2
        if (x - halfTooltipWidth < padding) {
            x = halfTooltipWidth + padding
        } else if (x + halfTooltipWidth > viewportWidth - padding) {
            x = viewportWidth - halfTooltipWidth - padding
        }
    }

    // Adjust vertical position for left/right placements
    if (placement === "left" || placement === "right") {
        const halfTooltipHeight = tooltipHeight / 2
        if (y - halfTooltipHeight < padding) {
            y = halfTooltipHeight + padding
        } else if (y + halfTooltipHeight > viewportHeight - padding) {
            y = viewportHeight - halfTooltipHeight - padding
        }
    }

    return { x, y, placement }
}

async function handleMouseEnter(item, event) {
    if (isMobile.value) return

    hoveredAnime.value = item.refId
    tooltipPosition.value = calculateTooltipPosition(event)

    // Check cache first
    if (animeCache.value.has(item.refId)) {
        animeDetails.value = animeCache.value.get(item.refId)
        return
    }

    hoverTimer = setTimeout(async () => {
        if (hoveredAnime.value === item.refId) {
            tooltipLoading.value = true
            try {
                const details = await $fetch(`/api/anime/${item.refId}`)
                if (hoveredAnime.value === item.refId) {
                    animeDetails.value = details
                    // Cache the result
                    animeCache.value.set(item.refId, details)
                }
            } catch (err) {
                console.error("Failed to fetch anime details:", err)
            } finally {
                tooltipLoading.value = false
            }
        }
    }, 2000)
}

function handleMouseLeave() {
    if (hoverTimer) {
        clearTimeout(hoverTimer)
        hoverTimer = null
    }
    hoveredAnime.value = null
    animeDetails.value = null
    tooltipLoading.value = false
}

function handleTouchStart(item, event) {
    if (!isMobile.value) return

    event.preventDefault()
    hoveredAnime.value = item.refId
    tooltipPosition.value = calculateTooltipPosition(event)

    // Check cache first
    if (animeCache.value.has(item.refId)) {
        animeDetails.value = animeCache.value.get(item.refId)
        return
    }

    hoverTimer = setTimeout(async () => {
        if (hoveredAnime.value === item.refId) {
            tooltipLoading.value = true
            try {
                const details = await $fetch(`/api/anime/${item.refId}`)
                if (hoveredAnime.value === item.refId) {
                    animeDetails.value = details
                    animeCache.value.set(item.refId, details)
                }
            } catch (err) {
                console.error("Failed to fetch anime details:", err)
            } finally {
                tooltipLoading.value = false
            }
        }
    }, 1000)
}

function handleTouchEnd() {
    if (hoverTimer) {
        clearTimeout(hoverTimer)
        hoverTimer = null
    }
}

function closeTooltip() {
    handleMouseLeave()
}

function checkMobile() {
    isMobile.value = window.innerWidth < 768 || "ontouchstart" in window
}

useHead({ title: `每日新番 | ${appConfig.siteName}` })

onMounted(() => {
    fetchHomeAnime()
    checkMobile()
    window.addEventListener("resize", checkMobile)
})

onUnmounted(() => {
    if (hoverTimer) {
        clearTimeout(hoverTimer)
    }
    window.removeEventListener("resize", checkMobile)
})
</script>

<template>
    <div class="min-h-screen bg-gradient-to-br from-gray-50 via-indigo-50/30 to-purple-50/20 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800">
        <main class="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
            <!-- Loading State -->
            <div v-if="loading && !Object.keys(byDay).length" class="flex items-center justify-center min-h-[400px]">
                <div class="text-center">
                    <div class="inline-block w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                    <p class="mt-4 text-gray-600 dark:text-gray-400">載入中...</p>
                </div>
            </div>

            <div v-else class="space-y-8">
                <!-- Daily Schedule Section -->
                <section class="anime-card">
                    <div class="mb-4 sm:mb-6">
                        <div class="flex items-center gap-2 sm:gap-3 mb-2">
                            <h2 class="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">每日新番</h2>
                        </div>
                        <p class="text-xs sm:text-sm text-gray-500 dark:text-gray-400"><span class="hidden sm:inline">滑鼠懸停查看詳情 | </span>點擊日期標籤查看當日更新</p>
                    </div>

                    <!-- Loading inside section -->
                    <div v-if="loading" class="flex justify-center py-12">
                        <div class="inline-block w-8 h-8 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                    </div>

                    <template v-else>
                        <!-- Day Tabs -->
                        <div class="flex flex-wrap gap-2 sm:gap-3 mb-4 sm:mb-6">
                            <button
                                v-for="d in Object.keys(weekdayLabel)"
                                :key="d"
                                @click="selectedDay = d"
                                :class="['day-tab', selectedDay === d ? 'day-tab-active' : 'day-tab-inactive']"
                            >
                                {{ weekdayLabel[d] }}
                            </button>
                        </div>

                        <!-- Day Content -->
                        <div v-if="!byDay[selectedDay] || !byDay[selectedDay].length" class="text-center py-12 text-gray-500 dark:text-gray-400">
                            <span class="material-icons text-4xl mb-2 opacity-50">event_busy</span>
                            <p>今日暫無更新節目</p>
                        </div>

                        <div v-else class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                            <NuxtLink
                                v-for="item in byDay[selectedDay]"
                                :key="item.refId"
                                class="daily-item group"
                                :to="`/anime/${item.refId}`"
                                @mouseenter="handleMouseEnter(item, $event)"
                                @mouseleave="handleMouseLeave"
                                @touchstart="handleTouchStart(item, $event)"
                                @touchend="handleTouchEnd"
                            >
                                <div class="relative overflow-hidden rounded-t-lg aspect-video bg-gray-200 dark:bg-gray-700">
                                    <img :src="item.thumbnail" alt="" class="w-full h-full object-cover transform transition-transform duration-300 group-hover:scale-110" />
                                    <div class="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>

                                    <!-- Play icon overlay -->
                                    <div class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                        <div class="w-10 h-10 rounded-full bg-white/90 dark:bg-gray-900/90 flex items-center justify-center shadow-lg">
                                            <span class="material-icons text-indigo-600 dark:text-indigo-400 text-2xl">play_arrow</span>
                                        </div>
                                    </div>
                                </div>

                                <div class="p-2">
                                    <div class="font-semibold text-xs sm:text-sm text-gray-900 dark:text-white line-clamp-2 mb-1 leading-tight">
                                        {{ item.title }}
                                    </div>
                                    <div class="flex items-center text-xs text-indigo-600 dark:text-indigo-400 font-medium">
                                        <span class="material-icons text-xs mr-1">play_circle</span>
                                        {{ item.episode }}
                                    </div>
                                </div>
                            </NuxtLink>
                        </div>
                    </template>
                </section>

                <!-- Theme Sections -->
                <section v-if="Object.keys(themes).length" class="space-y-12">
                    <div v-for="(items, title) in themes" :key="title">
                        <div v-if="items && items.length">
                            <!-- Section Header -->
                            <div class="flex items-center gap-3 mb-6">
                                <h2 class="text-3xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">
                                    {{ title }}
                                </h2>
                            </div>

                            <!-- Anime Grid -->
                            <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                                <NuxtLink v-for="item in items" :key="item.refId || item.video_url" class="anime-card-item group" :to="`/anime/${item.refId}`">
                                    <!-- Image Container -->
                                    <div class="relative overflow-hidden rounded-t-xl aspect-[2/3] bg-gray-200 dark:bg-gray-700">
                                        <img :src="item.image" :alt="item.title" class="w-full h-full object-cover transform transition-all duration-500 group-hover:scale-110" />
                                        <!-- Gradient Overlay -->
                                        <div
                                            class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300"
                                        ></div>

                                        <!-- Year Badge -->
                                        <div class="absolute top-2 right-2 badge-year">
                                            {{ item.year }}
                                        </div>

                                        <!-- Hover Play Button -->
                                        <div
                                            class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 transform scale-75 group-hover:scale-100"
                                        >
                                            <div class="w-14 h-14 rounded-full bg-white/90 dark:bg-gray-900/90 flex items-center justify-center shadow-xl">
                                                <span class="material-icons text-indigo-600 dark:text-indigo-400 text-3xl">play_arrow</span>
                                            </div>
                                        </div>
                                    </div>

                                    <!-- Info Container -->
                                    <div class="p-3 space-y-2">
                                        <h3
                                            class="font-semibold text-sm text-gray-900 dark:text-gray-100 line-clamp-2 leading-snug group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors"
                                        >
                                            {{ item.title }}
                                        </h3>

                                        <div class="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                                            <div class="flex items-center gap-1">
                                                <span class="material-icons text-sm">movie</span>
                                                <span>{{ item.episodes }}</span>
                                            </div>
                                            <div class="flex items-center gap-1">
                                                <span class="material-icons text-sm">visibility</span>
                                                <span>{{ formatViews(item.views) }}</span>
                                            </div>
                                        </div>
                                    </div>
                                </NuxtLink>
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        </main>

        <!-- Anime Details Tooltip -->
        <Teleport to="body">
            <Transition name="tooltip-fade">
                <div
                    v-if="hoveredAnime && animeDetails"
                    :class="['anime-tooltip', `tooltip-${tooltipPosition.placement}`]"
                    :style="{
                        left: tooltipPosition.x + 'px',
                        top: tooltipPosition.y + 'px',
                    }"
                >
                    <!-- Mobile close button -->
                    <button
                        v-if="isMobile"
                        @click="closeTooltip"
                        class="absolute top-2 right-2 z-10 w-6 h-6 bg-gray-800/80 dark:bg-gray-200/80 rounded-full flex items-center justify-center text-white dark:text-gray-900"
                    >
                        <span class="material-icons text-sm">close</span>
                    </button>

                    <div class="tooltip-content">
                        <!-- Header with Image -->
                        <div class="flex gap-3 mb-3">
                            <img :src="animeDetails.image" :alt="animeDetails.title" class="w-20 sm:w-24 h-28 sm:h-32 object-cover rounded-lg shadow-lg flex-shrink-0" />
                            <div class="flex-1 min-w-0">
                                <h3 class="font-bold text-base sm:text-lg text-gray-900 dark:text-white mb-2 line-clamp-2">
                                    {{ animeDetails.title }}
                                </h3>
                                <div class="space-y-1 text-xs sm:text-sm">
                                    <div class="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                                        <span class="material-icons text-sm text-yellow-400">star</span>
                                        <span class="font-bold text-sm">{{ animeDetails.userRating?.score }}</span>
                                        <span class="text-sm text-gray-300">({{ animeDetails.userRating?.count || 0 }})</span>
                                    </div>
                                    <div class="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                                        <span class="material-icons text-sm">visibility</span>
                                        <span>{{ animeDetails.views }}</span>
                                    </div>
                                    <div class="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                                        <span class="material-icons text-sm">movie</span>
                                        <span>共{{ Object.keys(animeDetails.episodes).length }}集</span>
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
                                class="px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-full text-xs font-medium"
                            >
                                {{ tag }}
                            </span>
                        </div>

                        <!-- Tooltip Arrow -->
                        <div class="tooltip-arrow"></div>
                    </div>

                    <!-- Mobile overlay backdrop -->
                    <div v-if="isMobile" @click="closeTooltip" class="tooltip-backdrop"></div>
                </div>
            </Transition>

            <!-- Loading Tooltip -->
            <Transition name="tooltip-fade">
                <div
                    v-if="hoveredAnime && tooltipLoading && !animeDetails"
                    :class="['anime-tooltip-loading', `tooltip-${tooltipPosition.placement}`]"
                    :style="{
                        left: tooltipPosition.x + 'px',
                        top: tooltipPosition.y + 'px',
                    }"
                >
                    <div class="flex items-center gap-2">
                        <div class="w-4 h-4 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                        <span class="text-xs sm:text-sm text-gray-600 dark:text-gray-300">載入詳情...</span>
                    </div>
                </div>
            </Transition>
        </Teleport>
    </div>
</template>

<style scoped>
/* Card Styles */
.anime-card {
    @apply bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-4 sm:p-6 transition-all duration-300 hover:shadow-xl;
}

/* Day Tab Styles */
.day-tab {
    @apply px-3 sm:px-5 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all duration-300 transform;
}

.day-tab-inactive {
    @apply bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 
           border-2 border-gray-200 dark:border-gray-700
           hover:border-indigo-300 dark:hover:border-indigo-600
           hover:text-indigo-600 dark:hover:text-indigo-400
           hover:shadow-md hover:-translate-y-0.5;
}

.day-tab-active {
    @apply bg-gradient-to-r from-indigo-600 to-purple-600 text-white 
           border-2 border-indigo-600 dark:border-purple-600
           shadow-lg shadow-indigo-500/30 dark:shadow-purple-500/30
           transform -translate-y-1;
}

/* Daily Item Styles */
.daily-item {
    @apply bg-white dark:bg-gray-800 rounded-xl overflow-hidden
           cursor-pointer transition-all duration-300 hover:shadow-lg 
           hover:-translate-y-1 border border-gray-100 dark:border-gray-700
           hover:border-indigo-300 dark:hover:border-indigo-600;
}

/* Anime Card Item Styles */
.anime-card-item {
    @apply bg-white dark:bg-gray-800 rounded-xl overflow-hidden 
           cursor-pointer transition-all duration-300
           hover:shadow-2xl hover:-translate-y-2
           border border-gray-100 dark:border-gray-700
           hover:border-indigo-300 dark:hover:border-indigo-600;
}

/* Year Badge */
.badge-year {
    @apply bg-gradient-to-r from-indigo-500 to-purple-600 text-white 
           text-xs font-bold px-3 py-1 rounded-full shadow-lg
           backdrop-blur-sm transform transition-transform duration-300;
}

.group:hover .badge-year {
    @apply scale-110;
}

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
    @apply bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 p-3 sm:p-4;
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
    border-top-color: rgb(31, 41, 55);
}

.dark .tooltip-bottom .tooltip-arrow {
    border-bottom-color: rgb(31, 41, 55);
}

.dark .tooltip-left .tooltip-arrow {
    border-left-color: rgb(31, 41, 55);
}

.dark .tooltip-right .tooltip-arrow {
    border-right-color: rgb(31, 41, 55);
}

.anime-tooltip-loading {
    position: fixed;
    z-index: 9999;
    @apply bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 px-3 sm:px-4 py-2;
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

/* Tooltip backdrop for mobile */
.tooltip-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: -1;
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

/* Smooth Scrollbar */
::-webkit-scrollbar {
    width: 8px;
    height: 8px;
}

::-webkit-scrollbar-track {
    @apply bg-gray-100 dark:bg-gray-800;
}

::-webkit-scrollbar-thumb {
    @apply bg-gray-300 dark:bg-gray-600 rounded-full;
}

::-webkit-scrollbar-thumb:hover {
    @apply bg-gray-400 dark:bg-gray-500;
}

/* Animation Keyframes */
@keyframes fadeInUp {
    from {
        opacity: 0;
        transform: translateY(20px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

.anime-card,
.anime-card-item {
    animation: fadeInUp 0.6s ease-out;
}
</style>
