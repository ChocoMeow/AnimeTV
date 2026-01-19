<script setup>
const { userSettings } = useUserSettings()
const { isMobile } = useMobile()
const STORAGE_KEY = 'friendListOpen'
const isOpen = ref(false)

// Profile dialog state
const showProfileDialog = ref(false)
const selectedFriend = ref(null)

// Use the composable with proper reactivity
const userId = computed(() => userSettings.value?.id || null)
const { friends, loading, error } = useFriends(userId)

// Computed friend categories with proper status mapping
const watchingFriends = computed(() => friends.value.filter((f) => f.status === "watching"))
const onlineFriends = computed(() => friends.value.filter((f) => f.status === "online"))
const idleFriends = computed(() => friends.value.filter((f) => f.status === "idle"))
const offlineFriends = computed(() => friends.value.filter((f) => f.status === "offline"))

// Friend sections configuration (filtered to only show sections with friends)
const friendSections = computed(() => [
    { friends: watchingFriends.value, title: "正在觀看", status: "watching", dotColorClass: "bg-green-500", icon: "play_circle", text: "在線", isWatching: true },
    { friends: onlineFriends.value, title: "在線中", status: "online", dotColorClass: "bg-green-500", icon: "computer", text: "在線" },
    { friends: idleFriends.value, title: "閒置中", status: "idle", dotColorClass: "bg-yellow-500", icon: "schedule", text: "暫時離開" },
    { friends: offlineFriends.value, title: "離線", status: "offline", dotColorClass: "bg-gray-400", icon: null, text: null, isOffline: true }
].filter(section => section.friends.length > 0))

// Helper to format last seen time
const formatLastSeen = (lastSeen) => {
    if (!lastSeen) return "未知";

    // Convert lastSeen to a Date object (assuming it's in ISO format)
    const seen = new Date(lastSeen);

    // Get the user's local time zone offset in milliseconds
    const localOffset = new Date().getTimezoneOffset() * 60000;

    // Adjust the seen time to the local time
    const localSeen = new Date(seen.getTime() - localOffset);

    // Get the current local time
    const now = new Date();

    // Calculate the difference in milliseconds
    const diffMs = now - localSeen;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "剛剛";
    if (diffMins < 60) return `${diffMins} 分鐘前`;
    if (diffHours < 24) return `${diffHours} 小時前`;
    return `${diffDays} 天前`;
};

// Save state to localStorage
const saveState = (open) => {
    if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, open.toString())
    }
}

// UI controls
const openFriendList = () => {
    isOpen.value = true
    saveState(true)
    if (import.meta.client) {
        document.body.classList.add("friend-list-open")
    }
}

const closeFriendList = () => {
    isOpen.value = false
    saveState(false)
    if (import.meta.client) {
        document.body.classList.remove("friend-list-open")
    }
}

// Watch isOpen to manage body class when changed by v-model (e.g., when drawer closes)
watch(isOpen, (newValue) => {
    if (import.meta.client) {
        if (newValue) {
            document.body.classList.add("friend-list-open")
            saveState(true)
        } else {
            document.body.classList.remove("friend-list-open")
            saveState(false)
        }
    }
})

// Function to open friend profile
const openFriendProfile = (friend) => {
    selectedFriend.value = friend
    showProfileDialog.value = true
}

onMounted(() => {
    // Load saved state from localStorage after mount (client-side only)
    if (!isMobile.value && typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem(STORAGE_KEY)
        if (saved === 'true') {
            isOpen.value = true
            document.body.classList.add("friend-list-open")
        }
    }
})

onBeforeUnmount(() => {
    if (import.meta.client) {
        document.body.classList.remove("friend-list-open")
    }
})
</script>

<template>
    <!-- Desktop Friend List Panel -->
    <transition name="slide-left">
        <div v-if="isOpen"
            class="hidden lg:flex fixed right-0 top-0 h-screen w-80 bg-white dark:bg-gray-950 shadow-2xl border-l border-gray-200 dark:border-white/10 flex-col z-30 pt-16">
            <!-- Toggle Button (Left Side - when open) -->
            <button @click="closeFriendList"
                class="absolute -left-9 top-1/2 -translate-y-1/2 bg-white dark:bg-gray-950 border-t border-b border-l border-gray-300 dark:border-white/20 p-2 rounded-l-lg hover:border-black/70 dark:hover:border-white/70 transition-all"
                title="關閉好友列表">
                <span class="material-icons text-gray-600 dark:text-gray-300 text-lg">chevron_right</span>
            </button>

            <!-- Friends List -->
            <div class="flex-1 overflow-y-auto p-3 space-y-3 pt-6">
                <div v-for="section in friendSections" :key="section.status" class="space-y-2">
                    <h3
                        class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2 px-1">
                        {{ section.title }} — {{ section.friends.length }}</h3>
                    <div v-for="friend in section.friends" :key="friend.id" class="friend-card">
                        <!-- Watching Friend Card -->
                        <div v-if="section.isWatching"
                            class="relative p-3 rounded-xl border border-gray-300 dark:border-gray-700 hover:shadow-md transition-shadow overflow-hidden">
                            <div v-if="friend.animeBackground"
                                class="anime-background absolute inset-0 bg-cover bg-center"
                                :style="{ backgroundImage: `url(${friend.animeBackground})` }"></div>
                            <div class="relative z-10">
                                <div class="flex items-start gap-3 mb-3 cursor-pointer"
                                    @click="openFriendProfile(friend)">
                                    <div class="relative flex-shrink-0">
                                        <img :src="friend.avatar" :alt="friend.name"
                                            class="w-11 h-11 rounded-full border-2 border-white dark:border-gray-200 object-cover shadow-lg" />
                                        <span
                                            class="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-green-500 border-2 border-white dark:border-gray-900 rounded-full"
                                            :title="friend.status"></span>
                                    </div>
                                    <div class="flex-1 min-w-0">
                                        <h4
                                            class="font-semibold text-sm text-white drop-shadow-lg truncate mb-1 hover:underline">
                                            {{ friend.name }}</h4>
                                        <div class="flex items-center gap-1.5 text-xs text-white drop-shadow-md mb-0.5">
                                            <span class="material-icons text-xs">play_circle</span>
                                            <span class="truncate font-medium">{{ friend.currentAnime }}</span>
                                        </div>
                                        <div class="text-xs text-white/90 drop-shadow-md">第 {{ friend.currentEpisode }}
                                            集</div>
                                    </div>
                                </div>
                                <NuxtLink :to="`/anime/${friend.animeId}?e=${friend.currentEpisode}`"
                                    class="w-full px-3 py-2 bg-gray-900 dark:bg-gray-100 hover:bg-gray-800 dark:hover:bg-gray-200 text-white dark:text-gray-900 text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-md">
                                    前往</NuxtLink>
                            </div>
                        </div>
                        <!-- Regular Friend Card -->
                        <div v-else
                            :class="['flex items-center gap-3 p-3 rounded-xl transition-colors border border-gray-200 dark:border-white/10 cursor-pointer', section.isOffline ? 'bg-gray-950/5 dark:bg-white/10 opacity-70 hover:opacity-90' : 'bg-gray-950/5 dark:bg-white/10 hover:bg-gray-950/10 dark:hover:bg-white/20']"
                            @click="openFriendProfile(friend)">
                            <div class="relative flex-shrink-0">
                                <img :src="friend.avatar" :alt="friend.name"
                                    :class="['w-10 h-10 rounded-full border-2 border-gray-200 dark:border-gray-700 object-cover', section.isOffline && 'grayscale']" />
                                <span
                                    :class="['absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 border-2 border-white dark:border-gray-900 rounded-full', section.dotColorClass]"
                                    :title="friend.status"></span>
                            </div>
                            <div class="flex-1 min-w-0">
                                <h4 class="font-medium text-sm text-gray-900 dark:text-white truncate hover:underline">
                                    {{ friend.name }}</h4>
                                <p v-if="section.isOffline" class="text-xs text-gray-500 dark:text-gray-400">上次上線 {{
                                    formatLastSeen(friend.lastSeen) }}</p>
                                <p v-else class="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                                    <span v-if="section.icon" class="material-icons text-xs">{{ section.icon }}</span>
                                    {{ section.text }}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </transition>

    <!-- Mobile Friend List Drawer -->
    <ClientOnly>
        <BaseBottomDrawer v-if="isMobile" v-model="isOpen" title="好友列表" :max-height="'max-h-[85vh]'">
            <!-- Mobile Friends List -->
            <div class="space-y-4 pb-4">
                <div v-for="section in friendSections" :key="section.status" class="space-y-3">
                    <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{{
                        section.title }} — {{ section.friends.length }}</h3>
                    <div v-for="friend in section.friends" :key="friend.id" class="friend-card">
                        <!-- Watching Friend Card (Mobile) -->
                        <div v-if="section.isWatching"
                            class="relative p-4 rounded-2xl border border-gray-300 dark:border-gray-700 overflow-hidden">
                            <div v-if="friend.animeBackground"
                                class="anime-background absolute inset-0 bg-cover bg-center"
                                :style="{ backgroundImage: `url(${friend.animeBackground})` }"></div>
                            <div class="relative z-10">
                                <div class="flex items-start gap-3 mb-3 cursor-pointer"
                                    @click="openFriendProfile(friend)">
                                    <div class="relative flex-shrink-0">
                                        <img :src="friend.avatar" :alt="friend.name"
                                            class="w-14 h-14 rounded-full border-2 border-white dark:border-gray-200 object-cover shadow-lg" />
                                        <span
                                            class="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 border-3 border-white dark:border-gray-900 rounded-full"></span>
                                    </div>
                                    <div class="flex-1 min-w-0">
                                        <h4 class="font-bold text-base text-white drop-shadow-lg truncate mb-1">{{
                                            friend.name }}</h4>
                                        <div class="flex items-center gap-1.5 text-sm text-white drop-shadow-md mb-1">
                                            <span class="material-icons text-base">play_circle</span>
                                            <span class="truncate font-medium">{{ friend.currentAnime }}</span>
                                        </div>
                                        <div class="text-sm text-white/90 drop-shadow-md">第 {{ friend.currentEpisode }}
                                            集</div>
                                    </div>
                                </div>
                                <NuxtLink :to="`/anime/${friend.animeId}?e=${friend.currentEpisode}`"
                                    class="w-full px-4 py-3 bg-gray-900 dark:bg-gray-100 hover:bg-gray-800 dark:hover:bg-gray-200 text-white dark:text-gray-900 text-sm font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 shadow-md">
                                    前往</NuxtLink>
                            </div>
                        </div>
                        <!-- Regular Friend Card (Mobile) -->
                        <div v-else
                            :class="['flex items-center gap-3 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 cursor-pointer', section.isOffline ? 'bg-gray-50 dark:bg-white/10 opacity-70' : 'bg-gray-50 dark:bg-white/10']"
                            @click="openFriendProfile(friend)">
                            <div class="relative flex-shrink-0">
                                <img :src="friend.avatar" :alt="friend.name"
                                    :class="['w-12 h-12 rounded-full border-2 border-gray-200 dark:border-gray-700 object-cover', section.isOffline && 'grayscale']" />
                                <span
                                    :class="['absolute -bottom-0.5 -right-0.5 w-4 h-4 border-2 border-white dark:border-gray-900 rounded-full', section.dotColorClass]"></span>
                            </div>
                            <div class="flex-1 min-w-0">
                                <h4 class="font-semibold text-base text-gray-900 dark:text-white truncate">{{
                                    friend.name }}</h4>
                                <p v-if="section.isOffline" class="text-sm text-gray-500 dark:text-gray-400">上次上線 {{
                                    formatLastSeen(friend.lastSeen) }}</p>
                                <p v-else class="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1">
                                    <span v-if="section.icon" class="material-icons text-sm">{{ section.icon }}</span>
                                    {{ section.text }}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </BaseBottomDrawer>
    </ClientOnly>

    <!-- Toggle Button - Desktop (when closed) -->
    <ClientOnly>
        <transition v-if="friends.length" name="fade">
            <button v-if="!isOpen" @click="openFriendList"
                class="lg:flex fixed right-4 top-1/2 -translate-y-1/2 z-30 bg-white dark:bg-gray-950 border-2 border-gray-300 dark:border-gray-600 p-2.5 rounded-lg hover:border-black/70 dark:hover:border-white/70 transition-all duration-300 shadow-md"
                title="顯示好友列表">
                <span class="material-icons text-gray-600 dark:text-gray-300 text-xl">group</span>
            </button>
        </transition>
    </ClientOnly>

    <!-- User Profile Dialog -->
    <UserProfileDialog v-if="selectedFriend" v-model="showProfileDialog" :data="selectedFriend" />
</template>

<style scoped>
/* Slide animation for the desktop friend list panel */
.slide-left-enter-active,
.slide-left-leave-active {
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease-out;
}

.slide-left-enter-from {
    transform: translateX(100%);
    opacity: 0;
}

.slide-left-leave-to {
    transform: translateX(100%);
    opacity: 0;
}


/* Fade animation for the floating button */
.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.3s ease, transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
    transform: scale(0.8);
}

/* Friend card animation */
.friend-card {
    animation: slideIn 0.3s ease-out;
}

@keyframes slideIn {
    from {
        opacity: 0;
        transform: translateY(10px);
    }

    to {
        opacity: 1;
        transform: translateY(0);
    }
}

/* Anime background with fade-in and opacity */
.anime-background {
    opacity: 0;
    animation: fadeInBackground 0.8s ease-in-out forwards;
}

@keyframes fadeInBackground {
    from {
        opacity: 0;
    }

    to {
        opacity: 0.35;
    }
}

/* Smooth touch interactions on mobile */
@media (max-width: 1023px) {
    .friend-card {
        -webkit-tap-highlight-color: transparent;
    }
}
</style>
