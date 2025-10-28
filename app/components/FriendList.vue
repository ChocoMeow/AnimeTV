<script setup>
const client = useSupabaseClient()

const isOpen = ref(false)

// Mock friends data
const friends = ref([
    {
        id: 1,
        name: "小櫻",
        avatar: "https://i.pravatar.cc/150?img=1",
        status: "playing",
        currentAnime: "進擊的巨人 The Final Season",
        currentEpisode: 4,
        animeId: "112522",
        animeBackground: "https://p2.bahamut.com.tw/B/ACG/c/74/0000106374.JPG",
    },
    {
        id: 2,
        name: "小雪",
        avatar: "https://i.pravatar.cc/150?img=5",
        status: "playing",
        currentAnime: "最後可以再拜託您一件事嗎？",
        currentEpisode: 8,
        animeId: "38000",
        animeBackground: "https://p2.bahamut.com.tw/B/ACG/c/50/0000141450.JPG",
    },
    {
        id: 3,
        name: "浩志",
        avatar: "https://i.pravatar.cc/150?img=12",
        status: "playing",
        currentAnime: "SPY×FAMILY 間諜家家酒 Season 3",
        currentEpisode: 15,
        animeId: "19",
        animeBackground: "https://p2.bahamut.com.tw/B/ACG/c/78/0000139878.JPG",
    },
    {
        id: 4,
        name: "小美",
        avatar: "https://i.pravatar.cc/150?img=9",
        status: "idle",
        lastSeen: "5 分鐘前",
    },
    {
        id: 5,
        name: "健司",
        avatar: "https://i.pravatar.cc/150?img=13",
        status: "idle",
        lastSeen: "15 分鐘前",
    },
    {
        id: 6,
        name: "步美",
        avatar: "https://i.pravatar.cc/150?img=24",
        status: "offline",
        lastSeen: "2 小時前",
    },
    {
        id: 7,
        name: "賢二",
        avatar: "https://i.pravatar.cc/150?img=33",
        status: "offline",
        lastSeen: "1 天前",
    },
    {
        id: 8,
        name: "莉娜",
        avatar: "https://i.pravatar.cc/150?img=45",
        status: "offline",
        lastSeen: "3 天前",
    },
])

const playingFriends = computed(() => friends.value.filter((f) => f.status === "playing"))

const idleFriends = computed(() => friends.value.filter((f) => f.status === "idle"))

const offlineFriends = computed(() => friends.value.filter((f) => f.status === "offline"))

const openFriendList = () => {
    isOpen.value = true
    if (process.client) {
        document.body.classList.add("friend-list-open")
    }
}

const closeFriendList = () => {
    isOpen.value = false
    if (process.client) {
        document.body.classList.remove("friend-list-open")
    }
}

const watchTogether = (friend) => {
    // Navigate to the anime page
    navigateTo(`/anime/${friend.animeId}`)
    console.log(`Watching ${friend.currentAnime} with ${friend.name}`)
}

async function fetchFriendList() {
    const { data, error } = await client.from("friends_with_status")
    if (error) throw error

    friends.value = data
}

onMounted(() => {
    // fetchFriendList()
})

onBeforeUnmount(() => {
    if (process.client) {
        document.body.classList.remove("friend-list-open")
    }
})
</script>

<template>
    <!-- Desktop Friend List Panel -->
    <transition name="slide-left">
        <div v-if="isOpen" class="hidden lg:flex fixed right-0 top-0 h-screen w-80 bg-white dark:bg-gray-900 shadow-2xl border-l border-gray-200 dark:border-gray-700 flex-col z-30 pt-16">
            <!-- Toggle Button (Left Side - when open) -->
            <button @click="closeFriendList" class="absolute -left-9 top-1/2 -translate-y-1/2 bg-white dark:bg-gray-900 border-t border-b border-l border-gray-300 dark:border-gray-600 p-2 rounded-l-lg hover:border-indigo-500 dark:hover:border-indigo-400 transition-all" title="關閉好友列表">
                <span class="material-icons text-gray-600 dark:text-gray-300 text-lg">chevron_right</span>
            </button>

            <!-- Friends List -->
            <div class="flex-1 overflow-y-auto p-3 space-y-3 pt-6">
                <!-- Online/Playing Friends -->
                <div v-if="playingFriends.length > 0" class="space-y-2">
                    <h3 class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2 px-1">正在觀看 — {{ playingFriends.length }}</h3>
                    <div v-for="friend in playingFriends" :key="friend.id" class="friend-card">
                        <div class="relative p-3 rounded-xl border border-indigo-200 dark:border-indigo-800 hover:shadow-md transition-shadow overflow-hidden">
                            <!-- Anime Background Image -->
                            <div v-if="friend.animeBackground" class="anime-background absolute inset-0 bg-cover bg-center" :style="{ backgroundImage: `url(${friend.animeBackground})` }"></div>

                            <!-- Content Overlay -->
                            <div class="relative z-10">
                                <div class="flex items-start gap-3 mb-3">
                                    <div class="relative flex-shrink-0">
                                        <img :src="friend.avatar" :alt="friend.name" class="w-11 h-11 rounded-full border-2 border-white dark:border-gray-200 object-cover shadow-lg" />
                                        <span class="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-green-500 border-2 border-white dark:border-gray-900 rounded-full" :title="friend.status"></span>
                                    </div>
                                    <div class="flex-1 min-w-0">
                                        <h4 class="font-semibold text-sm text-white drop-shadow-lg truncate mb-1">{{ friend.name }}</h4>
                                        <div class="flex items-center gap-1.5 text-xs text-white drop-shadow-md mb-0.5">
                                            <span class="material-icons text-xs">play_circle</span>
                                            <span class="truncate font-medium">{{ friend.currentAnime }}</span>
                                        </div>
                                        <div class="text-xs text-white/90 drop-shadow-md">第 {{ friend.currentEpisode }} 集</div>
                                    </div>
                                </div>
                                <button @click="watchTogether(friend)" class="w-full px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-md">一起觀看</button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Idle Friends -->
                <div v-if="idleFriends.length > 0" class="space-y-2">
                    <h3 class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2 px-1">閒置中 — {{ idleFriends.length }}</h3>
                    <div v-for="friend in idleFriends" :key="friend.id" class="friend-card">
                        <div class="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors border border-gray-200 dark:border-gray-700">
                            <div class="relative flex-shrink-0">
                                <img :src="friend.avatar" :alt="friend.name" class="w-10 h-10 rounded-full border-2 border-gray-200 dark:border-gray-700 object-cover" />
                                <span class="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-yellow-500 border-2 border-white dark:border-gray-900 rounded-full" :title="friend.status"></span>
                            </div>
                            <div class="flex-1 min-w-0">
                                <h4 class="font-medium text-sm text-gray-900 dark:text-white truncate">{{ friend.name }}</h4>
                                <p class="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                                    <span class="material-icons text-xs">schedule</span>
                                    暫時離開
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Offline Friends -->
                <div v-if="offlineFriends.length > 0" class="space-y-2">
                    <h3 class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2 px-1">離線 — {{ offlineFriends.length }}</h3>
                    <div v-for="friend in offlineFriends" :key="friend.id" class="friend-card">
                        <div class="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800/30 rounded-xl opacity-70 border border-gray-200 dark:border-gray-700">
                            <div class="relative flex-shrink-0">
                                <img :src="friend.avatar" :alt="friend.name" class="w-10 h-10 rounded-full border-2 border-gray-200 dark:border-gray-700 object-cover grayscale" />
                                <span class="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-gray-400 border-2 border-white dark:border-gray-900 rounded-full" :title="friend.status"></span>
                            </div>
                            <div class="flex-1 min-w-0">
                                <h4 class="font-medium text-sm text-gray-900 dark:text-white truncate">{{ friend.name }}</h4>
                                <p class="text-xs text-gray-500 dark:text-gray-400">上次上線 {{ friend.lastSeen }}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </transition>

    <!-- Mobile Friend List Drawer -->
    <transition name="slide-up">
        <div v-if="isOpen" class="lg:hidden fixed inset-0 z-50">
            <!-- Backdrop -->
            <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" @click="closeFriendList"></div>

            <!-- Drawer -->
            <div class="absolute bottom-0 left-0 right-0 max-h-[85vh] bg-white dark:bg-gray-900 rounded-t-3xl shadow-2xl flex flex-col">
                <!-- Toggle Button (Top with swipe down indicator) -->
                <button @click="closeFriendList" class="pt-4 pb-5 flex items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors w-full" title="關閉好友列表">
                    <span class="material-icons text-gray-600 dark:text-gray-300 text-2xl">expand_more</span>
                </button>

                <!-- Mobile Friends List -->
                <div class="flex-1 overflow-y-auto p-4 space-y-4 pb-8">
                    <!-- Playing Friends (Mobile) -->
                    <div v-if="playingFriends.length > 0" class="space-y-3">
                        <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">正在觀看 — {{ playingFriends.length }}</h3>
                        <div v-for="friend in playingFriends" :key="friend.id" class="friend-card">
                            <div class="relative p-4 rounded-2xl border border-indigo-200 dark:border-indigo-800 overflow-hidden">
                                <!-- Anime Background Image -->
                                <div v-if="friend.animeBackground" class="anime-background absolute inset-0 bg-cover bg-center" :style="{ backgroundImage: `url(${friend.animeBackground})` }"></div>

                                <!-- Content Overlay -->
                                <div class="relative z-10">
                                    <div class="flex items-start gap-3 mb-3">
                                        <div class="relative flex-shrink-0">
                                            <img :src="friend.avatar" :alt="friend.name" class="w-14 h-14 rounded-full border-2 border-white dark:border-gray-200 object-cover shadow-lg" />
                                            <span class="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 border-3 border-white dark:border-gray-900 rounded-full"></span>
                                        </div>
                                        <div class="flex-1 min-w-0">
                                            <h4 class="font-bold text-base text-white drop-shadow-lg truncate mb-1">{{ friend.name }}</h4>
                                            <div class="flex items-center gap-1.5 text-sm text-white drop-shadow-md mb-1">
                                                <span class="material-icons text-base">play_circle</span>
                                                <span class="truncate font-medium">{{ friend.currentAnime }}</span>
                                            </div>
                                            <div class="text-sm text-white/90 drop-shadow-md">第 {{ friend.currentEpisode }} 集</div>
                                        </div>
                                    </div>
                                    <button @click="watchTogether(friend)" class="w-full px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 shadow-md">一起觀看</button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Idle Friends (Mobile) -->
                    <div v-if="idleFriends.length > 0" class="space-y-3">
                        <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">閒置中 — {{ idleFriends.length }}</h3>
                        <div v-for="friend in idleFriends" :key="friend.id" class="friend-card">
                            <div class="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-200 dark:border-gray-700">
                                <div class="relative flex-shrink-0">
                                    <img :src="friend.avatar" :alt="friend.name" class="w-12 h-12 rounded-full border-2 border-gray-200 dark:border-gray-700 object-cover" />
                                    <span class="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-yellow-500 border-2 border-white dark:border-gray-900 rounded-full"></span>
                                </div>
                                <div class="flex-1 min-w-0">
                                    <h4 class="font-semibold text-base text-gray-900 dark:text-white truncate">{{ friend.name }}</h4>
                                    <p class="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1">
                                        <span class="material-icons text-sm">schedule</span>
                                        暫時離開
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Offline Friends (Mobile) -->
                    <div v-if="offlineFriends.length > 0" class="space-y-3">
                        <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">離線 — {{ offlineFriends.length }}</h3>
                        <div v-for="friend in offlineFriends" :key="friend.id" class="friend-card">
                            <div class="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-800/30 rounded-2xl opacity-70 border border-gray-200 dark:border-gray-700">
                                <div class="relative flex-shrink-0">
                                    <img :src="friend.avatar" :alt="friend.name" class="w-12 h-12 rounded-full border-2 border-gray-200 dark:border-gray-700 object-cover grayscale" />
                                    <span class="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-gray-400 border-2 border-white dark:border-gray-900 rounded-full"></span>
                                </div>
                                <div class="flex-1 min-w-0">
                                    <h4 class="font-semibold text-base text-gray-900 dark:text-white truncate">{{ friend.name }}</h4>
                                    <p class="text-sm text-gray-500 dark:text-gray-400">上次上線 {{ friend.lastSeen }}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </transition>

    <!-- Toggle Button - Desktop (when closed) -->
    <transition v-if="friends.length" name="fade">
        <button v-if="!isOpen" @click="openFriendList" class="lg:flex fixed right-4 top-1/2 -translate-y-1/2 z-30 bg-white dark:bg-gray-900 border-2 border-gray-300 dark:border-gray-600 p-2.5 rounded-lg hover:border-indigo-500 dark:hover:border-indigo-400 transition-all duration-300 shadow-md" title="顯示好友列表">
            <span class="material-icons text-gray-600 dark:text-gray-300 text-xl">group</span>
        </button>
    </transition>
    
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

/* Slide up animation for mobile drawer */
.slide-up-enter-active {
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.slide-up-leave-active {
    transition: all 0.25s cubic-bezier(0.4, 0, 0.6, 1);
}

.slide-up-enter-from .absolute.bottom-0,
.slide-up-leave-to .absolute.bottom-0 {
    transform: translateY(100%);
}

.slide-up-enter-from .absolute.inset-0,
.slide-up-leave-to .absolute.inset-0 {
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

/* Custom scrollbar for friend list */
.overflow-y-auto::-webkit-scrollbar {
    width: 6px;
}

.overflow-y-auto::-webkit-scrollbar-track {
    background: transparent;
}

.overflow-y-auto::-webkit-scrollbar-thumb {
    background: rgb(209 213 219);
    border-radius: 3px;
}

.dark .overflow-y-auto::-webkit-scrollbar-thumb {
    background: rgb(75 85 99);
}

.overflow-y-auto::-webkit-scrollbar-thumb:hover {
    background: rgb(156 163 175);
}

.dark .overflow-y-auto::-webkit-scrollbar-thumb:hover {
    background: rgb(107 114 128);
}

/* Smooth touch interactions on mobile */
@media (max-width: 1023px) {
    .friend-card {
        -webkit-tap-highlight-color: transparent;
    }
}
</style>
