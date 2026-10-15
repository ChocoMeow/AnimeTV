<script setup>
import { WATCH_ANIME_META, WATCH_ANIME_META_INNER, withAnimeCovers } from '#shared/utils/watchHistory'

const { userSettings } = useUserSettings()
const { showToast } = useToast()
const appConfig = useAppConfig()
const client = useSupabaseClient()

const SEASON_NAMES = ['冬季', '春季', '夏季', '秋季']
const pageSize = 20

const favoriteItems = ref([])
const loading = ref(true)
const searchQuery = ref('')
const selectedItems = ref(new Set())
const showDeleteConfirm = ref(false)
const showDeleteAllConfirm = ref(false)
const currentPage = ref(0)
const hasMore = ref(true)
const loadingMore = ref(false)
const sortBy = ref('recent')

function mapFavorites(rows) {
    return withAnimeCovers(rows).map((item) => {
        const [y, m] = String(item.premiere_date || '').split('-').map(Number)
        const year = y || 0
        const seasonIndex = m >= 1 && m <= 12 ? Math.floor((m - 1) / 3) : -1
        return {
            ...item,
            seasonYear: year,
            seasonIndex,
            seasonLabel: year && seasonIndex >= 0 ? `${year} 年${SEASON_NAMES[seasonIndex]}` : '未分類季節',
        }
    })
}

function buildFavoritesQuery(from, to) {
    const search = searchQuery.value?.trim()
    let query = client
        .from('favorites')
        .select(`*, ${search ? WATCH_ANIME_META_INNER : WATCH_ANIME_META}`)
        .eq('user_id', userSettings.value.id)
        .range(from, to)

    if (search) query = query.ilike('anime_meta.title', `%${search}%`)
    if (sortBy.value === 'title') return query.order('anime_meta(title)', { ascending: true })
    if (sortBy.value === 'season') return query.order('anime_meta(premiere_date)', { ascending: false, nullsFirst: false })
    return query.order('created_at', { ascending: false })
}

const filteredFavorites = computed(() => {
    let filtered = [...favoriteItems.value]
    if (searchQuery.value) {
        const query = searchQuery.value.toLowerCase()
        filtered = filtered.filter((item) => item.anime_title?.toLowerCase().includes(query))
    }

    if (sortBy.value === 'title') {
        filtered.sort((a, b) => a.anime_title.localeCompare(b.anime_title))
    } else if (sortBy.value === 'season') {
        filtered.sort((a, b) => {
            const yearA = a.seasonYear || 0
            const yearB = b.seasonYear || 0
            const idxA = a.seasonIndex ?? -1
            const idxB = b.seasonIndex ?? -1
            if (yearA && yearB) {
                if (yearA !== yearB) return yearB - yearA
                if (idxA !== idxB) return idxB - idxA
            } else if (yearA) return -1
            else if (yearB) return 1
            return new Date(b.created_at) - new Date(a.created_at)
        })
    } else {
        filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    }
    return filtered
})

const groupedFavoritesBySeason = computed(() => {
    if (sortBy.value !== 'season') return {}
    return filteredFavorites.value.reduce((acc, item) => {
        ;(acc[item.seasonLabel || '未分類季節'] ||= []).push(item)
        return acc
    }, {})
})

function toggleSelectItem(id, event) {
    event.preventDefault()
    event.stopPropagation()
    if (selectedItems.value.has(id)) selectedItems.value.delete(id)
    else selectedItems.value.add(id)
}

function selectAll() {
    if (selectedItems.value.size === filteredFavorites.value.length) selectedItems.value.clear()
    else filteredFavorites.value.forEach((item) => selectedItems.value.add(item.id))
}

async function loadMore() {
    if (loading.value || loadingMore.value || !hasMore.value) return
    loadingMore.value = true
    try {
        const nextPage = currentPage.value + 1
        const { data, error } = await buildFavoritesQuery(nextPage * pageSize, nextPage * pageSize + pageSize - 1)
        if (error) throw error
        if (!data?.length) {
            hasMore.value = false
            return
        }
        favoriteItems.value = [...favoriteItems.value, ...mapFavorites(data)]
        currentPage.value = nextPage
        if (data.length < pageSize) hasMore.value = false
    } catch (err) {
        console.error('Failed to load more favorites:', err)
    } finally {
        loadingMore.value = false
    }
}

function handleScroll() {
    if (window.pageYOffset + window.innerHeight >= document.documentElement.scrollHeight - 200) loadMore()
}

async function deleteSelected() {
    if (selectedItems.value.size) showDeleteConfirm.value = true
}

async function confirmDelete() {
    try {
        const idsToDelete = Array.from(selectedItems.value)
        const { error } = await client.from('favorites').delete().in('id', idsToDelete)
        if (error) throw error
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
        const { data, error } = await buildFavoritesQuery(0, pageSize - 1)
        if (error) throw error
        favoriteItems.value = mapFavorites(data)
        currentPage.value = 0
        hasMore.value = data?.length === pageSize
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
                    <AppChip :active="sortBy === 'recent'" icon="schedule" @click="sortBy = 'recent'">最近收藏</AppChip>
                    <AppChip :active="sortBy === 'title'" icon="sort_by_alpha" @click="sortBy = 'title'">名稱排序</AppChip>
                    <AppChip :active="sortBy === 'season'" icon="event" @click="sortBy = 'season'">季節排序</AppChip>
                </div>

                <!-- Action Buttons -->
                <div v-if="favoriteItems.length > 0" class="flex items-center gap-2 sm:gap-3 flex-wrap">
                    <AppChip
                        variant="ghost"
                        :icon="selectedItems.size === filteredFavorites.length && filteredFavorites.length > 0 ? 'check_box' : 'check_box_outline_blank'"
                        @click="selectAll"
                    >
                        {{ selectedItems.size === filteredFavorites.length && filteredFavorites.length > 0 ? '取消全選' : '全選' }}
                    </AppChip>

                    <AppChip v-if="selectedItems.size > 0" variant="danger" icon="delete" @click="deleteSelected">
                        刪除已選 ({{ selectedItems.size }})
                    </AppChip>

                    <AppChip variant="danger-ghost" icon="delete_sweep" @click="showDeleteAllConfirm = true">
                        清除全部
                    </AppChip>
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
                                <AppImage
                                    :src="item.anime_image"
                                    :alt="item.anime_title"
                                    class="aspect-[2/3] w-full"
                                    img-class="w-full h-full object-cover group-hover:scale-105"
                                    icon-class="text-5xl"
                                />

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
                        <AppImage
                            :src="item.anime_image"
                            :alt="item.anime_title"
                            class="aspect-[2/3] w-full"
                            img-class="w-full h-full object-cover group-hover:scale-105"
                            icon-class="text-5xl"
                        />

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
.poster-card {
    @apply relative bg-black/[0.02] dark:bg-white/5 rounded-xl overflow-hidden
           ring-1 ring-black/5 dark:ring-white/10
           hover:ring-black/10 dark:hover:ring-white/20
           hover:shadow-xl hover:shadow-black/5 dark:hover:shadow-black/50
           hover:-translate-y-1 transition-all duration-300;
}
</style>
