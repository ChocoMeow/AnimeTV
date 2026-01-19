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

function formatViews(views) {
    if (!views) return "0"
    if (views >= 1000000) {
        return (views / 1000000).toFixed(1) + "M"
    } else if (views >= 1000) {
        return (views / 1000).toFixed(1) + "K"
    }
    return views.toString()
}

// Additional Details Configuration
const additionalDetails = computed(() => {
    if (!anime.value) return []
    
    const details = []
    
    if (anime.value.premiereDate) {
        details.push({
            label: "首播日期",
            value: anime.value.premiereDate,
            icon: "event",
            iconBg: "bg-pink-100 dark:bg-pink-900/30",
            iconColor: "text-pink-600 dark:text-pink-400"
        })
    }
    
    if (anime.value.productionCompany) {
        details.push({
            label: "代理廠商",
            value: anime.value.productionCompany,
            icon: "business",
            iconBg: "bg-gray-100 dark:bg-gray-800",
            iconColor: "text-gray-600 dark:text-gray-400"
        })
    }
    
    if (anime.value.director) {
        details.push({
            label: "導演監督",
            value: anime.value.director,
            icon: "person",
            iconBg: "bg-gray-100 dark:bg-gray-800",
            iconColor: "text-gray-600 dark:text-gray-400"
        })
    }
    
    if (anime.value.distributor) {
        details.push({
            label: "發行商",
            value: anime.value.distributor,
            icon: "local_shipping",
            iconBg: "bg-blue-100 dark:bg-blue-900/30",
            iconColor: "text-blue-600 dark:text-blue-400"
        })
    }
    
    return details
})

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
        <AnimeLoader :show="loading" message="載入動漫詳情中..." centered />
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="flex flex-col justify-center items-center min-h-screen text-center px-4">
        <div class="w-20 h-20 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-6">
            <span class="material-icons text-5xl text-red-500 dark:text-red-400">error_outline</span>
        </div>
        <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">載入失敗</h2>
        <p class="text-red-600 dark:text-red-400 mb-6 max-w-md">{{ error }}</p>
        <button @click="router.back()" class="px-6 py-3 bg-gray-900 dark:bg-gray-100 hover:bg-gray-800 dark:hover:bg-gray-200 text-white dark:text-gray-900 rounded-lg shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-0.5">返回上一頁</button>
    </div>

    <!-- Empty State -->
    <div v-else-if="!anime" class="flex flex-col justify-center items-center min-h-screen">
        <span class="material-icons text-6xl text-gray-400 mb-4">movie_filter</span>
        <p class="text-gray-600 dark:text-gray-400">無可用的動漫資料</p>
    </div>

    <!-- Content -->
    <div v-else class="bg-white dark:bg-gray-950">
        <!-- Main Content Area - YouTube-style Layout -->
        <div class="space-y-8 max-w-[96rem] mx-auto px-3 sm:px-4 py-4 sm:py-8">
            <div class="flex flex-col lg:flex-row gap-6">
                <!-- Left Column (70% on wide screens) -->
                <div class="flex-1 lg:w-[75%] space-y-4">
                    <!-- Video Player -->
                    <section class="w-full" aria-label="Video player">
                        <VideoPlayer 
                            v-if="videoUrl || selectedEpisode" 
                            ref="videoPlayer" 
                            :src="videoUrl || ''" 
                            :autoplay="false"
                            preload="metadata" 
                            :has-next-episode="hasNextEpisode" 
                            :shortcuts="userShortcuts" 
                            @play="handlePlay" 
                            @pause="handlePause" 
                            @ended="handleEnded" 
                            @next-episode="handleNextEpisode" 
                            @previous-episode="handlePreviousEpisode" 
                            @loadstart="videoLoading = true" 
                            @loadeddata="onVideoReady" 
                        />

                        <div v-else class="aspect-video bg-black dark:bg-white/10 relative rounded-lg overflow-hidden flex flex-col items-center justify-center text-gray-400">
                            <span class="material-icons text-6xl mb-4 opacity-50">play_circle_outline</span>
                            <p class="text-lg">請選擇集數開始播放</p>
                        </div>
                    </section>

                    <!-- Mobile: Continue Prompt and Episode Picker -->
                    <div class="lg:hidden space-y-4">
                        <!-- Continue Watching Prompt -->
                        <transition name="slide-down">
                            <section v-if="showContinuePrompt && lastWatchedData" aria-label="Continue watching">
                                <div class="bg-gray-950/5 dark:bg-white/10 rounded-xl shadow-lg overflow-hidden">
                                    <div class="p-4 space-y-3">
                                        <div class="flex items-center gap-3">
                                            <div class="w-10 h-10 bg-black/70 dark:bg-white/10 rounded-lg flex items-center justify-center flex-shrink-0">
                                                <span class="material-icons text-xl text-white dark:text-white">play_circle</span>
                                            </div>
                                            <div class="flex-1 min-w-0">
                                                <h3 class="text-sm font-bold text-gray-900 dark:text-white mb-0.5">繼續觀看</h3>
                                                <p class="text-xs text-gray-600 dark:text-white/80 truncate">
                                                    第 {{ lastWatchedData.episode_number }} 集
                                                </p>
                                            </div>
                                        </div>
                                        
                                        <!-- Progress Bar -->
                                        <div class="space-y-1.5">
                                            <div class="flex items-center justify-between text-xs text-gray-600 dark:text-white/70">
                                                <span>{{ formatDuration(lastWatchedData.playback_time) }} / {{ formatDuration(lastWatchedData.video_duration) }}</span>
                                                <span>{{ lastWatchedData.progress_percentage }}%</span>
                                            </div>
                                            <div class="h-1.5 bg-gray-200 dark:bg-white/10 rounded-full overflow-hidden">
                                                <div 
                                                    class="h-full bg-black/70 dark:bg-white rounded-full transition-all"
                                                    :style="{ width: `${lastWatchedData.progress_percentage}%` }"
                                                ></div>
                                            </div>
                                        </div>
                                        
                                        <button 
                                            @click="continueLast" 
                                            class="w-full px-4 py-2.5 bg-black/70 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 rounded-lg transition-all font-medium flex items-center justify-center gap-2 text-sm"
                                        >
                                            <span class="material-icons text-lg">play_arrow</span>
                                            繼續播放
                                        </button>
                                    </div>
                                </div>
                            </section>
                        </transition>

                        <!-- Episode Picker -->
                        <section aria-label="Episode selector">
                            <div class="flex items-center justify-between mb-4">
                                <h2 class="text-xl font-bold text-gray-900 dark:text-white">選擇集數</h2>
                                <span v-if="anime?.episodes" class="text-sm text-gray-600 dark:text-gray-400">
                                    共 <span class="font-semibold text-gray-900 dark:text-white">{{ Object.keys(anime.episodes).length }}</span> 集
                                </span>
                            </div>
                            <EpisodesPicker 
                                v-if="anime?.episodes" 
                                :episodes="anime.episodes" 
                                :watch-progress="allWatchProgress" 
                                :compact="true"
                                :anime-image="anime.image"
                                v-model="selectedEpisode" 
                                @select="(n) => (selectedEpisode = n)" 
                            />
                            <div v-else class="text-center py-8 text-gray-500 dark:text-gray-400">
                                <span class="material-icons text-4xl mb-2 opacity-50">video_library</span>
                                <p>暫無可用集數</p>
                            </div>
                        </section>
                    </div>

                    <!-- Anime Information Block -->
                    <section class="space-y-4" aria-label="Anime information">
                        <!-- Title and Actions -->
                        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                            <h1 class="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white leading-tight">{{ anime.title }}</h1>
                            <div class="flex items-center gap-2 flex-shrink-0">
                                <button 
                                    v-if="anime.detailId" 
                                    @click="showDetailDialog = true" 
                                    class="w-10 h-10 bg-gray-950/5 dark:bg-white/10 rounded-lg border border-gray-200 dark:border-white/20 hover:bg-gray-950/10 dark:hover:bg-white/20 transition-all flex items-center justify-center focus:outline-none" 
                                    title="Details"
                                    aria-label="View anime details"
                                >
                                    <span class="material-icons text-xl text-gray-900 dark:text-white">info</span>
                                </button>
                                <button 
                                    @click="openShareDialog" 
                                    class="w-10 h-10 bg-gray-950/5 dark:bg-white/10 rounded-lg border border-gray-200 dark:border-white/20 hover:bg-gray-950/10 dark:hover:bg-white/20 transition-all flex items-center justify-center focus:outline-none" 
                                    title="Share"
                                    aria-label="Share anime"
                                >
                                    <span class="material-icons text-xl text-gray-900 dark:text-white">share</span>
                                </button>
                                <button 
                                    @click="toggleFavorite" 
                                    class="w-10 h-10 bg-gray-950/5 dark:bg-white/10 rounded-lg border border-gray-200 dark:border-white/20 hover:bg-gray-950/10 dark:hover:bg-white/20 transition-all flex items-center justify-center focus:outline-none"
                                    aria-label="Toggle favorite"
                                    :title="isFavorite ? '已收藏' : '收藏'"
                                >
                                    <span class="material-icons text-xl" :class="isFavorite ? 'text-red-500' : 'text-gray-900 dark:text-white'">{{ isFavorite ? "favorite" : "favorite_border" }}</span>
                                </button>
                            </div>
                        </div>

                        <!-- Views and Likes -->
                        <div class="flex flex-wrap items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                            <div class="flex items-center gap-1.5">
                                <span class="material-icons text-base">visibility</span>
                                <span class="text-gray-900 dark:text-white">{{ formatViews(anime.views) }}</span>
                                <span>觀看</span>
                            </div>
                            <div class="flex items-center gap-1.5">
                                <span class="material-icons text-base">favorite</span>
                                <span class="text-gray-900 dark:text-white">{{ anime.userRating?.count || 0 }}</span>
                                <span>喜歡</span>
                            </div>
                            <div v-if="anime.userRating?.score" class="flex items-center gap-1.5">
                                <span class="material-icons text-base text-yellow-400">star</span>
                                <span class="text-gray-900 dark:text-white">{{ formatRating(anime.userRating.score) }}</span>
                            </div>
                        </div>

                        <!-- Description -->
                        <div class="text-gray-700 dark:text-gray-200 leading-relaxed" role="region" aria-label="Anime description">
                            {{ anime.description || "暫無簡介" }}
                        </div>

                        <!-- Tags Section -->
                        <div v-if="anime.tags && anime.tags.length > 0" class="flex flex-wrap items-center gap-2">
                            <NuxtLink
                                v-for="tag in anime.tags"
                                :key="tag"
                                :to="`/show-all-anime?tags=${encodeURIComponent(tag)}`"
                                class="px-3 py-1.5 bg-gray-950/5 dark:bg-white/10 rounded-full border border-gray-200 dark:border-white/20 
                                        text-sm font-medium text-gray-900 dark:text-white
                                        hover:bg-gray-950/10 dark:hover:bg-white/20 hover:border-gray-300 dark:hover:border-white/40
                                        transition-all duration-200
                                        flex items-center gap-1.5
                                        focus:outline-none"
                            >
                                <span class="material-icons text-xs">tag</span>
                                {{ tag }}
                            </NuxtLink>
                        </div>

                        <!-- Additional Details -->
                        <div v-if="additionalDetails.length > 0" class="pt-4 border-t border-gray-200 dark:border-gray-700">
                            <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4">詳細資訊</h3>
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div 
                                    v-for="detail in additionalDetails" 
                                    :key="detail.label"
                                    class="bg-gray-950/5 dark:bg-white/10 rounded-xl p-4"
                                >
                                    <div class="flex items-start gap-3">
                                        <div class="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" :class="detail.iconBg">
                                            <span class="material-icons text-xl" :class="detail.iconColor">{{ detail.icon }}</span>
                                        </div>
                                        <div class="flex-1 min-w-0">
                                            <p class="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{{ detail.label }}</p>
                                            <p class="text-sm font-semibold text-gray-900 dark:text-white">{{ detail.value }}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>
                </div>

                <!-- Right Column (30% on wide screens) - Desktop Only -->
                <aside class="hidden lg:block lg:w-[25%] lg:sticky lg:top-20 lg:self-start space-y-6" aria-label="Episode list and related content">
                    <!-- Continue Watching Prompt -->
                    <transition name="slide-down">
                        <section v-if="showContinuePrompt && lastWatchedData" aria-label="Continue watching">
                            <div class="bg-gray-950/5 dark:bg-white/10 rounded-xl shadow-lg overflow-hidden">
                                <div class="p-4 space-y-3">
                                    <div class="flex items-center gap-3">
                                        <div class="w-10 h-10 bg-black/70 dark:bg-white/10 rounded-lg flex items-center justify-center flex-shrink-0">
                                            <span class="material-icons text-xl text-white dark:text-white">play_circle</span>
                                        </div>
                                        <div class="flex-1 min-w-0">
                                            <h3 class="text-sm font-bold text-gray-900 dark:text-white mb-0.5">繼續觀看</h3>
                                            <p class="text-xs text-gray-600 dark:text-white/80 truncate">
                                                第 {{ lastWatchedData.episode_number }} 集
                                            </p>
                                        </div>
                                    </div>
                                    
                                    <!-- Progress Bar -->
                                    <div class="space-y-1.5">
                                        <div class="flex items-center justify-between text-xs text-gray-600 dark:text-white/70">
                                            <span>{{ formatDuration(lastWatchedData.playback_time) }} / {{ formatDuration(lastWatchedData.video_duration) }}</span>
                                            <span>{{ lastWatchedData.progress_percentage }}%</span>
                                        </div>
                                        <div class="h-1.5 bg-gray-200 dark:bg-white/10 rounded-full overflow-hidden">
                                            <div 
                                                class="h-full bg-black/70 dark:bg-white rounded-full transition-all"
                                                :style="{ width: `${lastWatchedData.progress_percentage}%` }"
                                            ></div>
                                        </div>
                                    </div>
                                    
                                    <button 
                                        @click="continueLast" 
                                        class="w-full px-4 py-2.5 bg-black/70 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 rounded-lg transition-all font-medium flex items-center justify-center gap-2 text-sm"
                                    >
                                        <span class="material-icons text-lg">play_arrow</span>
                                        繼續播放
                                    </button>
                                </div>
                            </div>
                        </section>
                    </transition>

                    <!-- Episode Picker -->
                    <section aria-label="Episode selector">
                        <div class="flex items-center justify-between mb-4">
                            <h2 class="text-xl font-bold text-gray-900 dark:text-white">選擇集數</h2>
                            <span v-if="anime?.episodes" class="text-sm text-gray-600 dark:text-gray-400">
                                共 <span class="font-semibold text-gray-900 dark:text-white">{{ Object.keys(anime.episodes).length }}</span> 集
                            </span>
                        </div>
                        <EpisodesPicker 
                            v-if="anime?.episodes" 
                            :episodes="anime.episodes" 
                            :watch-progress="allWatchProgress" 
                            :compact="true"
                            :anime-image="anime.image"
                            v-model="selectedEpisode" 
                            @select="(n) => (selectedEpisode = n)" 
                        />
                        <div v-else class="text-center py-8 text-gray-500 dark:text-gray-400">
                            <span class="material-icons text-4xl mb-2 opacity-50">video_library</span>
                            <p>暫無可用集數</p>
                        </div>
                    </section>

                    <!-- Related Anime -->
                    <section v-if="anime.relatedAnime && anime.relatedAnime.length" aria-label="Related anime">
                        <h2 class="text-xl font-bold text-gray-900 dark:text-white mb-4">相關動漫</h2>
                        <div class="space-y-3" role="list" aria-label="Related anime list">
                            <NuxtLink
                                v-for="item in anime.relatedAnime"
                                :key="item.refId || item.video_url"
                                :to="`/anime/${item.refId}`"
                                class="flex gap-3 p-2 rounded-lg hover:bg-gray-950/5 dark:hover:bg-white/10 transition-colors group focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-white focus:ring-offset-2"
                                role="listitem"
                                :aria-label="`View ${item.title}`"
                            >
                                <div class="flex-shrink-0 w-32 aspect-video rounded overflow-hidden bg-gray-200 dark:bg-gray-700">
                                    <img
                                        :src="item.image"
                                        :alt="`${item.title} thumbnail`"
                                        loading="lazy"
                                        decoding="async"
                                        class="w-full h-full object-cover transform transition-transform duration-300 group-hover:scale-110"
                                    />
                                </div>
                                <div class="flex-1 min-w-0 space-y-1">
                                    <h3 class="font-semibold text-sm text-gray-900 dark:text-white line-clamp-1 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors">
                                        {{ item.title }}
                                    </h3>
                                    <div class="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
                                        <span v-if="item.year" class="flex items-center gap-1" aria-label="Release year">
                                            <span class="material-icons text-xs" aria-hidden="true">calendar_today</span>
                                            {{ item.year }}
                                        </span>
                                        <span v-if="item.episodes" class="flex items-center gap-1" aria-label="Episode count">
                                            <span class="material-icons text-xs" aria-hidden="true">movie</span>
                                            {{ item.episodes }}
                                        </span>
                                        <span v-if="item.views" class="flex items-center gap-1" aria-label="Views">
                                            <span class="material-icons text-xs" aria-hidden="true">visibility</span>
                                            {{ formatViews(item.views) }}
                                        </span>
                                    </div>
                                </div>
                            </NuxtLink>
                        </div>
                    </section>
                </aside>
            </div>
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
                <span class="material-icons text-3xl text-gray-600 dark:text-gray-400">keyboard</span>
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
    @apply bg-gray-950/5 dark:bg-white/10 rounded-2xl shadow-lg p-4 sm:p-6 transition-all duration-300 hover:shadow-xl;
}

.info-card {
    @apply flex items-center gap-3 px-4 py-3 bg-gray-950/5 backdrop-blur-sm rounded-lg border border-white/20;
}

.anime-card-item {
    @apply bg-white dark:bg-black/5 !important;
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

/* Ensure video player maintains 16:9 aspect ratio */
section[aria-label="Video player"] > div {
    @apply w-full;
}

/* Line clamp utility for description */
.line-clamp-3 {
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
}

/* Focus visible styles for better accessibility */
*:focus-visible {
    @apply outline-none ring-2 ring-gray-900 dark:ring-white ring-offset-2;
}
</style>
