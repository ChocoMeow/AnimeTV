<script setup>
import { ref, watch, onMounted, onUnmounted } from "vue"
import { useRouter } from "vue-router"

const router = useRouter()
const client = useSupabaseClient()
const user = useSupabaseUser()

const searchQuery = ref("")
const searchResults = ref([])
const searchHistory = ref([])
const loading = ref(false)
const mobileMenuOpen = ref(false)
const mobileSearchOpen = ref(false)
const showDropdown = ref(false)
const showUserMenu = ref(false)

let hideDropdownTimeout = null
let hideUserMenuTimeout = null
let searchDebounceTimeout = null

function handleResize() {
    if (window.innerWidth >= 768) {
        mobileSearchOpen.value = false
        mobileMenuOpen.value = false
    }
}

function debouncedSearch() {
    if (searchDebounceTimeout) {
        clearTimeout(searchDebounceTimeout)
    }
    searchDebounceTimeout = setTimeout(() => {
        fetchSearchSuggestions()
    }, 300)
}

async function saveSearchHistory(query) {
    if (!query || !user?.value?.sub) return

    try {
        // Save to Supabase
        const { error } = await client.from("search_history").insert({
            user_id: user.value.sub,
            query: query,
        })

        if (error) throw error

        // Refresh search history
        await fetchSearchHistory()
    } catch (err) {
        console.error("Failed to save search history:", err)
    }
}

async function removeFromHistory(id) {
    try {
        const { error } = await client.from("search_history").delete().eq("id", id)

        if (error) throw error

        // Remove from local state
        searchHistory.value = searchHistory.value.filter((item) => item.id !== id)
    } catch (err) {
        console.error("Failed to remove search history:", err)
    }
}

async function fetchSearchHistory() {
    if (!user?.value?.sub) {
        searchHistory.value = []
        return
    }

    try {
        const { data, error } = await client.from("search_history").select("*").eq("user_id", user.value.sub).order("created_at", { ascending: false }).limit(5)

        if (error) throw error

        searchHistory.value = data || []
    } catch (err) {
        console.error("Failed to fetch search history:", err)
        searchHistory.value = []
    }
}

function searchFromHistory(query) {
    searchQuery.value = query
    showDropdown.value = true
}

function handleEnter() {
    if (!searchQuery.value) return
    if (searchResults.value.length > 0) {
        selectResult(searchResults.value[0])
    } else {
        saveSearchHistory(searchQuery.value)
        closeMobileSearch()
        showDropdown.value = false
    }
}

function selectResult(result) {
    if (searchQuery.value) {
        saveSearchHistory(searchQuery.value)
    }
    router.push(`/anime/${result.refId}`)
    closeMobileSearch()
    showDropdown.value = false
}

function closeMobileSearch() {
    mobileSearchOpen.value = false
    searchQuery.value = ""
    searchResults.value = []
}

function hideDropdownDelayed() {
    hideDropdownTimeout = setTimeout(() => {
        showDropdown.value = false
    }, 200)
}

function hideUserMenuDelayed() {
    hideUserMenuTimeout = setTimeout(() => {
        showUserMenu.value = false
    }, 200)
}

function cancelHideUserMenu() {
    if (hideUserMenuTimeout) {
        clearTimeout(hideUserMenuTimeout)
    }
}

function formatViews(views) {
    if (views >= 1000000) {
        return (views / 1000000).toFixed(1) + "M"
    } else if (views >= 1000) {
        return (views / 1000).toFixed(1) + "K"
    }
    return views
}

async function fetchSearchSuggestions() {
    if (!searchQuery.value) {
        searchResults.value = []
        return
    }
    loading.value = true
    try {
        const res = await $fetch(`/api/search/${encodeURIComponent(searchQuery.value)}`)
        searchResults.value = res.results || []
    } catch (err) {
        console.error("Search failed:", err)
        searchResults.value = []
    } finally {
        loading.value = false
    }
}

async function signOut() {
    showUserMenu.value = false
    const { error } = await client.auth.signOut()
    navigateTo("/auth/login")
}

function navigateToFavorites() {
    showUserMenu.value = false
    router.push("/favorites")
}

onMounted(() => {
    fetchSearchHistory()
    window.addEventListener("resize", handleResize)
})

onUnmounted(() => {
    window.removeEventListener("resize", handleResize)
    if (searchDebounceTimeout) {
        clearTimeout(searchDebounceTimeout)
    }
    if (hideDropdownTimeout) {
        clearTimeout(hideDropdownTimeout)
    }
    if (hideUserMenuTimeout) {
        clearTimeout(hideUserMenuTimeout)
    }
})

watch(searchQuery, () => {
    debouncedSearch()
})

// Watch user changes to fetch history when user logs in
watch(user, (newUser) => {
    if (newUser) {
        fetchSearchHistory()
    } else {
        searchHistory.value = []
    }
})
</script>

<template>
    <header class="sticky top-0 z-50 w-full bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm">
        <div class="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
            <!-- Left: Logo -->
            <div class="flex items-center gap-2">
                <NuxtLink to="/" class="flex items-center gap-2 group">
                    <img class="w-8 h-8 flex items-center justify-center" src="/icons/icon_1024x1024.png" alt="" />
                    <span class="text-indigo-600 dark:text-indigo-400 font-bold text-xl">Anime Hub</span>
                </NuxtLink>
            </div>

            <!-- Desktop search -->
            <div class="hidden md:flex flex-1 justify-center max-w-xl px-4 relative">
                <input v-model="searchQuery" @keyup.enter="handleEnter" @focus="showDropdown = true" @blur="hideDropdownDelayed" type="search" placeholder="搜尋動漫..." class="w-full bg-gray-100 dark:bg-gray-700 rounded-full px-4 py-2 pr-10 text-sm text-gray-800 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-indigo-400 outline-none" />
                <!-- Loading Spinner -->
                <div v-if="loading" class="absolute right-8 top-1/2 -translate-y-1/2">
                    <div class="animate-spin rounded-full h-4 w-4 border-2 border-indigo-600 border-t-transparent"></div>
                </div>
                <!-- Modern Dropdown -->
                <transition name="dropdown">
                    <div v-if="(searchResults.length || searchHistory.length || (searchQuery && !loading)) && showDropdown" class="absolute top-full mt-2 w-full bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 z-50 max-h-96 overflow-y-auto">
                        <!-- Search History (shown when no query) -->
                        <div v-if="!searchQuery && searchHistory.length" class="py-2">
                            <div class="px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">最近搜尋</div>
                            <ul>
                                <li v-for="item in searchHistory" :key="item.id" class="px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors flex items-center justify-between group" @mousedown.prevent="searchFromHistory(item.query)">
                                    <div class="flex items-center gap-2">
                                        <span class="material-icons text-gray-400 text-sm">history</span>
                                        <span class="text-sm text-gray-700 dark:text-gray-300">{{ item.query }}</span>
                                    </div>
                                    <button @mousedown.prevent.stop="removeFromHistory(item.id)" class="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded">
                                        <span class="material-icons text-gray-500 text-sm">close</span>
                                    </button>
                                </li>
                            </ul>
                        </div>

                        <!-- Search Results -->
                        <ul v-if="searchResults.length" class="py-2">
                            <li v-for="(result, i) in searchResults" :key="i" class="px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors" @mousedown.prevent="selectResult(result)">
                                <div class="flex items-center gap-3">
                                    <!-- Image -->
                                    <div class="w-16 h-20 flex-shrink-0 rounded overflow-hidden bg-gray-200 dark:bg-gray-700">
                                        <img v-if="result.image" :src="result.image" :alt="result.title" class="w-full h-full object-cover" />
                                        <div v-else class="w-full h-full flex items-center justify-center text-gray-400">
                                            <span class="material-icons">image</span>
                                        </div>
                                    </div>
                                    <!-- Info -->
                                    <div class="flex-1 min-w-0">
                                        <h4 class="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
                                            {{ result.title }}
                                        </h4>
                                        <div class="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
                                            <span v-if="result.year">{{ result.year }}</span>
                                            <span v-if="result.episodes" class="flex items-center gap-1">
                                                <span class="material-icons text-xs">play_circle</span>
                                                {{ result.episodes }}
                                            </span>
                                            <span v-if="result.views" class="flex items-center gap-1">
                                                <span class="material-icons text-xs">visibility</span>
                                                {{ formatViews(result.views) }}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </li>
                        </ul>

                        <!-- Desktop No Results Message -->
                        <div v-if="searchQuery && !loading && !searchResults.length" class="py-8 px-4 text-center">
                            <span class="material-icons text-gray-400 text-4xl mb-2">search_off</span>
                            <p class="text-gray-600 dark:text-gray-400 text-sm">找不到「{{ searchQuery }}」的相關結果</p>
                        </div>
                    </div>
                </transition>
            </div>

            <!-- Right: Nav (desktop) -->
            <nav class="hidden md:flex items-center gap-3">
                <NuxtLink to="/show-all-anime" class="text-sm px-3 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"> 全部作品 </NuxtLink>

                <!-- User Profile Dropdown -->
                <div class="relative">
                    <button @click="showUserMenu = !showUserMenu" @mouseenter="cancelHideUserMenu" @mouseleave="hideUserMenuDelayed" class="flex items-center gap-2 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                        <img v-if="user?.user_metadata?.avatar_url" :src="user.user_metadata.avatar_url" :alt="user.user_metadata.name" class="w-8 h-8 rounded-full object-cover border-2 border-gray-200 dark:border-gray-600" />
                        <div v-else class="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white font-semibold">
                            {{ user?.user_metadata?.name?.[0]?.toUpperCase() || "U" }}
                        </div>
                    </button>

                    <!-- User Menu Dropdown -->
                    <transition name="dropdown">
                        <div v-if="showUserMenu" @mouseenter="cancelHideUserMenu" @mouseleave="hideUserMenuDelayed" class="absolute right-0 top-full mt-2 w-64 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 z-50 overflow-hidden">
                            <!-- User Info Header -->
                            <div class="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-gray-700 dark:to-gray-750">
                                <div class="flex items-center gap-3">
                                    <img v-if="user?.user_metadata?.avatar_url" :src="user.user_metadata.avatar_url" :alt="user.user_metadata.name" class="w-12 h-12 rounded-full object-cover border-2 border-white dark:border-gray-600" />
                                    <div v-else class="w-12 h-12 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-lg">
                                        {{ user?.user_metadata?.name?.[0]?.toUpperCase() || "U" }}
                                    </div>
                                    <div class="flex-1 min-w-0">
                                        <p class="font-semibold text-gray-900 dark:text-gray-100 truncate">
                                            {{ user?.user_metadata?.name || "User" }}
                                        </p>
                                        <p class="text-xs text-gray-600 dark:text-gray-400 truncate">
                                            {{ user?.email }}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <!-- Menu Items -->
                            <div class="py-2">
                                <NuxtLink to="/history" class="w-full px-4 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-3 text-gray-700 dark:text-gray-300" @click.native="showUserMenu = false">
                                    <span class="material-icons text-gray-500 dark:text-gray-400">history</span>
                                    <span class="text-sm font-medium">觀看紀錄</span>
                                </NuxtLink>

                                <button @click="navigateToFavorites" class="w-full px-4 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-3 text-gray-700 dark:text-gray-300">
                                    <span class="material-icons text-gray-500 dark:text-gray-400">favorite</span>
                                    <span class="text-sm font-medium">我的最愛</span>
                                </button>

                                <div class="border-t border-gray-200 dark:border-gray-700 my-2"></div>

                                <button @click="signOut" class="w-full px-4 py-2.5 text-left hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex items-center gap-3 text-red-600 dark:text-red-400">
                                    <span class="material-icons">logout</span>
                                    <span class="text-sm font-medium">登出</span>
                                </button>
                            </div>
                        </div>
                    </transition>
                </div>
            </nav>

            <!-- Mobile buttons -->
            <div class="md:hidden flex items-center gap-2">
                <!-- Search icon -->
                <button @click="mobileSearchOpen = true" class="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center">
                    <span class="material-icons text-gray-700 dark:text-gray-200">search</span>
                </button>
                <!-- Menu icon -->
                <button @click="mobileMenuOpen = !mobileMenuOpen" class="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center">
                    <span class="material-icons text-gray-700 dark:text-gray-200">menu</span>
                </button>
            </div>
        </div>

        <!-- Mobile search overlay -->
        <transition name="fade">
            <div v-if="mobileSearchOpen" class="md:hidden fixed inset-0 bg-white dark:bg-gray-800 flex flex-col z-[60] overflow-hidden">
                <div class="px-4 py-3 flex-shrink-0">
                    <div class="flex items-center relative">
                        <input v-model="searchQuery" @keyup.enter="handleEnter" type="search" placeholder="搜尋動漫..." class="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full px-4 py-2 pr-10 text-sm text-gray-800 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-indigo-400 outline-none" />
                        <!-- Mobile Loading Spinner -->
                        <div v-if="loading" class="absolute right-14 top-1/2 -translate-y-1/2">
                            <div class="animate-spin rounded-full h-4 w-4 border-2 border-indigo-600 border-t-transparent"></div>
                        </div>
                        <button @click="closeMobileSearch" class="ml-2 p-2 flex items-center justify-center">
                            <span class="material-icons text-gray-700 dark:text-gray-200">close</span>
                        </button>
                    </div>
                </div>

                <!-- Mobile Search History -->
                <div v-if="!searchQuery && searchHistory.length" class="mt-3 bg-white dark:bg-gray-800 rounded-xl overflow-y-auto flex-1">
                    <div class="px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">最近搜尋</div>
                    <ul>
                        <li v-for="item in searchHistory" :key="item.id" class="px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors flex items-center justify-between group" @click="searchFromHistory(item.query)">
                            <div class="flex items-center gap-2">
                                <span class="material-icons text-gray-400 text-sm">history</span>
                                <span class="text-sm text-gray-700 dark:text-gray-300">{{ item.query }}</span>
                            </div>
                            <button @click.stop="removeFromHistory(item.id)" class="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded">
                                <span class="material-icons text-gray-500 text-sm">close</span>
                            </button>
                        </li>
                    </ul>
                </div>

                <!-- Mobile Results -->
                <div v-if="searchResults.length" class="mt-3 bg-white dark:bg-gray-800 rounded-xl overflow-y-auto flex-1">
                    <ul class="py-2">
                        <li v-for="(result, i) in searchResults" :key="i" class="px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors" @click="selectResult(result)">
                            <div class="flex items-center gap-3">
                                <!-- Image -->
                                <div class="w-16 h-20 flex-shrink-0 rounded overflow-hidden bg-gray-200 dark:bg-gray-700">
                                    <img v-if="result.image" :src="result.image" :alt="result.title" class="w-full h-full object-cover" />
                                    <div v-else class="w-full h-full flex items-center justify-center text-gray-400">
                                        <span class="material-icons">image</span>
                                    </div>
                                </div>
                                <!-- Info -->
                                <div class="flex-1 min-w-0">
                                    <h4 class="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
                                        {{ result.title }}
                                    </h4>
                                    <div class="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
                                        <span v-if="result.year">{{ result.year }}</span>
                                        <span v-if="result.episodes" class="flex items-center gap-1">
                                            <span class="material-icons text-xs">play_circle</span>
                                            {{ result.episodes }}
                                        </span>
                                        <span v-if="result.views" class="flex items-center gap-1">
                                            <span class="material-icons text-xs">visibility</span>
                                            {{ formatViews(result.views) }}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </li>
                    </ul>
                </div>

                <!-- Mobile No Results Message -->
                <div v-if="searchQuery && !loading && !searchResults.length" class="mt-3 flex-1 flex items-center justify-center">
                    <div class="text-center py-8 px-4">
                        <span class="material-icons text-gray-400 text-5xl mb-3">search_off</span>
                        <p class="text-gray-600 dark:text-gray-400 text-sm">找不到「{{ searchQuery }}」的相關結果</p>
                    </div>
                </div>
            </div>
        </transition>

        <!-- Mobile nav -->
        <div v-if="mobileMenuOpen" class="md:hidden px-4 pb-3 space-y-3">
            <!-- User Profile Section (Mobile) -->
            <div class="flex items-center gap-3 px-3 py-3 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-gray-700 dark:to-gray-750 rounded-lg">
                <img v-if="user?.user_metadata?.avatar_url" :src="user.user_metadata.avatar_url" :alt="user.user_metadata.name" class="w-12 h-12 rounded-full object-cover border-2 border-white dark:border-gray-600" />
                <div v-else class="w-12 h-12 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-lg">
                    {{ user?.user_metadata?.name?.[0]?.toUpperCase() || "U" }}
                </div>
                <div class="flex-1 min-w-0">
                    <p class="font-semibold text-gray-900 dark:text-gray-100 truncate">
                        {{ user?.user_metadata?.name || "User" }}
                    </p>
                    <p class="text-xs text-gray-600 dark:text-gray-400 truncate">
                        {{ user?.email }}
                    </p>
                </div>
            </div>

            <nav class="flex flex-col gap-2">
                <NuxtLink to="/show-all-anime" class="text-sm px-3 py-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3" @click="mobileMenuOpen = false">
                    <span class="material-icons text-gray-500 dark:text-gray-400 text-xl">movie</span>
                    <span>全部作品</span>
                </NuxtLink>
                <NuxtLink to="/history" class="text-sm px-3 py-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3" @click="mobileMenuOpen = false">
                    <span class="material-icons text-gray-500 dark:text-gray-400 text-xl">history</span>
                    <span>觀看紀錄</span>
                </NuxtLink>
                <NuxtLink to="/favorites" class="text-sm px-3 py-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3" @click="mobileMenuOpen = false">
                    <span class="material-icons text-gray-500 dark:text-gray-400 text-xl">favorite</span>
                    <span>我的最愛</span>
                </NuxtLink>
                <button @click="signOut" class="text-sm px-3 py-2 rounded hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-3 text-red-600 dark:text-red-400 text-left">
                    <span class="material-icons text-xl">logout</span>
                    <span>登出</span>
                </button>
            </nav>
        </div>
    </header>
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

.dropdown-enter-active,
.dropdown-leave-active {
    transition: all 0.2s ease;
}
.dropdown-enter-from,
.dropdown-leave-to {
    opacity: 0;
    transform: translateY(-10px);
}

/* Custom scrollbar for dropdown */
.overflow-y-auto::-webkit-scrollbar {
    width: 6px;
}
.overflow-y-auto::-webkit-scrollbar-track {
    background: transparent;
}
.overflow-y-auto::-webkit-scrollbar-thumb {
    background: #cbd5e1;
    border-radius: 3px;
}
.dark .overflow-y-auto::-webkit-scrollbar-thumb {
    background: #475569;
}
</style>
