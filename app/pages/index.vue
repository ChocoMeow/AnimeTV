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
const displayedItems = computed(() => {
    if (selectedDay.value === "0") {
        return Object.values(byDay.value || {}).flat()
    }
    return byDay.value[selectedDay.value] || [];
})

const weekdayLabel = {
    "0": "全部",
    "1": "週一",
    "2": "週二",
    "3": "週三",
    "4": "週四",
    "5": "週五",
    "6": "週六",
    "7": "週日",
}

// Use shared tooltip composable
const {
    hoveredAnime,
    animeDetails,
    tooltipLoading,
    tooltipError,
    tooltipPosition,
    handleMouseEnter,
    handleMouseLeave,
    cleanup,
} = useAnimeTooltip()

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

useHead({ title: `每日新番 | ${appConfig.siteName}` })

onMounted(() => {
    fetchHomeAnime()
})

onUnmounted(() => {
    cleanup()
})
</script>

<template>
    <!-- Loading State -->
    <div v-if="loading" class="flex items-center justify-center min-h-screen">
        <AnimeLoader :show="loading" message="正在載入動畫資料..." centered />
    </div>

    <div v-else class="space-y-8 max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-8 ">
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
                <div class="inline-block w-8 h-8 border-3 border-gray-300 dark:border-gray-600 border-t-gray-900 dark:border-t-gray-100 rounded-full animate-spin"></div>
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
                <div v-if="!displayedItems.length" class="text-center py-12 text-gray-500 dark:text-gray-400">
                    <span class="material-icons text-4xl mb-2 opacity-50">event_busy</span>
                    <p>今日暫無更新節目</p>
                </div>

                <div v-else class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                    <NuxtLink
                        v-for="item in displayedItems"
                        :key="item.refId"
                        class="daily-item group"
                        :to="`/anime/${item.refId}`"
                        @mouseenter="handleMouseEnter(item, $event)"
                        @mouseleave="handleMouseLeave"
                    >
                        <div class="relative overflow-hidden rounded-t-lg aspect-video bg-gray-200 dark:bg-gray-700">
                            <img :src="item.thumbnail" alt="" class="w-full h-full object-cover transform transition-transform duration-300 group-hover:scale-110" />
                            <div class="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>

                            <!-- Play icon overlay -->
                            <div class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <div class="w-10 h-10 rounded-full bg-white/90 dark:bg-gray-900/90 flex items-center justify-center shadow-lg">
                                    <span class="material-icons text-2xl">play_arrow</span>
                                </div>
                            </div>
                        </div>

                        <div class="p-2">
                            <div class="font-semibold text-xs sm:text-sm text-gray-900 dark:text-white line-clamp-2 mb-1 leading-tight">
                                {{ item.title }}
                            </div>
                            <div class="flex items-center text-xs text-gray-500 dark:text-gray-400 font-medium">
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
                        <AnimeCard 
                            v-for="item in items" 
                            :key="item.refId || item.video_url" 
                            :anime="item"
                            :on-mouse-enter="handleMouseEnter"
                            :on-mouse-leave="handleMouseLeave"
                        />
                    </div>
                </div>
            </div>
        </section>
    </div>

    <!-- Anime Tooltip Component -->
    <AnimeTooltip
        :hovered-anime="hoveredAnime"
        :anime-details="animeDetails"
        :tooltip-loading="tooltipLoading"
        :tooltip-error="tooltipError"
        :tooltip-position="tooltipPosition"
    />
</template>

<style scoped>
/* Card Styles */
.anime-card {
    @apply bg-gray-950/5 dark:bg-white/10 rounded-2xl shadow-lg p-4 sm:p-6 transition-all duration-300 hover:shadow-xl;
}

/* Day Tab Styles */
.day-tab {
    @apply px-3 sm:px-5 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all duration-300 transform;
}

.day-tab-inactive {
    @apply bg-white dark:bg-white/10 text-gray-600 dark:text-gray-300 
           border-2 border-black/10 dark:border-white/10
           hover:bg-black/10 dark:hover:bg-white/20
           hover:shadow-md hover:-translate-y-0.5;
}

.day-tab-active {
    @apply bg-black/70 dark:bg-white text-white dark:text-black 
           border-2 border-black/10 dark:border-white/10
           shadow-lg shadow-black/30 dark:shadow-white/30
           transform -translate-y-1;
}

/* Daily Item Styles */
.daily-item {
    @apply bg-white dark:bg-black/5 rounded-xl overflow-hidden
           cursor-pointer transition-all duration-300 hover:shadow-lg 
           hover:-translate-y-1 border border-gray-950/5 dark:border-white/10
           hover:border-black/10 dark:hover:border-white/10;
}
</style>
