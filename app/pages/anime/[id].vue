<script setup>
// Core
const { userSettings, getShortcuts, formatShortcutKey } = useUserSettings()
const appConfig = useAppConfig()
const route = useRoute()
const router = useRouter()
const client = useSupabaseClient()
const { isAdmin } = useAdmin()

const userShortcuts = computed(() => getShortcuts())

const { setWatching, setOnline } = useUserStatus()

const {
    hoveredAnime, animeDetails, tooltipLoading, tooltipError, tooltipPosition,
    handleMouseEnter: handleTooltipMouseEnter,
    handleMouseLeave: handleTooltipMouseLeave,
    handleTooltipEnter, handleTooltipLeave,
    setFavoriteStatus, cleanup: cleanupAnimeTooltip,
} = useAnimeTooltip()

const SAVE_INTERVAL = 120000
let saveIntervalTimer = null

// ─── State ────────────────────────────────────────────────────────────────────

const anime = ref(null)
const selectedEpisode = ref(null)
const videoUrl = ref(null)
const videoIsHls = ref(false)
const error = ref(null)
const loading = ref(true)
const isFavorite = ref(false)
const showShareDialog = ref(false)
const showDetailDialog = ref(false)
const shareUrl = ref("")
const showShortcutsModal = ref(false)
const showToolbarOverflowMenu = ref(false)
const toolbarOverflowRoot = ref(null)
let toolbarOverflowClickHandler = null

// Offline
const {
    loadAnimeSnapshot, deleteAnimeSnapshot, listDownloadedEpisodeKeys,
    removeEpisode: removeOfflineEpisode, getOfflinePlayback, getOfflineThumbnailAssets,
} = useOfflineAnimeDownloads()
const { showToast } = useToast()
const { runOfflineDownloadBatch } = useOfflineDownloadQueue()
const showOfflineDownloadDialog = ref(false)
const offlineDownloadedKeys = ref([])
const isOfflineDownloading = ref(false)
const offlineDownloadProgress = ref(0)
const offlineDownloadLabel = ref("")
const offlinePlaybackRevoke = ref(null)
const offlineThumbRevoke = ref(null)
const offlineThumbnailJpgUrl = ref(null)
const offlineThumbnailVttText = ref(null)
const offlineModeBanner = ref(false)

// Watch history / continue watching
const lastWatchedData = ref(null)
const showContinuePrompt = ref(false)
const allWatchProgress = ref({})

// Player
const videoPlayer = ref(null)
const hasSetInitialTime = ref(false)

// ─── Computed ─────────────────────────────────────────────────────────────────

const sortedEpisodeKeys = computed(() => {
    if (!anime.value?.episodes) return []
    return Object.keys(anime.value.episodes).sort((a, b) => {
        const na = parseInt(a, 10), nb = parseInt(b, 10)
        return !isNaN(na) && !isNaN(nb) ? na - nb : a.localeCompare(b)
    })
})

const episodeInfo = computed(() => {
    const keys = sortedEpisodeKeys.value
    const currentIndex = keys.indexOf(String(selectedEpisode.value))
    return { keys, currentIndex }
})

const hasNextEpisode = computed(() => {
    const { keys, currentIndex } = episodeInfo.value
    return currentIndex !== -1 && currentIndex < keys.length - 1
})

const currentEpisodeData = computed(() => {
    if (!anime.value?.episodes || selectedEpisode.value == null) return null
    return anime.value.episodes[String(selectedEpisode.value)] ?? null
})

const currentVideoId = computed(() => {
    const ep = currentEpisodeData.value
    return typeof ep === "string" ? null : ep?.video_id ?? null
})

const videoPlayerMeta = computed(() => ({
    title: anime.value?.title ?? null,
    episode: selectedEpisode.value ?? null,
    videoId: currentVideoId.value,
    thumbnailJpgUrl: offlineThumbnailJpgUrl.value,
    thumbnailVttText: offlineThumbnailVttText.value,
}))

const isMac = computed(() =>
    typeof window !== "undefined" && /Mac|iPhone|iPod|iPad/i.test(navigator.platform)
)

const additionalDetails = computed(() => {
    if (!anime.value) return []
    const map = [
        { key: "premiereDate",      label: "首播日期", icon: "event",          iconBg: "bg-pink-100 dark:bg-pink-900/30",  iconColor: "text-pink-600 dark:text-pink-400" },
        { key: "productionCompany", label: "製作公司", icon: "business",       iconBg: "bg-gray-100 dark:bg-gray-800",     iconColor: "text-gray-600 dark:text-gray-400" },
        { key: "director",          label: "導演監督", icon: "person",         iconBg: "bg-gray-100 dark:bg-gray-800",     iconColor: "text-gray-600 dark:text-gray-400" },
        { key: "distributor",       label: "發行商",   icon: "local_shipping", iconBg: "bg-blue-100 dark:bg-blue-900/30",  iconColor: "text-blue-600 dark:text-blue-400" },
    ]
    return map.filter(d => anime.value[d.key]).map(d => ({ ...d, value: anime.value[d.key] }))
})

const animeToolbarActions = computed(() => {
    if (!anime.value) return []
    const actions = []

    if (anime.value.detailId) {
        actions.push({ key: 'detail', label: '詳情', icon: 'info', iconClass: 'text-gray-900 dark:text-white', run: () => { showDetailDialog.value = true } })
    }

    actions.push(
        { key: 'share',    label: '分享',                          icon: 'share',          iconClass: 'text-gray-900 dark:text-white',  run: () => openShareDialog() },
        { key: 'favorite', label: isFavorite.value ? '已收藏' : '收藏', icon: isFavorite.value ? 'bookmark_added' : 'bookmark_add', iconClass: isFavorite.value ? 'text-red-500' : 'text-gray-900 dark:text-white', run: () => toggleFavorite() },
    )

    if (anime.value.episodes && Object.keys(anime.value.episodes).length) {
        actions.push({ key: 'offline', label: '離線下載', icon: 'download', iconClass: 'text-gray-900 dark:text-white', run: () => { showOfflineDownloadDialog.value = true } })
    }

    if (isAdmin.value === true) {
        const sourceId = anime.value.refId ?? route.params.id
        const hasVideoId = anime.value.videoId != null && String(anime.value.videoId).length > 0
        if (sourceId || hasVideoId) {
            actions.push({
                key: 'admin', label: '後台管理', icon: 'admin_panel_settings', iconClass: 'text-gray-900 dark:text-white',
                run: () => router.push({ path: '/admin', query: { field: hasVideoId ? 'video_id' : 'source_id', search: hasVideoId ? String(anime.value.videoId) : String(sourceId), operator: 'eq' } }),
            })
        }
    }

    return actions
})

const toolbarPrimaryActions = computed(() => animeToolbarActions.value.slice(0, 3))
const toolbarOverflowActions = computed(() => animeToolbarActions.value.slice(3))

// ─── Offline helpers ──────────────────────────────────────────────────────────

function revokeOfflinePlayback() {
    offlinePlaybackRevoke.value?.()
    offlinePlaybackRevoke.value = null
}

function revokeOfflineThumbnails() {
    offlineThumbRevoke.value?.()
    offlineThumbRevoke.value = null
    offlineThumbnailJpgUrl.value = null
    offlineThumbnailVttText.value = null
}

async function refreshOfflineEpisodeList() {
    offlineDownloadedKeys.value = anime.value?.refId
        ? await listDownloadedEpisodeKeys(anime.value.refId)
        : []
}

async function handleOfflineDownload(keys) {
    if (!anime.value || !keys?.length) return
    isOfflineDownloading.value = true
    offlineDownloadProgress.value = 0
    offlineDownloadLabel.value = ""
    try {
        await runOfflineDownloadBatch({
            refId: anime.value.refId,
            animeTitle: anime.value.title,
            animeSnapshot: anime.value,
            keys,
            episodes: anime.value.episodes || {},
            setOverallProgress: (v) => { offlineDownloadProgress.value = v },
            setOverallLabel:    (v) => { offlineDownloadLabel.value = v },
            toast: (msg, type, duration) => showToast(msg, type, duration),
        })
        await refreshOfflineEpisodeList()
    } catch (err) {
        showToast(err?.message || "下載失敗", "error")
    } finally {
        offlineDownloadProgress.value = 100
        offlineDownloadLabel.value = ""
        isOfflineDownloading.value = false
    }
}

async function handleOfflineRemoveEpisode(ep) {
    if (!anime.value?.refId) return
    try {
        await removeOfflineEpisode(anime.value.refId, ep)
        showToast("已刪除離線檔案", "success")
        await refreshOfflineEpisodeList()
    } catch { showToast("刪除失敗", "error") }
}

async function handleOfflineRemoveAll() {
    if (!anime.value?.refId || !confirm("確定清除此作品所有離線下載？")) return
    try {
        const keys = await listDownloadedEpisodeKeys(anime.value.refId)
        for (const k of keys) await removeOfflineEpisode(anime.value.refId, k)
        await deleteAnimeSnapshot(anime.value.refId)
        showToast("已清除離線資料", "success")
        await refreshOfflineEpisodeList()
    } catch { showToast("清除失敗", "error") }
}

// ─── UI actions ───────────────────────────────────────────────────────────────

function openShareDialog() {
    if (typeof window !== "undefined") {
        const params = new URLSearchParams()
        if (selectedEpisode.value && videoPlayer.value) {
            params.set("e", selectedEpisode.value)
            const t = videoPlayer.value.currentTime
            if (t > 0) params.set("t", Math.floor(t).toString())
        }
        const base = window.location.origin + route.path
        shareUrl.value = params.toString() ? `${base}?${params}` : base
    }
    showShareDialog.value = true
}

function formatRating(score) {
    return score ? parseFloat(score).toFixed(1) : "N/A"
}

// ─── Toolbar overflow click-outside ──────────────────────────────────────────

watch(showToolbarOverflowMenu, (open) => {
    if (!import.meta.client) return
    if (toolbarOverflowClickHandler) {
        document.removeEventListener('click', toolbarOverflowClickHandler, true)
        toolbarOverflowClickHandler = null
    }
    if (!open) return
    toolbarOverflowClickHandler = (e) => {
        if (toolbarOverflowRoot.value && !toolbarOverflowRoot.value.contains(e.target))
            showToolbarOverflowMenu.value = false
    }
    nextTick(() => setTimeout(() => {
        if (showToolbarOverflowMenu.value && toolbarOverflowClickHandler)
            document.addEventListener('click', toolbarOverflowClickHandler, true)
    }, 0))
})

watch(() => route.fullPath, () => { showToolbarOverflowMenu.value = false })

// ─── Continue watching ────────────────────────────────────────────────────────

function continueLast() {
    if (!lastWatchedData.value) return
    selectedEpisode.value = lastWatchedData.value.episode_number
    showContinuePrompt.value = false
    router.replace({ path: route.path, query: { e: lastWatchedData.value.episode_number, t: lastWatchedData.value.playback_time } })
}

// ─── Episode navigation ───────────────────────────────────────────────────────

function handleNextEpisode() {
    const { keys, currentIndex } = episodeInfo.value
    if (currentIndex !== -1 && currentIndex < keys.length - 1)
        selectedEpisode.value = keys[currentIndex + 1]
}

function handlePreviousEpisode() {
    const { keys, currentIndex } = episodeInfo.value
    if (currentIndex > 0) selectedEpisode.value = keys[currentIndex - 1]
}

// ─── Playback events ──────────────────────────────────────────────────────────

function handlePlay()  { startAutoSave() }
function handlePause() { stopAutoSave() }
function handleEnded() { saveWatchHistory(); stopAutoSave(); setOnline() }

// ─── Favorites ────────────────────────────────────────────────────────────────

async function toggleFavorite() {
    if (!anime.value || !userSettings.value.id) return
    isFavorite.value = !isFavorite.value
    const { error } = isFavorite.value
        ? await client.from("favorites").insert({ user_id: userSettings.value.id, anime_ref_id: anime.value.refId, anime_title: anime.value.title, anime_image: anime.value.image })
        : await client.from("favorites").delete().match({ user_id: userSettings.value.id, anime_ref_id: anime.value.refId })
    if (error) throw new Error(error.message)
}

// ─── Watch history ────────────────────────────────────────────────────────────

function startAutoSave() {
    if (!saveIntervalTimer) saveIntervalTimer = setInterval(saveWatchHistory, SAVE_INTERVAL)
}

function stopAutoSave() {
    clearInterval(saveIntervalTimer)
    saveIntervalTimer = null
}

async function saveWatchHistory(episodeNumber = null) {
    if (!userSettings.value.watch_history_enabled || !userSettings.value.id || !anime.value || !videoPlayer.value) return
    const epNum = (typeof episodeNumber === "number" || typeof episodeNumber === "string" ? episodeNumber : null) || selectedEpisode.value
    if (!epNum) return

    const duration = videoPlayer.value.duration
    const currentTime = videoPlayer.value.currentTime
    if (!duration) return

    const historyData = {
        user_id: userSettings.value.id,
        anime_ref_id: anime.value.refId,
        anime_title: anime.value.title,
        anime_image: anime.value.image,
        episode_number: String(epNum),
        playback_time: Math.floor(currentTime),
        video_duration: Math.floor(duration),
        progress_percentage: Math.min(100, Math.floor((currentTime / duration) * 100)),
    }

    try {
        const { error } = await client.from("watch_history").upsert(historyData, { onConflict: "user_id, anime_ref_id, episode_number" })
        if (error) throw error
        allWatchProgress.value[historyData.episode_number] = historyData
        lastWatchedData.value = historyData
    } catch (err) { console.error("Failed to save watch history:", err) }
}

async function fetchLastWatched() {
    if (!userSettings.value.id || !anime.value) return
    try {
        const { data, error } = await client.from("watch_history")
            .select("*")
            .eq("anime_ref_id", anime.value.refId)
            .eq("user_id", userSettings.value.id)
            .order("updated_at", { ascending: false })

        if (!error && data?.length) {
            allWatchProgress.value = {}
            data.forEach(item => {
                if (!allWatchProgress.value[item.episode_number])
                    allWatchProgress.value[item.episode_number] = item
            })
            lastWatchedData.value = data[0]
            if (lastWatchedData.value.progress_percentage < 90 && !route.query.e)
                showContinuePrompt.value = true
        }
    } catch (err) { console.error("Failed to fetch last watched:", err) }
}

// ─── Video ready ──────────────────────────────────────────────────────────────

async function onVideoReady() {
    if (hasSetInitialTime.value) return

    let startTime = null
    if (route.query.t) {
        startTime = parseFloat(route.query.t)
    } else if (selectedEpisode.value && allWatchProgress.value[String(selectedEpisode.value)]) {
        startTime = allWatchProgress.value[String(selectedEpisode.value)].playback_time
    }

    if (startTime && videoPlayer.value && !isNaN(startTime) && startTime > 0) {
        const videoEl = videoPlayer.value.videoElement
        const doSeek = () => { if (!hasSetInitialTime.value && videoPlayer.value) { videoPlayer.value.seek(startTime); hasSetInitialTime.value = true } }
        if (videoEl?.readyState >= 2) { videoPlayer.value.seek(startTime); hasSetInitialTime.value = true }
        else videoEl?.addEventListener("canplay", doSeek, { once: true })
    } else {
        hasSetInitialTime.value = true
    }

    const videoEl = videoPlayer.value?.videoElement
    if (videoEl) setTimeout(() => videoEl.scrollIntoView({ behavior: "smooth", block: "center" }), 100)

    if (anime.value && selectedEpisode.value) {
        setWatching({ refId: anime.value.refId, title: anime.value.title, image: anime.value.image, episode: selectedEpisode.value })
    }
}

// ─── Episode watcher ──────────────────────────────────────────────────────────

function applyEpisodeQueryFromRoute() {
    if (!anime.value?.episodes || !route.query.e) return
    const key = route.query.e
    if (anime.value.episodes[key]) { selectedEpisode.value = key; return }
    const num = parseInt(key)
    if (!isNaN(num) && anime.value.episodes[String(num)]) selectedEpisode.value = String(num)
}

watch(selectedEpisode, async (epNum, oldEpNum) => {
    if (!epNum || !anime.value?.episodes) return

    const isManualChange = oldEpNum !== null && oldEpNum !== epNum
    if (isManualChange) {
        if (oldEpNum && videoPlayer.value) await saveWatchHistory(oldEpNum)
        hasSetInitialTime.value = false
        if (route.query.t || route.query.e) {
            const q = { ...route.query }
            delete q.t; delete q.e
            router.replace({ path: route.path, query: q })
        }
    }

    revokeOfflinePlayback()
    revokeOfflineThumbnails()

    const refId = anime.value.refId

    if (import.meta.client && refId) {
        const thumb = await getOfflineThumbnailAssets(refId, epNum)
        if (thumb) {
            offlineThumbnailJpgUrl.value = thumb.jpgUrl || null
            offlineThumbnailVttText.value = thumb.vttText || null
            offlineThumbRevoke.value = thumb.revoke
        }
    }

    if (import.meta.client && refId) {
        const playback = await getOfflinePlayback(refId, epNum)
        if (playback) {
            offlinePlaybackRevoke.value = playback.revoke
            videoUrl.value = playback.url
            videoIsHls.value = playback.isHls
            return
        }
    }

    const token = anime.value.episodes[String(epNum)]?.token
    if (!token) { videoUrl.value = null; videoIsHls.value = false; return }

    showContinuePrompt.value = false
    try {
        const res = await $fetch(`/api/episode/${token}`)
        if (res?.s?.length) {
            const raw = res.s[0].src
            const finalUrl = raw.startsWith("http") ? raw : `https:${raw}`
            videoUrl.value = `/api/proxy-video?url=${encodeURIComponent(finalUrl)}&cookie=${encodeURIComponent(res.videoCookie)}`
            videoIsHls.value = /\.m3u8(\?|$)/i.test(finalUrl) || finalUrl.toLowerCase().includes("m3u8")
        } else {
            videoUrl.value = null; videoIsHls.value = false
        }
    } catch (err) {
        console.error("Episode fetch failed:", err)
        if (import.meta.client && refId) {
            const playback = await getOfflinePlayback(refId, epNum)
            if (playback) {
                offlinePlaybackRevoke.value = playback.revoke
                videoUrl.value = playback.url
                videoIsHls.value = playback.isHls
                showToast("使用離線影片播放", "info", 2500)
                return
            }
        }
        videoUrl.value = null; videoIsHls.value = false
    }
})

// ─── Data fetching ────────────────────────────────────────────────────────────

async function fetchDetail() {
    loading.value = true
    error.value = null
    videoUrl.value = null
    videoIsHls.value = false
    selectedEpisode.value = null
    revokeOfflinePlayback()
    revokeOfflineThumbnails()
    offlineModeBanner.value = false

    try {
        const res = await $fetch(`/api/anime/${route.params.id}?withEpisodes=true`)
        if (!res || !Object.keys(res).length) { error.value = "找不到此動漫的詳細資訊"; return }
        anime.value = res
        isFavorite.value = res.isFavorite
        useHead({ title: `${res.title} | ${appConfig.siteName}` })
        await fetchLastWatched()
        await refreshOfflineEpisodeList()
        applyEpisodeQueryFromRoute()
    } catch (err) {
        if (import.meta.client) {
            try {
                const snap = await loadAnimeSnapshot(route.params.id)
                if (snap?.episodes && Object.keys(snap.episodes).length) {
                    anime.value = snap
                    useHead({ title: `${snap.title} | ${appConfig.siteName}` })
                    offlineModeBanner.value = true
                    await refreshOfflineEpisodeList()
                    applyEpisodeQueryFromRoute()
                    return
                }
            } catch (offlineErr) { console.error("Offline snapshot load failed:", offlineErr) }
        }
        useHead({ title: `載入動漫詳情失敗 | ${appConfig.siteName}` })
        error.value = "載入動漫詳情失敗，請稍後再試"
    } finally {
        loading.value = false
    }
}

// ─── Keyboard shortcuts ───────────────────────────────────────────────────────

function handleShortcutsKeydown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === "/") {
        e.preventDefault()
        showShortcutsModal.value = !showShortcutsModal.value
    }
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

onMounted(() => {
    fetchDetail()
    window.addEventListener("beforeunload", () => saveWatchHistory())
    window.addEventListener("keydown", handleShortcutsKeydown)
})

onUnmounted(() => {
    saveWatchHistory()
    stopAutoSave()
    setOnline()
    revokeOfflinePlayback()
    revokeOfflineThumbnails()
    if (toolbarOverflowClickHandler) document.removeEventListener('click', toolbarOverflowClickHandler, true)
    window.removeEventListener("beforeunload", saveWatchHistory)
    window.removeEventListener("keydown", handleShortcutsKeydown)
    cleanupAnimeTooltip()
})
</script>

<template>
    <!-- Loading -->
    <SkeletonAnimeDetail v-if="loading" />

    <!-- Error -->
    <div v-else-if="error" class="flex flex-col justify-center items-center min-h-screen text-center px-4">
        <div class="w-20 h-20 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-6">
            <span class="material-icons text-5xl text-red-500 dark:text-red-400">error_outline</span>
        </div>
        <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">載入失敗</h2>
        <p class="text-red-600 dark:text-red-400 mb-6 max-w-md">{{ error }}</p>
        <button @click="router.back()" class="px-6 py-3 bg-gray-900 dark:bg-gray-100 hover:bg-gray-800 dark:hover:bg-gray-200 text-white dark:text-gray-900 rounded-lg shadow-lg transition-all transform hover:-translate-y-0.5">返回上一頁</button>
    </div>

    <!-- Empty -->
    <div v-else-if="!anime" class="flex flex-col justify-center items-center min-h-screen">
        <span class="material-icons text-6xl text-gray-400 mb-4">movie_filter</span>
        <p class="text-gray-600 dark:text-gray-400">無可用的動漫資料</p>
    </div>

    <!-- Content -->
    <div v-else class="bg-white dark:bg-gray-950">
        <div class="space-y-8 max-w-[96rem] mx-auto px-3 sm:px-4 py-4 sm:py-8">
            <div class="flex flex-col lg:flex-row gap-6">

                <!-- Left Column -->
                <div class="flex-1 lg:w-[75%] space-y-4">

                    <!-- Video Player -->
                    <section aria-label="Video player">
                        <!-- Thumbnail placeholder (no video selected) -->
                        <div v-if="!videoUrl && anime?.image"
                            class="aspect-video relative rounded-lg overflow-hidden bg-gray-900 dark:bg-gray-950">
                            <div class="absolute inset-0">
                                <NuxtImg :src="anime.image" alt="Anime thumbnail" loading="eager"
                                    class="w-full h-full object-cover"
                                    style="filter: blur(2px);" />
                            </div>
                            <div class="absolute inset-0 bg-gradient-to-b from-black/70 via-black/60 to-black/80" />
                            <div class="absolute inset-0 flex flex-col items-center justify-center z-[1] px-4 sm:px-8">
                                <span class="material-icons text-white text-4xl sm:text-5xl pb-4">play_circle_outline</span>
                                <div class="text-center space-y-2 sm:space-y-3">
                                    <h3 class="text-xl sm:text-2xl font-bold text-white mb-2">選擇集數開始播放</h3>
                                    <p class="text-sm sm:text-base text-white/80 max-w-md">請從右側（或下方）選擇您想觀看的集數</p>
                                </div>
                            </div>
                        </div>

                        <!-- Video Player -->
                        <VideoPlayer
                            v-if="videoUrl"
                            ref="videoPlayer"
                            :src="videoUrl"
                            :is-hls="videoIsHls"
                            :anime-meta="videoPlayerMeta"
                            preload="metadata"
                            :has-next-episode="hasNextEpisode"
                            :shortcuts="userShortcuts"
                            autoplay
                            @play="handlePlay"
                            @pause="handlePause"
                            @ended="handleEnded"
                            @next-episode="handleNextEpisode"
                            @previous-episode="handlePreviousEpisode"
                            @loadeddata="onVideoReady"
                        />
                    </section>

                    <!-- Offline Banner -->
                    <div v-if="offlineModeBanner"
                        class="flex items-center gap-3 p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50 text-amber-900 dark:text-amber-100 text-sm"
                        role="status">
                        <span class="material-icons flex-shrink-0 text-xl">wifi_off</span>
                        <p>離線模式：已從本機載入先前快取的動漫資料。請選擇已下載的集數觀看；重新整理前請勿關閉此分頁。</p>
                    </div>

                    <!-- Anime Information -->
                    <section class="space-y-4" aria-label="Anime information">
                        <!-- Title + Actions -->
                        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                            <h1 class="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white leading-tight">{{ anime.title }}</h1>
                            <div class="flex items-center gap-2 flex-shrink-0">
                                <button v-for="action in toolbarPrimaryActions" :key="action.key"
                                    type="button"
                                    class="w-10 h-10 bg-gray-950/5 dark:bg-white/10 rounded-lg border border-gray-200 dark:border-white/20 hover:bg-gray-950/10 dark:hover:bg-white/20 transition-all flex items-center justify-center focus:outline-none"
                                    :title="action.label" :aria-label="action.label"
                                    @click="action.run()">
                                    <span class="material-icons text-xl" :class="action.iconClass">{{ action.icon }}</span>
                                </button>
                                <div v-if="toolbarOverflowActions.length" ref="toolbarOverflowRoot" class="relative">
                                    <button type="button"
                                        class="w-10 h-10 bg-gray-950/5 dark:bg-white/10 rounded-lg border border-gray-200 dark:border-white/20 hover:bg-gray-950/10 dark:hover:bg-white/20 transition-all flex items-center justify-center focus:outline-none"
                                        title="更多" aria-label="更多操作"
                                        :aria-expanded="showToolbarOverflowMenu"
                                        @click.stop="showToolbarOverflowMenu = !showToolbarOverflowMenu">
                                        <span class="material-icons text-xl text-gray-900 dark:text-white">more_vert</span>
                                    </button>
                                    <div v-show="showToolbarOverflowMenu"
                                        class="absolute right-0 top-full mt-2 min-w-[11rem] py-1 rounded-lg border border-gray-200 dark:border-white/20 bg-white dark:bg-gray-950 shadow-lg z-10"
                                        role="menu" @click.stop>
                                        <button v-for="action in toolbarOverflowActions" :key="action.key"
                                            type="button"
                                            class="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-white/10"
                                            role="menuitem"
                                            @click="action.run(); showToolbarOverflowMenu = false">
                                            <span class="material-icons text-lg flex-shrink-0" :class="action.iconClass">{{ action.icon }}</span>
                                            <span>{{ action.label }}</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Stats -->
                        <div class="flex flex-wrap items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                            <div class="flex items-center gap-1.5">
                                <span class="material-icons text-base">visibility</span>
                                <span class="text-gray-900 dark:text-white">{{ formatViews(anime.views) }}</span>
                                <span>觀看</span>
                            </div>
                            <div class="flex items-center gap-1.5">
                                <span class="material-icons text-base">favorite</span>
                                <span class="text-gray-900 dark:text-white">{{ formatViews(anime.userRating.votes) }}</span>
                                <span>喜歡</span>
                            </div>
                            <div v-if="anime.userRating?.score" class="flex items-center gap-1.5">
                                <span class="material-icons text-base text-yellow-400">star</span>
                                <span class="text-gray-900 dark:text-white">{{ formatRating(anime.userRating.score) }}</span>
                            </div>
                        </div>

                        <!-- Description -->
                        <div class="text-gray-700 dark:text-gray-200 leading-relaxed">{{ anime.description || "暫無簡介" }}</div>

                        <!-- Tags -->
                        <div v-if="anime.tags?.length" class="flex flex-wrap items-center gap-2">
                            <NuxtLink v-for="tag in anime.tags" :key="tag"
                                :to="`/show-all-anime?tags=${encodeURIComponent(tag)}`"
                                class="px-3 py-1.5 bg-gray-950/5 dark:bg-white/10 rounded-full border border-gray-200 dark:border-white/20 text-sm font-medium text-gray-900 dark:text-white hover:bg-gray-950/10 dark:hover:bg-white/20 hover:border-gray-300 dark:hover:border-white/40 transition-all flex items-center gap-1.5 focus:outline-none">
                                <span class="material-icons text-xs">tag</span>
                                {{ tag }}
                            </NuxtLink>
                        </div>

                        <!-- Additional Details -->
                        <div v-if="additionalDetails.length" class="pt-4 border-t border-gray-200 dark:border-gray-700">
                            <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4">詳細資訊</h3>
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div v-for="detail in additionalDetails" :key="detail.label"
                                    class="bg-gray-950/5 dark:bg-white/10 rounded-xl p-4">
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

                <!-- Right Column / Sidebar (sticky on desktop, inline on mobile) -->
                <aside class="lg:w-[25%] lg:sticky lg:top-20 lg:self-start space-y-6" aria-label="Episode list and related content">

                    <!-- Continue Watching Prompt -->
                    <transition name="slide-down">
                        <section v-if="showContinuePrompt && lastWatchedData" aria-label="Continue watching">
                            <div class="bg-gray-950/5 dark:bg-white/10 rounded-xl shadow-lg overflow-hidden">
                                <div class="p-4 space-y-3">
                                    <div class="flex items-center gap-3">
                                        <div class="w-10 h-10 bg-black/70 dark:bg-white/10 rounded-lg flex items-center justify-center flex-shrink-0">
                                            <span class="material-icons text-xl text-white">play_circle</span>
                                        </div>
                                        <div class="flex-1 min-w-0">
                                            <h3 class="text-sm font-bold text-gray-900 dark:text-white mb-0.5">繼續觀看</h3>
                                            <p class="text-xs text-gray-600 dark:text-white/80 truncate">第 {{ lastWatchedData.episode_number }} 集</p>
                                        </div>
                                    </div>
                                    <div class="space-y-1.5">
                                        <div class="flex items-center justify-between text-xs text-gray-600 dark:text-white/70">
                                            <span>{{ formatTime(lastWatchedData.playback_time) }} / {{ formatTime(lastWatchedData.video_duration) }}</span>
                                            <span>{{ lastWatchedData.progress_percentage }}%</span>
                                        </div>
                                        <div class="h-1.5 bg-gray-200 dark:bg-white/10 rounded-full overflow-hidden">
                                            <div class="h-full bg-black/70 dark:bg-white rounded-full transition-all"
                                                :style="{ width: `${lastWatchedData.progress_percentage}%` }" />
                                        </div>
                                    </div>
                                    <button @click="continueLast"
                                        class="w-full px-4 py-2.5 bg-black/70 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 rounded-lg transition-all font-medium flex items-center justify-center gap-2 text-sm">
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
                        <EpisodesPicker v-if="anime?.episodes"
                            :episodes="anime.episodes"
                            :watch-progress="allWatchProgress"
                            :compact="true"
                            :anime-image="anime.image"
                            v-model="selectedEpisode"
                            @select="(n) => (selectedEpisode = n)" />
                        <div v-else class="text-center py-8 text-gray-500 dark:text-gray-400">
                            <span class="material-icons text-4xl mb-2 opacity-50">video_library</span>
                            <p>暫無可用集數</p>
                        </div>
                    </section>

                    <!-- Related Anime -->
                    <section v-if="anime.relatedAnime?.length" aria-label="Related anime">
                        <h2 class="text-xl font-bold text-gray-900 dark:text-white mb-4">相關動漫</h2>
                        <div class="space-y-3" role="list">
                            <NuxtLink v-for="item in anime.relatedAnime" :key="item.refId || item.video_url"
                                :to="`/anime/${item.refId}`"
                                class="flex gap-3 p-2 rounded-lg hover:bg-gray-950/5 dark:hover:bg-white/10 transition-colors group focus:outline-none"
                                role="listitem" :aria-label="`View ${item.title}`"
                                @mouseenter="handleTooltipMouseEnter(item, $event)"
                                @mouseleave="handleTooltipMouseLeave">
                                <div class="flex-shrink-0 w-32 aspect-video rounded overflow-hidden bg-gray-200 dark:bg-gray-700">
                                    <NuxtImg :src="item.image" :alt="`${item.title} thumbnail`"
                                        loading="lazy" decoding="async"
                                        class="w-full h-full object-cover transform transition-transform duration-300 group-hover:scale-110" />
                                </div>
                                <div class="flex-1 min-w-0 space-y-1">
                                    <h3 class="font-semibold text-sm text-gray-900 dark:text-white line-clamp-1 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors">{{ item.title }}</h3>
                                    <div class="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
                                        <span v-if="item.year" class="flex items-center gap-1">
                                            <span class="material-icons text-xs">calendar_today</span> {{ item.year }}
                                        </span>
                                        <span v-if="item.episodes" class="flex items-center gap-1">
                                            <span class="material-icons text-xs">movie</span> {{ item.episodes }}
                                        </span>
                                        <span v-if="item.views" class="flex items-center gap-1">
                                            <span class="material-icons text-xs">visibility</span> {{ formatViews(item.views) }}
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

    <!-- Dialogs -->
    <LazyAnimeTooltip
        :hovered-anime="hoveredAnime" :anime-details="animeDetails"
        :tooltip-loading="tooltipLoading" :tooltip-error="tooltipError"
        :tooltip-position="tooltipPosition"
        :on-tooltip-enter="handleTooltipEnter" :on-tooltip-leave="handleTooltipLeave"
        :on-favorite-toggled="({ refId, isFavorite }) => setFavoriteStatus(refId, isFavorite)" />

    <LazyShareDialog v-model="showShareDialog" :share-url="shareUrl" :anime-title="anime?.title" :has-episode="!!selectedEpisode" />
    <LazyAnimeDetailDialog v-if="anime" v-model="showDetailDialog" :anime-id="anime.detailId" />

    <LazyOfflineDownloadDialog
        v-model="showOfflineDownloadDialog"
        :episode-keys="sortedEpisodeKeys"
        :episodes="anime?.episodes || {}"
        :downloaded-keys="offlineDownloadedKeys"
        :is-downloading="isOfflineDownloading"
        :download-progress="offlineDownloadProgress"
        :download-label="offlineDownloadLabel"
        @download="handleOfflineDownload"
        @download-all="handleOfflineDownload"
        @remove="handleOfflineRemoveEpisode"
        @remove-all="handleOfflineRemoveAll"
        @refresh="refreshOfflineEpisodeList" />

    <!-- Shortcuts Modal -->
    <LazyBaseDialog v-model="showShortcutsModal" max-width="max-w-2xl">
        <template #header>
            <div class="flex items-center gap-3">
                <span class="material-icons text-3xl text-gray-600 dark:text-gray-400">keyboard</span>
                <h3 class="text-2xl font-bold text-gray-900 dark:text-white">鍵盤快捷鍵</h3>
            </div>
        </template>
        <div class="space-y-4">
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
                            <kbd class="px-2 py-1 text-xs font-semibold text-gray-800 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded">{{ isMac ? '⌘' : 'Ctrl' }}</kbd>
                            <span class="text-xs text-gray-400">+</span>
                            <kbd class="px-2 py-1 text-xs font-semibold text-gray-800 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded">/</kbd>
                        </div>
                    </div>
                </div>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
                <template v-for="(shortcut, action) in userShortcuts" :key="action">
                    <div v-if="action !== 'playPause' && shortcut?.label"
                        class="flex items-center justify-between py-2 border-b border-gray-200 dark:border-gray-700">
                        <span class="text-sm text-gray-600 dark:text-gray-400">{{ shortcut.label }}</span>
                        <kbd class="px-2 py-1 text-xs font-semibold text-gray-800 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded">{{ formatShortcutKey(shortcut) }}</kbd>
                    </div>
                </template>
            </div>
            <div class="pt-4">
                <p class="text-xs text-gray-500 dark:text-gray-400 text-center">提示：在輸入框中輸入時，快捷鍵將不會生效</p>
            </div>
        </div>
    </LazyBaseDialog>
</template>

<style scoped>
.slide-down-enter-active, .slide-down-leave-active { transition: all 0.4s ease-out; }
.slide-down-enter-from, .slide-down-leave-to { opacity: 0; transform: translateY(-20px); }

*:focus-visible { @apply outline-none ring-2 ring-gray-900 dark:ring-white ring-offset-2; }
</style>