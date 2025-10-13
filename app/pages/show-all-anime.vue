<script setup>
import { ref, onMounted } from "vue"
import { useRouter } from "vue-router"

const router = useRouter()

const animeList = ref([])
const totalPage = ref(1)
const loading = ref(false)
const searchQuery = ref("")
const currentPage = ref(1)

// Filters
const selectedTags = ref([])
const selectedCategory = ref("")
const showFilters = ref(true)

const tags = ["全部", "動作", "冒險", "奇幻", "異世界", "魔法", "超能力", "科幻", "機甲", "校園", "喜劇", "戀愛", "青春", "勵志", "溫馨", "悠閒", "料理", "親情", "感人", "運動", "競技", "偶像", "音樂", "職場", "推理", "懸疑", "時間穿越", "歷史", "戰爭", "血腥暴力", "靈異神怪", "黑暗", "特攝", "BL", "GL"]
const categories = ["電影", "OVA", "雙語", "泡麵番", "真人演出"]

// Fetch anime list (page + filters)
async function fetchAnime(page = 1) {
    loading.value = true
    try {
        const res = await $fetch(`/api/animeList?page=${page}&category=${selectedCategory.value}&tags=${selectedTags.value.join(",")}`)
        animeList.value = res.results
        totalPage.value = parseInt(res.totalPage)
        currentPage.value = page
        // Scroll to top smoothly
        window.scrollTo({ top: 0, behavior: "smooth" })
    } catch (err) {
        console.error("Failed to fetch anime:", err)
    } finally {
        loading.value = false
    }
}

// Handle search from SearchInput
async function handleSearch(query) {
    searchQuery.value = query
    try {
        const res = await $fetch(`/api/search/${encodeURIComponent(query)}`)
        console.log("Search results:", res.results)
    } catch (err) {
        console.error("Search failed:", err)
    }
}

// When user selects a suggestion
function handleSelect(query) {
    searchQuery.value = query
    fetchAnime(1)
}

function goToDetail(anime) {
    router.push(`/anime/${anime.refId}?type=ref`)
}

function toggleTag(tag) {
    if (tag === "全部") {
        selectedTags.value = []
    } else {
        if (selectedTags.value.includes(tag)) {
            selectedTags.value = selectedTags.value.filter((t) => t !== tag)
        } else {
            selectedTags.value.push(tag)
        }
    }
    fetchAnime(1)
}

function clearAllFilters() {
    selectedTags.value = []
    selectedCategory.value = ""
    fetchAnime(1)
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

onMounted(() => fetchAnime(1))
</script>

<template>
    <div class="min-h-screen bg-gradient-to-br from-gray-50 via-indigo-50/30 to-purple-50/20 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800">
        <!-- Filters Section -->
        <div class="sticky top-16 z-40 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700 shadow-sm rounded-2xl">
            <div class="max-w-7xl mx-auto px-4 py-4">
                <!-- Header with Toggle -->
                <div class="flex items-center justify-between mb-4">
                    <div class="flex items-center gap-3">
                        <h2 class="text-lg font-bold text-gray-900 dark:text-white">篩選條件</h2>
                        <span v-if="selectedTags.length || selectedCategory" class="px-2 py-1 text-xs font-semibold bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 rounded-full">
                            {{ selectedTags.length + (selectedCategory ? 1 : 0) }}
                        </span>
                    </div>
                    <div class="flex items-center gap-2">
                        <button v-if="selectedTags.length || selectedCategory" @click="clearAllFilters" class="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium transition-colors flex items-center gap-1">
                            <span class="material-icons text-sm">clear</span>
                            清除全部
                        </button>
                        <button @click="showFilters = !showFilters" class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                            <span class="material-icons text-gray-600 dark:text-gray-300">
                                {{ showFilters ? "expand_less" : "expand_more" }}
                            </span>
                        </button>
                    </div>
                </div>

                <!-- Filter Content -->
                <transition name="filter-expand">
                    <div v-if="showFilters" class="space-y-4">
                        <!-- Category Filter -->
                        <div class="flex flex-wrap items-center gap-3">
                            <label class="text-sm font-medium text-gray-700 dark:text-gray-300 min-w-[60px]">類型:</label>
                            <div class="flex flex-wrap gap-2">
                                <button
                                    @click="selectedCategory = ''; fetchAnime(1)"
                                    :class="['category-pill', selectedCategory === '' ? 'category-pill-active' : 'category-pill-inactive']"
                                >
                                    全部
                                </button>
                                <button
                                    v-for="cat in categories"
                                    :key="cat"
                                    @click="selectedCategory = cat; fetchAnime(1)"
                                    :class="['category-pill', selectedCategory === cat ? 'category-pill-active' : 'category-pill-inactive']"
                                >
                                    {{ cat }}
                                </button>
                            </div>
                        </div>

                        <!-- Tags Filter -->
                        <div class="flex flex-wrap items-start gap-3">
                            <label class="text-sm font-medium text-gray-700 dark:text-gray-300 min-w-[60px] pt-1.5">標籤:</label>
                            <div class="flex flex-wrap gap-2 flex-1">
                                <button v-for="tag in tags" :key="tag" @click="toggleTag(tag)" :class="['tag-pill', tag === '全部' && selectedTags.length === 0 ? 'tag-pill-active' : selectedTags.includes(tag) ? 'tag-pill-active' : 'tag-pill-inactive']">
                                    {{ tag }}
                                </button>
                            </div>
                        </div>
                    </div>
                </transition>
            </div>
        </div>

        <!-- Main Content -->
        <main class="max-w-7xl mx-auto px-4 py-8">
            <!-- Results Header -->
            <div class="flex items-center justify-between mb-6">
                <div class="flex items-center gap-3">
                    <h1 class="text-2xl font-bold text-gray-900 dark:text-white">全部作品</h1>
                    <span v-if="!loading" class="text-sm text-gray-500 dark:text-gray-400"> 共 {{ animeList.length }} 部作品 </span>
                </div>
            </div>

            <!-- Loading State -->
            <div v-if="loading" class="flex items-center justify-center min-h-[400px]">
                <div class="text-center">
                    <div class="inline-block w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                    <p class="mt-4 text-gray-600 dark:text-gray-400">載入中...</p>
                </div>
            </div>

            <!-- Empty State -->
            <div v-else-if="!animeList.length" class="flex flex-col items-center justify-center min-h-[400px] text-center">
                <div class="w-20 h-20 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
                    <span class="material-icons text-5xl text-gray-400 dark:text-gray-600">search_off</span>
                </div>
                <h3 class="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">找不到相關作品</h3>
                <p class="text-gray-500 dark:text-gray-400 mb-4">請嘗試調整篩選條件</p>
                <button @click="clearAllFilters" class="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors">清除篩選條件</button>
            </div>

            <!-- Anime Grid -->
            <div v-else class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                <div v-for="anime in animeList" :key="anime.refId" class="anime-card-item group" @click="goToDetail(anime)">
                    <!-- Image Container -->
                    <div class="relative overflow-hidden rounded-t-xl aspect-[2/3] bg-gray-200 dark:bg-gray-700">
                        <img :src="anime.image" :alt="anime.title" class="w-full h-full object-cover transform transition-all duration-500 group-hover:scale-110" />
                        <!-- Gradient Overlay -->
                        <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300"></div>

                        <!-- Year Badge -->
                        <div class="badge-year">
                            {{ anime.year }}
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
                            {{ anime.title }}
                        </h3>

                        <div class="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                            <div class="flex items-center gap-1">
                                <span class="material-icons text-sm">movie</span>
                                <span>{{ anime.episodes }}</span>
                            </div>
                            <div class="flex items-center gap-1">
                                <span class="material-icons text-sm">visibility</span>
                                <span>{{ formatViews(anime.views) }}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Pagination -->
            <div v-if="!loading && animeList.length" class="mt-8">
                <Pagination :current-page="currentPage" :total-page="totalPage" @change="fetchAnime" />
            </div>
        </main>
    </div>
</template>

<style scoped>
/* Category Pills */
.category-pill {
    @apply px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 transform;
}

.category-pill-inactive {
    @apply bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300
           border border-gray-200 dark:border-gray-600
           hover:border-indigo-300 dark:hover:border-indigo-600
           hover:text-indigo-600 dark:hover:text-indigo-400
           hover:shadow-md hover:-translate-y-0.5;
}

.category-pill-active {
    @apply bg-gradient-to-r from-indigo-600 to-purple-600 text-white 
           border border-indigo-600 dark:border-purple-600
           shadow-lg shadow-indigo-500/30 dark:shadow-purple-500/30;
}

/* Tag Pills */
.tag-pill {
    @apply px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-300 transform;
}

.tag-pill-inactive {
    @apply bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300
           border border-gray-200 dark:border-gray-600
           hover:bg-indigo-50 dark:hover:bg-gray-600
           hover:border-indigo-300 dark:hover:border-indigo-600
           hover:text-indigo-600 dark:hover:text-indigo-400
           hover:shadow-sm hover:-translate-y-0.5;
}

.tag-pill-active {
    @apply bg-indigo-600 text-white border border-indigo-600
           shadow-md shadow-indigo-500/30 transform -translate-y-0.5;
}

/* Anime Card Item */
.anime-card-item {
    @apply bg-white dark:bg-gray-800 rounded-xl overflow-hidden 
           cursor-pointer transition-all duration-300
           hover:shadow-2xl hover:-translate-y-2
           border border-gray-100 dark:border-gray-700
           hover:border-indigo-300 dark:hover:border-indigo-600;
    animation: fadeInUp 0.6s ease-out;
}

/* Year Badge */
.badge-year {
    @apply absolute top-2 right-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white 
           text-xs font-bold px-3 py-1 rounded-full shadow-lg
           backdrop-blur-sm transform transition-transform duration-300;
}

.group:hover .badge-year {
    @apply scale-110;
}

/* Line Clamp */
.line-clamp-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}

/* Filter Expand Transition */
.filter-expand-enter-active,
.filter-expand-leave-active {
    transition: all 0.3s ease;
    max-height: 500px;
    overflow: hidden;
}

.filter-expand-enter-from,
.filter-expand-leave-to {
    max-height: 0;
    opacity: 0;
}

/* Animations */
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

/* Scrollbar */
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
</style>
