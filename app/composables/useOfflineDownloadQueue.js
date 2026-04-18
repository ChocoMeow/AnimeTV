function isAbortError(err) {
    return err?.name === 'AbortError' || err?.name === 'CanceledError'
}

export function useOfflineDownloadQueue() {
    const tasks = useState('offlineDownloadTasks', () => [])
    const taskControls = useState('offlineDownloadTaskControls', () => ({}))
    const cancelledIds = useState('offlineDownloadCancelledIds', () => ({}))

    function upsertTask(task) {
        const key = `${task.refId}::${task.episodeKey}`
        const idx = tasks.value.findIndex((t) => `${t.refId}::${t.episodeKey}` === key)
        const existing = idx === -1 ? null : tasks.value[idx]
        const now = Date.now()
        const next = {
            id: key,
            refId: task.refId,
            animeTitle: task.animeTitle || '未命名作品',
            episodeKey: String(task.episodeKey),
            status: task.status || 'queued', // queued, downloading, paused, done, error
            progress: Math.max(0, Math.min(100, task.progress ?? 0)),
            label: task.label || '',
            createdAt: existing?.createdAt || now,
            updatedAt: now,
            error: task.error || '',
        }
        if (idx === -1) tasks.value.push(next)
        else tasks.value[idx] = { ...tasks.value[idx], ...next }
    }

    function removeTask(id) {
        tasks.value = tasks.value.filter((t) => t.id !== id)
    }

    function clearFinished() {
        tasks.value = tasks.value.filter((t) => t.status !== 'done' && t.status !== 'error')
    }

    function setControl(id, patch) {
        const prev = taskControls.value[id] || {}
        taskControls.value = { ...taskControls.value, [id]: { ...prev, ...patch } }
    }

    function removeControl(id) {
        if (!taskControls.value[id]) return
        const next = { ...taskControls.value }
        delete next[id]
        taskControls.value = next
    }

    /** Start control for an episode; keep an existing pause lock if user paused before download began. */
    function beginEpisodeControl(id) {
        const existing = taskControls.value[id]
        const abort = new AbortController()
        if (existing?.pausePromise && existing?.resolvePause) {
            setControl(id, {
                abort,
                pausePromise: existing.pausePromise,
                resolvePause: existing.resolvePause,
            })
        } else {
            setControl(id, {
                abort,
                pausePromise: null,
                resolvePause: null,
            })
        }
        return taskControls.value[id]
    }

    function pauseTask(id) {
        const t = tasks.value.find((x) => x.id === id)
        if (!t || (t.status !== 'downloading' && t.status !== 'queued' && t.status !== 'paused')) return
        if (t.status === 'paused') return
        upsertTask({
            refId: t.refId,
            animeTitle: t.animeTitle,
            episodeKey: t.episodeKey,
            status: 'paused',
            progress: t.progress,
            label: '已暫停',
            error: t.error,
        })
        let c = taskControls.value[id]
        if (!c) {
            setControl(id, { abort: new AbortController(), pausePromise: null, resolvePause: null })
            c = taskControls.value[id]
        }
        if (!c.pausePromise) {
            let resolvePauseFn
            const pausePromise = new Promise((resolve) => {
                resolvePauseFn = resolve
            })
            setControl(id, { ...taskControls.value[id], pausePromise, resolvePause: resolvePauseFn })
        }
    }

    function resumeTask(id) {
        const t = tasks.value.find((x) => x.id === id)
        if (!t || t.status !== 'paused') return
        upsertTask({
            refId: t.refId,
            animeTitle: t.animeTitle,
            episodeKey: t.episodeKey,
            status: 'downloading',
            progress: t.progress,
            label: '繼續下載…',
            error: t.error,
        })
        const c = taskControls.value[id]
        if (c?.resolvePause) {
            c.resolvePause()
        }
        setControl(id, {
            ...(taskControls.value[id] || {}),
            resolvePause: null,
            pausePromise: null,
        })
    }

    function cancelDownloadTask(id) {
        cancelledIds.value = { ...cancelledIds.value, [id]: true }
        const c = taskControls.value[id]
        try {
            c?.abort?.abort()
        } catch {
            /* ignore */
        }
        removeControl(id)
        removeTask(id)
    }

    function consumeCancelled(id) {
        if (!cancelledIds.value[id]) return false
        const next = { ...cancelledIds.value }
        delete next[id]
        cancelledIds.value = next
        return true
    }

    async function waitWhilePaused(id) {
        const c = taskControls.value[id]
        if (c?.pausePromise) await c.pausePromise
    }

    /**
     * Runs a concurrent offline download batch (same-origin worker), honoring pause / resume / cancel from the queue UI.
     */
    async function runOfflineDownloadBatch({
        refId,
        animeTitle,
        animeSnapshot,
        keys,
        episodes,
        setOverallProgress,
        setOverallLabel,
        toast,
    }) {
        const { downloadEpisode } = useOfflineAnimeDownloads()
        if (!refId || !keys?.length) return { successCount: 0, failedCount: 0, cancelledCount: 0 }

        const total = keys.length
        const concurrency = 3
        const progressByEpisode = Object.fromEntries(keys.map((ep) => [ep, 0]))
        let completed = 0
        let successCount = 0
        let failedCount = 0
        let cancelledCount = 0

        const updateOverallProgress = () => {
            const totalProgress = keys.reduce((sum, ep) => sum + (progressByEpisode[ep] || 0), 0)
            setOverallProgress?.((totalProgress / total) * 100)
            setOverallLabel?.(`下載中 ${completed}/${total}（同時 ${concurrency}）`)
        }

        const updateTask = (episodeKey, payload) => {
            upsertTask({
                refId,
                animeTitle,
                episodeKey,
                ...payload,
            })
        }

        updateOverallProgress()

        let cursor = 0
        const worker = async () => {
            while (cursor < keys.length) {
                const i = cursor++
                const ep = keys[i]
                const id = `${refId}::${String(ep)}`
                const episodeData = episodes[ep] || {}
                const token = episodeData.token

                if (consumeCancelled(id)) {
                    cancelledCount++
                    completed++
                    updateOverallProgress()
                    continue
                }

                if (!token) {
                    progressByEpisode[ep] = 1
                    completed++
                    failedCount++
                    updateOverallProgress()
                    continue
                }

                updateTask(ep, {
                    status: 'downloading',
                    progress: 0,
                    label: `準備下載第 ${ep} 集`,
                })

                beginEpisodeControl(id)
                const ctrl = taskControls.value[id]
                const signal = ctrl?.abort?.signal

                try {
                    await waitWhilePaused(id)
                    if (consumeCancelled(id)) {
                        cancelledCount++
                        completed++
                        updateOverallProgress()
                        removeControl(id)
                        continue
                    }

                    await downloadEpisode({
                        refId,
                        animeTitle,
                        animeSnapshot,
                        episodeKey: ep,
                        token,
                        videoId: episodeData.video_id || null,
                        signal,
                        waitWhilePaused: () => waitWhilePaused(id),
                        onProgress: (p) => {
                            if (cancelledIds.value[id]) return
                            if ((p.phase === 'segment' || p.phase === 'progressive') && p.total) {
                                const epProgress = Math.max(0, Math.min(1, p.current / p.total))
                                progressByEpisode[ep] = epProgress
                                updateOverallProgress()
                                const t = tasks.value.find((x) => x.id === id)
                                if (!t || t?.status === 'paused') return
                                updateTask(ep, {
                                    status: 'downloading',
                                    progress: epProgress * 100,
                                    label:
                                        p.phase === 'segment'
                                            ? `第 ${ep} 集：片段 ${p.current}/${p.total}`
                                            : `第 ${ep} 集：${Math.floor(epProgress * 100)}%`,
                                })
                            }
                        },
                    })
                    if (consumeCancelled(id)) {
                        cancelledCount++
                    } else {
                        progressByEpisode[ep] = 1
                        successCount++
                        updateTask(ep, {
                            status: 'done',
                            progress: 100,
                            label: `第 ${ep} 集下載完成`,
                        })
                    }
                } catch (err) {
                    if (consumeCancelled(id) || isAbortError(err)) {
                        cancelledCount++
                    } else {
                        console.error(err)
                        progressByEpisode[ep] = 1
                        failedCount++
                        updateTask(ep, {
                            status: 'error',
                            progress: 0,
                            label: `第 ${ep} 集下載失敗`,
                            error: err?.message || '下載失敗',
                        })
                    }
                } finally {
                    removeControl(id)
                    completed++
                    updateOverallProgress()
                }
            }
        }

        const workers = Array.from({ length: Math.min(concurrency, total) }, () => worker())
        await Promise.all(workers)

        if (toast) {
            if (cancelledCount > 0 && successCount === 0 && failedCount === 0) {
                toast(`已取消 ${cancelledCount} 個下載`, 'info')
            } else if (failedCount === 0 && cancelledCount === 0) {
                toast(`下載完成（${successCount} 集）`, 'success')
            } else if (successCount > 0) {
                const parts = []
                if (successCount) parts.push(`成功 ${successCount}`)
                if (failedCount) parts.push(`失敗 ${failedCount}`)
                if (cancelledCount) parts.push(`取消 ${cancelledCount}`)
                toast(`部分完成：${parts.join('，')}`, 'warning', 3500)
            } else if (failedCount > 0) {
                toast('下載失敗', 'error')
            }
        }

        return { successCount, failedCount, cancelledCount }
    }

    const activeTasks = computed(() => tasks.value.filter((t) => t.status === 'queued' || t.status === 'downloading' || t.status === 'paused'))
    const recentTasks = computed(() => tasks.value.filter((t) => t.status === 'done' || t.status === 'error').slice(0, 8))
    const activeCount = computed(() => activeTasks.value.length)

    return {
        tasks,
        activeTasks,
        recentTasks,
        activeCount,
        upsertTask,
        removeTask,
        clearFinished,
        pauseTask,
        resumeTask,
        cancelDownloadTask,
        runOfflineDownloadBatch,
    }
}
