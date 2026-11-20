/**
 * HLS.js attach, quality levels, 429 backoff, and fatal stream recovery.
 */
export function usePlayerHls({
    videoRef,
    startTime,
    isLoading,
    isBuffering,
    getIsUnmounted,
    onStartTimeApplied,
    requestStreamRecovery,
    notify,
    onAfterQualityChange,
}) {
    const effectiveVideoSrc = ref('')
    const qualityLevels = ref([])
    const selectedQuality = ref(-1)
    const activeQualityIndex = ref(-1)
    /** Preferred height in px, or -1 for auto. Kept across source changes. */
    let preferredQualityHeight = -1

    let hlsInstance = null
    let hlsPrefetchReset = null
    let hlsRateLimitTimer = null
    let hlsRateLimitBackoff = false
    let sourceGeneration = 0
    const streamRecoveryAttempts = { network: 0, media: 0 }

    const clearTimer = (timer) => {
        if (timer) clearTimeout(timer)
        return null
    }

    const qualityLabel = computed(() => {
        if (selectedQuality.value === -1) {
            const active = qualityLevels.value.find((l) => l.index === activeQualityIndex.value)
            return active?.label ? `自動 · ${active.label}` : '自動'
        }
        return qualityLevels.value.find((l) => l.index === selectedQuality.value)?.label || '自動'
    })

    function formatQualityLabel(level, index) {
        if (level?.height) return `${level.height}p`
        const res = level?.attrs?.RESOLUTION || level?.attrs?.resolution
        if (typeof res === 'string' && res.includes('x')) {
            const h = Number(res.split('x')[1])
            return h > 0 ? `${h}p` : res
        }
        if (level?.bitrate) return `${Math.round(level.bitrate / 1000)} kbps`
        return `來源 ${index + 1}`
    }

    function resetQualityState() {
        qualityLevels.value = []
        selectedQuality.value = -1
        activeQualityIndex.value = -1
    }

    function syncQualityLevelsFromHls(hls) {
        const levels = hls?.levels
        if (!levels?.length) {
            resetQualityState()
            return
        }
        qualityLevels.value = levels
            .map((level, index) => ({
                index,
                label: formatQualityLabel(level, index),
                height: Number(level.height) || 0,
                bitrate: Number(level.bitrate) || 0,
            }))
            .sort((a, b) => b.height - a.height || b.bitrate - a.bitrate)

        let levelIndex = -1
        if (preferredQualityHeight > 0) {
            const exact = qualityLevels.value.find((l) => l.height === preferredQualityHeight)
            const withHeight = qualityLevels.value.filter((l) => l.height > 0)
            if (exact) levelIndex = exact.index
            else if (withHeight.length) {
                levelIndex = withHeight.reduce((best, l) =>
                    Math.abs(l.height - preferredQualityHeight) < Math.abs(best.height - preferredQualityHeight) ? l : best
                ).index
            }
        }
        selectedQuality.value = levelIndex
        hls.currentLevel = levelIndex
        if (levelIndex >= 0) activeQualityIndex.value = levelIndex
    }

    function setQuality(levelIndex) {
        if (!hlsInstance) return
        selectedQuality.value = levelIndex
        hlsInstance.currentLevel = levelIndex
        if (levelIndex >= 0) {
            activeQualityIndex.value = levelIndex
            preferredQualityHeight = qualityLevels.value.find((l) => l.index === levelIndex)?.height || -1
        } else {
            preferredQualityHeight = -1
        }
        if (import.meta.client) {
            try {
                localStorage.setItem('videoQualityHeight', preferredQualityHeight === -1 ? 'auto' : String(preferredQualityHeight))
            } catch { /* ignore */ }
        }
        onAfterQualityChange?.()
        const label = levelIndex === -1
            ? '自動'
            : qualityLevels.value.find((l) => l.index === levelIndex)?.label
        if (label) notify?.(`畫質 ${label}`, 'high_quality')
    }

    function backoffHls429(hls) {
        if (hlsRateLimitBackoff) return
        hlsRateLimitBackoff = true
        isBuffering.value = true
        isLoading.value = false
        const level = Math.max(0, hls.currentLevel >= 0 ? hls.currentLevel : hls.loadLevel)
        hls.stopLoad()
        hls.loadLevel = level
        hls.nextLoadLevel = level
        hlsRateLimitTimer = clearTimer(hlsRateLimitTimer)
        hlsRateLimitTimer = setTimeout(() => {
            hlsRateLimitBackoff = false
            hlsRateLimitTimer = null
            if (hlsInstance !== hls || getIsUnmounted?.()) return
            isBuffering.value = false
            hls.startLoad()
        }, 4000)
    }

    function destroyHls() {
        hlsRateLimitTimer = clearTimer(hlsRateLimitTimer)
        hlsRateLimitBackoff = false
        hlsPrefetchReset?.()
        hlsPrefetchReset = null
        hlsInstance?.destroy()
        hlsInstance = null
        resetQualityState()
    }

    function resetRecoveryAttempts() {
        streamRecoveryAttempts.network = 0
        streamRecoveryAttempts.media = 0
    }

    function bumpSourceGeneration() {
        sourceGeneration++
    }

    function loadPreferredQualityFromStorage() {
        if (!import.meta.client) return
        const savedQuality = localStorage.getItem('videoQualityHeight')
        if (savedQuality === 'auto') preferredQualityHeight = -1
        else if (savedQuality != null && Number(savedQuality) > 0) preferredQualityHeight = Number(savedQuality)
    }

    async function applyVideoSource(src, isHls, video) {
        const generation = ++sourceGeneration
        destroyHls()
        effectiveVideoSrc.value = ''

        if (!src || !video || getIsUnmounted?.()) return
        if (!isHls) {
            effectiveVideoSrc.value = src
            return
        }

        let Hls
        try {
            Hls = (await import('hls.js')).default
        } catch {
            if (generation === sourceGeneration) requestStreamRecovery?.()
            return
        }
        if (generation !== sourceGeneration || video !== videoRef.value || getIsUnmounted?.()) return
        if (!Hls.isSupported()) {
            effectiveVideoSrc.value = src
            return
        }

        try {
            // Direct-CORS HLS CDNs may rate-limit parallel prefetch / ABR retry storms — use stock loader there.
            // Proxied streams: every segment is `/api/media/proxy` — keep ahead window modest.
            const limited = isDirectHlsSrc(src)
            const parallel = limited ? null : createParallelFragLoader(Hls, { minAhead: 1, maxAhead: 3 })
            hlsPrefetchReset = parallel?.reset ?? null

            const start = Number(toValue(startTime))
            const startPosition = start > 0 ? start : -1
            const hls = new Hls({
                fragLoadingMaxRetry: limited ? 1 : 4,
                fragLoadingRetryDelay: limited ? 4000 : 1000,
                levelLoadingMaxRetry: limited ? 1 : 4,
                startLevel: 0,
                startPosition,
                abrEwmaDefaultEstimate: 500_000,
                maxBufferLength: 30,
                startFragPrefetch: !limited,
                ...(parallel ? { fLoader: parallel.FragLoader } : {}),
            })
            hlsInstance = hls
            if (startPosition > 0) onStartTimeApplied?.()

            const alive = () => hlsInstance === hls && generation === sourceGeneration
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                if (alive()) syncQualityLevelsFromHls(hls)
            })
            if (parallel) {
                // Prefer playhead (not SN 0) so level reload / ABR does not re-fetch early segments via proxy.
                const fragIndexNearPlayhead = (details) => {
                    const frags = details?.fragments
                    if (!frags?.length) return 0
                    let t = hls.media?.currentTime
                    if (!(Number.isFinite(t) && t > 0) && startPosition > 0) t = startPosition
                    if (!(Number.isFinite(t) && t > 0)) return 0
                    const i = frags.findIndex((f) => f.start + f.duration > t)
                    return i >= 0 ? i : Math.max(0, frags.length - 1)
                }
                let prefetchLevel = -1
                hls.on(Hls.Events.LEVEL_LOADED, (_, { details, level }) => {
                    if (!alive() || !details?.fragments?.length) return
                    const from = fragIndexNearPlayhead(details)
                    if (level !== prefetchLevel) {
                        parallel.clear()
                        prefetchLevel = level
                    }
                    parallel.warmAhead(details.fragments, from)
                })
                hls.on(Hls.Events.FRAG_LOADED, (_, { frag }) => {
                    if (!alive() || frag?.type !== 'main') return
                    const details = hls.levels[frag.level]?.details
                    if (details) parallel.warmAhead(details.fragments, frag.sn - details.startSN + 1)
                })
            }
            hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
                if (alive()) activeQualityIndex.value = data.level
            })
            hls.on(Hls.Events.ERROR, (_, data) => {
                if (!alive()) return
                if (data?.response?.code === 429) {
                    backoffHls429(hls)
                    return
                }
                if (!data.fatal) return
                if (data.type === Hls.ErrorTypes.NETWORK_ERROR && streamRecoveryAttempts.network < 2) {
                    streamRecoveryAttempts.network++
                    isLoading.value = true
                    hls.startLoad()
                } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR && streamRecoveryAttempts.media < 2) {
                    streamRecoveryAttempts.media++
                    isLoading.value = true
                    hls.recoverMediaError()
                } else {
                    requestStreamRecovery?.()
                }
            })
            hls.loadSource(src)
            hls.attachMedia(video)
        } catch {
            if (generation === sourceGeneration) requestStreamRecovery?.()
        }
    }

    return {
        effectiveVideoSrc,
        qualityLevels,
        selectedQuality,
        activeQualityIndex,
        qualityLabel,
        setQuality,
        applyVideoSource,
        destroyHls,
        resetRecoveryAttempts,
        bumpSourceGeneration,
        loadPreferredQualityFromStorage,
    }
}
