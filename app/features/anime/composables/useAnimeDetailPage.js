/**
 * Anime detail page: data loading, episode selection, playback, favorites, history, offline.
 * Must stay sync — any `await` here drops Vue/Nuxt instance for later composables.
 */
export function useAnimeDetailPage() {
    // ─── Composables ──────────────────────────────────────────────────────────
    const { userSettings, getShortcuts, formatShortcutKey } = useUserSettings()
    const user = useSupabaseUser()
    const appConfig = useAppConfig()
    const route = useRoute()
    const router = useRouter()
    const client = useSupabaseClient()
    const { isAdmin } = useAdmin()
    const { setWatching, setOnline } = useUserStatus()
    const { isIncognito } = useIncognitoMode()
    const { showToast } = useToast()
    const {
        loadAnimeSnapshot,
        listDownloadedEpisodeKeys,
        removeEpisode: removeOfflineEpisode,
        getOfflinePlayback,
        getOfflineThumbnailAssets,
    } = useOfflineAnimeDownloads()
    const { runOfflineDownloadBatch } = useOfflineDownloadQueue()
    const {
        put: putOfflineWatchHistory,
        listForAnime: listOfflineWatchHistory,
        sync: syncOfflineWatchHistory,
    } = useOfflineWatchHistory()
    const {
        hoveredAnime,
        animeDetails,
        tooltipLoading,
        tooltipError,
        tooltipPosition,
        handleMouseEnter: handleTooltipMouseEnter,
        handleMouseLeave: handleTooltipMouseLeave,
        handleTooltipEnter,
        handleTooltipLeave,
        setFavoriteStatus,
        cleanup: cleanupAnimeTooltip,
    } = useAnimeTooltip()

    const userShortcuts = computed(() => getShortcuts())
    const isMac = computed(() => /Mac|iPhone|iPod|iPad/i.test(navigator.platform ?? ''))

    // SEO: public API only when logged out (crawlers).
    // Register Nuxt composables BEFORE any await — context is lost after await.
    const { data: seo } = useFetch(`/api/public/anime/${route.params.id}/seo`, {
        immediate: !user.value,
        default: () => null,
    })
    const pageTitle = ref(appConfig.siteName)
    const seoTitle = computed(() => (seo.value?.title ? `${seo.value.title} | ${appConfig.siteName}` : appConfig.siteName))
    const seoDesc = computed(() => {
        const s = seo.value
        if (!s) return appConfig.siteDescription
        return [s.score > 0 && `★ ${s.score}`, s.views && `${formatViews(s.views)} 觀看`, s.description]
            .filter(Boolean)
            .join(' · ') || appConfig.siteDescription
    })
    useSeoMeta({
        title: () => (seo.value?.title ? seoTitle.value : undefined),
        description: () => seoDesc.value,
        ogTitle: () => seoTitle.value,
        ogDescription: () => seoDesc.value,
        ogImage: () => seo.value?.image,
        ogType: 'website',
        twitterCard: 'summary',
        twitterTitle: () => seoTitle.value,
        twitterDescription: () => seoDesc.value,
        twitterImage: () => seo.value?.image,
    })
    useHead({ title: () => pageTitle.value })

    // ─── State ────────────────────────────────────────────────────────────────
    const anime = ref(null)
    const selectedEpisode = ref(null)
    const videoUrl = ref(null)
    const videoIsHls = ref(false)
    const error = ref(null)
    const loading = ref(true)
    const episodesLoading = ref(false)
    const isFavorite = ref(false)

    // UI
    const showShareDialog = ref(false)
    const showDetailDialog = ref(false)
    const showShortcutsModal = ref(false)
    const showOfflineDownloadDialog = ref(false)
    const showToolbarOverflowMenu = ref(false)
    const toolbarOverflowRoot = ref(null)
    const shareUrl = ref('')

    // Offline
    const offlineDownloadedKeys = ref([])
    const isOfflineDownloading = ref(false)
    const offlineDownloadProgress = ref(0)
    const offlineDownloadLabel = ref('')
    const offlinePlaybackRevoke = ref(null)
    const offlineThumbRevoke = ref(null)
    const offlineThumbnails = ref(null)
    const isOfflineView = ref(false)

    // Watch history
    const lastWatchedData = ref(null)
    const showContinuePrompt = ref(false)
    const allWatchProgress = ref({})

    // Player
    const videoPlayer = ref(null)
    const isTheaterMode = ref(false)
    const streamResumeTime = ref(null)
    const MAX_STREAM_RECOVERY = 3
    const episodeLoading = ref(false)
    let streamRecoveryAttempts = 0
    let streamRecovering = false
    let episodeFetchId = 0

    const LOCAL_SAVE_MS = 5_000 // IndexedDB; DB sync is 2 min / online
    let saveTimer = null

    // Action Toolbar
    const toolbarHeaderRef = ref(null)
    const toolbarHeaderWidth = ref(1024)
    const toolbarRowLayout = ref(true)
    let toolbarResizeObserver = null
    let disposeToolbarLayout = null

    // ─── Computed ─────────────────────────────────────────────────────────────
    const sortedEpisodeKeys = computed(() => {
        if (!anime.value?.episodes) return []
        return Object.keys(anime.value.episodes).sort((a, b) => {
            const na = parseInt(a, 10),
                nb = parseInt(b, 10)
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
        const ep = anime.value.episodes[String(selectedEpisode.value)]
        return ep && typeof ep === 'object' ? ep : null
    })

    const videoPlayerMeta = computed(() => {
        const ep = currentEpisodeData.value
        return {
            title: anime.value?.title ?? null,
            episode: selectedEpisode.value ?? null,
            thumbnails: offlineThumbnails.value || ep?.thumbnails || null,
            captions: Array.isArray(ep?.captions) ? ep.captions : [],
            episodeToken: ep?.token || null,
            aiCaptionLangs: Array.isArray(ep?.aiCaptionLangs) ? ep.aiCaptionLangs : [],
            chapters: ep?.chapters,
        }
    })

    const playerStartTime = computed(() => {
        if (streamResumeTime.value != null) return Number(streamResumeTime.value) || 0
        const q = parseFloat(route.query.t)
        if (q > 0) return q
        const saved = allWatchProgress.value[String(selectedEpisode.value)]
        if (!saved || Number(saved.progress_percentage) >= 90) return 0
        return Math.max(0, Number(saved.playback_time) || 0)
    })

    const additionalDetails = computed(() => {
        if (!anime.value) return []
        return [
            { key: "premiereDate",      label: "首播日期", icon: "event",          iconBg: "bg-pink-100 dark:bg-pink-900/30", iconColor: "text-pink-600 dark:text-pink-400" },
            { key: "productionCompany", label: "製作公司", icon: "business",       iconBg: "bg-gray-100 dark:bg-gray-800",    iconColor: "text-gray-600 dark:text-gray-400" },
            { key: "director",          label: "導演監督", icon: "person",         iconBg: "bg-gray-100 dark:bg-gray-800",    iconColor: "text-gray-600 dark:text-gray-400" },
            { key: "distributor",       label: "發行商",   icon: "local_shipping", iconBg: "bg-blue-100 dark:bg-blue-900/30", iconColor: "text-blue-600 dark:text-blue-400" },
        ].filter(d => anime.value[d.key]).map(d => ({ ...d, value: anime.value[d.key] }))
    })

    const animeToolbarActions = computed(() => {
        if (!anime.value) return []
        const actions = []

        if (anime.value.detailId)
            actions.push({
                key: 'detail',
                label: '詳情',
                icon: 'info',
                iconClass: 'text-gray-900 dark:text-white',
                run: () => {
                    showDetailDialog.value = true
                },
            })

        actions.push(
            { key: 'share', label: '分享', icon: 'share', iconClass: 'text-gray-900 dark:text-white', run: openShareDialog },
            {
                key: 'favorite',
                label: isFavorite.value ? '已收藏' : '收藏',
                icon: isFavorite.value ? 'bookmark_added' : 'bookmark_add',
                iconClass: isFavorite.value ? 'text-red-500' : 'text-gray-900 dark:text-white',
                run: toggleFavorite,
            },
        )

        if (Object.keys(anime.value.episodes ?? {}).length)
            actions.push({
                key: 'offline',
                label: '離線下載',
                icon: 'download',
                iconClass: 'text-gray-900 dark:text-white',
                run: () => {
                    showOfflineDownloadDialog.value = true
                },
            })

        if (isAdmin.value) {
            const sourceId = anime.value.refId ?? route.params.id
            const hasVideoId = String(anime.value.videoId ?? '').length > 0
            if (sourceId || hasVideoId)
                actions.push({
                    key: 'admin',
                    label: '後台管理',
                    icon: 'admin_panel_settings',
                    iconClass: 'text-gray-900 dark:text-white',
                    run: () =>
                        router.push({
                            path: '/admin',
                            query: {
                                field: hasVideoId ? 'video_id' : 'source_id',
                                search: hasVideoId ? String(anime.value.videoId) : String(sourceId),
                                operator: 'eq',
                            },
                        }),
                })
        }
        return actions
    })

    const toolbarActionsSplit = computed(() => {
        const actions = animeToolbarActions.value
        const visible = Math.min(toolbarMaxVisible(toolbarHeaderWidth.value, toolbarRowLayout.value), actions.length)
        return { primary: actions.slice(0, visible), overflow: actions.slice(visible) }
    })

    // ─── Toolbar actions split ─────────────────────────────────────────────────
    function toolbarMaxVisible(width, rowLayout) {
        const [show3, show2, show1] = rowLayout ? [900, 720, 520] : [360, 280, 180]
        if (width >= show3) return 3
        if (width >= show2) return 2
        if (width >= show1) return 1
        return 0
    }

    // ─── Offline helpers ──────────────────────────────────────────────────────
    function revokeOfflinePlayback() {
        offlinePlaybackRevoke.value?.()
        offlinePlaybackRevoke.value = null
    }
    function revokeOfflineThumbnails() {
        offlineThumbRevoke.value?.()
        offlineThumbRevoke.value = null
        offlineThumbnails.value = null
    }
    const offlineCoverUrl = ref(null)
    const offlineCoverRevoke = ref(null)
    const coverSrc = computed(() => offlineCoverUrl.value || anime.value?.image || '')

    function revokeOfflineCover() {
        offlineCoverRevoke.value?.()
        offlineCoverRevoke.value = null
        offlineCoverUrl.value = null
    }

    async function refreshOfflineEpisodeList() {
        offlineDownloadedKeys.value = anime.value?.refId ? await listDownloadedEpisodeKeys(anime.value.refId) : []
    }

    async function handleOfflineDownload(keys, qualityHeight) {
        if (!anime.value || !keys?.length) return
        isOfflineDownloading.value = true
        offlineDownloadProgress.value = 0
        offlineDownloadLabel.value = ''
        try {
            await runOfflineDownloadBatch({
                refId: anime.value.refId,
                animeTitle: anime.value.title,
                animeSnapshot: anime.value,
                keys,
                qualityHeight,
                episodes: anime.value.episodes || {},
                setOverallProgress: (v) => {
                    offlineDownloadProgress.value = v
                },
                setOverallLabel: (v) => {
                    offlineDownloadLabel.value = v
                },
                toast: (msg, type, duration) => showToast(msg, type, duration),
            })
            await refreshOfflineEpisodeList()
        } catch (err) {
            showToast(err?.message || '下載失敗', 'error')
        } finally {
            offlineDownloadProgress.value = 100
            offlineDownloadLabel.value = ''
            isOfflineDownloading.value = false
        }
    }

    async function handleOfflineRemoveEpisode(ep) {
        if (!anime.value?.refId) return
        try {
            await removeOfflineEpisode(anime.value.refId, ep)
            showToast('已刪除離線檔案', 'success')
            await refreshOfflineEpisodeList()
        } catch {
            showToast('刪除失敗', 'error')
        }
    }

    // ─── UI actions ───────────────────────────────────────────────────────────
    function openShareDialog() {
        const params = new URLSearchParams()
        if (selectedEpisode.value && videoPlayer.value) {
            params.set('e', selectedEpisode.value)
            const t = videoPlayer.value.currentTime
            if (t > 0) params.set('t', Math.floor(t).toString())
        }
        const base = window.location.origin + route.path
        shareUrl.value = params.size ? `${base}?${params}` : base
        showShareDialog.value = true
    }

    const formatRating = (score) => (score ? parseFloat(score).toFixed(1) : 'N/A')

    // ─── Toolbar overflow click-outside ──────────────────────────────────────
    let toolbarOverflowClickHandler = null

    watch(toolbarHeaderRef, (el) => {
        toolbarResizeObserver?.disconnect()
        if (!el) return
        toolbarResizeObserver = new ResizeObserver(([entry]) => {
            toolbarHeaderWidth.value = entry.contentRect.width
        })
        toolbarResizeObserver.observe(el)
    })

    watch(showToolbarOverflowMenu, (open) => {
        if (!import.meta.client) return
        if (toolbarOverflowClickHandler) {
            document.removeEventListener('click', toolbarOverflowClickHandler, true)
            toolbarOverflowClickHandler = null
        }
        if (!open) return
        toolbarOverflowClickHandler = (e) => {
            if (!toolbarOverflowRoot.value?.contains(e.target)) showToolbarOverflowMenu.value = false
        }
        nextTick(() =>
            setTimeout(() => {
                if (showToolbarOverflowMenu.value) document.addEventListener('click', toolbarOverflowClickHandler, true)
            }, 0),
        )
    })

    watch(
        () => route.fullPath,
        () => {
            showToolbarOverflowMenu.value = false
        },
    )

    // ─── Watch history (local every 5s → DB every 2 min / online / leave) ─────
    const startAutoSave = () => {
        saveTimer ||= setInterval(saveWatchHistory, LOCAL_SAVE_MS)
    }
    const stopAutoSave = () => {
        clearInterval(saveTimer)
        saveTimer = null
    }

    async function saveWatchHistory(episodeNumber = null) {
        const { watch_history_enabled, id } = userSettings.value
        if (isIncognito.value || !watch_history_enabled || !id || !anime.value) return
        const epNum = (typeof episodeNumber === 'string' || typeof episodeNumber === 'number')
            ? episodeNumber
            : selectedEpisode.value
        if (!epNum) return

        const el = videoPlayer.value?.videoElement
        const duration = Number(el?.duration) || 0
        if (!duration) return
        const playbackTime = Math.floor(Number(el?.currentTime) || 0)
        const prev = allWatchProgress.value[String(epNum)]
        const prevPlayback = Number(prev?.playback_time) || 0
        const prevTotal = Number(prev?.total_playback_time) || prevPlayback || 0
        const entry = {
            user_id: id,
            anime_ref_id: anime.value.refId,
            episode_number: String(epNum),
            playback_time: playbackTime,
            video_duration: Math.floor(duration),
            progress_percentage: Math.min(100, Math.floor((playbackTime / duration) * 100)),
            total_playback_time: prevTotal + (playbackTime > prevPlayback ? playbackTime - prevPlayback : 0),
        }

        try {
            await putOfflineWatchHistory(entry)
            allWatchProgress.value[entry.episode_number] = entry
            lastWatchedData.value = entry
        } catch (err) {
            console.error('Failed to save watch history:', err)
        }
    }

    function handleLeave() {
        void saveWatchHistory().then(() => navigator.onLine && syncOfflineWatchHistory(client))
        stopAutoSave()
        setOnline()
    }

    async function fetchLastWatched() {
        if (!userSettings.value.id || !anime.value) return
        try {
            const userId = userSettings.value.id
            const local = await listOfflineWatchHistory(userId, anime.value.refId)
            let remote = []
            if (!isClientOffline()) {
                const { data, error } = await client
                    .from('watch_history')
                    .select('*')
                    .eq('anime_ref_id', anime.value.refId)
                    .eq('user_id', userId)
                    .order('updated_at', { ascending: false })
                if (error) throw error
                remote = data || []
            }
            const data = mergeWatchHistory(remote, local)
            if (!data.length) return
            allWatchProgress.value = Object.fromEntries(data.map((item) => [String(item.episode_number), item]))
            lastWatchedData.value = data[0]
            if (data[0].progress_percentage < 90 && !route.query.e) showContinuePrompt.value = true
        } catch (err) {
            console.error('Failed to fetch last watched:', err)
        }
    }

    // ─── Continue watching / episode nav ─────────────────────────────────────
    function continueLast() {
        if (!lastWatchedData.value) return
        selectedEpisode.value = lastWatchedData.value.episode_number
        showContinuePrompt.value = false
        router.replace({ path: route.path, query: { e: lastWatchedData.value.episode_number, t: lastWatchedData.value.playback_time } })
    }

    function handleNextEpisode() {
        if (episodeLoading.value) return
        const { keys, currentIndex } = episodeInfo.value
        if (currentIndex === -1 || currentIndex >= keys.length - 1) return
        selectedEpisode.value = keys[currentIndex + 1]
    }

    function handlePreviousEpisode() {
        if (episodeLoading.value) return
        const { keys, currentIndex } = episodeInfo.value
        if (currentIndex > 0) selectedEpisode.value = keys[currentIndex - 1]
    }

    // ─── Playback events ──────────────────────────────────────────────────────
    function handlePlay() {
        startAutoSave()
        if (anime.value && selectedEpisode.value)
            setWatching({ refId: anime.value.refId, title: anime.value.title, image: anime.value.image, episode: selectedEpisode.value })
    }
    function handlePause() {
        void saveWatchHistory()
        stopAutoSave()
    }
    function handleEnded() {
        handleLeave()
    }

    // ─── Favorites ────────────────────────────────────────────────────────────
    async function toggleFavorite() {
        if (!anime.value || !userSettings.value.id) return
        isFavorite.value = !isFavorite.value
        const table = client.from('favorites')
        const match = { user_id: userSettings.value.id, anime_ref_id: anime.value.refId }
        const { error } = isFavorite.value
            ? await table.insert(match)
            : await table.delete().match(match)
        if (error) {
            isFavorite.value = !isFavorite.value
            throw new Error(error.message)
        }
    }

    function onVideoReady() {
        streamResumeTime.value = null
        videoPlayer.value?.videoElement && setTimeout(() => videoPlayer.value.videoElement.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100)
        if (anime.value && selectedEpisode.value)
            setWatching({ refId: anime.value.refId, title: anime.value.title, image: anime.value.image, episode: selectedEpisode.value })
    }

    // ─── Episode watcher ──────────────────────────────────────────────────────
    function applyEpisodeQueryFromRoute() {
        if (!anime.value?.episodes || !route.query.e) return false
        const key = String(Array.isArray(route.query.e) ? route.query.e[0] : route.query.e)
        const episodes = anime.value.episodes
        const match = Object.prototype.hasOwnProperty.call(episodes, key)
            ? key
            : Object.prototype.hasOwnProperty.call(episodes, String(parseInt(key, 10)))
              ? String(parseInt(key, 10))
              : null
        if (match) {
            selectedEpisode.value = match
            return true
        }
        return false
    }

    /** Merge resolve-time fields (seek thumbs / captions) into the episode list entry. */
    function mergeEpisodePlaybackMeta(epKey, res) {
        const ep = anime.value?.episodes?.[epKey]
        if (!ep || typeof ep !== 'object' || !res) return
        const patch = {}
        // Keep list-time seals when present — resealing on play causes a duplicate seek-vtt fetch.
        const hasListThumbs = !!(ep.thumbnails?.vttSrc || ep.thumbnails?.sheetSrc)
        if (res.thumbnails && !hasListThumbs) patch.thumbnails = res.thumbnails
        if (Array.isArray(res.captions) && res.captions.length) patch.captions = res.captions
        if (Array.isArray(res.aiCaptionLangs) && res.aiCaptionLangs.length) patch.aiCaptionLangs = res.aiCaptionLangs
        if (res.chapters) patch.chapters = res.chapters
        if (Object.keys(patch).length) anime.value.episodes[epKey] = { ...ep, ...patch }
    }

    function handleCaptionAdded(track) {
        const epKey = String(selectedEpisode.value ?? '')
        const ep = anime.value?.episodes?.[epKey]
        if (!ep || typeof ep !== 'object' || !track?.srclang || !(track?.src || track?.vttText)) return
        const captions = Array.isArray(ep.captions) ? [...ep.captions] : []
        if (!captions.some((c) => c?.srclang === track.srclang)) captions.push(track)
        anime.value.episodes[epKey] = {
            ...ep,
            captions,
            aiCaptionLangs: (ep.aiCaptionLangs || []).filter((code) => code !== track.srclang),
        }
    }

    async function fetchOnlineVideoUrl(epNum) {
        if (isOfflineView.value || isClientOffline()) return false
        const token = anime.value?.episodes[String(epNum)]?.token
        if (!token) {
            videoUrl.value = null
            videoIsHls.value = false
            return false
        }

        try {
            const res = await $fetch(`/api/episode/${encodeURIComponent(token)}`)
            if (!res?.proxyUrl) {
                videoUrl.value = null
                videoIsHls.value = false
                return false
            }
            videoUrl.value = res.proxyUrl
            videoIsHls.value = Boolean(res.isHls)
            mergeEpisodePlaybackMeta(String(epNum), res)
            return true
        } catch (err) {
            console.error('Episode fetch failed:', err)
            return false
        }
    }

    async function handleStreamError() {
        if (streamRecovering || !selectedEpisode.value) return
        if (isOfflineView.value || isClientOffline()) return
        if (String(videoUrl.value || '').startsWith('blob:')) return
        if (!anime.value?.episodes[String(selectedEpisode.value)]?.token) return

        if (streamRecoveryAttempts >= MAX_STREAM_RECOVERY) {
            showToast('影片連線失敗，請重新整理頁面', 'error')
            return
        }

        streamRecovering = true
        streamRecoveryAttempts++
        streamResumeTime.value = videoPlayer.value?.currentTime ?? 0
        showToast('正在重新連線…', 'info')

        try {
            const ok = await fetchOnlineVideoUrl(selectedEpisode.value)
            if (!ok) showToast('影片重新連線失敗', 'error')
        } finally {
            streamRecovering = false
        }
    }

    watch(selectedEpisode, async (epNum, oldEpNum) => {
        if (!epNum || !anime.value?.episodes) return

        const fetchId = ++episodeFetchId

        // Save progress while the current player is still mounted, then clear immediately
        // so the UI reacts at once (avoids "did my click register?" double-taps).
        if (oldEpNum && oldEpNum !== epNum) {
            streamRecoveryAttempts = 0
            if (videoPlayer.value) saveWatchHistory(oldEpNum)
            if (route.query.t || route.query.e) {
                const q = { ...route.query }
                delete q.t
                delete q.e
                router.replace({ path: route.path, query: q })
            }
        }

        videoUrl.value = null
        videoIsHls.value = false
        episodeLoading.value = true

        revokeOfflinePlayback()
        revokeOfflineThumbnails()

        const { refId, title, image } = anime.value
        setWatching({ refId, title, image, episode: epNum })

        try {
            if (import.meta.client && refId) {
                const thumb = await getOfflineThumbnailAssets(refId, epNum)
                if (fetchId !== episodeFetchId) return
                if (thumb?.thumbnails) {
                    offlineThumbnails.value = thumb.thumbnails
                    offlineThumbRevoke.value = thumb.revoke
                }

                const playback = await getOfflinePlayback(refId, epNum)
                if (fetchId !== episodeFetchId) return
                if (playback) {
                    offlinePlaybackRevoke.value = playback.revoke
                    videoUrl.value = playback.url
                    videoIsHls.value = false
                    return
                }
            }

            if (isOfflineView.value || isClientOffline()) {
                videoUrl.value = null
                videoIsHls.value = false
                showToast('此集尚未下載，離線時無法播放', 'info', 2500)
                return
            }

            showContinuePrompt.value = false
            const ok = await fetchOnlineVideoUrl(epNum)
            if (fetchId !== episodeFetchId) return
            if (!ok) {
                const playback = import.meta.client && refId ? await getOfflinePlayback(refId, epNum) : null
                if (fetchId !== episodeFetchId) return
                if (playback) {
                    offlinePlaybackRevoke.value = playback.revoke
                    videoUrl.value = playback.url
                    videoIsHls.value = false
                    showToast('使用離線影片播放', 'info', 2500)
                } else {
                    videoUrl.value = null
                    videoIsHls.value = false
                }
            }
        } finally {
            if (fetchId === episodeFetchId) episodeLoading.value = false
        }
    })

    // ─── Data fetching ────────────────────────────────────────────────────────
    function isClientOffline() {
        return import.meta.client && !navigator.onLine
    }

    async function fetchEpisodes(refId) {
        if (!refId) return { episodes: {} }
        episodesLoading.value = true
        try {
            const res = await $fetch(`/api/anime/${refId}/episodes`)
            return { episodes: res?.episodes || {} }
        } catch {
            return { episodes: {} }
        } finally {
            episodesLoading.value = false
        }
    }

    /** Apply IndexedDB snapshot (saved on download). Returns false if none. */
    async function applyOfflineSnapshot(refId) {
        const snap = await loadAnimeSnapshot(refId)
        if (!snap?.episodes || !Object.keys(snap.episodes).length) return false

        revokeOfflineCover()
        // Keep anime.image as the remote URL (persistable). Blob covers are display-only.
        anime.value = { ...snap, imageBlob: undefined }
        if (snap.imageBlob?.size) {
            const url = URL.createObjectURL(snap.imageBlob)
            offlineCoverUrl.value = url
            offlineCoverRevoke.value = () => URL.revokeObjectURL(url)
        }
        isOfflineView.value = true
        pageTitle.value = `${snap.title} | ${appConfig.siteName}`
        await refreshOfflineEpisodeList()
        await fetchLastWatched()
        applyEpisodeQueryFromRoute()
        return true
    }

    function resetDetailState() {
        loading.value = true
        error.value = null
        videoUrl.value = null
        videoIsHls.value = false
        selectedEpisode.value = null
        episodeLoading.value = false
        episodeFetchId++
        isOfflineView.value = false
        revokeOfflinePlayback()
        revokeOfflineThumbnails()
        revokeOfflineCover()
    }

    async function fetchDetail() {
        resetDetailState()
        const refId = String(route.params.id)

        // Offline: use local snapshot only. SW may cache detail API without episodes.
        if (isClientOffline()) {
            if (!(await applyOfflineSnapshot(refId))) {
                pageTitle.value = `載入動漫詳情失敗 | ${appConfig.siteName}`
                error.value = '離線模式下找不到此動漫的下載資料'
            }
            loading.value = false
            return
        }

        try {
            const res = await $fetch(`/api/anime/${refId}?withRelated=true`)
            if (!res || !Object.keys(res).length) {
                error.value = '找不到此動漫的詳細資訊'
                return
            }

            anime.value = { ...res, episodes: {} }
            isFavorite.value = res.isFavorite
            pageTitle.value = `${res.title} | ${appConfig.siteName}`
            fetchLastWatched().catch((err) => console.error('Last watched fetch failed:', err))
            refreshOfflineEpisodeList().catch((err) => console.error('Offline episode list refresh failed:', err))
            fetchEpisodes(refId)
                .then(async ({ episodes }) => {
                    if (String(route.params.id) !== refId || !anime.value) return
                    anime.value.episodes = episodes
                    await nextTick()
                    if (route.query.e && !selectedEpisode.value) applyEpisodeQueryFromRoute()
                })
                .catch((err) => console.error('Episodes fetch flow failed:', err))
        } catch {
            if (await applyOfflineSnapshot(refId)) return
            pageTitle.value = `載入動漫詳情失敗 | ${appConfig.siteName}`
            error.value = '載入動漫詳情失敗，請稍後再試'
        } finally {
            loading.value = false
        }
    }

    // ─── Keyboard shortcuts ───────────────────────────────────────────────────
    function handleShortcutsKeydown(e) {
        if ((e.ctrlKey || e.metaKey) && e.key === '/') {
            e.preventDefault()
            showShortcutsModal.value = !showShortcutsModal.value
        }
    }

    // ─── Lifecycle ────────────────────────────────────────────────────────────
    onBeforeUnmount(() => handleLeave())

    onMounted(() => {
        const mq = window.matchMedia('(min-width: 768px)')
        const syncLayout = () => { toolbarRowLayout.value = mq.matches }
        syncLayout()
        mq.addEventListener('change', syncLayout)
        disposeToolbarLayout = () => mq.removeEventListener('change', syncLayout)

        fetchDetail()
        window.addEventListener('beforeunload', handleLeave)
        window.addEventListener('keydown', handleShortcutsKeydown)
    })

    onUnmounted(() => {
        disposeToolbarLayout?.()
        toolbarResizeObserver?.disconnect()
        revokeOfflinePlayback()
        revokeOfflineThumbnails()
        revokeOfflineCover()
        if (toolbarOverflowClickHandler) document.removeEventListener('click', toolbarOverflowClickHandler, true)
        window.removeEventListener('beforeunload', handleLeave)
        window.removeEventListener('keydown', handleShortcutsKeydown)
        cleanupAnimeTooltip()
    })

    return {
        // Router / shortcuts
        router,
        userShortcuts,
        formatShortcutKey,
        isMac,
        formatRating,

        // Core state
        anime,
        selectedEpisode,
        videoUrl,
        videoIsHls,
        error,
        loading,
        episodesLoading,
        isOfflineView,
        coverSrc,
        offlineCoverUrl,

        // Player
        videoPlayer,
        isTheaterMode,
        episodeLoading,
        videoPlayerMeta,
        playerStartTime,
        hasNextEpisode,
        handlePlay,
        handlePause,
        handleEnded,
        handleNextEpisode,
        handlePreviousEpisode,
        onVideoReady,
        handleStreamError,
        handleCaptionAdded,

        // Continue / history
        showContinuePrompt,
        lastWatchedData,
        allWatchProgress,
        continueLast,

        // Toolbar
        toolbarHeaderRef,
        animeToolbarActions,
        toolbarActionsSplit,
        showToolbarOverflowMenu,
        toolbarOverflowRoot,
        additionalDetails,

        // Related tooltip
        hoveredAnime,
        animeDetails,
        tooltipLoading,
        tooltipError,
        tooltipPosition,
        handleTooltipMouseEnter,
        handleTooltipMouseLeave,
        handleTooltipEnter,
        handleTooltipLeave,
        setFavoriteStatus,

        // Dialogs
        showShareDialog,
        shareUrl,
        showDetailDialog,
        showShortcutsModal,
        showOfflineDownloadDialog,

        // Offline download
        sortedEpisodeKeys,
        offlineDownloadedKeys,
        isOfflineDownloading,
        offlineDownloadProgress,
        offlineDownloadLabel,
        handleOfflineDownload,
        handleOfflineRemoveEpisode,
        refreshOfflineEpisodeList,
    }
}
