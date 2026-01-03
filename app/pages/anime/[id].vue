<script setup>
// Core
const { userSettings, getShortcuts, formatShortcutKey } = useUserSettings()
const appConfig = useAppConfig()
const route = useRoute()
const router = useRouter()
const client = useSupabaseClient()

// Get user shortcuts
const userShortcuts = computed(() => getShortcuts())

// User status tracking
const { setWatching, setOnline } = useUserStatus()

// Component State
const anime = ref(null)
const selectedEpisode = ref(null)
const videoUrl = ref(null)
const error = ref(null)
const loading = ref(true)
const videoLoading = ref(false)
const isFavorite = ref(false)
const showShareDialog = ref(false)
const showDetailDialog = ref(false)
const shareUrl = ref("")
const showShortcutsModal = ref(false)

// Continue Watching State
const lastWatchedData = ref(null)
const showContinuePrompt = ref(false)
const allWatchProgress = ref({})

// Video Tracking
const videoPlayer = ref(null)
const hasSetInitialTime = ref(false)
const previousEpisode = ref(null)

// Constants
const SAVE_INTERVAL = 120000 // Save every 2 minutes
let saveIntervalTimer = null

// UI Actions
function openShareDialog() {
    if (typeof window !== "undefined") {
        const baseUrl = window.location.origin + route.path
        const params = new URLSearchParams()

        if (selectedEpisode.value && videoPlayer.value) {
            params.set("e", selectedEpisode.value)
            const currentTime = videoPlayer.value.currentTime
            if (currentTime > 0) {
                params.set("t", Math.floor(currentTime).toString())
            }
        }

        shareUrl.value = params.toString() ? `${baseUrl}?${params.toString()}` : baseUrl
    }
    showShareDialog.value = true
}

function formatRating(score) {
    return score ? parseFloat(score).toFixed(1) : "N/A"
}

function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
}

// Continue Watching Functions
function continueLast() {
    if (!lastWatchedData.value) return
    selectedEpisode.value = lastWatchedData.value.episode_number
    showContinuePrompt.value = false

    router.replace({
        path: route.path,
        query: {
            e: lastWatchedData.value.episode_number,
            t: lastWatchedData.value.playback_time,
        },
    })
}

function handlePlay() {
    startAutoSave()
}

function handlePause() {
    stopAutoSave()
}

function handleEnded() {
    saveWatchHistory()
    stopAutoSave()
    setOnline()
}

// Helper function to get sorted episode numbers and current index
function getEpisodeInfo() {
    if (!anime.value || !anime.value.episodes || !selectedEpisode.value) {
        return { episodeNumbers: [], currentIndex: -1 }
    }

    // Get all episode numbers and sort them
    const episodeNumbers = Object.keys(anime.value.episodes).sort((a, b) => {
        // Try to sort numerically first, fallback to string comparison
        const numA = parseInt(a)
        const numB = parseInt(b)
        if (!isNaN(numA) && !isNaN(numB)) {
            return numA - numB
        }
        return a.localeCompare(b)
    })

    // Find current episode index
    const currentIndex = episodeNumbers.indexOf(String(selectedEpisode.value))

    return { episodeNumbers, currentIndex }
}

// Check if there's a next episode
const hasNextEpisode = computed(() => {
    const { episodeNumbers, currentIndex } = getEpisodeInfo()
    return currentIndex !== -1 && currentIndex < episodeNumbers.length - 1
})

// Check if running on Mac (for displaying correct modifier key)
const isMac = computed(() => {
    if (typeof window === 'undefined') return false
    return /Mac|iPhone|iPod|iPad/i.test(navigator.platform)
})

function handleNextEpisode() {
    const { episodeNumbers, currentIndex } = getEpisodeInfo()
    
    // If there's a next episode, select it
    if (currentIndex !== -1 && currentIndex < episodeNumbers.length - 1) {
        const nextEpisode = episodeNumbers[currentIndex + 1]
        selectedEpisode.value = nextEpisode
    }
}

function handlePreviousEpisode() {
    const { episodeNumbers, currentIndex } = getEpisodeInfo()
    
    // If there's a previous episode, select it
    if (currentIndex !== -1 && currentIndex > 0) {
        const prevEpisode = episodeNumbers[currentIndex - 1]
        selectedEpisode.value = prevEpisode
    }
}

async function toggleFavorite() {
    if (!anime.value || !userSettings.value.id) return
    isFavorite.value = !isFavorite.value

    let response
    if (isFavorite.value) {
        response = await client.from("favorites").insert({
            user_id: userSettings.value.id,
            anime_ref_id: anime.value.refId,
            anime_title: anime.value.title,
            anime_image: anime.value.image,
        })
    } else {
        response = await client.from("favorites").delete().match({
            user_id: userSettings.value.id,
            anime_ref_id: anime.value.refId,
        })
    }

    if (response.error) {
        throw new Error(response.error.message)
    }
}

async function fetchLastWatched() {
    try {
        if (!userSettings.value.id || !anime.value) return
        const { data, error } = await client.from("watch_history")
            .select("*")
            .eq("anime_ref_id", anime.value.refId)
            .eq("user_id", userSettings.value.id)
            .order("updated_at", { ascending: false })

        if (!error && data && data.length > 0) {
            allWatchProgress.value = {}
            data.forEach((item) => {
                if (!allWatchProgress.value[item.episode_number]) {
                    allWatchProgress.value[item.episode_number] = item
                }
            })

            lastWatchedData.value = data[0]

            if (lastWatchedData.value.progress_percentage < 90 && !route.query.e) {
                showContinuePrompt.value = true
            }
        }
    } catch (err) {
        console.error("Failed to fetch last watched:", err)
    }
}

async function onVideoReady() {
    videoLoading.value = false

    if (hasSetInitialTime.value) return

    let startTime = null

    if (route.query.t) {
        startTime = parseFloat(route.query.t)
    }

    if (startTime && videoPlayer.value && !isNaN(startTime) && startTime > 0) {
        const videoElement = videoPlayer.value.videoElement
        if (videoElement && videoElement.readyState >= 2) {
            videoPlayer.value.seek(startTime)
            hasSetInitialTime.value = true
        } else if (videoElement) {
            videoElement.addEventListener(
                "canplay",
                () => {
                    if (!hasSetInitialTime.value && videoPlayer.value) {
                        videoPlayer.value.seek(startTime)
                        hasSetInitialTime.value = true
                    }
                },
                { once: true }
            )
        }
    } else {
        hasSetInitialTime.value = true
    }

    // Scroll to video player
    const videoElement = videoPlayer.value?.videoElement
    if (videoElement) {
        setTimeout(() => {
            videoElement.scrollIntoView({
                behavior: "smooth",
                block: "center",
            })
        }, 100)
    }

    await saveWatchHistory()
    
    if (anime.value && selectedEpisode.value) {
        setWatching({
            refId: anime.value.refId,
            title: anime.value.title,
            image: anime.value.image,
            episode: selectedEpisode.value
        })
    }
}

// Watch History
function startAutoSave() {
    if (saveIntervalTimer) return
    saveIntervalTimer = setInterval(saveWatchHistory, SAVE_INTERVAL)
}

function stopAutoSave() {
    if (saveIntervalTimer) {
        clearInterval(saveIntervalTimer)
        saveIntervalTimer = null
    }
}

async function saveWatchHistory() {
    if (!userSettings.value.watch_history_enabled || !userSettings.value.id || !anime.value || !selectedEpisode.value || !videoPlayer.value) return

    const duration = videoPlayer.value.duration
    const currentTime = videoPlayer.value.currentTime

    if (!duration || duration === 0) return

    const progressPercentage = Math.min(100, Math.floor((currentTime / duration) * 100))

    try {
        const historyData = {
            user_id: userSettings.value.id,
            anime_ref_id: anime.value.refId,
            anime_title: anime.value.title,
            anime_image: anime.value.image,
            episode_number: String(selectedEpisode.value),
            playback_time: Math.floor(currentTime),
            video_duration: Math.floor(duration),
            progress_percentage: progressPercentage,
        }

        const { data, error } = await client.from("watch_history").upsert(historyData, { onConflict: "user_id, anime_ref_id, episode_number" })
        if (error) throw error

        allWatchProgress.value[historyData.episode_number] = historyData
        lastWatchedData.value = historyData
    } catch (err) {
        console.error("Failed to save watch history:", err)
    }
}

// Data Fetching
async function fetchDetail() {
    loading.value = true
    error.value = null
    videoUrl.value = null
    selectedEpisode.value = null

    try {
        const res = await $fetch(`/api/anime/${route.params.id}`)
        if (!res || Object.keys(res).length === 0) {
            error.value = "找不到此動漫的詳細資訊"
            return
        }

        anime.value = res
        isFavorite.value = res.isFavorite
        useHead({ title: `${res.title} | ${appConfig.siteName}` })
        await fetchLastWatched()

        // Handle episode from query parameter (can be number or text)
        if (route.query.e) {
            const episodeKey = route.query.e
            if (anime.value.episodes[episodeKey]) {
                selectedEpisode.value = episodeKey
            } else {
                const numEpisode = parseInt(route.query.e)
                if (!isNaN(numEpisode) && anime.value.episodes[String(numEpisode)]) {
                    selectedEpisode.value = String(numEpisode)
                }
            }
        }
    } catch (err) {
        useHead({ title: `載入動漫詳情失敗 | ${appConfig.siteName}` })
        console.error("Failed to fetch anime detail:", err)
        error.value = "載入動漫詳情失敗，請稍後再試"
    } finally {
        loading.value = false
    }
}

watch(selectedEpisode, async (epNum) => {
    if (!epNum || !anime.value?.episodes) return

    const isManualChange = previousEpisode.value !== null && previousEpisode.value !== epNum

    if (isManualChange) {
        hasSetInitialTime.value = false
        if (route.query.t || route.query.e) {
            const newQuery = { ...route.query }
            delete newQuery.t
            delete newQuery.e
            router.replace({
                path: route.path,
                query: newQuery,
            })
        }
    }

    previousEpisode.value = epNum

    const token = anime.value.episodes[String(epNum)]
    if (!token) {
        videoUrl.value = null
        return
    }

    videoLoading.value = true
    try {
        const res = await $fetch(`/api/episode/${token}`)
        if (res?.s?.length) {
            const raw = res.s[0].src
            const finalUrl = raw.startsWith("http") ? raw : `https:${raw}`
            videoUrl.value = `/api/proxy-video?url=${encodeURIComponent(finalUrl)}&cookie=${encodeURIComponent(res.videoCookie)}`
        } else {
            videoUrl.value = null
        }
    } catch (err) {
        console.error("Episode fetch failed:", err)
        videoUrl.value = null
    } finally {
        videoLoading.value = false
    }
})

// Keyboard shortcuts handler
function handleShortcutsKeydown(e) {
    // Handle Ctrl+/ or Cmd+/ to show shortcuts menu
    if ((e.ctrlKey || e.metaKey) && e.key === "/") {
        e.preventDefault()
        showShortcutsModal.value = !showShortcutsModal.value
    }
}

onMounted(() => {
    fetchDetail()
    window.addEventListener("beforeunload", saveWatchHistory)
    window.addEventListener("keydown", handleShortcutsKeydown)
})

onUnmounted(() => {
    saveWatchHistory()
    stopAutoSave()
    setOnline()
    window.removeEventListener("beforeunload", saveWatchHistory)
    window.removeEventListener("keydown", handleShortcutsKeydown)
})
</script>

<template>
    <!-- Loading State -->
    <div v-if="loading" class="flex items-center justify-center min-h-screen">
        <!-- <div class="text-center">
            <div class="inline-block w-16 h-16 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-4"></div>
            <p class="text-gray-600 dark:text-gray-400 text-lg">載入動漫詳情中...</p>
        </div> -->
        <AnimeLoader :show="loading" message="載入動漫詳情中..." centered />
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="flex flex-col justify-center items-center min-h-screen text-center px-4">
        <div class="w-20 h-20 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-6">
            <span class="material-icons text-5xl text-red-500 dark:text-red-400">error_outline</span>
        </div>
        <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">載入失敗</h2>
        <p class="text-red-600 dark:text-red-400 mb-6 max-w-md">{{ error }}</p>
        <button @click="router.back()" class="px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-0.5">返回上一頁</button>
    </div>

    <!-- Empty State -->
    <div v-else-if="!anime" class="flex flex-col justify-center items-center min-h-screen">
        <span class="material-icons text-6xl text-gray-400 mb-4">movie_filter</span>
        <p class="text-gray-600 dark:text-gray-400">無可用的動漫資料</p>
    </div>

    <!-- Content -->
    <div v-else>
        <!-- Hero Section -->
        <div class="relative overflow-hidden bg-gradient-to-br from-indigo-900 via-purple-900 to-gray-900 text-white">
            <div class="absolute inset-0 opacity-70">
                <img :src="anime.image" :alt="anime.title" class="w-full h-full object-cover blur-2xl scale-110" />
            </div>
            <div class="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/80 to-transparent"></div>

            <div class="relative max-w-7xl mx-auto px-4 py-12">
                <div class="flex flex-col md:flex-row gap-8">
                    <div class="flex-shrink-0 mx-auto md:mx-0">
                        <div class="relative group">
                            <img :src="anime.image" :alt="anime.title" class="w-64 md:w-72 rounded-2xl shadow-2xl object-cover transform transition-transform duration-300 group-hover:scale-105" />
                        </div>
                    </div>

                    <div class="flex-1 space-y-6">
                        <div>
                            <div class="flex flex-col md:flex-row items-center justify-between gap-4 mb-3">
                                <h1 class="text-4xl md:text-5xl font-bold leading-tight text-center md:text-left">{{ anime.title }}</h1>
                                <div class="flex items-center gap-2 flex-shrink-0">
                                    <button v-if="anime.detailId" @click="showDetailDialog = true" class="w-10 h-10 bg-white/10 backdrop-blur-sm rounded-lg border border-white/20 hover:bg-white/20 transition-all flex items-center justify-center" title="Details">
                                        <span class="material-icons text-xl">info</span>
                                    </button>
                                    <button @click="openShareDialog" class="w-10 h-10 bg-white/10 backdrop-blur-sm rounded-lg border border-white/20 hover:bg-white/20 transition-all flex items-center justify-center" title="Share">
                                        <span class="material-icons text-xl">share</span>
                                    </button>
                                </div>
                            </div>
                            <div class="flex flex-wrap items-center justify-center md:justify-start gap-3">
                                <div class="flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-sm rounded-lg border border-white/20">
                                    <span class="material-icons text-yellow-400">star</span>
                                    <span class="font-bold text-lg">{{ formatRating(anime.userRating?.score) }}</span>
                                    <span class="text-sm text-gray-300">({{ anime.userRating?.count || 0 }})</span>
                                </div>

                                <button @click="toggleFavorite" class="px-4 py-2 bg-white/10 backdrop-blur-sm rounded-lg border border-white/20 hover:bg-white/20 transition-all flex items-center gap-2">
                                    <span class="material-icons" :class="isFavorite ? 'text-red-500' : 'text-white'">{{ isFavorite ? "favorite" : "favorite_border" }}</span>
                                    <span>{{ isFavorite ? "已收藏" : "收藏" }}</span>
                                </button>
                            </div>
                        </div>

                        <div class="prose prose-invert max-w-none">
                            <p class="text-gray-200 leading-relaxed text-lg">{{ anime.description || "暫無簡介" }}</p>
                        </div>

                        <!-- Tags Section -->
                        <div v-if="anime.tags && anime.tags.length > 0" class="flex flex-wrap items-center gap-2">
                            <div class="flex flex-wrap gap-2">
                                <NuxtLink
                                    v-for="tag in anime.tags"
                                    :key="tag"
                                    :to="`/show-all-anime?tags=${encodeURIComponent(tag)}`"
                                    class="px-3 py-1.5 bg-white/10 backdrop-blur-sm rounded-full border border-white/20 
                                            text-sm font-medium text-white
                                            hover:bg-white/20 hover:border-white/40 hover:scale-105
                                            transition-all duration-200 transform
                                            flex items-center gap-1.5"
                                >
                                    <span class="material-icons text-xs">tag</span>
                                    {{ tag }}
                                </NuxtLink>
                            </div>
                        </div>

                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                            <div class="info-card" v-if="anime.director">
                                <span class="material-icons text-indigo-400">person</span>
                                <div>
                                    <p class="text-gray-400 text-xs">導演監督</p>
                                    <p class="font-semibold">{{ anime.director }}</p>
                                </div>
                            </div>

                            <div class="info-card" v-if="anime.productionCompany">
                                <span class="material-icons text-purple-400">business</span>
                                <div>
                                    <p class="text-gray-400 text-xs">代理廠商</p>
                                    <p class="font-semibold">{{ anime.productionCompany }}</p>
                                </div>
                            </div>

                            <div class="info-card" v-if="anime.premiereDate">
                                <span class="material-icons text-pink-400">event</span>
                                <div>
                                    <p class="text-gray-400 text-xs">首播日期</p>
                                    <p class="font-semibold">{{ anime.premiereDate }}</p>
                                </div>
                            </div>

                            <div class="info-card" v-if="anime.distributor">
                                <span class="material-icons text-blue-400">local_shipping</span>
                                <div>
                                    <p class="text-gray-400 text-xs">發行商</p>
                                    <p class="font-semibold">{{ anime.distributor }}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Continue Watching Prompt -->
        <transition name="slide-down">
            <div v-if="showContinuePrompt && lastWatchedData" class="max-w-7xl mx-auto px-4 -mt-8 relative z-10">
                <div class="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl shadow-2xl p-6 text-white">
                    <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                        <div class="flex items-start gap-4">
                            <div class="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
                                <span class="material-icons text-2xl">play_circle</span>
                            </div>
                            <div>
                                <h3 class="text-xl font-bold mb-1">繼續觀看</h3>
                                <p class="text-white/90 text-sm">
                                    第 {{ lastWatchedData.episode_number }} 集 - {{ formatDuration(lastWatchedData.playback_time) }} / {{ formatDuration(lastWatchedData.video_duration) }}
                                    <span class="inline-block ml-2 px-2 py-0.5 bg-white/20 rounded text-xs">{{ lastWatchedData.progress_percentage }}% 完成</span>
                                </p>
                            </div>
                        </div>
                        <div class="flex gap-3 w-full md:w-auto">
                            <button @click="continueLast" class="flex-1 md:flex-none px-6 py-3 bg-white text-indigo-600 hover:bg-gray-100 rounded-lg transition-all font-medium flex items-center justify-center gap-2">
                                <span class="material-icons text-xl">play_arrow</span>
                                繼續播放
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </transition>

        <!-- Main Content Area -->
        <div class="max-w-7xl mx-auto px-4 py-4 space-y-8">
            <!-- Episode Selector -->
            <section class="content-card">
                <div class="flex items-center gap-3 mb-4">
                    <h2 class="text-2xl font-bold text-gray-900 dark:text-white">選擇集數</h2>
                </div>

                <EpisodesPicker v-if="anime?.episodes" :episodes="anime.episodes" :watch-progress="allWatchProgress" v-model="selectedEpisode" @select="(n) => (selectedEpisode = n)" class="mb-4" />
                <div v-else class="text-center py-8 text-gray-500 dark:text-gray-400 mb-4">
                    <span class="material-icons text-4xl mb-2 opacity-50">video_library</span>
                    <p>暫無可用集數</p>
                </div>

                <VideoPlayer v-if="videoUrl || selectedEpisode" ref="videoPlayer" :src="videoUrl || ''" autoplay preload="metadata" :has-next-episode="hasNextEpisode" :shortcuts="userShortcuts" @play="handlePlay" @pause="handlePause" @ended="handleEnded" @next-episode="handleNextEpisode" @previous-episode="handlePreviousEpisode" @loadstart="videoLoading = true" @loadeddata="onVideoReady" />

                <div v-else class="aspect-video bg-black relative rounded-lg overflow-hidden flex flex-col items-center justify-center text-gray-400">
                    <span class="material-icons text-6xl mb-4 opacity-50">play_circle_outline</span>
                    <p class="text-lg">請選擇集數開始播放</p>
                </div>
            </section>

            <!-- Related Anime -->
            <section v-if="anime.relatedAnime && anime.relatedAnime.length" class="content-card">
                <div class="flex items-center gap-3 mb-6">
                    <h2 class="text-2xl font-bold text-gray-900 dark:text-white">相關動漫</h2>
                </div>

                <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    <NuxtLink v-for="rel in anime.relatedAnime" :key="rel.refId" :to="`/anime/${rel.refId}`" class="related-card group">
                        <div class="relative overflow-hidden rounded-t-xl aspect-[2/3] bg-gray-200 dark:bg-gray-700">
                            <img :src="rel.image" :alt="rel.title" class="w-full h-full object-cover transform transition-all duration-500 group-hover:scale-110" />
                            <div class="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>

                            <div class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 transform scale-75 group-hover:scale-100">
                                <div class="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shadow-xl">
                                    <span class="material-icons text-indigo-600 text-2xl">play_arrow</span>
                                </div>
                            </div>
                        </div>

                        <div class="p-3">
                            <p class="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{{ rel.title }}</p>
                        </div>
                    </NuxtLink>
                </div>
            </section>
        </div>
    </div>

    <!-- Share Dialog Component -->
    <LazyShareDialog v-model="showShareDialog" :share-url="shareUrl" :anime-title="anime?.title" :has-episode="!!selectedEpisode" />

    <!-- Detail Dialog Component -->
    <LazyAnimeDetailDialog v-if="anime" v-model="showDetailDialog" :anime-id="anime.detailId" />

    <!-- Keyboard Shortcuts Dialog -->
    <BaseDialog v-model="showShortcutsModal" max-width="max-w-2xl">
        <template #header>
            <div class="flex items-center gap-3">
                <span class="material-icons text-3xl text-indigo-500">keyboard</span>
                <h3 class="text-2xl font-bold text-gray-900 dark:text-white">鍵盤快捷鍵</h3>
            </div>
        </template>
        <div class="space-y-4">
            <!-- Play/Pause and Long Press (special cases) -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div class="space-y-2">
                    <div class="flex items-center justify-between py-2 border-b border-gray-200 dark:border-gray-700">
                        <span class="text-sm text-gray-600 dark:text-gray-400">{{ userShortcuts.playPause?.label || "播放/暫停" }}</span>
                        <kbd class="px-2 py-1 text-xs font-semibold text-gray-800 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded">{{ formatShortcutKey(userShortcuts.playPause) }}</kbd>
                    </div>
                    <div class="flex items-center justify-between py-2 border-b border-gray-200 dark:border-gray-700">
                        <span class="text-sm text-gray-600 dark:text-gray-400">長按 {{ formatShortcutKey(userShortcuts.playPause) }} (2x 速度)</span>
                        <kbd class="px-2 py-1 text-xs font-semibold text-gray-800 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded">{{ formatShortcutKey(userShortcuts.playPause) }} (長按)</kbd>
                    </div>
                </div>
                <div class="space-y-2">
                    <div class="flex items-center justify-between py-2">
                        <span class="text-sm text-gray-600 dark:text-gray-400">顯示快捷鍵</span>
                        <div class="flex items-center gap-1">
                            <kbd class="px-2 py-1 text-xs font-semibold text-gray-800 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded">
                                <span v-if="isMac">⌘</span>
                                <span v-else>Ctrl</span>
                            </kbd>
                            <span class="text-xs text-gray-400">+</span>
                            <kbd class="px-2 py-1 text-xs font-semibold text-gray-800 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded">/</kbd>
                        </div>
                    </div>
                </div>
            </div>

            <!-- All other shortcuts in two columns -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
                <template v-for="(shortcut, action) in userShortcuts" :key="action">
                    <div v-if="action !== 'playPause' && shortcut?.label" class="flex items-center justify-between py-2 border-b border-gray-200 dark:border-gray-700">
                        <span class="text-sm text-gray-600 dark:text-gray-400">{{ shortcut.label }}</span>
                        <kbd class="px-2 py-1 text-xs font-semibold text-gray-800 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded">{{ formatShortcutKey(shortcut) }}</kbd>
                    </div>
                </template>
            </div>

            <!-- Additional Info -->
            <div class="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <p class="text-xs text-gray-500 dark:text-gray-400 text-center">
                    提示：在輸入框中輸入時，快捷鍵將不會生效
                </p>
            </div>
        </div>
    </BaseDialog>
</template>

<style scoped>
.content-card {
    @apply bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-4 sm:p-6 transition-all duration-300 hover:shadow-xl;
}

.info-card {
    @apply flex items-center gap-3 px-4 py-3 bg-white/10 backdrop-blur-sm rounded-lg border border-white/20;
}

.related-card {
    @apply bg-white dark:bg-gray-800 rounded-xl overflow-hidden cursor-pointer 
           transition-all duration-300 hover:shadow-2xl hover:-translate-y-2
           border border-gray-100 dark:border-gray-700
           hover:border-indigo-300 dark:hover:border-indigo-600;
}

.slide-down-enter-active,
.slide-down-leave-active {
    transition: all 0.4s ease-out;
}

.slide-down-enter-from {
    opacity: 0;
    transform: translateY(-20px);
}

.slide-down-leave-to {
    opacity: 0;
    transform: translateY(-20px);
}

@keyframes fadeInUp {
    from {
        opacity: 0;
        transform: translateY(20px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

.content-card,
.related-card {
    animation: fadeInUp 0.6s ease-out;
}

::-webkit-scrollbar {
    width: 8px;
    height: 8px;
}

::-webkit-scrollbar-track {
    @apply bg-gray-100 dark:bg-gray-800;
}

::-webkit-scrollbar-thumb {
    @apply bg-gray-300 dark:bg-gray-600 rounded-full;
}

::-webkit-scrollbar-thumb:hover {
    @apply bg-gray-400 dark:bg-gray-500;
}
</style>
