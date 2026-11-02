import {
    UNTITLED_ANIME,
    isAbortError,
    offlineDownloadConcurrency,
    offlineEpisodeKey,
} from '#shared/utils/offline'
import { clearJob, getJob, listJobs, putJob } from '~/utils/offlineStaging'

const ACTIVE = new Set(['queued', 'downloading', 'paused'])
const FINISHED = new Set(['done', 'error'])
const PROGRESS_PHASES = new Set(['segment', 'progressive', 'remux'])

let wakeLock = null
let lifecycleBound = false
let restoreStarted = false
const autoPaused = new Set()
const coldRunning = new Set()

const emptyControl = () => ({ abort: new AbortController(), pausePromise: null, resolvePause: null })

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

function progressLabel(p, ratio) {
    if (p.phase === 'segment') return `片段 ${p.current}/${p.total}`
    if (p.phase === 'remux') return '轉成 MP4'
    if (!(p.total > 0)) return `${((p.current || 0) / 1024 / 1024).toFixed(1)} MB`
    return ratio >= 0.99 ? '儲存中' : '下載中'
}

function jobProgress(job) {
    return job?.total > 0 ? Math.max(0, Math.min(100, (job.done / job.total) * 100)) : 0
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

function makeJob({ id, refId, episodeKey, token, qualityHeight, animeTitle, done = 0, total = 0, status = 'queued', kind = 'mp4' }) {
    return {
        id,
        refId: String(refId),
        episodeKey: String(episodeKey),
        token,
        kind,
        qualityHeight: qualityHeight ?? null,
        animeTitle: animeTitle || UNTITLED_ANIME,
        done,
        total,
        status,
    }
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
        const pause = prev?.pausePromise && prev?.resolvePause
            ? { pausePromise: prev.pausePromise, resolvePause: prev.resolvePause }
            : {}
        setControl(id, { ...emptyControl(), ...pause })
        return taskControls.value[id]
    }

    async function syncWakeLock() {
        if (!import.meta.client) return
        const need = !document.hidden && tasks.value.some((t) => t.status === 'downloading' || t.status === 'queued')
        if (!need) {
            try {
                await wakeLock?.release?.()
            } catch { /* ignore */ }
            wakeLock = null
            return
        }
        if (wakeLock) return
        try {
            wakeLock = (await navigator.wakeLock?.request?.('screen')) || null
            wakeLock?.addEventListener('release', () => {
                wakeLock = null
            })
        } catch { /* unsupported */ }
    }

    async function persistJobStatus(id, status) {
        const job = await getJob(id)
        if (job) await putJob({ ...job, status })
    }

    function pauseTask(id, { abort = true } = {}) {
        const t = findTask(id)
        if (!t || !ACTIVE.has(t.status) || t.status === 'paused') return
        upsertTask({ ...t, status: 'paused', label: '已暫停' })
        void persistJobStatus(id, 'paused')
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
        if (abort) quietAbort(taskControls.value[id])
        syncWakeLock()
    }

    function resumeTask(id) {
        const t = findTask(id)
        if (!t || t.status !== 'paused') return
        autoPaused.delete(id)
        upsertTask({ ...t, status: 'downloading', label: '繼續下載…' })
        void persistJobStatus(id, 'downloading')
        if (taskControls.value[id]?.resolvePause) {
            taskControls.value[id].resolvePause()
            setControl(id, { ...(taskControls.value[id] || {}), resolvePause: null, pausePromise: null })
            syncWakeLock()
            return
        }
        syncWakeLock()
        void coldResume(id)
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

    /** Shared pause/retry loop for batch + cold resume. Returns done|cancelled|error. */
    async function runEpisodeLoop({
        id,
        refId,
        animeTitle,
        episodeKey,
        token,
        videoId,
        thumbnailsJpgUrl,
        thumbnailsVttUrl,
        qualityHeight,
        onRatio,
    }) {
        const { downloadEpisode } = useOfflineAnimeDownloads()
        while (true) {
            if (!(await awaitRunnable(id))) return 'cancelled'
            const ctrl = beginEpisodeControl(id)
            syncWakeLock()
            try {
                await downloadEpisode({
                    refId,
                    animeTitle,
                    episodeKey,
                    token,
                    videoId,
                    thumbnailsJpgUrl,
                    thumbnailsVttUrl,
                    qualityHeight,
                    signal: ctrl.abort.signal,
                    waitWhilePaused: () => waitWhilePaused(id),
                    onProgress: (p) => {
                        if (cancelledIds.value[id] || !PROGRESS_PHASES.has(p.phase)) return
                        const ratio = progressOf(p)
                        if (!isPaused(id)) onRatio?.(ratio, progressLabel(p, ratio))
                    },
                })
                removeControl(id)
                return consumeCancelled(id) ? 'cancelled' : 'done'
            } catch (err) {
                quietAbort(ctrl)
                if (isPaused(id)) continue
                removeControl(id)
                if (consumeCancelled(id)) return 'cancelled'
                console.error(err)
                return { error: err }
            }
        }
    }

    function applyEpisodeResult(result, { update, progress = 0 }) {
        if (result === 'cancelled') return 'cancelledCount'
        if (result === 'done') {
            update({ status: 'done', progress: 100, label: '下載完成' })
            return 'successCount'
        }
        const timedOut = isAbortError(result.error)
        update({
            status: 'error',
            progress,
            label: timedOut ? '下載逾時' : '下載失敗',
            error: timedOut ? '下載逾時或連線中斷' : result.error?.message || '下載失敗',
        })
        return 'failedCount'
    }

    async function coldResume(id) {
        if (coldRunning.has(id)) return
        coldRunning.add(id)
        try {
            const job = await getJob(id)
            const t = findTask(id)
            if (!job?.token || !t) {
                if (t) upsertTask({ ...t, status: 'error', label: '無法繼續下載', error: '找不到下載進度' })
                return
            }
            const base = { refId: job.refId, animeTitle: job.animeTitle, episodeKey: job.episodeKey }
            const result = await runEpisodeLoop({
                id,
                ...base,
                token: job.token,
                qualityHeight: job.qualityHeight,
                onRatio: (ratio, label) => upsertTask({ ...base, status: 'downloading', progress: ratio * 100, label }),
            })
            applyEpisodeResult(result, {
                update: (payload) => upsertTask({ ...base, ...payload }),
                progress: jobProgress(job),
            })
        } finally {
            coldRunning.delete(id)
            syncWakeLock()
        }
    }

    function pauseForBackground() {
        if (!import.meta.client || !document.hidden) return
        for (const t of tasks.value) {
            if (t.status !== 'downloading' && t.status !== 'queued') continue
            autoPaused.add(t.id)
            pauseTask(t.id, { abort: false })
        }
        syncWakeLock()
    }

    function resumeAfterBackground() {
        if (!import.meta.client || document.hidden) return
        for (const id of [...autoPaused]) resumeTask(id)
        autoPaused.clear()
        syncWakeLock()
    }

    async function restoreJobs() {
        if (!import.meta.client || restoreStarted) return
        restoreStarted = true
        try {
            for (const job of await listJobs()) {
                upsertTask({
                    refId: job.refId,
                    animeTitle: job.animeTitle,
                    episodeKey: job.episodeKey,
                    status: 'paused',
                    progress: jobProgress(job),
                    label: '已暫停',
                })
                if (job.status !== 'paused') await putJob({ ...job, status: 'paused' })
            }
        } catch (err) {
            console.error(err)
        }
    }

    function ensureLifecycleHooks() {
        if (!import.meta.client || lifecycleBound) return
        lifecycleBound = true
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) pauseForBackground()
            else resumeAfterBackground()
        })
        window.addEventListener('beforeunload', (event) => {
            if (!tasks.value.some((t) => ACTIVE.has(t.status))) return
            event.preventDefault()
            event.returnValue = ''
        })
        void restoreJobs()
    }

    function cancelDownloadTask(id) {
        cancelledIds.value = { ...cancelledIds.value, [id]: true }
        autoPaused.delete(id)
        coldRunning.delete(id)
        taskControls.value[id]?.resolvePause?.()
        quietAbort(taskControls.value[id])
        removeControl(id)
        removeTask(id)
        void clearJob(id)
        syncWakeLock()
    }

    async function seedQueuedJobs({ refId, animeTitle, keys, episodes, qualityHeight }) {
        for (const ep of keys) {
            const token = episodes?.[ep]?.token
            if (!token) continue
            const id = offlineEpisodeKey(refId, ep)
            const existing = await getJob(id)
            if (!existing) {
                await putJob(makeJob({ id, refId, episodeKey: ep, token, qualityHeight, animeTitle }))
            }
            upsertTask({
                refId,
                animeTitle,
                episodeKey: ep,
                status: 'queued',
                progress: jobProgress(existing),
                label: '排隊中',
            })
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
        const { saveAnimeSnapshot } = useOfflineAnimeDownloads()
        if (!refId || !keys?.length) return { successCount: 0, failedCount: 0, cancelledCount: 0 }

        const concurrency = offlineDownloadConcurrency()
        const total = keys.length
        const progressByEpisode = Object.fromEntries(keys.map((ep) => [ep, 0]))
        const counts = { completed: 0, successCount: 0, failedCount: 0, cancelledCount: 0 }
        const updateOverall = () => {
            setOverallProgress?.((keys.reduce((sum, ep) => sum + (progressByEpisode[ep] || 0), 0) / total) * 100)
            setOverallLabel?.(`下載中 ${counts.completed}/${total}（同時 ${concurrency}）`)
        }
        const bump = (field) => {
            counts[field]++
            counts.completed++
            updateOverall()
        }
        const updateTask = (episodeKey, payload) => upsertTask({ refId, animeTitle, episodeKey, ...payload })

        setOverallLabel?.('儲存作品資料…')
        await saveAnimeSnapshot(animeSnapshot?.refId ? animeSnapshot : { refId, title: animeTitle || UNTITLED_ANIME })
        await seedQueuedJobs({ refId, animeTitle, keys, episodes, qualityHeight })
        updateOverall()
        syncWakeLock()

        let cursor = 0
        const worker = async () => {
            while (cursor < keys.length) {
                const ep = keys[cursor++]
                const id = offlineEpisodeKey(refId, ep)
                const episodeData = episodes[ep] || {}
                if (consumeCancelled(id)) {
                    bump('cancelledCount')
                    continue
                }
                if (!episodeData.token) {
                    progressByEpisode[ep] = 1
                    bump('failedCount')
                    continue
                }

                updateTask(ep, { status: 'downloading', progress: (progressByEpisode[ep] || 0) * 100, label: '準備中' })
                const result = await runEpisodeLoop({
                    id,
                    refId,
                    animeTitle,
                    episodeKey: ep,
                    token: episodeData.token,
                    videoId: episodeData.video_id || null,
                    thumbnailsJpgUrl: episodeData.thumbnails_jpg_url || null,
                    thumbnailsVttUrl: episodeData.thumbnails_vtt_url || null,
                    qualityHeight,
                    onRatio: (ratio, label) => {
                        progressByEpisode[ep] = ratio
                        updateOverall()
                        updateTask(ep, { status: 'downloading', progress: ratio * 100, label })
                    },
                })
                if (result === 'done') progressByEpisode[ep] = 1
                bump(applyEpisodeResult(result, { update: (payload) => updateTask(ep, payload) }))
            }
        }

        try {
            await Promise.all(Array.from({ length: Math.min(concurrency, total) }, () => worker()))
        } finally {
            syncWakeLock()
        }
        batchToast(counts, toast)
        return { successCount: counts.successCount, failedCount: counts.failedCount, cancelledCount: counts.cancelledCount }
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
