<script setup>
const { userSettings } = useUserSettings()
const { showToast } = useToast()
const appConfig = useAppConfig()
const route = useRoute()
const client = useSupabaseClient()

const favoriteItems = ref([]) // each item will have seasonYear/seasonIndex/seasonLabel precomputed
const loading = ref(true)
const searchQuery = ref('')
const selectedItems = ref(new Set())
const showDeleteConfirm = ref(false)
const showDeleteAllConfirm = ref(false)
const pageSize = 20
const currentPage = ref(0)
const hasMore = ref(true)
const loadingMore = ref(false)
const sortBy = ref('recent') // recent, title, season

// ---------- Season helpers ----------
function enrichWithSeason(favorites) {
    const seasonNames = ['冬季', '春季', '夏季', '秋季']

    return (favorites || []).map((item) => {
        const premiere = item.anime_meta?.premiere_date
        let year = 0
        let month = 0

        if (premiere) {
            const [y, mo] = String(premiere).split('-')
            year = Number(y) || 0
            month = Number(mo) || 0
        }

        let seasonIndex = -1
        if (month >= 1 && month <= 3) seasonIndex = 0
        else if (month >= 4 && month <= 6) seasonIndex = 1
        else if (month >= 7 && month <= 9) seasonIndex = 2
        else if (month >= 10 && month <= 12) seasonIndex = 3

        const label = year && seasonIndex >= 0 ? `${year} 年${seasonNames[seasonIndex]}` : '未分類季節'

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
    if (sortBy.value === 'title') {
        filtered.sort((a, b) => a.anime_title.localeCompare(b.anime_title))
    } else if (sortBy.value === 'season') {
        // Sort by season (newest season first), fallback to recent if no season info
        filtered.sort((a, b) => {
            const yearA = a.seasonYear || 0
            const yearB = b.seasonYear || 0
            const idxA = typeof a.seasonIndex === 'number' ? a.seasonIndex : -1
            const idxB = typeof b.seasonIndex === 'number' ? b.seasonIndex : -1

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
    if (sortBy.value !== 'season') return {}

    return filteredFavorites.value.reduce((acc, item) => {
        const label = item.seasonLabel || '未分類季節'
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
    if (loading.value || loadingMore.value || !hasMore.value) return

    loadingMore.value = true
    try {
        const nextPage = currentPage.value + 1
        const from = nextPage * pageSize
        const to = from + pageSize - 1

        let query = client.from('favorites').select('*, anime_meta!anime_ref_id(premiere_date)').eq('user_id', userSettings.value.id).range(from, to)

        // Apply search filter (server-side)
        if (searchQuery.value?.trim()) {
            query = query.ilike('anime_title', `%${searchQuery.value.trim()}%`)
        }

        if (sortBy.value === 'title') {
            query = query.order('anime_title', { ascending: true })
        } else if (sortBy.value === 'season') {
            query = query.order('anime_meta(premiere_date)', { ascending: false, nullsFirst: false })
        } else {
            query = query.order('created_at', { ascending: false })
        }

        const { data, error } = await query
        if (error) throw error

        if (data && data.length > 0) {
            favoriteItems.value = [...favoriteItems.value, ...enrichWithSeason(data)]
            currentPage.value = nextPage
            if (data.length < pageSize) hasMore.value = false
        } else {
            hasMore.value = false
        }
    } catch (err) {
        console.error('Failed to load more favorites:', err)
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

        const { error } = await client.from('favorites').delete().in('id', idsToDelete)

        if (error) throw error

        // Remove from local state
        favoriteItems.value = favoriteItems.value.filter((item) => !idsToDelete.includes(item.id))
        selectedItems.value.clear()
        showDeleteConfirm.value = false
    } catch (err) {
        console.error('Failed to delete favorites:', err)
        showToast('刪除失敗，請稍後再試', 'error')
    }
}

async function confirmDeleteAll() {
    try {
        if (!userSettings.value.id) return
        const { error } = await client.from('favorites').delete().eq('user_id', userSettings.value.id)

        if (error) throw error

        favoriteItems.value = []
        selectedItems.value.clear()
        showDeleteAllConfirm.value = false
    } catch (err) {
        console.error('Failed to clear favorites:', err)
        showToast('清除失敗，請稍後再試', 'error')
    }
}

async function fetchFavorites() {
    loading.value = true
    try {
        if (!userSettings.value.id) {
            favoriteItems.value = []
            return
        }

        let query = client
            .from('favorites')
            .select('*, anime_meta!anime_ref_id(premiere_date)')
            .eq('user_id', userSettings.value.id)
            .range(0, pageSize - 1)

        // Apply search filter (server-side)
        if (searchQuery.value?.trim()) {
            query = query.ilike('anime_title', `%${searchQuery.value.trim()}%`)
        }

        if (sortBy.value === 'title') {
            query = query.order('anime_title', { ascending: true })
        } else if (sortBy.value === 'season') {
            query = query.order('anime_meta(premiere_date)', { ascending: false, nullsFirst: false })
        } else {
            query = query.order('created_at', { ascending: false })
        }

        const { data, error } = await query
        if (error) throw error

        favoriteItems.value = enrichWithSeason(data || [])
        currentPage.value = 0
        hasMore.value = data && data.length === pageSize
    } catch (err) {
        console.error('Failed to fetch favorites:', err)
        favoriteItems.value = []
        hasMore.value = false
    } finally {
        loading.value = false
    }
}

onMounted(() => {
    fetchFavorites()
    window.addEventListener('scroll', handleScroll)
})

onBeforeUnmount(() => {
    window.removeEventListener('scroll', handleScroll)
})

// Reset when sort or search changes
watch([sortBy, searchQuery], () => {
    favoriteItems.value = []
    currentPage.value = 0
    hasMore.value = true
    fetchFavorites()
})

useHead({
    title: `我的收藏 | ${appConfig.siteName}`,
})
</script>

<template>
    <div class="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 py-6 sm:py-8">
        <!-- Header -->
        <div class="mb-6 sm:mb-8">
            <!-- Title and Search Row -->
            <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4 sm:mb-5">
                <h1 class="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 dark:text-white flex-shrink-0">我的收藏</h1>

                <!-- Search -->
                <div class="relative w-full sm:max-w-xs">
                    <input v-model="searchQuery" type="text" placeholder="搜尋收藏..." class="page-search" />
                    <span class="material-symbols-rounded absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-xl">search</span>
                </div>
            </div>

            <!-- Filters and Actions Row -->
            <div class="flex flex-col md:flex-row gap-3 sm:gap-4 items-start md:items-center justify-between">
                <!-- Sort Options -->
                <div class="flex gap-2 flex-wrap">
                    <button @click="sortBy = 'recent'" :class="['pill-tab', sortBy === 'recent' ? 'pill-tab-active' : 'pill-tab-inactive']">
                        <span class="material-symbols-rounded text-lg">schedule</span>
                        最近收藏
                    </button>
                    <button @click="sortBy = 'title'" :class="['pill-tab', sortBy === 'title' ? 'pill-tab-active' : 'pill-tab-inactive']">
                        <span class="material-symbols-rounded text-lg">sort_by_alpha</span>
                        名稱排序
                    </button>
                    <button @click="sortBy = 'season'" :class="['pill-tab', sortBy === 'season' ? 'pill-tab-active' : 'pill-tab-inactive']">
                        <span class="material-symbols-rounded text-lg">event</span>
                        季節排序
                    </button>
                </div>

                <!-- Action Buttons -->
                <div v-if="favoriteItems.length > 0" class="flex items-center gap-2 sm:gap-3 flex-wrap">
                    <button @click="selectAll" class="btn-ghost">
                        <span class="material-symbols-rounded text-lg">
                            {{ selectedItems.size === filteredFavorites.length && filteredFavorites.length > 0 ? 'check_box' : 'check_box_outline_blank' }}
                        </span>
                        {{ selectedItems.size === filteredFavorites.length && filteredFavorites.length > 0 ? '取消全選' : '全選' }}
                    </button>

                    <button v-if="selectedItems.size > 0" @click="deleteSelected" class="btn-danger">
                        <span class="material-symbols-rounded text-lg">delete</span>
                        刪除已選 ({{ selectedItems.size }})
                    </button>

                    <button @click="showDeleteAllConfirm = true" class="btn-ghost-danger">
                        <span class="material-symbols-rounded text-lg">delete_sweep</span>
                        清除全部
                    </button>
                </div>
            </div>

            <!-- Stats -->
            <div v-if="!loading && favoriteItems.length > 0" class="mt-4 text-sm text-gray-600 dark:text-gray-400">
                共 {{ favoriteItems.length }} 部收藏動漫
            </div>
        </div>

        <!-- Loading State -->
        <div v-if="loading" class="flex items-center justify-center py-20">
            <LoadingSpinner size="xl" />
        </div>

        <!-- No Search Results -->
        <div v-else-if="filteredFavorites.length === 0" class="empty-state">
            <span class="material-symbols-rounded text-gray-400 dark:text-gray-500 text-6xl mb-4 opacity-60">search_off</span>
            <h3 class="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-2">找不到相關收藏</h3>
            <p class="text-gray-500 dark:text-gray-400">試試其他搜尋關鍵字</p>
        </div>

        <!-- Empty State -->
        <div v-else-if="favoriteItems.length === 0" class="empty-state">
            <span class="material-symbols-rounded text-gray-400 dark:text-gray-500 text-6xl mb-4 opacity-60">bookmark_add</span>
            <h3 class="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-2">還沒有收藏動漫</h3>
            <p class="text-gray-500 dark:text-gray-400 mb-6">找到喜歡的動漫就收藏起來吧</p>
            <NuxtLink to="/" class="btn-primary">
                <span class="material-symbols-rounded">explore</span>
                探索動漫
            </NuxtLink>
        </div>

        <!-- Favorites Grid -->
        <div v-else>
            <!-- Season grouped view (similar to history date groups) -->
            <div v-if="sortBy === 'season'" class="space-y-8 sm:space-y-10">
                <div v-for="(items, seasonLabel) in groupedFavoritesBySeason" :key="seasonLabel">
                    <!-- Season Header -->
                    <div class="flex items-center gap-3 mb-4">
                        <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">{{ seasonLabel }}</h2>
                        <div class="flex-1 h-px bg-black/10 dark:bg-white/10"></div>
                    </div>

                    <!-- Season Favorites Grid -->
                    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
                        <div v-for="item in items" :key="item.id" class="poster-card group">
                            <!-- Checkbox -->
                            <button
                                @click="toggleSelectItem(item.id, $event)"
                                class="absolute top-2 left-2 z-10 w-7 h-7 rounded-md bg-white/90 dark:bg-gray-950/90 shadow-md flex items-center justify-center transition-opacity backdrop-blur-sm"
                                :class="selectedItems.has(item.id) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'"
                            >
                                <span v-if="selectedItems.has(item.id)" class="material-symbols-rounded text-gray-900 dark:text-gray-100 text-lg">check_box</span>
                                <span v-else class="material-symbols-rounded text-gray-400 text-lg">check_box_outline_blank</span>
                            </button>

                            <!-- Favorite Badge -->
                            <div class="absolute top-2 right-2 z-10 w-7 h-7 rounded-full bg-red-500 shadow-md flex items-center justify-center">
                                <span class="material-symbols-rounded text-white text-sm">bookmark_added</span>
                            </div>

                            <!-- Clickable Link -->
                            <NuxtLink :to="`/anime/${item.anime_ref_id}`" class="block">
                                <!-- Poster -->
                                <div class="aspect-[2/3] w-full bg-gray-200 dark:bg-white/5 relative overflow-hidden">
                                    <NuxtImg
                                        v-if="item.anime_image"
                                        :src="item.anime_image"
                                        :alt="item.anime_title"
                                        loading="lazy"
                                        class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                    />
                                    <div v-else class="w-full h-full flex items-center justify-center text-gray-400">
                                        <span class="material-symbols-rounded text-5xl">movie</span>
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
            <div v-else class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
                <div v-for="item in filteredFavorites" :key="item.id" class="poster-card group">
                    <!-- Checkbox -->
                    <button
                        @click="toggleSelectItem(item.id, $event)"
                        class="absolute top-2 left-2 z-10 w-7 h-7 rounded-md bg-white/90 dark:bg-gray-950/90 shadow-md flex items-center justify-center transition-opacity backdrop-blur-sm"
                        :class="selectedItems.has(item.id) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'"
                    >
                        <span v-if="selectedItems.has(item.id)" class="material-symbols-rounded text-gray-900 dark:text-gray-100 text-lg">check_box</span>
                        <span v-else class="material-symbols-rounded text-gray-400 text-lg">check_box_outline_blank</span>
                    </button>

                    <!-- Favorite Badge -->
                    <div class="absolute top-2 right-2 z-10 w-7 h-7 rounded-full bg-red-500 shadow-md flex items-center justify-center">
                        <span class="material-symbols-rounded text-white text-sm">bookmark_added</span>
                    </div>

                    <!-- Clickable Link -->
                    <NuxtLink :to="`/anime/${item.anime_ref_id}`" class="block">
                        <!-- Poster -->
                        <div class="aspect-[2/3] w-full bg-gray-200 dark:bg-white/5 relative overflow-hidden">
                            <NuxtImg
                                v-if="item.anime_image"
                                :src="item.anime_image"
                                :alt="item.anime_title"
                                loading="lazy"
                                class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                            <div v-else class="w-full h-full flex items-center justify-center text-gray-400">
                                <span class="material-symbols-rounded text-5xl">movie</span>
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

    <!-- Loading More Spinner -->
    <div v-if="loadingMore" class="flex justify-center py-6">
        <LoadingSpinner size="md" />
    </div>

    <!-- Delete Confirmation Modal -->
    <BaseModal :show="showDeleteConfirm" title="確認刪除" icon="warning" icon-color="text-red-500" @close="showDeleteConfirm = false">
        <p class="text-gray-600 dark:text-gray-400 mb-6">確定要刪除 {{ selectedItems.size }} 個收藏嗎？此操作無法復原。</p>

        <template #actions>
            <button @click="showDeleteConfirm = false" class="btn-modal-cancel">取消</button>
            <button @click="confirmDelete" class="btn-modal-danger">確認刪除</button>
        </template>
    </BaseModal>

    <!-- Delete All Modal -->
    <BaseModal :show="showDeleteAllConfirm" title="清除全部紀錄" icon="delete_sweep" icon-color="text-red-500" @close="showDeleteAllConfirm = false">
        <p class="text-gray-600 dark:text-gray-400 mb-2">確定要清除所有收藏紀錄嗎？此操作無法復原。</p>

        <template #actions>
            <button @click="showDeleteAllConfirm = false" class="btn-modal-cancel">取消</button>
            <button @click="confirmDeleteAll" class="btn-modal-danger">確認清除</button>
        </template>
    </BaseModal>
</template>

<style scoped>
.page-search {
    @apply w-full bg-black/5 dark:bg-white/10 border border-transparent rounded-full px-4 py-2.5 pl-10 text-sm
           text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400
           focus:ring-2 focus:ring-black/10 dark:focus:ring-white/20 outline-none transition-shadow;
}

.pill-tab {
    @apply px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 flex items-center gap-2;
}

.pill-tab-inactive {
    @apply bg-black/5 dark:bg-white/10 text-gray-700 dark:text-gray-300 hover:bg-black/10 dark:hover:bg-white/20;
}

.pill-tab-active {
    @apply bg-gray-900 dark:bg-white text-white dark:text-black shadow-md;
}

.btn-primary {
    @apply inline-flex items-center gap-2 px-6 py-3 rounded-full font-semibold text-sm
           bg-gray-900 dark:bg-white text-white dark:text-black
           hover:opacity-90 transition-opacity;
}

.btn-ghost {
    @apply text-sm px-4 py-2 rounded-full bg-black/5 dark:bg-white/10 text-gray-700 dark:text-gray-300
           hover:bg-black/10 dark:hover:bg-white/20 transition-colors flex items-center gap-2;
}

.btn-ghost-danger {
    @apply text-sm px-4 py-2 rounded-full bg-black/5 dark:bg-white/10 text-red-600 dark:text-red-400
           hover:bg-red-500/10 transition-colors flex items-center gap-2;
}

.btn-danger {
    @apply text-sm px-4 py-2 rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors flex items-center gap-2;
}

.empty-state {
    @apply text-center py-20 rounded-2xl bg-black/[0.02] dark:bg-white/[0.03] border border-black/5 dark:border-white/5;
}

.poster-card {
    @apply relative bg-black/[0.02] dark:bg-white/5 rounded-xl overflow-hidden
           ring-1 ring-black/5 dark:ring-white/10
           hover:ring-black/10 dark:hover:ring-white/20
           hover:shadow-xl hover:shadow-black/5 dark:hover:shadow-black/50
           hover:-translate-y-1 transition-all duration-300;
}
</style>
