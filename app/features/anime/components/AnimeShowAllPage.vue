<script setup>
import { ANIME_TAGS } from '#shared/utils/anime'

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
const headerHiddenMobile = useState("app-mobile-header-hidden", () => false)

// Flag to prevent watcher from triggering when we update URL programmatically
const isUpdatingURL = ref(false)

// Use shared tooltip composable
const {
    hoveredAnime,
    animeDetails,
    tooltipLoading,
    tooltipError,
    tooltipPosition,
    handleMouseEnter,
    handleMouseLeave,
    handleTooltipEnter,
    handleTooltipLeave,
    setFavoriteStatus,
    cleanup,
} = useAnimeTooltip()

const tags = ["全部", ...ANIME_TAGS]
const categories = ["電影", "OVA", "雙語", "泡麵番", "真人演出", "自訂作品"]
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

        const res = await $fetch(`/api/anime/list?${params.toString()}`)
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
    if (typeof window !== "undefined" && window.innerWidth < 768) showFilters.value = false
    initializeFromRoute()
    fetchAnime(currentPage.value)
})

onUnmounted(() => {
    cleanup()
})
</script>

<template>
    <!-- Filters Section -->
    <div
        class="sticky z-30 bg-white/95 dark:bg-gray-950/90 backdrop-blur-sm border-b border-black/10 dark:border-white/10 shadow-sm rounded-2xl md:top-16 max-md:transition-[top] max-md:duration-300"
        :class="headerHiddenMobile ? 'max-md:top-0' : 'max-md:top-14'"
    >
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
                        <span class="material-symbols-rounded text-sm">clear</span>
                        清除全部
                    </button>
                    <button
                        type="button"
                        :aria-expanded="showFilters"
                        aria-label="展開或收合篩選"
                        class="flex h-9 w-9 items-center justify-center rounded-full text-gray-600 transition-colors hover:bg-black/5 dark:text-gray-300 dark:hover:bg-white/10"
                        @click="showFilters = !showFilters"
                    >
                        <span class="material-symbols-rounded text-[20px] leading-none">
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
                            <AppChip
                                v-for="option in sortOptions"
                                :key="option.value"
                                :active="selectedSort === option.value"
                                @click="selectedSort = option.value; fetchAnime(1)"
                            >
                                {{ option.label }}
                            </AppChip>
                        </div>
                    </div>

                    <!-- Category Filter -->
                    <div class="flex flex-wrap items-center gap-3">
                        <label class="text-sm font-medium text-gray-700 dark:text-gray-300 min-w-[60px]">類型:</label>
                        <div class="flex flex-wrap gap-2">
                            <AppChip
                                :active="selectedCategory === ''"
                                @click="selectedCategory = ''; fetchAnime(1)"
                            >
                                全部
                            </AppChip>
                            <AppChip
                                v-for="cat in categories"
                                :key="cat"
                                :active="selectedCategory === cat"
                                @click="selectedCategory = cat; fetchAnime(1)"
                            >
                                {{ cat }}
                            </AppChip>
                        </div>
                    </div>

                    <!-- Tags Filter -->
                    <div class="flex flex-wrap items-start gap-3">
                        <label class="text-sm font-medium text-gray-700 dark:text-gray-300 min-w-[60px] pt-1.5">標籤:</label>
                        <div class="flex flex-wrap gap-2 flex-1">
                            <AppChip
                                v-for="tag in tags"
                                :key="tag"
                                size="sm"
                                :active="tag === '全部' ? selectedTags.length === 0 : selectedTags.includes(tag)"
                                @click="toggleTag(tag)"
                            >
                                {{ tag }}
                            </AppChip>
                        </div>
                    </div>
                </div>
            </transition>
        </div>
    </div>

    <!-- Main Content -->
    <div class="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 py-6 sm:py-8">
        <!-- Results Header -->
        <div class="flex items-center justify-between mb-6">
            <div class="flex items-center gap-3">
                <h1 v-if="!loading" class="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 dark:text-white">全部作品</h1>
                <div v-else class="h-8 w-40 rounded-lg bg-gray-200 dark:bg-white/10 animate-pulse" />
                <span v-if="!loading" class="text-sm text-gray-500 dark:text-gray-400"> 共 {{ animeList.length }} 部作品 </span>
            </div>
        </div>

        <!-- Skeleton grid while loading -->
        <div v-if="loading" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
            <SkeletonAnimeCard v-for="n in 12" :key="n" />
        </div>

        <!-- Empty State -->
        <div v-else-if="!animeList.length" class="flex flex-col items-center justify-center min-h-[400px] text-center rounded-2xl bg-black/[0.02] dark:bg-white/[0.03] border border-black/5 dark:border-white/5">
            <div class="w-20 h-20 bg-black/5 dark:bg-white/5 rounded-full flex items-center justify-center mb-4">
                <span class="material-symbols-rounded text-5xl text-gray-400 dark:text-gray-500 opacity-70">search_off</span>
            </div>
            <h3 class="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-2">找不到相關作品</h3>
            <p class="text-gray-500 dark:text-gray-400 mb-4">請嘗試調整篩選條件</p>
            <button @click="clearAllFilters" class="px-6 py-2.5 bg-gray-900 dark:bg-white hover:opacity-90 text-white dark:text-black rounded-full font-medium transition-opacity">清除篩選條件</button>
        </div>

        <!-- Anime Grid -->
        <div v-else class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
            <LazyAnimeCard 
                v-for="anime in animeList" 
                :key="anime.refId" 
                :anime="anime"
                :show-hover-title-color="true"
                :on-mouse-enter="handleMouseEnter"
                :on-mouse-leave="handleMouseLeave"
            />
        </div>

        <!-- Pagination -->
        <div v-if="!loading && animeList.length" class="mt-8">
            <Pagination :current-page="currentPage" :total-page="totalPage" @change="fetchAnime" />
        </div>
    </div>

    <!-- Anime Tooltip Component -->
    <LazyAnimeTooltip
        :hovered-anime="hoveredAnime"
        :anime-details="animeDetails"
        :tooltip-loading="tooltipLoading"
        :tooltip-error="tooltipError"
        :tooltip-position="tooltipPosition"
        :on-tooltip-enter="handleTooltipEnter"
        :on-tooltip-leave="handleTooltipLeave"
        :on-favorite-toggled="({ refId, isFavorite }) => setFavoriteStatus(refId, isFavorite)"
    />
</template>

<style scoped>
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
</style>
