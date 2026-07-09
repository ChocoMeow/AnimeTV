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

// Tab configuration
const tabs = computed(() => [
    {
        id: 'friends',
        label: '我的好友',
        labelShort: '好友',
        icon: 'group',
        badge: friends.value.length,
        badgeColor: 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-400',
    },
    {
        id: 'requests',
        label: '好友請求',
        labelShort: '請求',
        icon: 'person_add',
        badge: incomingRequests.value.length,
        badgeColor: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
    },
    {
        id: 'search',
        label: '搜尋用戶',
        labelShort: '搜尋',
        icon: 'search',
        badge: null,
        badgeColor: '',
    },
    {
        id: 'blocked',
        label: '已封鎖',
        labelShort: '封鎖',
        icon: 'block',
        badge: blockedUsers.value.length,
        badgeColor: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400',
    },
])

const selectedFriend = ref(null)
const showDeleteConfirm = ref(false)
const showBlockConfirm = ref(false)
const showUnblockConfirm = ref(false)
const showProfileDialog = ref(false)

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

// Open modal
function openConfirmModal(user, type) {
  selectedFriend.value = user

    const modalMap = {
        delete: showDeleteConfirm,
        block: showBlockConfirm,
        unblock: showUnblockConfirm,
        friendProfile: showProfileDialog
    }

    if (modalMap[type]) {
        modalMap[type].value = true
    }
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
async function handleRemoveFriend() {
    const success = await removeFriend(selectedFriend.value.id)

    if (success) {
        showToast("已移除好友", "success")
        openDropdown.value = null
    } else if (error.value) {
        showToast(`操作失敗: ${error.value}`, "error")
    }
}

// Block user handler
async function handleBlockUser() {
    const success = await blockUser(selectedFriend.value.id)

    if (success) {
        showToast(`已封鎖 ${selectedFriend.value.name}`, "success")
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
async function handleUnblockUser() {
    const success = await unblockUser(selectedFriend.value.id)

    if (success) {
        showToast(`已解除封鎖 ${selectedFriend.value.name}`, "success")
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
    <div class="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 py-6 sm:py-8">
        <!-- Header -->
        <div class="mb-6 sm:mb-8">
            <h1 class="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 dark:text-white mb-2">好友管理</h1>
            <p class="text-gray-600 dark:text-gray-400">管理您的好友和好友請求</p>
        </div>

        <!-- Tabs -->
        <div class="flex flex-wrap gap-2 mb-6 sm:mb-8">
            <button
                v-for="tab in tabs"
                :key="tab.id"
                @click="activeTab = tab.id"
                :class="['pill-tab', activeTab === tab.id ? 'pill-tab-active' : 'pill-tab-inactive']"
            >
                <span class="material-symbols-rounded text-lg">{{ tab.icon }}</span>
                <span class="hidden md:inline">{{ tab.label }}</span>
                <span class="md:hidden">{{ tab.labelShort }}</span>
                <span
                    v-if="tab.badge && tab.badge > 0"
                    :class="['ml-0.5 px-1.5 py-0.5 text-[10px] font-bold rounded-full', activeTab === tab.id ? 'bg-white/20 dark:bg-black/10' : tab.badgeColor]"
                >
                    {{ tab.badge }}
                </span>
            </button>
        </div>

        <!-- Friends Tab -->
        <div v-if="activeTab === 'friends'" class="space-y-4">
            <div v-if="loading" class="text-center py-12">
                <div class="animate-spin rounded-full h-12 w-12 border-4 border-black/10 dark:border-white/15 border-t-gray-900 dark:border-t-white mx-auto"></div>
            </div>

            <div v-else-if="friends.length === 0" class="empty-panel">
                <span class="material-symbols-rounded text-6xl text-gray-400 dark:text-gray-500 mb-4 opacity-60">group</span>
                <p class="text-gray-700 dark:text-gray-300 text-lg mb-2">還沒有好友</p>
                <p class="text-gray-500 dark:text-gray-400 text-sm mb-4">開始搜尋並新增您的第一位好友吧！</p>
                <button @click="activeTab = 'search'" class="btn-primary">搜尋用戶</button>
            </div>

            <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                <!-- In Friends Tab, replace the friend card section: -->
                <div v-for="friend in friends" :key="friend.id" class="panel-card p-4">
                    <div class="flex items-center gap-4">
                        <UserAvatar :src="friend.avatar" :name="friend.name" class="w-16 h-16 text-xl" img-class="ring-2 ring-black/5 dark:ring-white/10" />

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
                            <button @click.stop="toggleDropdown(friend.id)" class="p-2 flex items-center justify-center text-gray-600 hover:bg-black/5 dark:text-gray-400 dark:hover:bg-white/10 rounded-lg transition-colors" title="更多選項">
                                <span class="material-symbols-rounded">more_vert</span>
                            </button>

                            <!-- Dropdown content -->
                            <transition name="dropdown">
                                <div v-if="openDropdown === friend.id" class="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-gray-950 rounded-xl shadow-xl border border-black/5 dark:border-white/10 py-1 z-10">
                                    <button @click="openConfirmModal(friend, 'friendProfile')" class="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-black/5 dark:hover:bg-white/10 flex items-center gap-2">
                                        <span class="material-symbols-rounded text-lg">analytics</span>
                                        查看好友
                                    </button>
                                    <button @click="openConfirmModal(friend, 'delete')" class="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-black/5 dark:hover:bg-white/10 flex items-center gap-2">
                                        <span class="material-symbols-rounded text-lg">person_remove</span>
                                        移除好友
                                    </button>
                                    <button @click="openConfirmModal(friend, 'block')" class="w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-500/10 flex items-center gap-2">
                                        <span class="material-symbols-rounded text-lg">block</span>
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
                    <div class="animate-spin rounded-full h-12 w-12 border-4 border-black/10 dark:border-white/15 border-t-gray-900 dark:border-t-white mx-auto"></div>
                </div>

                <div v-else-if="incomingRequests.length === 0" class="empty-panel py-8">
                    <span class="material-symbols-rounded text-4xl text-gray-400 dark:text-gray-500 mb-2 opacity-60">inbox</span>
                    <p class="text-gray-600 dark:text-gray-400">沒有待處理的好友請求</p>
                </div>

                <div v-else class="space-y-3">
                    <div v-for="request in incomingRequests" :key="request.id" class="panel-card p-4">
                        <div class="flex items-center gap-4">
                            <UserAvatar :src="request.sender_avatar" :name="request.sender_name" class="w-14 h-14 text-lg" img-class="ring-2 ring-black/5 dark:ring-white/10" />

                            <div class="flex-1 min-w-0">
                                <h3 class="font-semibold text-gray-900 dark:text-white truncate">{{ request.sender_name }}</h3>
                            </div>

                            <div class="flex gap-2">
                                <button @click="handleAcceptRequest(request.id)" class="btn-primary-sm">接受</button>
                                <button @click="handleRejectRequest(request.id)" class="btn-ghost-sm">拒絕</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Outgoing Requests -->
            <div>
                <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">已發送的請求</h2>

                <div v-if="outgoingRequests.length === 0" class="empty-panel py-8">
                    <span class="material-symbols-rounded text-4xl text-gray-400 dark:text-gray-500 mb-2 opacity-60">send</span>
                    <p class="text-gray-600 dark:text-gray-400">沒有已發送的好友請求</p>
                </div>

                <div v-else class="space-y-3">
                    <div v-for="request in outgoingRequests" :key="request.id" class="panel-card p-4">
                        <div class="flex items-center gap-4">
                            <UserAvatar :src="request.receiver_avatar" :name="request.receiver_name" class="w-14 h-14 text-lg" img-class="ring-2 ring-black/5 dark:ring-white/10" />

                            <div class="flex-1 min-w-0">
                                <h3 class="font-semibold text-gray-900 dark:text-white truncate">{{ request.receiver_name }}</h3>
                                <p class="text-xs text-gray-500 dark:text-gray-500 mt-1">等待對方回應...</p>
                            </div>

                            <button @click="cancelRequest(request.id)" class="btn-ghost-sm">取消</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Search Tab -->
        <div v-if="activeTab === 'search'" class="space-y-4">
            <!-- Search Input -->
            <div class="panel-card p-6">
                <div class="relative">
                    <span class="material-symbols-rounded absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">search</span>
                    <input v-model="searchQuery" type="text" placeholder="搜尋用戶名稱..." class="w-full pl-12 pr-4 py-3 bg-black/5 dark:bg-white/10 border border-transparent rounded-full text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-black/10 dark:focus:ring-white/20 outline-none transition-shadow" />
                    <div v-if="searchLoading" class="absolute right-4 top-1/2 -translate-y-1/2">
                        <div class="animate-spin rounded-full h-5 w-5 border-2 border-black/10 dark:border-white/15 border-t-gray-900 dark:border-t-white"></div>
                    </div>
                </div>
            </div>

            <!-- Search Results -->
            <div v-if="searchQuery && searchResults.length === 0 && !searchLoading" class="empty-panel">
                <span class="material-symbols-rounded text-6xl text-gray-400 dark:text-gray-500 mb-4 opacity-60">search_off</span>
                <p class="text-gray-600 dark:text-gray-400">找不到符合「{{ searchQuery }}」的用戶</p>
            </div>

            <div v-else-if="searchResults.length > 0" class="space-y-3">
                <div v-for="result in searchResults" :key="result.id" class="panel-card p-4">
                    <div class="flex items-center gap-4">
                        <UserAvatar :src="result.avatar" :name="result.name" class="w-14 h-14 text-lg" img-class="ring-2 ring-black/5 dark:ring-white/10" />

                        <div class="flex-1 min-w-0">
                            <h3 class="font-semibold text-gray-900 dark:text-white truncate">{{ result.name }}</h3>
                        </div>

                        <button 
                            v-if="result.hasPending" 
                            disabled 
                            class="px-4 py-2 bg-black/5 dark:bg-white/10 text-gray-500 dark:text-gray-400 text-sm font-medium rounded-full cursor-not-allowed flex items-center gap-2"
                        >
                            <span class="material-symbols-rounded text-sm">schedule</span>
                            等待回應
                        </button>
                        <button 
                            v-else 
                            @click="handleSendRequest(result.id)" 
                            class="btn-primary-sm"
                        >
                            <span class="material-symbols-rounded text-sm">person_add</span>
                            加為好友
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <!-- Blocked Tab -->
        <div v-if="activeTab === 'blocked'" class="space-y-4">
            <div v-if="blockedLoading" class="text-center py-12">
                <div class="animate-spin rounded-full h-12 w-12 border-4 border-black/10 dark:border-white/15 border-t-gray-900 dark:border-t-white mx-auto"></div>
            </div>

            <div v-else-if="blockedUsers.length === 0" class="empty-panel">
                <span class="material-symbols-rounded text-6xl text-gray-400 dark:text-gray-500 mb-4 opacity-60">block</span>
                <p class="text-gray-700 dark:text-gray-300 text-lg mb-2">沒有封鎖的用戶</p>
                <p class="text-gray-500 dark:text-gray-400 text-sm">您目前沒有封鎖任何用戶</p>
            </div>

            <div v-else class="space-y-3">
                <div class="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 mb-4">
                    <div class="flex items-start gap-3">
                        <span class="material-symbols-rounded text-yellow-600 dark:text-yellow-400">info</span>
                        <div class="flex-1">
                            <p class="text-sm text-yellow-800 dark:text-yellow-200 font-medium mb-1">關於封鎖</p>
                            <p class="text-xs text-yellow-700 dark:text-yellow-300">被封鎖的用戶無法向您發送好友請求，也看不到您的在線狀態和活動。</p>
                        </div>
                    </div>
                </div>

                <div v-for="blockedUser in blockedUsers" :key="blockedUser.id" class="panel-card p-4">
                    <div class="flex items-center gap-4">
                        <UserAvatar :src="blockedUser.avatar" :name="blockedUser.name" class="w-14 h-14 text-lg" img-class="ring-2 ring-black/5 dark:ring-white/10" grayscale />

                        <div class="flex-1 min-w-0">
                            <h3 class="font-semibold text-gray-900 dark:text-white truncate">{{ blockedUser.name }}</h3>
                            <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                <span class="material-symbols-rounded text-xs align-middle">block</span>
                                已封鎖
                            </p>
                        </div>

                        <button @click="openConfirmModal(blockedUser, 'unblock')" class="btn-primary-sm">
                            <span class="material-symbols-rounded text-sm">check_circle</span>
                            解除封鎖
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Delete Confirmation Modal -->
    <BaseModal :show="showDeleteConfirm" title="確認刪除" icon="person_remove" icon-color="text-red-500" @close="showDeleteConfirm = false">
        <p class="text-gray-600 dark:text-gray-400 mb-6">確定要移除 {{ selectedFriend.name }} 嗎？</p>

        <template #actions>
            <button @click="showDeleteConfirm = false" class="btn-modal-cancel">取消</button>
            <button @click="handleRemoveFriend()" class="btn-modal-danger">確認刪除</button>
        </template>
    </BaseModal>

    <!-- Block Confirmation Modal -->
    <BaseModal :show="showBlockConfirm" title="確認封鎖" icon="block" icon-color="text-red-500" @close="showBlockConfirm = false">
        <p class="text-gray-600 dark:text-gray-400 mb-6">確定要封鎖 {{ selectedFriend.name }} 嗎？封鎖後您們將無法看到彼此的動態。</p>

        <template #actions>
            <button @click="showBlockConfirm = false" class="btn-modal-cancel">取消</button>
            <button @click="handleBlockUser()" class="btn-modal-danger">確認封鎖</button>
        </template>
    </BaseModal>

    <!-- Unblock Confirmation Modal -->
    <BaseModal :show="showUnblockConfirm" title="確認解除封鎖" icon="deployed_code_account" icon-color="text-red-500" @close="showUnblockConfirm = false">
        <p class="text-gray-600 dark:text-gray-400 mb-6">確定要解除封鎖 {{ selectedFriend.name }} 嗎？</p>

        <template #actions>
            <button @click="showUnblockConfirm = false" class="btn-modal-cancel">取消</button>
            <button @click="handleUnblockUser()" class="btn-modal-danger">確認解除封鎖</button>
        </template>
    </BaseModal>

    <!-- User Profile Dialog -->
    <UserProfileDialog v-if="selectedFriend" v-model="showProfileDialog" :data="selectedFriend" />
</template>

<style scoped>
.panel-card {
    @apply bg-black/[0.02] dark:bg-white/5 rounded-xl ring-1 ring-black/5 dark:ring-white/10
           hover:ring-black/10 dark:hover:ring-white/20 transition-all duration-200;
}

.empty-panel {
    @apply bg-black/[0.02] dark:bg-white/[0.03] border border-black/5 dark:border-white/5 rounded-2xl p-12 text-center;
}

.pill-tab {
    @apply px-4 md:px-5 py-2.5 rounded-full text-sm font-medium transition-all duration-200 flex items-center gap-2;
}

.pill-tab-inactive {
    @apply bg-black/5 dark:bg-white/10 text-gray-600 dark:text-gray-300 hover:bg-black/10 dark:hover:bg-white/20;
}

.pill-tab-active {
    @apply bg-gray-900 dark:bg-white text-white dark:text-black shadow-md;
}

.btn-primary {
    @apply inline-flex items-center gap-2 px-6 py-2.5 rounded-full font-semibold text-sm
           bg-gray-900 dark:bg-white text-white dark:text-black
           hover:opacity-90 transition-opacity;
}

.btn-primary-sm {
    @apply px-4 py-2 bg-gray-900 dark:bg-white hover:opacity-90 text-white dark:text-black text-sm font-medium rounded-full transition-opacity flex items-center gap-2;
}

.btn-ghost-sm {
    @apply px-4 py-2 bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-full transition-colors;
}

.btn-modal-cancel {
    @apply px-4 py-2 rounded-full bg-black/5 dark:bg-white/10 text-gray-700 dark:text-gray-300
           hover:bg-black/10 dark:hover:bg-white/20 transition-colors;
}

.btn-modal-danger {
    @apply px-4 py-2 rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors;
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
