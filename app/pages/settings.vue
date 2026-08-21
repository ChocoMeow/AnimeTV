<script setup>
const { showToast } = useToast()
const { searchHistory, userSettings, updateSetting, getDefaultShortcuts, getShortcuts, resetShortcuts, formatShortcutKey } = useUserSettings()
const { theme, setTheme } = useTheme()
const { speechLang, setSpeechLang, options: speechLangOptions } = useSpeechLang()
const appConfig = useAppConfig()
const client = useSupabaseClient()

function onSpeechLangChange(value) {
    if (value === speechLang.value) return
    setSpeechLang(value)
    showToast('語音語言已更新', 'success')
}

const loading = ref(false)
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


// Stats (used for Data Management buttons)
const stats = ref({
    watchHistory: 0,
    favorites: 0,
    searchHistory: 0,
})

// Fetch user stats (counts for clear buttons)
async function fetchStats() {
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

onMounted(async () => {
    loading.value = true
    try {
        await fetchStats()
    } finally {
        loading.value = false
    }
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
    title: `帳號設定 | ${appConfig.siteName}`,
})
</script>

<template>
    <div class="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 py-6 sm:py-8">
        <!-- Header -->
        <div class="mb-6 sm:mb-8">
            <h1 class="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 dark:text-white mb-2">帳號設定</h1>
            <p class="text-gray-600 dark:text-gray-400">管理你的帳號偏好、隱私與資料</p>
        </div>

        <div v-if="loading" class="flex items-center justify-center py-20">
            <LoadingSpinner size="xl" />
        </div>

        <div v-else class="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5 items-start">
            <!-- contents on mobile so order matches desktop zigzag; columns on lg keep independent heights -->
            <div class="contents gap-4 sm:gap-5 lg:flex lg:flex-col">
                <!-- Appearance (Theme) -->
                <div class="settings-panel order-1">
                    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div>
                            <div class="flex items-center gap-3 mb-1">
                                <span class="material-symbols-rounded text-gray-500 dark:text-gray-400">palette</span>
                                <h3 class="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">外觀</h3>
                            </div>
                            <p class="text-sm text-gray-600 dark:text-gray-400">選擇淺色、深色或跟隨系統主題</p>
                        </div>
                        <div class="flex flex-wrap gap-2 sm:justify-end">
                            <button
                                v-for="opt in [{ value: 'light', label: '淺色', icon: 'light_mode' }, { value: 'dark', label: '深色', icon: 'dark_mode' }, { value: 'system', label: '跟隨系統', icon: 'settings_brightness' }]"
                                :key="opt.value"
                                @click="setTheme(opt.value)"
                                :class="['pill-tab', theme === opt.value ? 'pill-tab-active' : 'pill-tab-inactive']"
                            >
                                <span class="material-symbols-rounded text-lg">{{ opt.icon }}</span>
                                {{ opt.label }}
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Keyboard Shortcuts -->
                <div class="settings-panel order-3">
                    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div>
                            <div class="flex items-center gap-3 mb-1">
                                <span class="material-symbols-rounded text-gray-500 dark:text-gray-400">keyboard</span>
                                <h3 class="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">鍵盤快捷鍵</h3>
                            </div>
                            <p class="text-sm text-gray-600 dark:text-gray-400">調整影片播放器的鍵盤快捷鍵</p>
                        </div>
                        <button type="button" @click="showShortcutsModal = true" class="pill-tab pill-tab-inactive sm:justify-end">
                            <span class="material-symbols-rounded text-lg">edit</span>
                            自訂
                        </button>
                    </div>
                </div>

                <!-- Data Management -->
                <div class="settings-panel order-5">
                    <div class="flex items-center gap-3 mb-5 sm:mb-6">
                        <span class="material-symbols-rounded text-gray-500 dark:text-gray-400">storage</span>
                        <h3 class="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">資料管理</h3>
                    </div>

                    <div class="divide-y divide-black/5 dark:divide-white/10">
                        <div class="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                            <div>
                                <h4 class="font-medium text-gray-900 dark:text-gray-100">觀看紀錄</h4>
                                <p class="text-sm text-gray-600 dark:text-gray-400">清除所有觀看紀錄</p>
                            </div>
                            <button @click="openClearDataModal('history')" :disabled="stats.watchHistory === 0" class="btn-danger-outline">清除</button>
                        </div>

                        <div class="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                            <div>
                                <h4 class="font-medium text-gray-900 dark:text-gray-100">收藏列表</h4>
                                <p class="text-sm text-gray-600 dark:text-gray-400">清除所有收藏的動漫</p>
                            </div>
                            <button @click="openClearDataModal('favorites')" :disabled="stats.favorites === 0" class="btn-danger-outline">清除</button>
                        </div>

                        <div class="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                            <div>
                                <h4 class="font-medium text-gray-900 dark:text-gray-100">搜尋紀錄</h4>
                                <p class="text-sm text-gray-600 dark:text-gray-400">清除所有搜尋歷史</p>
                            </div>
                            <button @click="openClearDataModal('search')" :disabled="stats.searchHistory === 0" class="btn-danger-outline">清除</button>
                        </div>

                        <div class="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                            <div>
                                <h4 class="font-medium text-gray-900 dark:text-gray-100">所有資料</h4>
                                <p class="text-sm text-gray-600 dark:text-gray-400">清除所有個人資料</p>
                            </div>
                            <button @click="openClearDataModal('all')" class="btn-danger-outline">全部清除</button>
                        </div>
                    </div>
                </div>
            </div>

            <div class="contents gap-4 sm:gap-5 lg:flex lg:flex-col">
                <!-- Speech recognition language -->
                <div class="settings-panel order-2">
                    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div>
                            <div class="flex items-center gap-3 mb-1">
                                <span class="material-symbols-rounded text-gray-500 dark:text-gray-400">mic</span>
                                <h3 class="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">語音輸入語言</h3>
                            </div>
                            <p class="text-sm text-gray-600 dark:text-gray-400">搜尋列與 AI 助手語音辨識使用的語言</p>
                        </div>
                        <div class="w-full sm:w-56 shrink-0">
                            <Dropdown
                                :model-value="speechLang"
                                :options="speechLangOptions"
                                @update:model-value="onSpeechLangChange"
                            />
                        </div>
                    </div>
                </div>

                <!-- Privacy Settings -->
                <div class="settings-panel order-4">
                    <div class="flex items-center gap-3 mb-5 sm:mb-6">
                        <span class="material-symbols-rounded text-gray-500 dark:text-gray-400">privacy_tip</span>
                        <h3 class="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">隱私設定</h3>
                    </div>

                    <div class="divide-y divide-black/5 dark:divide-white/10">
                        <div class="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                            <div class="flex-1 pr-4">
                                <h4 class="font-medium text-gray-900 dark:text-gray-100 mb-1">觀看紀錄</h4>
                                <p class="text-sm text-gray-600 dark:text-gray-400">記錄你觀看的動漫和播放進度</p>
                            </div>
                            <button
                                @click="updateSetting('watch_history_enabled', !userSettings.watch_history_enabled)"
                                :class="userSettings.watch_history_enabled ? 'bg-gray-900 dark:bg-white' : 'bg-black/10 dark:bg-white/15'"
                                class="relative inline-flex h-8 w-14 flex-shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out"
                            >
                                <span
                                    :class="userSettings.watch_history_enabled ? 'translate-x-7' : 'translate-x-1'"
                                    class="pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white dark:bg-gray-950 shadow ring-0 transition duration-200 ease-in-out mt-1"
                                ></span>
                            </button>
                        </div>

                        <div class="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                            <div class="flex-1 pr-4">
                                <h4 class="font-medium text-gray-900 dark:text-gray-100 mb-1">搜尋記錄</h4>
                                <p class="text-sm text-gray-600 dark:text-gray-400">記錄你查詢的內容與探索足跡</p>
                            </div>
                            <button
                                @click="updateSetting('search_history_enabled', !userSettings.search_history_enabled)"
                                :class="userSettings.search_history_enabled ? 'bg-gray-900 dark:bg-white' : 'bg-black/10 dark:bg-white/15'"
                                class="relative inline-flex h-8 w-14 flex-shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out"
                            >
                                <span
                                    :class="userSettings.search_history_enabled ? 'translate-x-7' : 'translate-x-1'"
                                    class="pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white dark:bg-gray-950 shadow ring-0 transition duration-200 ease-in-out mt-1"
                                ></span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
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
            <button @click="showClearDataModal = false" class="btn-modal-cancel">取消</button>
            <button @click="clearData" class="btn-modal-danger">確認清除</button>
        </template>
    </BaseModal>

    <!-- Shortcuts Customization Modal -->
    <BaseModal :show="showShortcutsModal" title="自訂快捷鍵" icon="keyboard" icon-color="text-gray-500" max-width="max-w-3xl" @close="showShortcutsModal = false">
        <div class="space-y-4">
            <div v-if="waitingForKey && editingShortcut" class="mb-4 p-4 bg-black/5 dark:bg-white/10 rounded-xl">
                <p class="text-sm text-gray-700 dark:text-gray-300 font-medium">
                    請按下你想要設定的按鍵...
                </p>
                <p class="text-xs text-gray-600 dark:text-gray-400 mt-1">
                    正在設定：{{ shortcuts[editingShortcut]?.label || editingShortcut }}
                </p>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto p-1">
                <div v-for="action in Object.keys(shortcuts)" :key="action" 
                    class="flex items-center justify-between p-3 bg-black/[0.02] dark:bg-white/5 ring-1 ring-black/5 dark:ring-white/10 rounded-xl hover:ring-black/10 dark:hover:ring-white/20 transition-all"
                    :class="{ 'ring-2 ring-gray-900 dark:ring-white': editingShortcut === action }">
                    <div class="flex-1">
                        <p class="text-sm font-medium text-gray-900 dark:text-gray-100">{{ shortcuts[action]?.label || action }}</p>
                        <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            預設: <kbd class="px-1.5 py-0.5 bg-black/5 dark:bg-white/10 rounded text-xs">{{ formatShortcutKey(defaultShortcuts[action]?.key || defaultShortcuts[action]) }}</kbd>
                        </p>
                    </div>
                    <div class="flex items-center gap-2">
                        <kbd class="px-2 py-1 text-xs font-semibold text-gray-800 dark:text-gray-200 bg-black/5 dark:bg-white/10 border border-black/5 dark:border-white/10 rounded">
                            {{ formatShortcutKey(shortcuts[action]?.key || shortcuts[action]) }}
                        </kbd>
                        <button @click="editingShortcut === action ? cancelEditShortcut() : startEditShortcut(action)" 
                            class="px-2 py-1 text-xs text-gray-600 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/10 rounded transition-colors">
                            {{ editingShortcut === action ? '取消' : '編輯' }}
                        </button>
                    </div>
                </div>
            </div>

            <div class="flex items-center justify-between pt-4 border-t border-black/10 dark:border-white/10">
                <button @click="resetAllShortcuts" 
                    class="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 rounded-lg transition-colors">
                    重置為預設值
                </button>
                <p class="text-xs text-gray-500 dark:text-gray-400">
                    提示：點擊「編輯」後按下你想要設定的按鍵
                </p>
            </div>
        </div>

        <template #actions>
            <button @click="showShortcutsModal = false" class="btn-modal-cancel">關閉</button>
        </template>
    </BaseModal>
</template>

<style scoped>
.settings-panel {
    @apply bg-black/[0.02] dark:bg-white/5 rounded-2xl ring-1 ring-black/5 dark:ring-white/10 p-5 sm:p-6;
}

.pill-tab {
    @apply h-10 px-4 rounded-full text-sm font-medium leading-none transition-colors inline-flex items-center justify-center gap-2 shrink-0;
}

.pill-tab-inactive {
    @apply bg-black/5 dark:bg-white/10 text-gray-700 dark:text-gray-300 hover:bg-black/10 dark:hover:bg-white/20;
}

.pill-tab-active {
    @apply bg-gray-900 dark:bg-white text-white dark:text-black shadow-md;
}

.btn-danger-outline {
    @apply h-10 px-4 inline-flex items-center justify-center shrink-0 bg-red-500/10 text-red-600 dark:text-red-400 rounded-full text-sm font-medium leading-none hover:bg-red-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed;
}
</style>

