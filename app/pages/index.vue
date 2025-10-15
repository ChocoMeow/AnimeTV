<script setup>
import { ref, onMounted } from "vue"
import { useRouter } from "vue-router"

const router = useRouter()
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

function goToDetailByRefId(refId) {
    if (!refId) return
    router.push(`/anime/${refId}?type=ref`)
}

function goToDetailByVideoId(videoId) {
    if (!videoId) return
    router.push(`/anime/${videoId}?type=video`)
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

function formatViews(views) {
    if (!views) return "0"
    if (views >= 1000000) {
        return (views / 1000000).toFixed(1) + "M"
    } else if (views >= 1000) {
        return (views / 1000).toFixed(1) + "K"
    }
    return views
}

useHead({ title: `每日新番 | Anime Hub`})
onMounted(fetchHomeAnime)
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
                        <p class="text-xs sm:text-sm text-gray-500 dark:text-gray-400">點擊日期標籤查看當日更新</p>
                    </div>

                    <!-- Loading inside section -->
                    <div v-if="loading" class="flex justify-center py-12">
                        <div class="inline-block w-8 h-8 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                    </div>

                    <template v-else>
                        <!-- Day Tabs -->
                        <div class="flex flex-wrap gap-2 sm:gap-3 mb-4 sm:mb-6">
                            <button v-for="d in Object.keys(weekdayLabel)" :key="d" @click="selectedDay = d" :class="['day-tab', selectedDay === d ? 'day-tab-active' : 'day-tab-inactive']">
                                {{ weekdayLabel[d] }}
                            </button>
                        </div>

                        <!-- Day Content -->
                        <div v-if="!byDay[selectedDay] || !byDay[selectedDay].length" class="text-center py-12 text-gray-500 dark:text-gray-400">
                            <span class="material-icons text-4xl mb-2 opacity-50">event_busy</span>
                            <p>今日暫無更新節目</p>
                        </div>

                        <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            <div v-for="item in byDay[selectedDay]" :key="item.video_url" class="daily-item group" @click="goToDetailByVideoId(item.refId)">
                                <div class="relative overflow-hidden rounded-lg flex-shrink-0 w-32 sm:w-36">
                                    <img :src="item.thumbnail" alt="" class="w-full h-24 object-cover transform transition-transform duration-300 group-hover:scale-110" />
                                    <div class="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                </div>
                                <div class="flex-1 min-w-0 p-3 flex flex-col justify-center">
                                    <div class="font-semibold text-sm text-gray-900 dark:text-white line-clamp-2 mb-2 leading-tight">
                                        {{ item.title }}
                                    </div>
                                    <div class="flex items-center text-xs text-indigo-600 dark:text-indigo-400 font-medium">
                                        <span class="material-icons text-sm mr-1">play_circle</span>
                                        {{ item.episode }}
                                    </div>
                                </div>
                            </div>
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
                                <div v-for="item in items" :key="item.refId || item.video_url" class="anime-card-item group" @click="goToDetailByRefId(item.refId)">
                                    <!-- Image Container -->
                                    <div class="relative overflow-hidden rounded-t-xl aspect-[2/3] bg-gray-200 dark:bg-gray-700">
                                        <img :src="item.image" :alt="item.title" class="w-full h-full object-cover transform transition-all duration-500 group-hover:scale-110" />
                                        <!-- Gradient Overlay -->
                                        <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300"></div>

                                        <!-- Year Badge -->
                                        <div class="absolute top-2 right-2 badge-year">
                                            {{ item.year }}
                                        </div>

                                        <!-- Hover Play Button -->
                                        <div class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 transform scale-75 group-hover:scale-100">
                                            <div class="w-14 h-14 rounded-full bg-white/90 dark:bg-gray-900/90 flex items-center justify-center shadow-xl">
                                                <span class="material-icons text-indigo-600 dark:text-indigo-400 text-3xl">play_arrow</span>
                                            </div>
                                        </div>
                                    </div>

                                    <!-- Info Container -->
                                    <div class="p-3 space-y-2">
                                        <h3 class="font-semibold text-sm text-gray-900 dark:text-gray-100 line-clamp-2 leading-snug group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
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
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        </main>
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
    @apply flex gap-2 sm:gap-3 bg-white dark:bg-gray-800 rounded-xl overflow-hidden
           cursor-pointer transition-all duration-300 hover:shadow-lg 
           hover:-translate-y-1 border border-gray-100 dark:border-gray-700
           hover:border-indigo-300 dark:hover:border-indigo-600
           min-h-[96px];
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

/* Line Clamp Utility */
.line-clamp-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
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
