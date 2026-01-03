<script setup>
const { showToast } = useToast()
const { searchHistory, userSettings, updateSetting, getDefaultShortcuts, getShortcuts, resetShortcuts, formatShortcutKey } = useUserSettings()
const appConfig = useAppConfig()
const client = useSupabaseClient()

const loading = ref(false)
const showDisableAccountModal = ref(false)
const showClearDataModal = ref(false)
const clearDataType = ref("") // 'history', 'favorites', 'search', 'all'
const showShortcutsModal = ref(false)
const editingShortcut = ref(null)
const waitingForKey = ref(false)
const shortcuts = computed(() => getShortcuts())
const defaultShortcuts = getDefaultShortcuts()

// Start editing a shortcut
function startEditShortcut(action) {
    editingShortcut.value = action
    waitingForKey.value = true
}

// Cancel editing
function cancelEditShortcut() {
    editingShortcut.value = null
    waitingForKey.value = false
}

// Handle key press for shortcut assignment
function handleKeyPress(e) {
    if (!waitingForKey.value || !editingShortcut.value) return
    
    e.preventDefault()
    e.stopPropagation()
    
    // Ignore modifier keys alone
    if (['Control', 'Alt', 'Meta', 'OS'].includes(e.key)) {
        return
    }
    
    // Get the key value
    let keyValue = e.key
    
    // Handle special keys
    if (e.key === ' ') {
        keyValue = ' '
    } else if (e.key.startsWith('Arrow')) {
        keyValue = e.key
    } else if (e.key.length === 1) {
        keyValue = e.key.toLowerCase()
    }
    
    // Check for duplicates before saving
    const conflictingAction = checkDuplicateShortcut(editingShortcut.value, keyValue)
    if (conflictingAction) {
        const conflictingLabel = shortcuts.value[conflictingAction]?.label || conflictingAction
        showToast(`此快捷鍵已被「${conflictingLabel}」使用，請先更改該功能的快捷鍵`, "error")
        return
    }
    
    // Save the shortcut
    saveShortcut(editingShortcut.value, keyValue)
}

// Check if a shortcut key is already in use
function checkDuplicateShortcut(action, key) {
    const currentShortcuts = shortcuts.value
    
    // Check if the key is already used by another action
    for (const [actionKey, actionValue] of Object.entries(currentShortcuts)) {
        // Skip the current action being edited
        if (actionKey === action) continue
        
        // Get the key from the shortcut object
        const shortcutKey = typeof actionValue === 'string' ? actionValue : actionValue.key
        
        // Check if the key matches
        if (shortcutKey === key) {
            // Return the conflicting action name for better error message
            return actionKey
        }
    }
    
    return null // No duplicate
}

// Save a shortcut
async function saveShortcut(action, key) {
    const currentShortcuts = userSettings.value?.custom_shortcuts || {}
    const newShortcuts = { ...currentShortcuts, [action]: key }
    
    const success = await updateSetting('custom_shortcuts', newShortcuts)
    if (success) {
        editingShortcut.value = null
        waitingForKey.value = false
        showToast("快捷鍵已更新", "success")
    }
}

// Reset all shortcuts to defaults
async function resetAllShortcuts() {
    const success = await resetShortcuts()
    if (success) {
        showToast("快捷鍵已重置為預設值", "success")
    }
}


// Stats
const stats = ref({
    watchHistory: 0,
    favorites: 0,
    searchHistory: 0,
})

// Fetch user stats
async function fetchStats() {
    loading.value = true;
    try {
        const [historyRes, favoritesRes, searchRes] = await Promise.all([
            client.from("watch_history").select("id", { count: "exact", head: true }).eq("user_id", userSettings.value.id),
            client.from("favorites").select("id", { count: "exact", head: true }).eq("user_id", userSettings.value.id),
            client.from("search_history").select("id", { count: "exact", head: true }).eq("user_id", userSettings.value.id)
        ])

        stats.value.watchHistory = historyRes.count || 0
        stats.value.favorites = favoritesRes.count || 0
        stats.value.searchHistory = searchRes.count || 0
    } catch (err) {
        console.error("Failed to fetch stats:", err)
    } finally {
        loading.value = false
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
            const { error } = await client.from("watch_history").delete().eq("user_id", userSettings.value.id)
            if (error) throw error
            stats.value.watchHistory = 0
            showToast("觀看紀錄已清除", "success")
        } else if (type === "favorites") {
            const { error } = await client.from("favorites").delete().eq("user_id", userSettings.value.id)
            if (error) throw error
            stats.value.favorites = 0
            showToast("收藏已清除", "success")
        } else if (type === "search") {
            const { error } = await client.from("search_history").delete().eq("user_id", userSettings.value.id)
            if (error) throw error
            stats.value.searchHistory = 0
            searchHistory.value = []
            showToast("搜尋紀錄已清除", "success")
        } else if (type === "all") {
            await Promise.all([
                client.from("watch_history").delete().eq("user_id", userSettings.value.id),
                client.from("favorites").delete().eq("user_id", userSettings.value.id),
                client.from("search_history").delete().eq("user_id", userSettings.value.id)
            ])
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
// async function disableAccount() {
//     try {
//         // In a real app, you would call an API to disable the account
//         // For now, we'll just sign out the user
//         showToast("帳號停用功能開發中", "info")
//         showDisableAccountModal.value = false

//         // Optionally sign out
//         // await client.auth.signOut()
//         // navigateTo('/login')
//     } catch (err) {
//         console.error("Failed to disable account:", err)
//         showToast("停用失敗，請稍後再試", "error")
//     }
// }

onMounted(() => {
    fetchStats()
    if (showShortcutsModal.value) {
        window.addEventListener('keydown', handleKeyPress)
    }
})

onUnmounted(() => {
    window.removeEventListener('keydown', handleKeyPress)
})

watch(showShortcutsModal, (isOpen) => {
    if (isOpen) {
        window.addEventListener('keydown', handleKeyPress)
    } else {
        window.removeEventListener('keydown', handleKeyPress)
        cancelEditShortcut()
    }
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
                <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                    <div class="flex items-center gap-3 mb-6">
                        <span class="material-icons text-gray-600 dark:text-gray-400">privacy_tip</span>
                        <h3 class="text-xl font-semibold text-gray-900 dark:text-gray-100">隱私設定</h3>
                    </div>

                    <div class="space-y-6">
                        <div class="flex items-center justify-between py-3 border-b border-gray-200 dark:border-gray-700">
                            <div class="flex-1">
                                <h4 class="font-medium text-gray-900 dark:text-gray-100 mb-1">觀看紀錄</h4>
                                <p class="text-sm text-gray-600 dark:text-gray-400">記錄你觀看的動漫和播放進度</p>
                            </div>
                            <button @click="updateSetting('watch_history_enabled', !userSettings.watch_history_enabled)" :class="userSettings.watch_history_enabled ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'" class="relative inline-flex h-8 w-14 flex-shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out">
                                <span :class="userSettings.watch_history_enabled ? 'translate-x-7' : 'translate-x-1'" class="pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out mt-1"></span>
                            </button>
                        </div>

                        <div class="flex items-center justify-between py-3">
                            <div class="flex-1">
                                <h4 class="font-medium text-gray-900 dark:text-gray-100 mb-1">搜尋記錄</h4>
                                <p class="text-sm text-gray-600 dark:text-gray-400">記錄你查詢的內容與探索足跡</p>
                            </div>
                            <button @click="updateSetting('search_history_enabled', !userSettings.search_history_enabled)" :class="userSettings.search_history_enabled ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'" class="relative inline-flex h-8 w-14 flex-shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out">
                                <span :class="userSettings.search_history_enabled ? 'translate-x-7' : 'translate-x-1'" class="pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out mt-1"></span>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Keyboard Shortcuts -->
                <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                    <div class="flex items-center justify-between mb-6">
                        <div class="flex items-center gap-3">
                            <span class="material-icons text-gray-600 dark:text-gray-400">keyboard</span>
                            <h3 class="text-xl font-semibold text-gray-900 dark:text-white">鍵盤快捷鍵</h3>
                        </div>
                        <button @click="showShortcutsModal = true" class="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium flex items-center gap-2">
                            <span class="material-icons text-lg">edit</span>
                            自訂快捷鍵
                        </button>
                    </div>
                    <p class="text-sm text-gray-600 dark:text-gray-400">自訂影片播放器的鍵盤快捷鍵以符合你的使用習慣</p>
                </div>

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

        <!-- Shortcuts Customization Modal -->
        <BaseModal :show="showShortcutsModal" title="自訂快捷鍵" icon="keyboard" icon-color="text-indigo-500" max-width="max-w-3xl" @close="showShortcutsModal = false">
            <div class="space-y-4">
                <div v-if="waitingForKey && editingShortcut" class="mb-4 p-4 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg">
                    <p class="text-sm text-indigo-700 dark:text-indigo-300 font-medium">
                        請按下你想要設定的按鍵...
                    </p>
                    <p class="text-xs text-indigo-600 dark:text-indigo-400 mt-1">
                        正在設定：{{ shortcuts[editingShortcut]?.label || editingShortcut }}
                    </p>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto p-1">
                    <div v-for="action in Object.keys(shortcuts)" :key="action" 
                        class="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                        :class="{ 'ring-2 ring-indigo-500': editingShortcut === action }">
                        <div class="flex-1">
                            <p class="text-sm font-medium text-gray-900 dark:text-gray-100">{{ shortcuts[action]?.label || action }}</p>
                            <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                預設: <kbd class="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs">{{ formatShortcutKey(defaultShortcuts[action]?.key || defaultShortcuts[action]) }}</kbd>
                            </p>
                        </div>
                        <div class="flex items-center gap-2">
                            <kbd class="px-2 py-1 text-xs font-semibold text-gray-800 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded">
                                {{ formatShortcutKey(shortcuts[action]?.key || shortcuts[action]) }}
                            </kbd>
                            <button @click="editingShortcut === action ? cancelEditShortcut() : startEditShortcut(action)" 
                                class="px-2 py-1 text-xs text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded transition-colors">
                                {{ editingShortcut === action ? '取消' : '編輯' }}
                            </button>
                        </div>
                    </div>
                </div>

                <div class="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
                    <button @click="resetAllShortcuts" 
                        class="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
                        重置為預設值
                    </button>
                    <p class="text-xs text-gray-500 dark:text-gray-400">
                        提示：點擊「編輯」後按下你想要設定的按鍵
                    </p>
                </div>
            </div>

            <template #actions>
                <button @click="showShortcutsModal = false" class="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">關閉</button>
            </template>
        </BaseModal>
    </div>
</template>
