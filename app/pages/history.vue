<script setup>
const { userSettings } = useUserSettings()
const { showToast } = useToast()
const appConfig = useAppConfig()
const route = useRoute()
const client = useSupabaseClient()

const historyItems = ref([])
const loading = ref(true)
const selectedFilter = ref("all")
const searchQuery = ref("")
const selectedItems = ref(new Set())
const showDeleteConfirm = ref(false)
const showDeleteAllConfirm = ref(false)
const pageSize = 20
const currentPage = ref(0)
const hasMore = ref(true)
const loadingMore = ref(false)

// Filter options
const filterOptions = [
    { value: "all", label: "全部" },
    { value: "today", label: "今天" },
    { value: "week", label: "本週" },
    { value: "month", label: "本月" },
]

// Computed filtered history
const filteredHistory = computed(() => {
    if (!searchQuery.value) return historyItems.value

    const query = searchQuery.value.toLowerCase()
    return historyItems.value.filter((item) => item.anime_title?.toLowerCase().includes(query))
})

// Group history by date
const groupedHistory = computed(() => {
    const groups = {}

    filteredHistory.value.forEach((item) => {
        const date = new Date(item.updated_at)
        const today = new Date()
        const yesterday = new Date(today)
        yesterday.setDate(yesterday.getDate() - 1)

        let dateKey
        if (isSameDay(date, today)) {
            dateKey = "今天"
        } else if (isSameDay(date, yesterday)) {
            dateKey = "昨天"
        } else {
            dateKey = formatDate(date)
        }

        if (!groups[dateKey]) {
            groups[dateKey] = []
        }
        groups[dateKey].push(item)
    })

    return groups
})

function isSameDay(date1, date2) {
    return date1.getDate() === date2.getDate() && date1.getMonth() === date2.getMonth() && date1.getFullYear() === date2.getFullYear()
}

function formatDate(date) {
    const year = date.getFullYear()
    const month = date.getMonth() + 1
    const day = date.getDate()
    return `${year}年${month}月${day}日`
}

function formatTime(dateString) {
    const date = new Date(dateString)
    const hours = date.getHours().toString().padStart(2, "0")
    const minutes = date.getMinutes().toString().padStart(2, "0")
    return `${hours}:${minutes}`
}

function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
}

function toggleSelectItem(animeRefId, event) {
    event.preventDefault()
    event.stopPropagation()
    if (selectedItems.value.has(animeRefId)) {
        selectedItems.value.delete(animeRefId)
    } else {
        selectedItems.value.add(animeRefId)
    }
}

function selectAll() {
    if (selectedItems.value.size === filteredHistory.value.length) {
        selectedItems.value.clear()
    } else {
        filteredHistory.value.forEach((item) => selectedItems.value.add(item.anime_ref_id))
    }
}

function applyTimeFilter(query) {
    if (selectedFilter.value === "all") return query

    const now = new Date()
    let filterDate

    if (selectedFilter.value === "today") {
        filterDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    } else if (selectedFilter.value === "week") {
        filterDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    } else if (selectedFilter.value === "month") {
        filterDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    }

    return query.gte("updated_at", filterDate.toISOString())
}

async function loadMore() {
    if (loadingMore.value || !hasMore.value) return

    loadingMore.value = true
    try {
        const nextPage = currentPage.value + 1
        const from = nextPage * pageSize
        const to = from + pageSize - 1

        let query = client
            .from("watch_history_latest_updates")
            .select("*")
            .eq("user_id", userSettings.value.id)

        // Apply time filter
        query = applyTimeFilter(query)

        const { data, error } = await query.order("updated_at", { ascending: false }).range(from, to)

        if (error) throw error

        if (data && data.length > 0) {
            historyItems.value = [...historyItems.value, ...data]
            currentPage.value = nextPage

            // Check if we got fewer records than requested
            if (data.length < pageSize) {
                hasMore.value = false
            }
        } else {
            hasMore.value = false
        }
    } catch (err) {
        console.error("Failed to load more history:", err)
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
        const animeRefIdsToDelete = Array.from(selectedItems.value)

        // Delete all watch history records for the selected anime (not just the latest episode)
        const { error } = await client
            .from("watch_history")
            .delete()
            .in("anime_ref_id", animeRefIdsToDelete)
            .eq("user_id", userSettings.value.id)

        if (error) throw error

        // Remove deleted items from the displayed list
        historyItems.value = historyItems.value.filter((item) => !animeRefIdsToDelete.includes(item.anime_ref_id))
        selectedItems.value.clear()
        showDeleteConfirm.value = false
        showToast("已刪除所選動漫的觀看紀錄", "success")
    } catch (err) {
        console.error("Failed to delete history:", err)
        showToast("刪除失敗，請稍後再試", "error")
    }
}

async function confirmDeleteAll() {
    try {
        if (!userSettings.value.id) return
        const { error } = await client.from("watch_history").delete().eq("user_id", userSettings.value.id)

        if (error) throw error

        historyItems.value = []
        selectedItems.value.clear()
        showDeleteAllConfirm.value = false
        showToast("已清除所有觀看紀錄", "success")
    } catch (err) {
        console.error("Failed to clear history:", err)
        showToast("清除失敗，請稍後再試", "error")
    }
}

async function fetchHistory() {
    loading.value = true
    try {
        let query = client
            .from("watch_history_latest_updates")
            .select("*")
            .eq("user_id", userSettings.value.id)

        // Apply time filter
        query = applyTimeFilter(query)

        const { data, error } = await query.order("updated_at", { ascending: false }).range(0, pageSize - 1)

        if (error) throw error

        historyItems.value = data || []
        currentPage.value = 0

        // Check if there might be more records
        hasMore.value = data && data.length === pageSize
    } catch (err) {
        console.error("Failed to fetch history:", err)
        historyItems.value = []
    } finally {
        loading.value = false
    }
}

onActivated(() => {
    // Reset and fetch fresh data
    historyItems.value = []
    currentPage.value = 0
    hasMore.value = true
    fetchHistory()
})

onMounted(() => {
    fetchHistory()
    window.addEventListener("scroll", handleScroll)
})

onBeforeUnmount(() => {
    window.removeEventListener("scroll", handleScroll)
})

// Reset when filters change
watch([selectedFilter, searchQuery], () => {
    historyItems.value = []
    currentPage.value = 0
    hasMore.value = true
    fetchHistory()
})

watch(
    () => route.path,
    (newPath) => {
        if (newPath === "/history" || newPath.includes("/history")) {
            historyItems.value = []
            currentPage.value = 0
            hasMore.value = true
            fetchHistory()
        }
    }
)

useHead({
    title: `觀看紀錄 | ${appConfig.siteName}`,
})
</script>

<template>
    <div class="max-w-7xl mx-auto px-4 py-6">
        <!-- Header -->
        <div class="mb-6">
            <!-- Title and Search Row -->
            <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                <h1 class="text-3xl font-bold text-gray-900 dark:text-gray-100 flex-shrink-0">觀看紀錄</h1>

                <!-- Search -->
                <div class="relative w-full sm:max-w-xs">
                    <input v-model="searchQuery" type="text" placeholder="搜尋動漫..." class="w-full bg-white dark:bg-white/10 border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 pl-10 text-sm " />
                    <span class="material-icons absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xl">search</span>
                </div>
            </div>

            <!-- Filters and Actions Row -->
            <div class="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                <!-- Time Filters -->
                <div class="flex gap-2 flex-wrap">
                    <button
                        v-for="filter in filterOptions"
                        :key="filter.value"
                        @click="selectedFilter = filter.value"
                        :class="[
                            'px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:shadow-md',
                            selectedFilter === filter.value
                                ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900'
                                : 'bg-white dark:bg-white/10 text-gray-700 dark:text-gray-300'
                        ]"
                    >
                        {{ filter.label }}
                    </button>
                </div>

                <!-- Action Buttons -->
                <div v-if="historyItems.length > 0" class="flex items-center gap-3 flex-wrap">
                    <button @click="selectAll" class="text-sm px-4 py-2 rounded-lg bg-white dark:bg-white/10 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-2">
                        <span class="material-icons text-lg">
                            {{ selectedItems.size === filteredHistory.length && filteredHistory.length > 0 ? "check_box" : "check_box_outline_blank" }}
                        </span>
                        {{ selectedItems.size === filteredHistory.length && filteredHistory.length > 0 ? "取消全選" : "全選" }}
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
        </div>

        <!-- Loading State -->
        <div v-if="loading" class="flex items-center justify-center py-20">
            <div class="animate-spin rounded-full h-12 w-12 border-4 border-gray-600 border-t-transparent"></div>
        </div>

        <!-- Empty State -->
        <div v-else-if="historyItems.length === 0" class="text-center py-20">
            <span class="material-icons text-gray-400 text-6xl mb-4">history</span>
            <h3 class="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">還沒有觀看紀錄</h3>
            <p class="text-gray-500 dark:text-gray-400 mb-6">開始觀看動漫，這裡會記錄你的觀看歷史</p>
            <NuxtLink to="/" class="px-6 py-3 bg-gray-900 dark:bg-gray-100 hover:bg-gray-800 dark:hover:bg-gray-200 text-white dark:text-gray-900 rounded-lg transition-colors">探索動漫</NuxtLink>
        </div>

        <!-- No Search Results -->
        <div v-else-if="filteredHistory.length === 0" class="text-center py-20">
            <span class="material-icons text-gray-400 text-6xl mb-4">search_off</span>
            <h3 class="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">找不到相關紀錄</h3>
            <p class="text-gray-500 dark:text-gray-400">試試其他搜尋關鍵字或篩選條件</p>
        </div>

        <!-- History List -->
        <div v-else class="space-y-8">
            <div v-for="(items, dateLabel) in groupedHistory" :key="dateLabel">
                <!-- Date Header -->
                <div class="flex items-center gap-3 mb-4">
                    <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">{{ dateLabel }}</h2>
                    <div class="flex-1 h-px bg-gray-200 dark:bg-gray-700"></div>
                </div>

                <!-- History Items -->
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div v-for="item in items" :key="item.id" class="bg-gray-950/5 dark:bg-white/10 rounded-lg shadow hover:shadow-lg transition-all overflow-hidden group relative">
                        <!-- Checkbox - Now always visible when selected -->
                        <button @click="toggleSelectItem(item.anime_ref_id, $event)" class="absolute top-3 left-3 z-10 w-6 h-6 rounded bg-white dark:bg-gray-700 shadow-md flex items-center justify-center transition-opacity" :class="selectedItems.has(item.anime_ref_id) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'">
                            <span v-if="selectedItems.has(item.anime_ref_id)" class="material-icons text-gray-900 dark:text-gray-100 text-lg">check_box</span>
                            <span v-else class="material-icons text-gray-400 text-lg">check_box_outline_blank</span>
                        </button>

                        <!-- Clickable Link - Wraps content -->
                        <NuxtLink :to="`/anime/${item.anime_ref_id}?e=${item.episode_number}&t=${item.playback_time}`" class="block cursor-pointer">
                            <div class="flex gap-4 p-4">
                                <!-- Thumbnail -->
                                <div class="w-24 h-32 flex-shrink-0 rounded overflow-hidden bg-gray-200 dark:bg-gray-700 relative">
                                    <img v-if="item.anime_image" :src="item.anime_image" :alt="item.anime_title" class="w-full h-full object-cover" />
                                    <div v-else class="w-full h-full flex items-center justify-center text-gray-400">
                                        <span class="material-icons text-4xl">movie</span>
                                    </div>

                                    <!-- Progress Bar -->
                                    <div v-if="item.progress_percentage > 0" class="absolute bottom-0 left-0 right-0 h-1 bg-gray-800/50">
                                        <div class="h-full bg-gray-600 dark:bg-gray-400" :style="{ width: `${item.progress_percentage}%` }"></div>
                                    </div>
                                </div>

                                <!-- Info -->
                                <div class="flex-1 min-w-0 flex flex-col">
                                    <h3 class="font-semibold text-gray-900 dark:text-gray-100 truncate mb-1">
                                        {{ item.anime_title }}
                                    </h3>

                                    <div class="space-y-1 text-sm text-gray-600 dark:text-gray-400 mb-3">
                                        <p class="flex items-center gap-2">
                                            <span class="material-icons text-xs">play_circle</span>
                                            上次觀看：第 {{ item.episode_number }} 集
                                        </p>
                                        <p class="flex items-center gap-2">
                                            <span class="material-icons text-xs">schedule</span>
                                            {{ formatTime(item.updated_at) }}
                                        </p>
                                        <p v-if="item.playback_time" class="flex items-center gap-2">
                                            <span class="material-icons text-xs">timer</span>
                                            觀看 {{ formatDuration(item.playback_time) }} / {{ formatDuration(item.video_duration) }}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </NuxtLink>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Delete Confirmation Modal -->
    <BaseModal :show="showDeleteConfirm" title="確認刪除" icon="warning" icon-color="text-red-500" @close="showDeleteConfirm = false">
        <p class="text-gray-600 dark:text-gray-400">確定要刪除 {{ selectedItems.size }} 部動漫的所有觀看紀錄嗎？此操作無法復原。</p>

        <template #actions>
            <button @click="showDeleteConfirm = false" class="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">取消</button>
            <button @click="confirmDelete" class="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors">確認刪除</button>
        </template>
    </BaseModal>

    <!-- Delete All Modal -->
    <BaseModal :show="showDeleteAllConfirm" title="清除全部紀錄" icon="delete_sweep" icon-color="text-red-500" @close="showDeleteAllConfirm = false">
        <p class="text-gray-600 dark:text-gray-400 mb-2">確定要清除所有觀看紀錄嗎？此操作無法復原。</p>

        <template #actions>
            <button @click="showDeleteAllConfirm = false" class="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">取消</button>
            <button @click="confirmDeleteAll" class="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors">確認清除</button>
        </template>
    </BaseModal>
</template>
