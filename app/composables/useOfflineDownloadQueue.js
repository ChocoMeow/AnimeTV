import {
    OFFLINE_CONCURRENCY,
    UNTITLED_ANIME,
    isAbortError,
    offlineEpisodeKey,
} from '#shared/utils/offline'

const ACTIVE = new Set(['queued', 'downloading', 'paused'])
const FINISHED = new Set(['done', 'error'])

let wakeLock = null
let lifecycleBound = false
const autoPaused = new Set()

function emptyControl() {
    return { abort: new AbortController(), pausePromise: null, resolvePause: null }
}

function quietAbort(ctrl) {
    try {
        ctrl?.abort?.abort()
    } catch { /* ignore */ }
}

function progressOf({ phase, current, total }) {
    if (phase === 'remux') return 0.98
    if (phase === 'progressive' && !(total > 0)) return Math.min(0.95, 1 - Math.exp(-(current || 0) / 2.5e7))
    return Math.max(0, Math.min(1, current / total))
}

function progressLabel(ep, p, ratio) {
    if (p.phase === 'segment') return `第 ${ep} 集：片段 ${p.current}/${p.total}`
    if (p.phase === 'remux') return `第 ${ep} 集：轉成 MP4`
    const amount = p.total > 0
        ? `${Math.floor(ratio * 100)}%`
        : `${((p.current || 0) / 1024 / 1024).toFixed(1)} MB`
    return `第 ${ep} 集：${amount}`
}

function batchToast({ successCount, failedCount, cancelledCount }, toast) {
    if (!toast) return
    if (cancelledCount && !successCount && !failedCount) return toast(`已取消 ${cancelledCount} 個下載`, 'info')
    if (!failedCount && !cancelledCount) return toast(`下載完成（${successCount} 集）`, 'success')
    if (successCount) {
        const parts = [
            successCount && `成功 ${successCount}`,
            failedCount && `失敗 ${failedCount}`,
            cancelledCount && `取消 ${cancelledCount}`,
        ].filter(Boolean)
        return toast(`部分完成：${parts.join('，')}`, 'warning', 3500)
    }
    if (failedCount) toast('下載失敗', 'error')
}

export function useOfflineDownloadQueue() {
    const tasks = useState('offlineDownloadTasks', () => [])
    const taskControls = useState('offlineDownloadTaskControls', () => ({}))
    const cancelledIds = useState('offlineDownloadCancelledIds', () => ({}))

    const findTask = (id) => tasks.value.find((t) => t.id === id)
    const isPaused = (id) => findTask(id)?.status === 'paused'

    function upsertTask(task) {
        const id = offlineEpisodeKey(task.refId, task.episodeKey)
        const idx = tasks.value.findIndex((t) => t.id === id)
        const existing = idx === -1 ? null : tasks.value[idx]
        const next = {
            id,
            refId: task.refId,
            animeTitle: task.animeTitle || UNTITLED_ANIME,
            episodeKey: String(task.episodeKey),
            status: task.status || 'queued',
            progress: Math.max(0, Math.min(100, task.progress ?? 0)),
            label: task.label || '',
            createdAt: existing?.createdAt || Date.now(),
            updatedAt: Date.now(),
            error: task.error || '',
        }
        if (idx === -1) tasks.value.push(next)
        else tasks.value[idx] = { ...tasks.value[idx], ...next }
    }

    const removeTask = (id) => {
        tasks.value = tasks.value.filter((t) => t.id !== id)
    }
    const clearFinished = () => {
        tasks.value = tasks.value.filter((t) => !FINISHED.has(t.status))
    }
    const setControl = (id, patch) => {
        taskControls.value = { ...taskControls.value, [id]: { ...(taskControls.value[id] || {}), ...patch } }
    }
    const removeControl = (id) => {
        if (!taskControls.value[id]) return
        const next = { ...taskControls.value }
        delete next[id]
        taskControls.value = next
    }

    function beginEpisodeControl(id) {
        const prev = taskControls.value[id]
        setControl(id, {
            ...emptyControl(),
            ...(prev?.pausePromise && prev?.resolvePause
                ? { pausePromise: prev.pausePromise, resolvePause: prev.resolvePause }
                : {}),
        })
        return taskControls.value[id]
    }

    async function syncWakeLock() {
        if (!import.meta.client) return
        const need =
            !document.hidden &&
            tasks.value.some((t) => t.status === 'downloading' || t.status === 'queued')
        if (!need) {
            try {
                await wakeLock?.release?.()
            } catch { /* ignore */ }
            wakeLock = null
            return
        }
        if (wakeLock) return
        try {
            wakeLock = await navigator.wakeLock?.request?.('screen') || null
            wakeLock?.addEventListener('release', () => {
                wakeLock = null
            })
        } catch { /* unsupported */ }
    }

    /** Abort in-flight fetches so same-origin slots are freed (soft wait blocked the whole API). */
    function pauseTask(id) {
        const t = findTask(id)
        if (!t || !ACTIVE.has(t.status) || t.status === 'paused') return
        upsertTask({ ...t, status: 'paused', label: '已暫停' })
        if (!taskControls.value[id]) setControl(id, emptyControl())
        if (!taskControls.value[id].pausePromise) {
            let resolvePause
            setControl(id, {
                ...taskControls.value[id],
                pausePromise: new Promise((r) => {
                    resolvePause = r
                }),
                resolvePause,
            })
        }
        quietAbort(taskControls.value[id])
        syncWakeLock()
    }

    function resumeTask(id) {
        const t = findTask(id)
        if (!t || t.status !== 'paused') return
        autoPaused.delete(id)
        upsertTask({ ...t, status: 'downloading', label: '繼續下載…' })
        taskControls.value[id]?.resolvePause?.()
        setControl(id, { ...(taskControls.value[id] || {}), resolvePause: null, pausePromise: null })
        syncWakeLock()
    }

    function pauseForBackground(force = false) {
        if (!import.meta.client || (!force && !document.hidden)) return
        for (const t of tasks.value) {
            if (t.status !== 'downloading' && t.status !== 'queued') continue
            autoPaused.add(t.id)
            pauseTask(t.id)
        }
        syncWakeLock()
    }

    function resumeAfterBackground() {
        if (!import.meta.client || document.hidden) return
        for (const id of [...autoPaused]) resumeTask(id)
        autoPaused.clear()
        syncWakeLock()
    }

    function ensureLifecycleHooks() {
        if (!import.meta.client || lifecycleBound) return
        lifecycleBound = true
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) pauseForBackground()
            else resumeAfterBackground()
        })
        window.addEventListener('pagehide', () => pauseForBackground(true))
        document.addEventListener('freeze', () => pauseForBackground(true))
    }

    function cancelDownloadTask(id) {
        cancelledIds.value = { ...cancelledIds.value, [id]: true }
        autoPaused.delete(id)
        taskControls.value[id]?.resolvePause?.()
        quietAbort(taskControls.value[id])
        removeControl(id)
        removeTask(id)
        syncWakeLock()
    }

    function consumeCancelled(id) {
        if (!cancelledIds.value[id]) return false
        const next = { ...cancelledIds.value }
        delete next[id]
        cancelledIds.value = next
        return true
    }

    const waitWhilePaused = async (id) => {
        const pause = taskControls.value[id]?.pausePromise
        if (pause) await pause
    }

    /** Wait out pause / background; return false if cancelled. */
    async function awaitRunnable(id) {
        while (true) {
            if (consumeCancelled(id)) return false
            await waitWhilePaused(id)
            if (consumeCancelled(id)) return false
            if (import.meta.client && document.hidden) {
                pauseForBackground()
                continue
            }
            return true
        }
    }

    async function runOfflineDownloadBatch({
        refId,
        animeTitle,
        animeSnapshot,
        keys,
        episodes,
        setOverallProgress,
        setOverallLabel,
        toast,
        qualityHeight,
    }) {
        ensureLifecycleHooks()
        const { downloadEpisode } = useOfflineAnimeDownloads()
        if (!refId || !keys?.length) return { successCount: 0, failedCount: 0, cancelledCount: 0 }

        const total = keys.length
        const progressByEpisode = Object.fromEntries(keys.map((ep) => [ep, 0]))
        const counts = { completed: 0, successCount: 0, failedCount: 0, cancelledCount: 0 }
        const updateOverall = () => {
            setOverallProgress?.((keys.reduce((sum, ep) => sum + (progressByEpisode[ep] || 0), 0) / total) * 100)
            setOverallLabel?.(`下載中 ${counts.completed}/${total}（同時 ${OFFLINE_CONCURRENCY}）`)
        }
        const bump = (field) => {
            counts[field]++
            counts.completed++
            updateOverall()
        }
        const updateTask = (episodeKey, payload) => upsertTask({ refId, animeTitle, episodeKey, ...payload })
        updateOverall()
        syncWakeLock()

        let cursor = 0
        const worker = async () => {
            while (cursor < keys.length) {
                const ep = keys[cursor++]
                const id = offlineEpisodeKey(refId, ep)
                const episodeData = episodes[ep] || {}
                const token = episodeData.token

                if (consumeCancelled(id)) {
                    bump('cancelledCount')
                    continue
                }
                if (!token) {
                    progressByEpisode[ep] = 1
                    bump('failedCount')
                    continue
                }

                // Pause aborts the fetch; resume restarts this episode.
                while (true) {
                    if (!(await awaitRunnable(id))) {
                        bump('cancelledCount')
                        break
                    }

                    updateTask(ep, {
                        status: 'downloading',
                        progress: (progressByEpisode[ep] || 0) * 100,
                        label: `準備下載第 ${ep} 集`,
                    })
                    const ctrl = beginEpisodeControl(id)
                    syncWakeLock()

                    try {
                        await downloadEpisode({
                            refId,
                            animeTitle,
                            animeSnapshot,
                            episodeKey: ep,
                            token,
                            videoId: episodeData.video_id || null,
                            thumbnailsJpgUrl: episodeData.thumbnails_jpg_url || null,
                            thumbnailsVttUrl: episodeData.thumbnails_vtt_url || null,
                            qualityHeight,
                            signal: ctrl.abort.signal,
                            waitWhilePaused: () => waitWhilePaused(id),
                            onProgress: (p) => {
                                if (cancelledIds.value[id] || !['segment', 'progressive', 'remux'].includes(p.phase)) return
                                const ratio = progressOf(p)
                                progressByEpisode[ep] = ratio
                                updateOverall()
                                if (isPaused(id)) return
                                updateTask(ep, {
                                    status: 'downloading',
                                    progress: ratio * 100,
                                    label: progressLabel(ep, p, ratio),
                                })
                            },
                        })
                        if (consumeCancelled(id)) bump('cancelledCount')
                        else {
                            progressByEpisode[ep] = 1
                            updateTask(ep, { status: 'done', progress: 100, label: `第 ${ep} 集下載完成` })
                            bump('successCount')
                        }
                        removeControl(id)
                        break
                    } catch (err) {
                        quietAbort(ctrl)
                        if (isPaused(id)) continue
                        removeControl(id)
                        if (consumeCancelled(id)) {
                            bump('cancelledCount')
                        } else {
                            console.error(err)
                            progressByEpisode[ep] = 1
                            const timedOut = isAbortError(err)
                            updateTask(ep, {
                                status: 'error',
                                progress: 0,
                                label: timedOut ? `第 ${ep} 集下載逾時` : `第 ${ep} 集下載失敗`,
                                error: timedOut ? '下載逾時或連線中斷' : err?.message || '下載失敗',
                            })
                            bump('failedCount')
                        }
                        break
                    }
                }
            }
        }

        try {
            await Promise.all(Array.from({ length: Math.min(OFFLINE_CONCURRENCY, total) }, () => worker()))
        } finally {
            syncWakeLock()
        }
        const { successCount, failedCount, cancelledCount } = counts
        batchToast({ successCount, failedCount, cancelledCount }, toast)
        return { successCount, failedCount, cancelledCount }
    }

    ensureLifecycleHooks()

    const activeTasks = computed(() => tasks.value.filter((t) => ACTIVE.has(t.status)))
    const recentTasks = computed(() => tasks.value.filter((t) => FINISHED.has(t.status)).slice(0, 8))

    return {
        tasks,
        activeTasks,
        recentTasks,
        activeCount: computed(() => activeTasks.value.length),
        upsertTask,
        removeTask,
        clearFinished,
        pauseTask,
        resumeTask,
        cancelDownloadTask,
        runOfflineDownloadBatch,
    }
}
