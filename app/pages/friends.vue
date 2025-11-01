<script setup>
const appConfig = useAppConfig()
const { userSettings } = useUserSettings()
const userId = computed(() => userSettings.value?.id || null)

// Use the friends composable
const { friends, pendingRequests, loading, error, searchUsers: searchUsersFromComposable, sendFriendRequest, acceptFriendRequest, rejectFriendRequest, removeFriend, blockUser, unblockUser, fetchBlockedUsers, refresh } = useFriends(userId)

// Use toast
const { showToast } = useToast()

// UI State
const activeTab = ref("friends")
const searchQuery = ref("")
const searchResults = ref([])
const searchLoading = ref(false)
const openDropdown = ref(null)
const blockedUsers = ref([])
const blockedLoading = ref(false)

let searchTimeout = null

// Toggle dropdown
const toggleDropdown = (friendId) => {
    openDropdown.value = openDropdown.value === friendId ? null : friendId
}

// Close dropdown when clicking outside
if (import.meta.client) {
    onMounted(() => {
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.friend-dropdown')) {
                openDropdown.value = null
            }
        })
    })
}

// Computed for incoming/outgoing requests
const incomingRequests = computed(() => {
    if (!userId.value) return []
    // Incoming = requests where someone ELSE sent to me (requester is NOT me)
    return pendingRequests.value.filter((req) => req.requester_id !== userId.value)
})

const outgoingRequests = computed(() => {
    if (!userId.value) return []
    // Outgoing = requests where I am the requester
    return pendingRequests.value.filter((req) => req.requester_id === userId.value)
})

// Get all user IDs that have any relationship (friends or pending)
const relatedUserIds = computed(() => {
    const ids = new Set()
    
    // Add all friend IDs
    friends.value.forEach(f => ids.add(f.id))
    
    // Add all pending request IDs (both incoming and outgoing)
    pendingRequests.value.forEach(req => {
        if (req.requester_id !== userId.value) {
            ids.add(req.requester_id)
        }
        if (req.user_id !== userId.value) {
            ids.add(req.user_id)
        }
        if (req.friend_id !== userId.value) {
            ids.add(req.friend_id)
        }
    })
    
    return ids
})

// Check if a user has a pending request
const isPending = (targetUserId) => {
    return pendingRequests.value.some(req => 
        (req.user_id === targetUserId || req.friend_id === targetUserId) &&
        (req.user_id === userId.value || req.friend_id === userId.value)
    )
}
// Search users
async function searchUsers() {
    if (!searchQuery.value || searchQuery.value.length < 2) {
        searchResults.value = []
        return
    }

    searchLoading.value = true
    try {
        const users = await searchUsersFromComposable(searchQuery.value)

        // Don't filter - show all users but mark those with pending requests
        searchResults.value = (users || [])
            .filter((user) => user.id !== userId.value && !relatedUserIds.value.has(user.id))
            .map(user => ({
                ...user,
                hasPending: isPending(user.id)
            }))
    } catch (err) {
        console.error("Error searching users:", err)
        searchResults.value = []
    } finally {
        searchLoading.value = false
    }
}

async function cancelRequest(friendshipId) {
    await handleRejectRequest(friendshipId)
}

// Debounced search
function debouncedSearch() {
    if (searchTimeout) clearTimeout(searchTimeout)
    searchTimeout = setTimeout(searchUsers, 300)
}

// Send friend request handler
async function handleSendRequest(targetUserId) {
    const success = await sendFriendRequest(targetUserId)

    if (success) {
        // Remove from search results
        searchResults.value = searchResults.value.filter((u) => u.id !== targetUserId)

        // Show success message
        showToast("好友請求已發送", "success")
    } else if (error.value) {
        showToast(`發送失敗: ${error.value}`, "error")
    }
}

// Accept request handler
async function handleAcceptRequest(friendshipId) {
    const success = await acceptFriendRequest(friendshipId)

    if (success) {
        showToast("已接受好友請求", "success")
    } else if (error.value) {
        showToast(`操作失敗: ${error.value}`, "error")
    }
}

// Reject request handler
async function handleRejectRequest(friendshipId) {
    const success = await rejectFriendRequest(friendshipId)

    if (success) {
        showToast("已拒絕好友請求", "success")
    } else if (error.value) {
        showToast(`操作失敗: ${error.value}`, "error")
    }
}

// Remove friend handler
async function handleRemoveFriend(friendshipId, friendName) {
    if (!confirm(`確定要移除 ${friendName} 嗎？`)) return

    const success = await removeFriend(friendshipId)

    if (success) {
        showToast("已移除好友", "success")
        openDropdown.value = null
    } else if (error.value) {
        showToast(`操作失敗: ${error.value}`, "error")
    }
}

// Block user handler
async function handleBlockUser(friendId, friendName) {
    if (!confirm(`確定要封鎖 ${friendName} 嗎？封鎖後您們將無法看到彼此的動態。`)) return

    const success = await blockUser(friendId)

    if (success) {
        showToast(`已封鎖 ${friendName}`, "success")
        openDropdown.value = null
        // Refresh blocked list if on that tab
        if (activeTab.value === 'blocked') {
            await loadBlockedUsers()
        }
    } else if (error.value) {
        showToast(`操作失敗: ${error.value}`, "error")
    }
}

// Unblock user handler
async function handleUnblockUser(userId, userName) {
    if (!confirm(`確定要解除封鎖 ${userName} 嗎？`)) return

    const success = await unblockUser(userId)

    if (success) {
        showToast(`已解除封鎖 ${userName}`, "success")
        await loadBlockedUsers()
    } else if (error.value) {
        showToast(`操作失敗: ${error.value}`, "error")
    }
}

// Load blocked users
async function loadBlockedUsers() {
    blockedLoading.value = true
    try {
        blockedUsers.value = await fetchBlockedUsers()
    } catch (err) {
        console.error('Error loading blocked users:', err)
        showToast('無法載入封鎖列表', 'error')
    } finally {
        blockedLoading.value = false
    }
}

// Watch search query
watch(searchQuery, debouncedSearch)

// Watch active tab for refresh
watch(activeTab, async (newTab) => {
    if (newTab === "friends" || newTab === "requests") {
        refresh()
    } else if (newTab === "blocked") {
        await loadBlockedUsers()
    }
})

useHead({ title: `好友管理 | ${appConfig.siteName}` })

// Cleanup
onUnmounted(() => {
    if (searchTimeout) clearTimeout(searchTimeout)
})
</script>

<template>
    <div class="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div class="max-w-7xl mx-auto px-4 py-6">
            <!-- Header -->
            <div class="mb-8">
                <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-2">好友管理</h1>
                <p class="text-gray-600 dark:text-gray-400">管理您的好友和好友請求</p>
            </div>

            <!-- Tabs -->
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm mb-6">
                <div class="grid grid-cols-2 md:grid-cols-4 border-b border-gray-200 dark:border-gray-700">
                    <button @click="activeTab = 'friends'" :class="['px-4 md:px-6 py-4 text-sm font-medium transition-colors relative', activeTab === 'friends' ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200']">
                        <span class="flex items-center justify-center gap-2">
                            <span class="material-icons text-xl">group</span>
                            <span class="hidden md:inline">我的好友</span>
                            <span class="md:hidden">好友</span>
                            <span v-if="friends.length" class="ml-1 px-2 py-0.5 text-xs bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-full">
                                {{ friends.length }}
                            </span>
                        </span>
                        <div v-if="activeTab === 'friends'" class="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 dark:bg-indigo-400"></div>
                    </button>

                    <button @click="activeTab = 'requests'" :class="['px-4 md:px-6 py-4 text-sm font-medium transition-colors relative', activeTab === 'requests' ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200']">
                        <span class="flex items-center justify-center gap-2">
                            <span class="material-icons text-xl">person_add</span>
                            <span class="hidden md:inline">好友請求</span>
                            <span class="md:hidden">請求</span>
                            <span v-if="incomingRequests.length" class="ml-1 px-2 py-0.5 text-xs bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full">
                                {{ incomingRequests.length }}
                            </span>
                        </span>
                        <div v-if="activeTab === 'requests'" class="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 dark:bg-indigo-400"></div>
                    </button>

                    <button @click="activeTab = 'search'" :class="['px-4 md:px-6 py-4 text-sm font-medium transition-colors relative', activeTab === 'search' ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200']">
                        <span class="flex items-center justify-center gap-2">
                            <span class="material-icons text-xl">search</span>
                            <span class="hidden md:inline">搜尋用戶</span>
                            <span class="md:hidden">搜尋</span>
                        </span>
                        <div v-if="activeTab === 'search'" class="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 dark:bg-indigo-400"></div>
                    </button>

                    <button @click="activeTab = 'blocked'" :class="['px-4 md:px-6 py-4 text-sm font-medium transition-colors relative', activeTab === 'blocked' ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200']">
                        <span class="flex items-center justify-center gap-2">
                            <span class="material-icons text-xl">block</span>
                            <span class="hidden md:inline">已封鎖</span>
                            <span class="md:hidden">封鎖</span>
                            <span v-if="blockedUsers.length" class="ml-1 px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-full">
                                {{ blockedUsers.length }}
                            </span>
                        </span>
                        <div v-if="activeTab === 'blocked'" class="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 dark:bg-indigo-400"></div>
                    </button>
                </div>
            </div>

            <!-- Friends Tab -->
            <div v-if="activeTab === 'friends'" class="space-y-4">
                <div v-if="loading" class="text-center py-12">
                    <div class="animate-spin rounded-full h-12 w-12 border-4 border-indigo-600 border-t-transparent mx-auto"></div>
                </div>

                <div v-else-if="friends.length === 0" class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-12 text-center">
                    <span class="material-icons text-6xl text-gray-400 mb-4">group</span>
                    <p class="text-gray-600 dark:text-gray-400 text-lg mb-2">還沒有好友</p>
                    <p class="text-gray-500 dark:text-gray-500 text-sm mb-4">開始搜尋並新增您的第一位好友吧！</p>
                    <button @click="activeTab = 'search'" class="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors">搜尋用戶</button>
                </div>

                <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <!-- In Friends Tab, replace the friend card section: -->
                    <div v-for="friend in friends" :key="friend.id" class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 hover:shadow-md transition-shadow">
                        <div class="flex items-center gap-4">
                            <img v-if="friend.avatar" :src="friend.avatar" :alt="friend.name" class="w-16 h-16 rounded-full object-cover border-2 border-gray-200 dark:border-gray-700" />
                            <div v-else class="w-16 h-16 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-xl">
                                {{ friend.name?.[0]?.toUpperCase() || "?" }}
                            </div>

                            <div class="flex-1 min-w-0">
                                <h3 class="font-semibold text-gray-900 dark:text-white truncate">{{ friend.name }}</h3>
                                <div class="flex items-center gap-2 mt-1">
                                    <span
                                        class="w-2 h-2 rounded-full"
                                        :class="{
                                            'bg-green-500': friend.status === 'watching' || friend.status === 'online',
                                            'bg-yellow-500': friend.status === 'idle',
                                            'bg-gray-400': friend.status === 'offline',
                                        }"
                                    ></span>
                                    <p class="text-sm text-gray-600 dark:text-gray-400">
                                        {{ friend.status === "watching" ? "正在觀看" : friend.status === "online" ? "線上" : friend.status === "idle" ? "閒置" : "離線" }}
                                    </p>
                                </div>
                            </div>

                            <!-- Dropdown menu -->
                            <div class="relative friend-dropdown">
                                <button @click.stop="toggleDropdown(friend.id)" class="p-2 text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700 rounded-lg transition-colors" title="更多選項">
                                    <span class="material-icons">more_vert</span>
                                </button>

                                <!-- Dropdown content -->
                                <transition name="dropdown">
                                    <div v-if="openDropdown === friend.id" class="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-10">
                                        <button @click="handleRemoveFriend(friend.friendshipId, friend.name)" class="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2">
                                            <span class="material-icons text-lg">person_remove</span>
                                            移除好友
                                        </button>
                                        <button @click="handleBlockUser(friend.id, friend.name)" class="w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2">
                                            <span class="material-icons text-lg">block</span>
                                            封鎖用戶
                                        </button>
                                    </div>
                                </transition>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Requests Tab -->
            <div v-if="activeTab === 'requests'" class="space-y-6">
                <!-- Incoming Requests -->
                <div>
                    <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">收到的請求</h2>

                    <div v-if="loading" class="text-center py-8">
                        <div class="animate-spin rounded-full h-12 w-12 border-4 border-indigo-600 border-t-transparent mx-auto"></div>
                    </div>

                    <div v-else-if="incomingRequests.length === 0" class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-8 text-center">
                        <span class="material-icons text-4xl text-gray-400 mb-2">inbox</span>
                        <p class="text-gray-600 dark:text-gray-400">沒有待處理的好友請求</p>
                    </div>

                    <div v-else class="space-y-3">
                        <div v-for="request in incomingRequests" :key="request.id" class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4">
                            <div class="flex items-center gap-4">
                                <img v-if="request.sender_avatar" :src="request.sender_avatar" :alt="request.sender_name" class="w-14 h-14 rounded-full object-cover border-2 border-gray-200 dark:border-gray-700" />
                                <div v-else class="w-14 h-14 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-lg">
                                    {{ request.sender_name?.[0]?.toUpperCase() || '?' }}
                                </div>

                                <div class="flex-1 min-w-0">
                                    <h3 class="font-semibold text-gray-900 dark:text-white truncate">{{ request.sender_name }}</h3>
                                </div>

                                <div class="flex gap-2">
                                    <button @click="handleAcceptRequest(request.id)" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors">接受</button>
                                    <button @click="handleRejectRequest(request.id)" class="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg transition-colors">拒絕</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Outgoing Requests -->
                <div>
                    <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">已發送的請求</h2>

                    <div v-if="outgoingRequests.length === 0" class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-8 text-center">
                        <span class="material-icons text-4xl text-gray-400 mb-2">send</span>
                        <p class="text-gray-600 dark:text-gray-400">沒有已發送的好友請求</p>
                    </div>

                    <div v-else class="space-y-3">
                        <div v-for="request in outgoingRequests" :key="request.id" class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4">
                            <div class="flex items-center gap-4">
                                <img v-if="request.receiver_avatar" :src="request.receiver_avatar" :alt="request.receiver_name" class="w-14 h-14 rounded-full object-cover border-2 border-gray-200 dark:border-gray-700" />
                                <div v-else class="w-14 h-14 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-lg">
                                    {{ request.receiver_name?.[0]?.toUpperCase() || '?' }}
                                </div>

                                <div class="flex-1 min-w-0">
                                    <h3 class="font-semibold text-gray-900 dark:text-white truncate">{{ request.receiver_name }}</h3>
                                    <p class="text-xs text-gray-500 dark:text-gray-500 mt-1">等待對方回應...</p>
                                </div>

                                <button @click="cancelRequest(request.id)" class="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg transition-colors">取消</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Search Tab -->
            <div v-if="activeTab === 'search'" class="space-y-4">
                <!-- Search Input -->
                <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
                    <div class="relative">
                        <span class="material-icons absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">search</span>
                        <input v-model="searchQuery" type="text" placeholder="搜尋用戶名稱..." class="w-full pl-12 pr-4 py-3 bg-gray-100 dark:bg-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-indigo-400 outline-none" />
                        <div v-if="searchLoading" class="absolute right-4 top-1/2 -translate-y-1/2">
                            <div class="animate-spin rounded-full h-5 w-5 border-2 border-indigo-600 border-t-transparent"></div>
                        </div>
                    </div>
                </div>

                <!-- Search Results -->
                <div v-if="searchQuery && searchResults.length === 0 && !searchLoading" class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-12 text-center">
                    <span class="material-icons text-6xl text-gray-400 mb-4">search_off</span>
                    <p class="text-gray-600 dark:text-gray-400">找不到符合「{{ searchQuery }}」的用戶</p>
                </div>

                <div v-else-if="searchResults.length > 0" class="space-y-3">
                    <div v-for="result in searchResults" :key="result.id" class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 hover:shadow-md transition-shadow">
                        <div class="flex items-center gap-4">
                            <img v-if="result.avatar" :src="result.avatar" :alt="result.name" class="w-14 h-14 rounded-full object-cover border-2 border-gray-200 dark:border-gray-700" />
                            <div v-else class="w-14 h-14 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-lg">
                                {{ result.name[0].toUpperCase() }}
                            </div>

                            <div class="flex-1 min-w-0">
                                <h3 class="font-semibold text-gray-900 dark:text-white truncate">{{ result.name }}</h3>
                            </div>

                            <button 
                                v-if="result.hasPending" 
                                disabled 
                                class="px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-400 text-sm font-medium rounded-lg cursor-not-allowed flex items-center gap-2"
                            >
                                <span class="material-icons text-sm">schedule</span>
                                等待回應
                            </button>
                            <button 
                                v-else 
                                @click="handleSendRequest(result.id)" 
                                class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
                            >
                                <span class="material-icons text-sm">person_add</span>
                                加為好友
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Blocked Tab -->
            <div v-if="activeTab === 'blocked'" class="space-y-4">
                <div v-if="blockedLoading" class="text-center py-12">
                    <div class="animate-spin rounded-full h-12 w-12 border-4 border-indigo-600 border-t-transparent mx-auto"></div>
                </div>

                <div v-else-if="blockedUsers.length === 0" class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-12 text-center">
                    <span class="material-icons text-6xl text-gray-400 mb-4">block</span>
                    <p class="text-gray-600 dark:text-gray-400 text-lg mb-2">沒有封鎖的用戶</p>
                    <p class="text-gray-500 dark:text-gray-500 text-sm">您目前沒有封鎖任何用戶</p>
                </div>

                <div v-else class="space-y-3">
                    <div class="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-4">
                        <div class="flex items-start gap-3">
                            <span class="material-icons text-yellow-600 dark:text-yellow-400">info</span>
                            <div class="flex-1">
                                <p class="text-sm text-yellow-800 dark:text-yellow-200 font-medium mb-1">關於封鎖</p>
                                <p class="text-xs text-yellow-700 dark:text-yellow-300">被封鎖的用戶無法向您發送好友請求，也看不到您的在線狀態和活動。</p>
                            </div>
                        </div>
                    </div>

                    <div v-for="blockedUser in blockedUsers" :key="blockedUser.id" class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4">
                        <div class="flex items-center gap-4">
                            <img v-if="blockedUser.avatar" :src="blockedUser.avatar" :alt="blockedUser.name" class="w-14 h-14 rounded-full object-cover border-2 border-gray-200 dark:border-gray-700 grayscale" />
                            <div v-else class="w-14 h-14 rounded-full bg-gray-500 flex items-center justify-center text-white font-bold text-lg grayscale">
                                {{ blockedUser.name[0].toUpperCase() }}
                            </div>

                            <div class="flex-1 min-w-0">
                                <h3 class="font-semibold text-gray-900 dark:text-white truncate">{{ blockedUser.name }}</h3>
                                <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                    <span class="material-icons text-xs align-middle">block</span>
                                    已封鎖
                                </p>
                            </div>

                            <button @click="handleUnblockUser(blockedUser.id, blockedUser.name)" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2">
                                <span class="material-icons text-sm">check_circle</span>
                                解除封鎖
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
/* Add smooth transitions */
.transition-shadow {
    transition: box-shadow 0.2s ease;
}

.transition-colors {
    transition: all 0.2s ease;
}

/* Dropdown animation */
.dropdown-enter-active {
    transition: all 0.2s ease-out;
}

.dropdown-leave-active {
    transition: all 0.15s ease-in;
}

.dropdown-enter-from {
    opacity: 0;
    transform: translateY(-10px);
}

.dropdown-leave-to {
    opacity: 0;
    transform: translateY(-5px);
}
</style>
