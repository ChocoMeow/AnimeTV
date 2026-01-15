<script setup>
const appConfig = useAppConfig()
const route = useRoute()
const router = useRouter()

const animeList = ref([])
const totalPage = ref(1)
const loading = ref(false)
const currentPage = ref(1)

// Filters
const selectedTags = ref([])
const selectedCategory = ref("")
const selectedSort = ref("1") // 1: 依年份排列, 2: 依月人氣排序
const showFilters = ref(true)

// Flag to prevent watcher from triggering when we update URL programmatically
const isUpdatingURL = ref(false)

const tags = [
    "全部",
    "動作",
    "冒險",
    "奇幻",
    "異世界",
    "魔法",
    "超能力",
    "科幻",
    "機甲",
    "校園",
    "喜劇",
    "戀愛",
    "青春",
    "勵志",
    "溫馨",
    "悠閒",
    "料理",
    "親情",
    "感人",
    "運動",
    "競技",
    "偶像",
    "音樂",
    "職場",
    "推理",
    "懸疑",
    "時間穿越",
    "歷史",
    "戰爭",
    "血腥暴力",
    "靈異神怪",
    "黑暗",
    "特攝",
    "BL",
    "GL",
]
const categories = ["電影", "OVA", "雙語", "泡麵番", "真人演出"]
const sortOptions = [
    { value: "1", label: "依年份排列" },
    { value: "2", label: "依月人氣排序" },
]

// Initialize from URL query params
function initializeFromRoute() {
    const { page, category, tags: urlTags, sort } = route.query

    currentPage.value = parseInt(page) || 1
    selectedCategory.value = category || ""
    selectedTags.value = urlTags ? urlTags.split(",").filter(Boolean) : []
    selectedSort.value = sort || "1"
}

// Update URL with current filters
function updateURL() {
    isUpdatingURL.value = true
    const query = {
        page: currentPage.value > 1 ? currentPage.value : undefined,
        category: selectedCategory.value || undefined,
        tags: selectedTags.value.length > 0 ? selectedTags.value.join(",") : undefined,
        sort: selectedSort.value !== "1" ? selectedSort.value : undefined,
    }

    router.replace({ query }).then(() => {
        // Reset flag after navigation completes
        nextTick(() => {
            isUpdatingURL.value = false
        })
    }).catch(() => {
        // Reset flag even if navigation fails
        isUpdatingURL.value = false
    })
}

// Fetch anime list (page + filters)
async function fetchAnime(page = 1) {
    loading.value = true
    currentPage.value = page

    try {
        // Build query string
        const params = new URLSearchParams({
            page: page.toString(),
            category: selectedCategory.value,
            tags: selectedTags.value.join(","),
        })

        // Add sort parameter if not default
        if (selectedSort.value === "2") {
            params.append("sort", "2")
        }

        const res = await $fetch(`/api/animeList?${params.toString()}`)
        animeList.value = res.results
        totalPage.value = parseInt(res.totalPage)

        // Update URL to reflect current state
        updateURL()

        // Scroll to top smoothly
        window.scrollTo({ top: 0, behavior: "smooth" })
    } catch (err) {
        console.error("Failed to fetch anime:", err)
    } finally {
        loading.value = false
    }
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
    selectedSort.value = "1"
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

// Watch for route changes (e.g., browser back/forward)
watch(
    () => route.query,
    () => {
        // Skip if we're updating the URL programmatically
        if (isUpdatingURL.value) {
            return
        }
        initializeFromRoute()
        fetchAnime(currentPage.value)
    },
    { deep: true }
)

useHead({ title: `所有動畫 | ${appConfig.siteName}` })

onMounted(() => {
    initializeFromRoute()
    fetchAnime(currentPage.value)
})
</script>

<template>
    <!-- Filters Section -->
    <div class="sticky top-16 z-40 bg-white/95 dark:bg-gray-950/90 backdrop-blur-sm border-b border-gray-200 dark:border-white/10 shadow-sm rounded-2xl">
        <div class="max-w-7xl mx-auto px-4 py-4">
            <!-- Header with Toggle -->
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                    <h2 class="text-lg font-bold text-gray-900 dark:text-white">篩選條件</h2>
                    <span
                        v-if="selectedTags.length || selectedCategory || selectedSort !== '1'"
                        class="px-2 py-1 text-xs font-semibold bg-black/10 dark:bg-white/10 text-gray-600 dark:text-gray-300 rounded-full"
                    >
                        {{ selectedTags.length + (selectedCategory ? 1 : 0) + (selectedSort !== "1" ? 1 : 0) }}
                    </span>
                </div>
                <div class="flex items-center gap-2">
                    <button
                        v-if="selectedTags.length || selectedCategory || selectedSort !== '1'"
                        @click="clearAllFilters"
                        class="text-sm text-black/70 dark:text-white hover:text-black/100 dark:hover:text-white font-medium transition-colors flex items-center gap-1"
                    >
                        <span class="material-icons text-sm">clear</span>
                        清除全部
                    </button>
                    <button @click="showFilters = !showFilters" class="p-2 rounded hover:bg-gray-100 dark:hover:bg-white/20 flex items-center justify-center">
                        <span class="material-icons text-gray-600 dark:text-gray-300">
                            {{ showFilters ? "expand_less" : "expand_more" }}
                        </span>
                    </button>
                </div>
            </div>

            <!-- Filter Content -->
            <transition name="filter-expand">
                <div v-if="showFilters" class="space-y-4 mt-4">
                    <!-- Sort Mode -->
                    <div class="flex flex-wrap items-center gap-3">
                        <label class="text-sm font-medium text-gray-700 dark:text-gray-300 min-w-[60px]">排序:</label>
                        <div class="flex flex-wrap gap-2">
                            <button
                                v-for="option in sortOptions"
                                :key="option.value"
                                @click="selectedSort = option.value; fetchAnime(1)"
                                :class="['category-pill', selectedSort === option.value ? 'category-pill-active' : 'category-pill-inactive']"
                            >
                                {{ option.label }}
                            </button>
                        </div>
                    </div>

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
                            <button
                                v-for="tag in tags"
                                :key="tag"
                                @click="toggleTag(tag)"
                                :class="[
                                    'tag-pill',
                                    tag === '全部' && selectedTags.length === 0 ? 'tag-pill-active' : selectedTags.includes(tag) ? 'tag-pill-active' : 'tag-pill-inactive',
                                ]"
                            >
                                {{ tag }}
                            </button>
                        </div>
                    </div>
                </div>
            </transition>
        </div>
    </div>

    <!-- Main Content -->
    <div class="max-w-7xl mx-auto px-4 py-8">
        <!-- Results Header -->
        <div class="flex items-center justify-between mb-6">
            <div class="flex items-center gap-3">
                <h1 class="text-2xl font-bold text-gray-900 dark:text-white">全部作品</h1>
                <span v-if="!loading" class="text-sm text-gray-500 dark:text-gray-400"> 共 {{ animeList.length }} 部作品 </span>
            </div>
        </div>

        <!-- Loading State -->
        <div v-if="loading" class="flex items-center justify-center min-h-[400px]">
            <AnimeLoader :show="loading" message="正在載入動畫資料..." centered />
        </div>

        <!-- Empty State -->
        <div v-else-if="!animeList.length" class="flex flex-col items-center justify-center min-h-[400px] text-center">
            <div class="w-20 h-20 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
                <span class="material-icons text-5xl text-gray-400 dark:text-gray-600">search_off</span>
            </div>
            <h3 class="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">找不到相關作品</h3>
            <p class="text-gray-500 dark:text-gray-400 mb-4">請嘗試調整篩選條件</p>
            <button @click="clearAllFilters" class="px-6 py-2 bg-gray-900 dark:bg-gray-100 hover:bg-gray-800 dark:hover:bg-gray-200 text-white dark:text-gray-900 rounded-lg transition-colors">清除篩選條件</button>
        </div>

        <!-- Anime Grid -->
        <div v-else class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            <AnimeCard 
                v-for="anime in animeList" 
                :key="anime.refId" 
                :anime="anime"
                :show-hover-title-color="true"
            />
        </div>

        <!-- Pagination -->
        <div v-if="!loading && animeList.length" class="mt-8">
            <Pagination :current-page="currentPage" :total-page="totalPage" @change="fetchAnime" />
        </div>
    </div>
</template>

<style scoped>
/* Category Pills */
.category-pill {
    @apply px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 transform;
}

.category-pill-inactive {
    @apply bg-white dark:bg-white/10 text-gray-600 dark:text-gray-300
           border-2 border-black/10 dark:border-white/10
           hover:bg-black/10 dark:hover:bg-white/20
           hover:shadow-md hover:-translate-y-0.5;
}

.category-pill-active {
    @apply bg-black/70 dark:bg-white text-white dark:text-black 
           border-2 border-black/10 dark:border-white/10
           shadow-lg shadow-black/30 dark:shadow-white/30
           transform -translate-y-1;
}

/* Tag Pills */
.tag-pill {
    @apply px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-300 transform;
}

.tag-pill-inactive {
    @apply bg-white dark:bg-white/10 text-gray-600 dark:text-gray-300
           border border-gray-200 dark:border-white/10
           hover:bg-black/10 dark:hover:bg-white/20
           hover:shadow-sm hover:-translate-y-0.5;
}

.tag-pill-active {
    @apply bg-black/70 dark:bg-white text-white dark:text-black
           shadow-md shadow-gray-500/30 dark:shadow-gray-400/30 transform -translate-y-0.5;
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
