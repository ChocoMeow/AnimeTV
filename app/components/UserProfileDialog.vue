<script setup>
import { useMobile } from '~/composables/useMobile'

const props = defineProps({
    modelValue: {
        type: Boolean,
        required: true,
    },
    data: {
        type: Object,
        required: false,
        default: null,
    }
})

const emit = defineEmits(['update:modelValue'])

const { isMobile } = useMobile()
const client = useSupabaseClient()

// Extract friend data from props
const friend = computed(() => props.data || {})
const userId = computed(() => friend.value.id || null)
const friendName = computed(() => friend.value.name || '好友')
const friendAvatar = computed(() => friend.value.avatar || null)

// Profile data
const profile = ref(null)
const recentlyWatched = ref([])
const favorites = ref([])
const stats = ref({
    totalWatched: 0,
    totalFavorites: 0,
    watchingTime: 0
})
const loading = ref(true)
const error = ref(null)

// Get initials from name
const initials = computed(() => {
    if (!friendName.value) return '?'
    return friendName.value.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
})

// Fetch user profile data
async function fetchProfile() {
    if (!userId.value) return

    loading.value = true
    error.value = null

    try {
        // We don't actually need user_settings for the profile display
        // Just set profile to a basic object to indicate we have a user
        profile.value = { id: userId.value }

        // Fetch recent watch history
        const { data: watchHistory, error: historyError } = await client
            .from('watch_history_latest_updates')
            .select('anime_ref_id, anime_title, anime_image, episode_number, updated_at, progress_percentage')
            .eq('user_id', userId.value)
            .order('updated_at', { ascending: false })
            .limit(10)

        if (historyError) {
            console.warn('Could not fetch watch history:', historyError)
        } else if (watchHistory) {
            recentlyWatched.value = watchHistory
        }

        // Fetch favorites
        const { data: favoritesData, error: favError } = await client
            .from('favorites')
            .select('anime_ref_id, anime_title, anime_image, created_at')
            .eq('user_id', userId.value)
            .order('created_at', { ascending: false })
            .limit(10)

        if (favError) {
            console.warn('Could not fetch favorites:', favError)
        } else if (favoritesData) {
            favorites.value = favoritesData
        }

        // Calculate stats
        const { count: watchCount } = await client
            .from('watch_history')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId.value)

        stats.value = {
            totalWatched: watchCount || 0,
            totalFavorites: favorites.value.length,
            watchingTime: 0 // Could calculate from watch history if needed
        }

    } catch (err) {
        console.error('Failed to fetch profile:', err)
        error.value = '載入個人資料失敗'
    } finally {
        loading.value = false
    }
}

// Watch for data changes
watch(() => props.data, () => {
    if (userId.value && props.modelValue) {
        fetchProfile()
    }
}, { immediate: true, deep: true })

// Watch for dialog open
watch(() => props.modelValue, (newVal) => {
    if (newVal && userId.value) {
        fetchProfile()
    }
})

function close() {
    emit('update:modelValue', false)
}

// Helper to format date
function formatDate(dateString) {
    const date = new Date(dateString)
    const now = new Date()
    const diffTime = Math.abs(now - date)
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return '今天'
    if (diffDays === 1) return '昨天'
    if (diffDays < 7) return `${diffDays} 天前`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} 週前`
    return `${Math.floor(diffDays / 30)} 個月前`
}
</script>

<template>
    <!-- Desktop Dialog -->
    <BaseDialog v-if="!isMobile" :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)"
        max-width="max-w-4xl" :scrollable="true">
        <!-- Loading State -->
        <div v-if="loading" class="flex flex-col items-center justify-center py-12">
            <div
                class="inline-block w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-4">
            </div>
            <p class="text-gray-600 dark:text-gray-400">載入資料中...</p>
        </div>

        <!-- Error State -->
        <div v-else-if="error" class="text-center py-12">
            <span class="material-icons text-5xl text-red-500 mb-4">error_outline</span>
            <p class="text-red-600 dark:text-red-400">{{ error }}</p>
        </div>

        <!-- Profile Content -->
        <div v-else-if="profile" class="space-y-0">
            <!-- Profile Header -->
            <div class="bg-white dark:bg-gray-800">
                <div class="flex items-center gap-4 mb-4">
                    <!-- Avatar -->
                    <div class="relative flex-shrink-0">
                        <div v-if="friendAvatar"
                            class="w-20 h-20 rounded-full border-4 border-white dark:border-gray-800 bg-gray-200 dark:bg-gray-700 overflow-hidden">
                            <img :src="friendAvatar" :alt="friendName" class="w-full h-full object-cover" />
                        </div>
                        <div v-else
                            class="w-20 h-20 rounded-full border-4 border-white dark:border-gray-800 bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-2xl font-bold">
                            {{ initials }}
                        </div>
                    </div>

                    <!-- Name and Stats -->
                    <div class="flex-1 min-w-0">
                        <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-1 truncate">{{ friendName }}</h2>
                        <div class="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400 flex-wrap">
                            <div class="flex items-center gap-1">
                                <span class="material-icons text-base">video_library</span>
                                <span>{{ stats.totalWatched }} 個活動</span>
                            </div>
                            <div class="flex items-center gap-1">
                                <span class="material-icons text-base">favorite</span>
                                <span>{{ stats.totalFavorites }} 個收藏</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Divider -->
                <div class="border-t border-gray-200 dark:border-gray-700 my-4"></div>

                <!-- Content Sections -->
                <div class="space-y-4">
                    <!-- Recently Watched Section -->
                    <div v-if="recentlyWatched.length > 0">
                        <h3 class="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                            最近活動
                        </h3>
                        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                            <NuxtLink v-for="anime in recentlyWatched" :key="anime.anime_ref_id"
                                :to="`/anime/${anime.anime_ref_id}`"
                                class="group relative overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-700/50 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all cursor-pointer"
                                @click="close">
                                <div class="aspect-[3/4] relative overflow-hidden">
                                    <img :src="anime.anime_image" :alt="anime.anime_title"
                                        class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                                    <div
                                        class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                                    </div>
                                    <div
                                        class="absolute bottom-0 left-0 right-0 p-2 translate-y-full group-hover:translate-y-0 transition-transform">
                                        <div class="text-white text-xs font-medium truncate">{{ anime.anime_title }}
                                        </div>
                                        <div class="text-white/80 text-xs">EP {{ anime.episode_number }} · {{
                                            anime.progress_percentage }}%</div>
                                    </div>
                                    <!-- Progress bar -->
                                    <div class="absolute bottom-0 left-0 right-0 h-1 bg-gray-800/50">
                                        <div class="h-full bg-indigo-500"
                                            :style="{ width: `${anime.progress_percentage}%` }"></div>
                                    </div>
                                </div>
                            </NuxtLink>
                        </div>
                    </div>

                    <!-- Favorites Section -->
                    <div v-if="favorites.length > 0">
                        <h3
                            class="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 mt-6">
                            收藏的動漫
                        </h3>
                        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                            <NuxtLink v-for="anime in favorites" :key="anime.anime_ref_id"
                                :to="`/anime/${anime.anime_ref_id}`"
                                class="group relative overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-700/50 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all cursor-pointer"
                                @click="close">
                                <div class="aspect-[3/4] relative overflow-hidden">
                                    <img :src="anime.anime_image" :alt="anime.anime_title"
                                        class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                                    <div
                                        class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                                    </div>
                                    <div class="absolute top-2 right-2">
                                        <div
                                            class="w-6 h-6 bg-pink-500 rounded-full flex items-center justify-center shadow-lg">
                                            <span class="material-icons text-white text-sm">favorite</span>
                                        </div>
                                    </div>
                                    <div
                                        class="absolute bottom-0 left-0 right-0 p-2 translate-y-full group-hover:translate-y-0 transition-transform">
                                        <div class="text-white text-xs font-medium truncate">{{ anime.anime_title }}
                                        </div>
                                        <div class="text-white/80 text-xs">{{ formatDate(anime.created_at) }}</div>
                                    </div>
                                </div>
                            </NuxtLink>
                        </div>
                    </div>

                    <!-- Empty State -->
                    <div v-if="recentlyWatched.length === 0 && favorites.length === 0" class="text-center py-16">
                        <div
                            class="w-16 h-16 bg-gray-100 dark:bg-gray-700/50 rounded-full flex items-center justify-center mx-auto mb-3">
                            <span class="material-icons text-4xl text-gray-400 dark:text-gray-500">tv_off</span>
                        </div>
                        <p class="text-sm text-gray-500 dark:text-gray-400">此用戶尚未觀看或收藏任何動漫</p>
                    </div>
                </div>
            </div>
        </div>
    </BaseDialog>

    <!-- Mobile Drawer -->
    <BaseBottomDrawer v-else :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)"
        :max-height="'max-h-[90vh]'">
        <template #header>
            <!-- Custom Header -->
            <div class="flex items-center gap-4">
                <div class="flex items-center gap-3">
                    <div v-if="friendAvatar"
                        class="w-16 h-16 rounded-full border-4 border-white dark:border-gray-800 bg-gray-200 dark:bg-gray-700 overflow-hidden flex-shrink-0">
                        <img :src="friendAvatar" :alt="friendName" class="w-full h-full object-cover" />
                    </div>
                    <div v-else
                        class="w-16 h-16 rounded-full border-4 border-white dark:border-gray-800 bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xl font-bold flex-shrink-0">
                        {{ initials }}
                    </div>
                    <div class="flex-1 min-w-0">
                        <h2 class="text-xl font-bold text-gray-900 dark:text-white truncate">{{ friendName }}</h2>
                        <div class="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                            <span>{{ stats.totalWatched }} 個活動</span>
                            <span>·</span>
                            <span>{{ stats.totalFavorites }} 個收藏</span>
                        </div>
                    </div>
                </div>
            </div>
        </template>

        <!-- Loading State -->
        <div v-if="loading" class="flex items-center justify-center py-12">
            <div class="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
        </div>

        <!-- Error State -->
        <div v-else-if="error" class="text-center py-12">
            <span class="material-icons text-5xl text-red-500 mb-4">error_outline</span>
            <p class="text-red-600 dark:text-red-400">{{ error }}</p>
        </div>

        <!-- Profile Content -->
        <div v-else-if="profile" class="space-y-6 pb-4">
            <!-- Recently Watched -->
            <div v-if="recentlyWatched.length > 0">
                <h3 class="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                    最近活動
                </h3>
                <div class="grid grid-cols-3 gap-2">
                    <NuxtLink v-for="anime in recentlyWatched" :key="anime.anime_ref_id"
                        :to="`/anime/${anime.anime_ref_id}`"
                        class="group relative overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-700/50"
                        @click="close">
                        <div class="aspect-[3/4] relative overflow-hidden">
                            <img :src="anime.anime_image" :alt="anime.anime_title" class="w-full h-full object-cover" />
                            <!-- Progress bar -->
                            <div class="absolute bottom-0 left-0 right-0 h-1 bg-gray-800/50">
                                <div class="h-full bg-indigo-500" :style="{ width: `${anime.progress_percentage}%` }">
                                </div>
                            </div>
                        </div>
                    </NuxtLink>
                </div>
            </div>

            <!-- Favorites -->
            <div v-if="favorites.length > 0">
                <h3 class="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                    收藏的動漫
                </h3>
                <div class="grid grid-cols-3 gap-2">
                    <NuxtLink v-for="anime in favorites" :key="anime.anime_ref_id" :to="`/anime/${anime.anime_ref_id}`"
                        class="group relative overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-700/50"
                        @click="close">
                        <div class="aspect-[3/4] relative overflow-hidden">
                            <img :src="anime.anime_image" :alt="anime.anime_title" class="w-full h-full object-cover" />
                            <div class="absolute top-2 right-2">
                                <div
                                    class="w-5 h-5 bg-pink-500 rounded-full flex items-center justify-center shadow-lg">
                                    <span class="material-icons text-white text-xs">favorite</span>
                                </div>
                            </div>
                        </div>
                    </NuxtLink>
                </div>
            </div>

            <!-- Empty State -->
            <div v-if="recentlyWatched.length === 0 && favorites.length === 0" class="text-center py-12">
                <div
                    class="w-14 h-14 bg-gray-100 dark:bg-gray-700/50 rounded-full flex items-center justify-center mx-auto mb-3">
                    <span class="material-icons text-3xl text-gray-400 dark:text-gray-500">tv_off</span>
                </div>
                <p class="text-sm text-gray-500 dark:text-gray-400">此用戶尚未觀看或收藏任何動漫</p>
            </div>
        </div>
    </BaseBottomDrawer>
</template>

<style scoped>
/* Add any additional styles if needed */
</style>
