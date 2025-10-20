<script setup>
const appConfig = useAppConfig()
const route = useRoute()
const client = useSupabaseClient()
const user = useSupabaseUser()

const historyItems = ref([])
const loading = ref(true)
const selectedFilter = ref("all") // all, today, week, month
const searchQuery = ref("")
const selectedItems = ref(new Set())
const showDeleteConfirm = ref(false)
const displayLimit = ref(20)
const loadingMore = ref(false)

// Computed filtered history
const filteredHistory = computed(() => {
    let filtered = [...historyItems.value]

    // Filter by time period
    const now = new Date()
    if (selectedFilter.value === "today") {
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        filtered = filtered.filter((item) => new Date(item.watched_at) >= todayStart)
    } else if (selectedFilter.value === "week") {
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        filtered = filtered.filter((item) => new Date(item.watched_at) >= weekAgo)
    } else if (selectedFilter.value === "month") {
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        filtered = filtered.filter((item) => new Date(item.watched_at) >= monthAgo)
    }

    // Filter by search query
    if (searchQuery.value) {
        const query = searchQuery.value.toLowerCase()
        filtered = filtered.filter((item) => item.anime_title?.toLowerCase().includes(query))
    }

    // Group by anime and keep only the most recent episode for each anime
    const animeMap = new Map()
    filtered.forEach((item) => {
        const animeId = item.anime_ref_id
        if (!animeMap.has(animeId)) {
            animeMap.set(animeId, item)
        } else {
            const existing = animeMap.get(animeId)
            // Keep the more recent watch
            if (new Date(item.watched_at) > new Date(existing.watched_at)) {
                animeMap.set(animeId, item)
            }
        }
    })

    // Convert back to array and sort by watched_at
    filtered = Array.from(animeMap.values()).sort((a, b) => new Date(b.watched_at) - new Date(a.watched_at))

    // Apply display limit for lazy loading
    return filtered.slice(0, displayLimit.value)
})

// Check if there are more items to load
const hasMoreItems = computed(() => {
    let filtered = [...historyItems.value]

    // Apply same filters
    const now = new Date()
    if (selectedFilter.value === "today") {
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        filtered = filtered.filter((item) => new Date(item.watched_at) >= todayStart)
    } else if (selectedFilter.value === "week") {
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        filtered = filtered.filter((item) => new Date(item.watched_at) >= weekAgo)
    } else if (selectedFilter.value === "month") {
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        filtered = filtered.filter((item) => new Date(item.watched_at) >= monthAgo)
    }

    if (searchQuery.value) {
        const query = searchQuery.value.toLowerCase()
        filtered = filtered.filter((item) => item.anime_title?.toLowerCase().includes(query))
    }

    return filtered.length > displayLimit.value
})

// Group history by date
const groupedHistory = computed(() => {
    const groups = {}

    filteredHistory.value.forEach((item) => {
        const date = new Date(item.watched_at)
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
    if (selectedItems.value.size === filteredHistory.value.length) {
        selectedItems.value.clear()
    } else {
        filteredHistory.value.forEach((item) => selectedItems.value.add(item.id))
    }
}

function loadMore() {
    if (loadingMore.value || !hasMoreItems.value) return
    loadingMore.value = true
    setTimeout(() => {
        displayLimit.value += 20
        loadingMore.value = false
    }, 300)
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

        const { error } = await client.from("watch_history").delete().in("id", idsToDelete)

        if (error) throw error

        // Remove from local state
        historyItems.value = historyItems.value.filter((item) => !idsToDelete.includes(item.id))
        selectedItems.value.clear()
        showDeleteConfirm.value = false
    } catch (err) {
        console.error("Failed to delete history:", err)
        alert("刪除失敗，請稍後再試")
    }
}

async function clearAllHistory() {
    if (!confirm("確定要清除所有觀看紀錄嗎？此操作無法復原。")) return

    try {
        if (!user?.value?.sub) return
        const { error } = await client.from("watch_history").delete().eq("user_id", user.value.sub)

        if (error) throw error

        historyItems.value = []
        selectedItems.value.clear()
    } catch (err) {
        console.error("Failed to clear history:", err)
        alert("清除失敗，請稍後再試")
    }
}

async function fetchHistory() {
    loading.value = true
    try {
        // Fetch watch history from Supabase
        const { data, error } = await client.from("watch_history").select("*").eq("user_id", user.value.sub).order("watched_at", { ascending: false })

        if (error) throw error

        historyItems.value = data || []
    } catch (err) {
        console.error("Failed to fetch history:", err)
        historyItems.value = []
    } finally {
        loading.value = false
    }
}

onActivated(() => {
    fetchHistory()
})

onMounted(() => {
    fetchHistory()
    window.addEventListener("scroll", handleScroll)
})

onBeforeUnmount(() => {
    window.removeEventListener("scroll", handleScroll)
})

// Reset display limit when filters change
watch([selectedFilter, searchQuery], () => {
    displayLimit.value = 20
})

watch(
    () => route.path,
    (newPath) => {
        if (newPath === "/history" || newPath.includes("/history")) {
            fetchHistory()
        }
    }
)

useHead({
    title: `觀看紀錄 | ${appConfig.siteName}`,
})
</script>

<template>
    <div class="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div class="max-w-7xl mx-auto px-4 py-6">
            <!-- Header -->
            <div class="mb-6">
                <!-- Title and Search Row -->
                <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                    <h1 class="text-3xl font-bold text-gray-900 dark:text-gray-100 flex-shrink-0">觀看紀錄</h1>

                    <!-- Search -->
                    <div class="relative w-full sm:max-w-xs">
                        <input v-model="searchQuery" type="text" placeholder="搜尋動漫..." class="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 pl-10 text-sm focus:ring-2 focus:ring-indigo-400 outline-none" />
                        <span class="material-icons absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xl">search</span>
                    </div>
                </div>

                <!-- Filters and Actions Row -->
                <div class="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                    <!-- Time Filters -->
                    <div class="flex gap-2 flex-wrap">
                        <button @click="selectedFilter = 'all'" :class="selectedFilter === 'all' ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300'" class="px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:shadow-md">全部</button>
                        <button @click="selectedFilter = 'today'" :class="selectedFilter === 'today' ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300'" class="px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:shadow-md">今天</button>
                        <button @click="selectedFilter = 'week'" :class="selectedFilter === 'week' ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300'" class="px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:shadow-md">本週</button>
                        <button @click="selectedFilter = 'month'" :class="selectedFilter === 'month' ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300'" class="px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:shadow-md">本月</button>
                    </div>

                    <!-- Action Buttons -->
                    <div v-if="historyItems.length > 0" class="flex items-center gap-3 flex-wrap">
                        <button @click="selectAll" class="text-sm px-4 py-2 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-2">
                            <span class="material-icons text-lg">
                                {{ selectedItems.size === filteredHistory.length && filteredHistory.length > 0 ? "check_box" : "check_box_outline_blank" }}
                            </span>
                            {{ selectedItems.size === filteredHistory.length && filteredHistory.length > 0 ? "取消全選" : "全選" }}
                        </button>

                        <button v-if="selectedItems.size > 0" @click="deleteSelected" class="text-sm px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors flex items-center gap-2">
                            <span class="material-icons text-lg">delete</span>
                            刪除已選 ({{ selectedItems.size }})
                        </button>

                        <button @click="clearAllHistory" class="text-sm px-4 py-2 rounded-lg bg-white dark:bg-gray-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex items-center gap-2">
                            <span class="material-icons text-lg">delete_sweep</span>
                            清除全部
                        </button>
                    </div>
                </div>
            </div>

            <!-- Loading State -->
            <div v-if="loading" class="flex items-center justify-center py-20">
                <div class="animate-spin rounded-full h-12 w-12 border-4 border-indigo-600 border-t-transparent"></div>
            </div>

            <!-- Empty State -->
            <div v-else-if="historyItems.length === 0" class="text-center py-20">
                <span class="material-icons text-gray-400 text-6xl mb-4">history</span>
                <h3 class="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">還沒有觀看紀錄</h3>
                <p class="text-gray-500 dark:text-gray-400 mb-6">開始觀看動漫，這裡會記錄你的觀看歷史</p>
                <NuxtLink to="/" class="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">探索動漫</NuxtLink>
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
                        <div v-for="item in items" :key="item.id" class="bg-white dark:bg-gray-800 rounded-lg shadow hover:shadow-lg transition-all overflow-hidden group relative">
                            <!-- Checkbox - Now always visible when selected -->
                            <button @click="toggleSelectItem(item.id, $event)" class="absolute top-3 left-3 z-10 w-6 h-6 rounded bg-white dark:bg-gray-700 shadow-md flex items-center justify-center transition-opacity" :class="selectedItems.has(item.id) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'">
                                <span v-if="selectedItems.has(item.id)" class="material-icons text-indigo-600 text-lg">check_box</span>
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
                                            <div class="h-full bg-indigo-600" :style="{ width: `${item.progress_percentage}%` }"></div>
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
                                                {{ formatTime(item.watched_at) }}
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

                <!-- Loading More Indicator -->
                <div v-if="hasMoreItems" class="flex items-center justify-center py-8">
                    <div v-if="loadingMore" class="animate-spin rounded-full h-8 w-8 border-4 border-indigo-600 border-t-transparent"></div>
                    <button v-else @click="loadMore" class="px-6 py-3 bg-white dark:bg-gray-800 text-indigo-600 dark:text-indigo-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors font-medium">載入更多</button>
                </div>
            </div>
        </div>

        <!-- Delete Confirmation Modal -->
        <transition name="fade">
            <div v-if="showDeleteConfirm" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
                <div class="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full p-6">
                    <div class="flex items-center gap-3 mb-4">
                        <span class="material-icons text-red-500 text-3xl">warning</span>
                        <h3 class="text-xl font-bold text-gray-900 dark:text-gray-100">確認刪除</h3>
                    </div>
                    <p class="text-gray-600 dark:text-gray-400 mb-6">確定要刪除 {{ selectedItems.size }} 個觀看紀錄嗎？此操作無法復原。</p>
                    <div class="flex gap-3 justify-end">
                        <button @click="showDeleteConfirm = false" class="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">取消</button>
                        <button @click="confirmDelete" class="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors">確認刪除</button>
                    </div>
                </div>
            </div>
        </transition>
    </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}
</style>
