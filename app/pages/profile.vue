<script setup>
const { showToast } = useToast()
const appConfig = useAppConfig()
const client = useSupabaseClient()
const user = useSupabaseUser()

const loading = ref(false)
const saving = ref(false)
const showDisableAccountModal = ref(false)
const showClearDataModal = ref(false)
const clearDataType = ref("") // 'history', 'favorites', 'search', 'all'

// User settings
const settings = ref({
    watch_history_enabled: true,
    notifications_enabled: true,
})

// Stats
const stats = ref({
    watchHistory: 0,
    favorites: 0,
    searchHistory: 0,
})

// Fetch user settings
async function fetchSettings() {
    loading.value = true
    try {
        const { data, error } = await client.from("user_settings").select("*").eq("user_id", user.value.sub).single()

        if (error && error.code !== "PGRST116") {
            throw error
        }

        if (data) {
            settings.value = {
                watch_history_enabled: data.watch_history_enabled ?? true,
                notifications_enabled: data.notifications_enabled ?? true,
            }
        } else {
            // Create default settings if not exists
            await createDefaultSettings()
        }
    } catch (err) {
        console.error("Failed to fetch settings:", err)
    } finally {
        loading.value = false
    }
}

// Create default settings
async function createDefaultSettings() {
    try {
        const { error } = await client.from("user_settings").insert({
            user_id: user.value.sub,
            watch_history_enabled: true,
            notifications_enabled: true,
        })

        if (error) throw error
    } catch (err) {
        console.error("Failed to create default settings:", err)
    }
}

// Save settings
async function saveSettings() {
    saving.value = true
    try {
        const { error } = await client.from("user_settings").upsert({
            user_id: user.value.sub,
            watch_history_enabled: settings.value.watch_history_enabled,
            notifications_enabled: settings.value.notifications_enabled,
            updated_at: new Date().toISOString(),
        })

        if (error) throw error

        // Show success message
        showToast("設定已儲存", "success")
    } catch (err) {
        console.error("Failed to save settings:", err)
        showToast("儲存失敗，請稍後再試", "error")
    } finally {
        saving.value = false
    }
}

// Fetch user stats
async function fetchStats() {
    try {
        const [historyRes, favoritesRes, searchRes] = await Promise.all([client.from("watch_history").select("id", { count: "exact", head: true }).eq("user_id", user.value.sub), client.from("favorites").select("id", { count: "exact", head: true }).eq("user_id", user.value.sub), client.from("search_history").select("id", { count: "exact", head: true }).eq("user_id", user.value.sub)])

        stats.value.watchHistory = historyRes.count || 0
        stats.value.favorites = favoritesRes.count || 0
        stats.value.searchHistory = searchRes.count || 0
    } catch (err) {
        console.error("Failed to fetch stats:", err)
    }
}

// Open clear data modal
function openClearDataModal(type) {
    clearDataType.value = type
    showClearDataModal.value = true
}

// Clear user data
async function clearData() {
    try {
        const type = clearDataType.value

        if (type === "history") {
            const { error } = await client.from("watch_history").delete().eq("user_id", user.value.sub)
            if (error) throw error
            stats.value.watchHistory = 0
            showToast("觀看紀錄已清除", "success")
        } else if (type === "favorites") {
            const { error } = await client.from("favorites").delete().eq("user_id", user.value.sub)
            if (error) throw error
            stats.value.favorites = 0
            showToast("收藏已清除", "success")
        } else if (type === "search") {
            const { error } = await client.from("search_history").delete().eq("user_id", user.value.sub)
            if (error) throw error
            stats.value.searchHistory = 0
            showToast("搜尋紀錄已清除", "success")
        } else if (type === "all") {
            await Promise.all([client.from("watch_history").delete().eq("user_id", user.value.sub), client.from("favorites").delete().eq("user_id", user.value.sub), client.from("search_history").delete().eq("user_id", user.value.sub)])
            stats.value = { watchHistory: 0, favorites: 0, searchHistory: 0 }
            showToast("所有資料已清除", "success")
        }

        showClearDataModal.value = false
    } catch (err) {
        console.error("Failed to clear data:", err)
        showToast("清除失敗，請稍後再試", "error")
    }
}

// Disable account
async function disableAccount() {
    try {
        // In a real app, you would call an API to disable the account
        // For now, we'll just sign out the user
        showToast("帳號停用功能開發中", "info")
        showDisableAccountModal.value = false

        // Optionally sign out
        // await client.auth.signOut()
        // navigateTo('/auth/login')
    } catch (err) {
        console.error("Failed to disable account:", err)
        showToast("停用失敗，請稍後再試", "error")
    }
}

// Watch settings changes
watch(
    () => settings.value.watch_history_enabled,
    (newVal) => {
        if (!newVal && stats.value.watchHistory > 0) {
            // Optionally prompt to clear history when disabling
        }
    }
)

onMounted(() => {
    fetchSettings()
    fetchStats()
})

useHead({
    title: `個人設定 | ${appConfig.siteName}`,
})
</script>

<template>
    <div class="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div class="max-w-7xl mx-auto px-4 py-6">
            <!-- Header -->
            <div class="mb-8">
                <h1 class="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">個人設定</h1>
                <p class="text-gray-600 dark:text-gray-400">管理你的帳號設定和偏好</p>
            </div>

            <!-- Loading State -->
            <div v-if="loading" class="flex items-center justify-center py-20">
                <div class="animate-spin rounded-full h-12 w-12 border-4 border-indigo-600 border-t-transparent"></div>
            </div>

            <div v-else class="space-y-6">
                <!-- Stats Cards -->
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                        <div class="flex items-center gap-3">
                            <div class="w-12 h-12 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                                <span class="material-icons text-indigo-600 dark:text-indigo-400">history</span>
                            </div>
                            <div>
                                <p class="text-2xl font-bold text-gray-900 dark:text-gray-100">{{ stats.watchHistory }}</p>
                                <p class="text-sm text-gray-600 dark:text-gray-400">觀看紀錄</p>
                            </div>
                        </div>
                    </div>

                    <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                        <div class="flex items-center gap-3">
                            <div class="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                                <span class="material-icons text-red-600 dark:text-red-400">favorite</span>
                            </div>
                            <div>
                                <p class="text-2xl font-bold text-gray-900 dark:text-gray-100">{{ stats.favorites }}</p>
                                <p class="text-sm text-gray-600 dark:text-gray-400">我的收藏</p>
                            </div>
                        </div>
                    </div>

                    <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                        <div class="flex items-center gap-3">
                            <div class="w-12 h-12 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                                <span class="material-icons text-purple-600 dark:text-purple-400">search</span>
                            </div>
                            <div>
                                <p class="text-2xl font-bold text-gray-900 dark:text-gray-100">{{ stats.searchHistory }}</p>
                                <p class="text-sm text-gray-600 dark:text-gray-400">搜尋紀錄</p>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Privacy Settings -->
                <!-- <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                    <div class="flex items-center gap-3 mb-6">
                        <span class="material-icons text-gray-600 dark:text-gray-400">privacy_tip</span>
                        <h3 class="text-xl font-semibold text-gray-900 dark:text-gray-100">隱私設定</h3>
                    </div>

                    <div class="space-y-6">
                        <div class="flex items-center justify-between py-3 border-b border-gray-200 dark:border-gray-700">
                            <div class="flex-1">
                                <h4 class="font-medium text-gray-900 dark:text-gray-100 mb-1">啟用觀看紀錄</h4>
                                <p class="text-sm text-gray-600 dark:text-gray-400">記錄你觀看的動漫和播放進度</p>
                            </div>
                            <button
                                @click="
                                    settings.watch_history_enabled = !settings.watch_history_enabled; saveSettings()
                                "
                                :class="settings.watch_history_enabled ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'"
                                class="relative inline-flex h-8 w-14 flex-shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out"
                            >
                                <span :class="settings.watch_history_enabled ? 'translate-x-7' : 'translate-x-1'" class="pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out mt-1"></span>
                            </button>
                        </div>

                        <div class="flex items-center justify-between py-3">
                            <div class="flex-1">
                                <h4 class="font-medium text-gray-900 dark:text-gray-100 mb-1">通知提醒</h4>
                                <p class="text-sm text-gray-600 dark:text-gray-400">接收新動漫和更新通知</p>
                            </div>
                            <button
                                @click="
                                    settings.notifications_enabled = !settings.notifications_enabled; saveSettings()
                                "
                                :class="settings.notifications_enabled ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'"
                                class="relative inline-flex h-8 w-14 flex-shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out"
                            >
                                <span :class="settings.notifications_enabled ? 'translate-x-7' : 'translate-x-1'" class="pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out mt-1"></span>
                            </button>
                        </div>
                    </div>
                </div> -->

                <!-- Data Management -->
                <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                    <div class="flex items-center gap-3 mb-6">
                        <span class="material-icons text-gray-600 dark:text-gray-400">storage</span>
                        <h3 class="text-xl font-semibold text-gray-900 dark:text-gray-100">資料管理</h3>
                    </div>

                    <div class="space-y-4">
                        <div class="flex items-center justify-between py-3 border-b border-gray-200 dark:border-gray-700">
                            <div>
                                <h4 class="font-medium text-gray-900 dark:text-gray-100">觀看紀錄</h4>
                                <p class="text-sm text-gray-600 dark:text-gray-400">清除所有觀看紀錄</p>
                            </div>
                            <button @click="openClearDataModal('history')" :disabled="stats.watchHistory === 0" class="px-4 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium">清除</button>
                        </div>

                        <div class="flex items-center justify-between py-3 border-b border-gray-200 dark:border-gray-700">
                            <div>
                                <h4 class="font-medium text-gray-900 dark:text-gray-100">收藏列表</h4>
                                <p class="text-sm text-gray-600 dark:text-gray-400">清除所有收藏的動漫</p>
                            </div>
                            <button @click="openClearDataModal('favorites')" :disabled="stats.favorites === 0" class="px-4 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium">清除</button>
                        </div>

                        <div class="flex items-center justify-between py-3 border-b border-gray-200 dark:border-gray-700">
                            <div>
                                <h4 class="font-medium text-gray-900 dark:text-gray-100">搜尋紀錄</h4>
                                <p class="text-sm text-gray-600 dark:text-gray-400">清除所有搜尋歷史</p>
                            </div>
                            <button @click="openClearDataModal('search')" :disabled="stats.searchHistory === 0" class="px-4 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium">清除</button>
                        </div>

                        <div class="flex items-center justify-between py-3">
                            <div>
                                <h4 class="font-medium text-gray-900 dark:text-gray-100">所有資料</h4>
                                <p class="text-sm text-gray-600 dark:text-gray-400">清除所有個人資料</p>
                            </div>
                            <button @click="openClearDataModal('all')" class="px-4 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors font-medium">全部清除</button>
                        </div>
                    </div>
                </div>

                <!-- Danger Zone -->
                <!-- <div class="bg-red-50 dark:bg-red-900/10 rounded-xl border-2 border-red-200 dark:border-red-900/30 p-6">
                    <div class="flex items-center gap-3 mb-6">
                        <span class="material-icons text-red-600 dark:text-red-400">warning</span>
                        <h3 class="text-xl font-semibold text-red-900 dark:text-red-400">危險區域</h3>
                    </div>

                    <div class="space-y-4">
                        <div class="flex items-center justify-between">
                            <div>
                                <h4 class="font-medium text-red-900 dark:text-red-400">停用帳號</h4>
                                <p class="text-sm text-red-700 dark:text-red-500">暫時停用你的帳號</p>
                            </div>
                            <button @click="showDisableAccountModal = true" class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium">停用帳號</button>
                        </div>
                    </div>
                </div> -->
            </div>
        </div>

        <!-- Clear Data Confirmation Modal -->
        <BaseModal :show="showClearDataModal" title="確認清除" icon="warning" icon-color="text-red-500" @close="showClearDataModal = false">
            <p class="text-gray-600 dark:text-gray-400 mb-6">
                <span v-if="clearDataType === 'history'">確定要清除所有觀看紀錄嗎？</span>
                <span v-else-if="clearDataType === 'favorites'">確定要清除所有收藏嗎？</span>
                <span v-else-if="clearDataType === 'search'">確定要清除所有搜尋紀錄嗎？</span>
                <span v-else>確定要清除所有個人資料嗎？包括觀看紀錄、收藏和搜尋紀錄。</span>
                此操作無法復原。
            </p>

            <template #actions>
                <button @click="showClearDataModal = false" class="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">取消</button>
                <button @click="clearData" class="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors">確認清除</button>
            </template>
        </BaseModal>

        <!-- Disable Account Modal -->
        <BaseModal :show="showDisableAccountModal" title="停用帳號" icon="error" icon-color="text-red-500" @close="showDisableAccountModal = false">
            <p class="text-gray-600 dark:text-gray-400 mb-6">停用帳號後，你將無法登入和使用服務。你可以隨時重新啟用帳號。確定要繼續嗎？</p>

            <template #actions>
                <button @click="showDisableAccountModal = false" class="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">取消</button>
                <button @click="disableAccount" class="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors">確認停用</button>
            </template>
        </BaseModal>
    </div>
</template>
