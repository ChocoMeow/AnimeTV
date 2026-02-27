<script setup>
const { userSettings } = useUserSettings()
const { showToast } = useToast()
const appConfig = useAppConfig()
const route = useRoute()
const client = useSupabaseClient()

const favoriteItems = ref([]) // each item will have seasonYear/seasonIndex/seasonLabel precomputed
const loading = ref(true)
const searchQuery = ref("")
const selectedItems = ref(new Set())
const showDeleteConfirm = ref(false)
const showDeleteAllConfirm = ref(false)
const pageSize = 20
const currentPage = ref(0)
const hasMore = ref(true)
const loadingMore = ref(false)
const sortBy = ref("recent") // recent, title, season

// ---------- Season helpers ----------
function enrichWithSeason(favorites, metaRows) {
    const metaBySourceId = (metaRows || []).reduce((acc, m) => {
        acc[m.source_id] = m
        return acc
    }, {})

    const seasonNames = ["冬季", "春季", "夏季", "秋季"]

    return (favorites || []).map((item) => {
        const m = metaBySourceId[item.anime_ref_id]
        let year = 0
        let month = 0

        const premiere = m?.premiere_date
        if (premiere) {
            const [y, mo] = String(premiere).split("-")
            year = Number(y) || 0
            month = Number(mo) || 0
        }

        let seasonIndex = -1
        if (month >= 1 && month <= 3) seasonIndex = 0
        else if (month >= 4 && month <= 6) seasonIndex = 1
        else if (month >= 7 && month <= 9) seasonIndex = 2
        else if (month >= 10 && month <= 12) seasonIndex = 3

        const label =
            year && seasonIndex >= 0 ? `${year} 年${seasonNames[seasonIndex]}` : "未分類季節"

        return { ...item, seasonYear: year, seasonIndex, seasonLabel: label }
    })
}

// Computed filtered favorites (flat list used for grid and grouping)
const filteredFavorites = computed(() => {
    let filtered = [...favoriteItems.value]

    // Filter by search query
    if (searchQuery.value) {
        const query = searchQuery.value.toLowerCase()
        filtered = filtered.filter((item) => item.anime_title?.toLowerCase().includes(query))
    }

    // Sort
    if (sortBy.value === "title") {
        filtered.sort((a, b) => a.anime_title.localeCompare(b.anime_title))
    } else if (sortBy.value === "season") {
        // Sort by season (newest season first), fallback to recent if no season info
        filtered.sort((a, b) => {
            const yearA = a.seasonYear || 0
            const yearB = b.seasonYear || 0
            const idxA = typeof a.seasonIndex === "number" ? a.seasonIndex : -1
            const idxB = typeof b.seasonIndex === "number" ? b.seasonIndex : -1

            // If both have valid season info, sort by year desc, then seasonIndex desc
            if (yearA && yearB) {
                if (yearA !== yearB) {
                    return yearB - yearA
                }
                if (idxA !== idxB) {
                    return idxB - idxA
                }
            } else if (yearA && !yearB) {
                return -1
            } else if (!yearA && yearB) {
                return 1
            }

            // Fallback: recent created_at
            return new Date(b.created_at) - new Date(a.created_at)
        })
    } else {
        // Sort by recent (created_at)
        filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    }

    return filtered
})

// Group favorites by season label for season view
const groupedFavoritesBySeason = computed(() => {
    if (sortBy.value !== "season") return {}

    return filteredFavorites.value.reduce((acc, item) => {
        const label = item.seasonLabel || "未分類季節"
        ;(acc[label] ||= []).push(item)
        return acc
    }, {})
})

function toggleSelectItem(id, event) {
    event.preventDefault()
    event.stopPropagation()
    if (selectedItems.value.has(id)) {
        selectedItems.value.delete(id)
    } else {
        selectedItems.value.add(id)
    }
}

function selectAll() {
    if (selectedItems.value.size === filteredFavorites.value.length) {
        selectedItems.value.clear()
    } else {
        filteredFavorites.value.forEach((item) => selectedItems.value.add(item.id))
    }
}

async function loadMore() {
    if (loadingMore.value || !hasMore.value) return

    loadingMore.value = true
    try {
        const nextPage = currentPage.value + 1
        const from = nextPage * pageSize
        const to = from + pageSize - 1

        const orderColumn = sortBy.value === "title" ? "anime_title" : "created_at"
        const ascending = sortBy.value === "title"

        // Fetch favorites page
        const { data, error } = await client
            .from("favorites")
            .select("*")
            .eq("user_id", userSettings.value.id)
            .order(orderColumn, { ascending })
            .range(from, to)

        if (error) throw error

        if (data && data.length > 0) {
            const ids = [...new Set(data.map((i) => i.anime_ref_id).filter(Boolean))]
            const { data: metaRows, error: metaError } = ids.length
                ? await client.from("anime_meta").select("source_id, premiere_date").in("source_id", ids)
                : { data: [], error: null }
            if (metaError) console.error("Failed to fetch anime_meta for favorites (loadMore):", metaError)

            favoriteItems.value = [...favoriteItems.value, ...enrichWithSeason(data, metaRows)]
            currentPage.value = nextPage

            // Check if we got fewer records than requested
            if (data.length < pageSize) {
                hasMore.value = false
            }
        } else {
            hasMore.value = false
        }
    } catch (err) {
        console.error("Failed to load more favorites:", err)
    } finally {
        loadingMore.value = false
    }
}

function handleScroll() {
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop
    const windowHeight = window.innerHeight
    const documentHeight = document.documentElement.scrollHeight

    // Load more when user is 200px from bottom
    if (scrollTop + windowHeight >= documentHeight - 200) {
        loadMore()
    }
}

async function deleteSelected() {
    if (selectedItems.value.size === 0) return
    showDeleteConfirm.value = true
}

async function confirmDelete() {
    try {
        const idsToDelete = Array.from(selectedItems.value)

        const { error } = await client.from("favorites").delete().in("id", idsToDelete)

        if (error) throw error

        // Remove from local state
        favoriteItems.value = favoriteItems.value.filter((item) => !idsToDelete.includes(item.id))
        selectedItems.value.clear()
        showDeleteConfirm.value = false
    } catch (err) {
        console.error("Failed to delete favorites:", err)
        showToast("刪除失敗，請稍後再試", "error")
    }
}

async function confirmDeleteAll() {
    try {
        if (!userSettings.value.id) return
        const { error } = await client.from("favorites").delete().eq("user_id", userSettings.value.id)

        if (error) throw error

        favoriteItems.value = []
        selectedItems.value.clear()
        showDeleteAllConfirm.value = false
    } catch (err) {
        console.error("Failed to clear favorites:", err)
        showToast("清除失敗，請稍後再試", "error")
    }
}

async function fetchFavorites() {
    loading.value = true
    try {
        if (!userSettings.value.id) {
            favoriteItems.value = []
            return
        }

        const orderColumn = sortBy.value === "title" ? "anime_title" : "created_at"
        const ascending = sortBy.value === "title"

        // Fetch first page only (0-19)
        const { data, error } = await client
            .from("favorites")
            .select("*")
            .eq("user_id", userSettings.value.id)
            .order(orderColumn, { ascending })
            .range(0, pageSize - 1)

        if (error) throw error

        const ids = [...new Set((data || []).map((i) => i.anime_ref_id).filter(Boolean))]
        const { data: metaRows, error: metaError } = ids.length
            ? await client.from("anime_meta").select("source_id, premiere_date, season").in("source_id", ids)
            : { data: [], error: null }
        if (metaError) console.error("Failed to fetch anime_meta for favorites (initial):", metaError)

        favoriteItems.value = enrichWithSeason(data, metaRows)
        currentPage.value = 0

        // Check if there might be more records
        hasMore.value = data && data.length === pageSize
    } catch (err) {
        console.error("Failed to fetch favorites:", err)
        favoriteItems.value = []
    } finally {
        loading.value = false
    }
}

onActivated(() => {
    // Reset and fetch fresh data
    favoriteItems.value = []
    currentPage.value = 0
    hasMore.value = true
    fetchFavorites()
})

onMounted(() => {
    fetchFavorites()
    window.addEventListener("scroll", handleScroll)
})

onBeforeUnmount(() => {
    window.removeEventListener("scroll", handleScroll)
})

// Reset when sort or search changes
watch([sortBy, searchQuery], () => {
    favoriteItems.value = []
    currentPage.value = 0
    hasMore.value = true
    fetchFavorites()
})

watch(
    () => route.path,
    (newPath) => {
        if (newPath === "/favorites" || newPath.includes("/favorites")) {
            favoriteItems.value = []
            currentPage.value = 0
            hasMore.value = true
            fetchFavorites()
        }
    }
)

useHead({
    title: `我的收藏 | ${appConfig.siteName}`,
})
</script>

<template>
    <div class="max-w-7xl mx-auto px-4 py-6">
        <!-- Header -->
        <div class="mb-6">
            <!-- Title and Search Row -->
            <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                <h1 class="text-3xl font-bold text-gray-900 dark:text-gray-100 flex-shrink-0">我的收藏</h1>

                <!-- Search -->
                <div class="relative w-full sm:max-w-xs">
                    <input v-model="searchQuery" type="text" placeholder="搜尋收藏..." class="w-full bg-white dark:bg-white/10 border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 pl-10 text-sm focus:ring-2 focus:ring-gray-500 dark:focus:ring-gray-400 outline-none" />
                    <span class="material-icons absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xl">search</span>
                </div>
            </div>

            <!-- Filters and Actions Row -->
            <div class="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                <!-- Sort Options -->
                <div class="flex gap-2 flex-wrap">
                    <button @click="sortBy = 'recent'" :class="sortBy === 'recent' ? 'text-white bg-gray-900 dark:bg-gray-100 dark:text-gray-900' : 'bg-white dark:bg-white/10 text-gray-700 dark:text-gray-300'" class="px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:shadow-md flex items-center gap-2">
                        <span class="material-icons text-lg">schedule</span>
                        最近收藏
                    </button>
                    <button @click="sortBy = 'title'" :class="sortBy === 'title' ? 'text-white bg-gray-900 dark:bg-gray-100 dark:text-gray-900' : 'bg-white dark:bg-white/10 text-gray-700 dark:text-gray-300'" class="px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:shadow-md flex items-center gap-2">
                        <span class="material-icons text-lg">sort_by_alpha</span>
                        名稱排序
                    </button>
                    <button @click="sortBy = 'season'" :class="sortBy === 'season' ? 'text-white bg-gray-900 dark:bg-gray-100 dark:text-gray-900' : 'bg-white dark:bg-white/10 text-gray-700 dark:text-gray-300'" class="px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:shadow-md flex items-center gap-2">
                        <span class="material-icons text-lg">event</span>
                        季節排序
                    </button>
                </div>

                <!-- Action Buttons -->
                <div v-if="favoriteItems.length > 0" class="flex items-center gap-3 flex-wrap">
                    <button @click="selectAll" class="text-sm px-4 py-2 rounded-lg bg-white dark:bg-white/10 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-2">
                        <span class="material-icons text-lg">
                            {{ selectedItems.size === filteredFavorites.length && filteredFavorites.length > 0 ? "check_box" : "check_box_outline_blank" }}
                        </span>
                        {{ selectedItems.size === filteredFavorites.length && filteredFavorites.length > 0 ? "取消全選" : "全選" }}
                    </button>

                    <button v-if="selectedItems.size > 0" @click="deleteSelected" class="text-sm px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors flex items-center gap-2">
                        <span class="material-icons text-lg">delete</span>
                        刪除已選 ({{ selectedItems.size }})
                    </button>

                    <button @click="showDeleteAllConfirm = true" class="text-sm px-4 py-2 rounded-lg bg-white dark:bg-white/10 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex items-center gap-2">
                        <span class="material-icons text-lg">delete_sweep</span>
                        清除全部
                    </button>
                </div>
            </div>

            <!-- Stats -->
            <div v-if="!loading && favoriteItems.length > 0" class="mt-4 text-sm text-gray-600 dark:text-gray-400">共 {{ favoriteItems.length }} 部收藏動漫</div>
        </div>

        <!-- Loading State -->
        <div v-if="loading" class="flex items-center justify-center py-20">
            <div class="animate-spin rounded-full h-12 w-12 border-4 border-gray-600 border-t-transparent"></div>
        </div>

        <!-- Empty State -->
        <div v-else-if="favoriteItems.length === 0" class="text-center py-20">
            <span class="material-icons text-gray-400 text-6xl mb-4">bookmark_add</span>
            <h3 class="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">還沒有收藏動漫</h3>
            <p class="text-gray-500 dark:text-gray-400 mb-6">找到喜歡的動漫就收藏起來吧</p>
            <NuxtLink to="/" class="px-6 py-3 bg-gray-900 dark:bg-gray-100 hover:bg-gray-800 dark:hover:bg-gray-200 text-white dark:text-gray-900 rounded-lg transition-colors inline-flex items-center gap-2">
                <span class="material-icons">explore</span>
                探索動漫
            </NuxtLink>
        </div>

        <!-- No Search Results -->
        <div v-else-if="filteredFavorites.length === 0" class="text-center py-20">
            <span class="material-icons text-gray-400 text-6xl mb-4">search_off</span>
            <h3 class="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">找不到相關收藏</h3>
            <p class="text-gray-500 dark:text-gray-400">試試其他搜尋關鍵字</p>
        </div>

        <!-- Favorites Grid -->
        <div v-else>
            <!-- Season grouped view (similar to history date groups) -->
            <div v-if="sortBy === 'season'" class="space-y-8">
                <div v-for="(items, seasonLabel) in groupedFavoritesBySeason" :key="seasonLabel">
                    <!-- Season Header -->
                    <div class="flex items-center gap-3 mb-4">
                        <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">{{ seasonLabel }}</h2>
                        <div class="flex-1 h-px bg-gray-200 dark:bg-gray-700"></div>
                    </div>

                    <!-- Season Favorites Grid -->
                    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                        <div
                            v-for="item in items"
                            :key="item.id"
                            class="bg-gray-950/5 dark:bg-white/10 rounded-lg shadow hover:shadow-xl transition-all overflow-hidden group relative"
                        >
                            <!-- Checkbox -->
                            <button
                                @click="toggleSelectItem(item.id, $event)"
                                class="absolute top-2 left-2 z-10 w-7 h-7 rounded bg-white/90 dark:bg-gray-700/90 shadow-md flex items-center justify-center transition-opacity backdrop-blur-sm"
                                :class="selectedItems.has(item.id) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'"
                            >
                                <span v-if="selectedItems.has(item.id)" class="material-icons text-gray-900 dark:text-gray-100 text-lg">check_box</span>
                                <span v-else class="material-icons text-gray-400 text-lg">check_box_outline_blank</span>
                            </button>

                            <!-- Favorite Badge -->
                            <div class="absolute top-2 right-2 z-10 w-7 h-7 rounded-full bg-red-500 shadow-md flex items-center justify-center">
                                <span class="material-icons text-white text-sm">bookmark_added</span>
                            </div>

                            <!-- Clickable Link -->
                            <NuxtLink :to="`/anime/${item.anime_ref_id}`" class="block">
                                <!-- Poster -->
                                <div class="aspect-[2/3] w-full bg-gray-200 dark:bg-gray-700 relative overflow-hidden">
                                    <img
                                        v-if="item.anime_image"
                                        :src="item.anime_image"
                                        :alt="item.anime_title"
                                        class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                    />
                                    <div v-else class="w-full h-full flex items-center justify-center text-gray-400">
                                        <span class="material-icons text-5xl">movie</span>
                                    </div>
                                </div>

                                <!-- Title -->
                                <div class="p-3">
                                    <h3 class="font-medium text-gray-900 dark:text-gray-100 text-sm line-clamp-2 leading-snug" :title="item.anime_title">
                                        {{ item.anime_title }}
                                    </h3>
                                </div>
                            </NuxtLink>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Default flat grid view -->
            <div v-else class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                <div
                    v-for="item in filteredFavorites"
                    :key="item.id"
                    class="bg-gray-950/5 dark:bg-white/10 rounded-lg shadow hover:shadow-xl transition-all overflow-hidden group relative"
                >
                    <!-- Checkbox -->
                    <button
                        @click="toggleSelectItem(item.id, $event)"
                        class="absolute top-2 left-2 z-10 w-7 h-7 rounded bg-white/90 dark:bg-gray-700/90 shadow-md flex items-center justify-center transition-opacity backdrop-blur-sm"
                        :class="selectedItems.has(item.id) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'"
                    >
                        <span v-if="selectedItems.has(item.id)" class="material-icons text-gray-900 dark:text-gray-100 text-lg">check_box</span>
                        <span v-else class="material-icons text-gray-400 text-lg">check_box_outline_blank</span>
                    </button>

                    <!-- Favorite Badge -->
                    <div class="absolute top-2 right-2 z-10 w-7 h-7 rounded-full bg-red-500 shadow-md flex items-center justify-center">
                        <span class="material-icons text-white text-sm">bookmark_added</span>
                    </div>

                    <!-- Clickable Link -->
                    <NuxtLink :to="`/anime/${item.anime_ref_id}`" class="block">
                        <!-- Poster -->
                        <div class="aspect-[2/3] w-full bg-gray-200 dark:bg-gray-700 relative overflow-hidden">
                            <img
                                v-if="item.anime_image"
                                :src="item.anime_image"
                                :alt="item.anime_title"
                                class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                            <div v-else class="w-full h-full flex items-center justify-center text-gray-400">
                                <span class="material-icons text-5xl">movie</span>
                            </div>
                        </div>

                        <!-- Title -->
                        <div class="p-3">
                            <h3 class="font-medium text-gray-900 dark:text-gray-100 text-sm line-clamp-2 leading-snug" :title="item.anime_title">
                                {{ item.anime_title }}
                            </h3>
                        </div>
                    </NuxtLink>
                </div>
            </div>
        </div>
    </div>

    <!-- Delete Confirmation Modal -->
    <BaseModal :show="showDeleteConfirm" title="確認刪除" icon="warning" icon-color="text-red-500" @close="showDeleteConfirm = false">
        <p class="text-gray-600 dark:text-gray-400 mb-6">確定要刪除 {{ selectedItems.size }} 個收藏嗎？此操作無法復原。</p>

        <template #actions>
            <button @click="showDeleteConfirm = false" class="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">取消</button>
            <button @click="confirmDelete" class="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors">確認刪除</button>
        </template>
    </BaseModal>

    <!-- Delete All Modal -->
    <BaseModal :show="showDeleteAllConfirm" title="清除全部紀錄" icon="delete_sweep" icon-color="text-red-500" @close="showDeleteAllConfirm = false">
        <p class="text-gray-600 dark:text-gray-400 mb-2">確定要清除所有收藏紀錄嗎？此操作無法復原。</p>

        <template #actions>
            <button @click="showDeleteAllConfirm = false" class="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">取消</button>
            <button @click="confirmDeleteAll" class="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors">確認清除</button>
        </template>
    </BaseModal>
</template>
