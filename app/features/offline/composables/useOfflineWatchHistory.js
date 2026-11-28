import { OFFLINE_HISTORY_STORE, offlineHistoryKey } from '#shared/utils/offline'
import { idbDelete, idbPairs, idbPut } from '~/features/offline/utils/offlineDb'

/** Pending IndexedDB → Supabase. */
export const WATCH_HISTORY_SYNC_MS = 120_000

let syncing = false
let syncTimer = null

const rowKey = (e) => offlineHistoryKey(e.user_id, e.anime_ref_id, e.episode_number)
const rowTime = (row) => Date.parse(row?.updated_at) || Number(row?.updated_at) || 0
const epKey = (n) => (/^\d+$/.test(String(n)) ? String(Number(n)) : String(n))

/** Newest row per episode (local wins ties). `"01"` and `"1"` share a key. */
export function mergeWatchHistory(remote = [], local = []) {
    const byEp = new Map()
    for (const row of [...remote, ...local]) {
        const key = epKey(row.episode_number)
        const next = { ...row, episode_number: key }
        if (!byEp.has(key) || rowTime(next) >= rowTime(byEp.get(key))) byEp.set(key, next)
    }
    return [...byEp.values()].sort((a, b) => rowTime(b) - rowTime(a))
}

export function useOfflineWatchHistory() {
    const put = (entry) => idbPut(OFFLINE_HISTORY_STORE, rowKey(entry), { ...entry, updated_at: Date.now() })
    const remove = (entry) => idbDelete(OFFLINE_HISTORY_STORE, rowKey(entry))

    async function list(userId) {
        if (!userId) return []
        const prefix = `${userId}::`
        return (await idbPairs(OFFLINE_HISTORY_STORE))
            .filter(({ key, value }) => String(key).startsWith(prefix) && value)
            .map(({ value }) => value)
    }

    const listForAnime = async (userId, refId) =>
        (await list(userId)).filter((row) => String(row.anime_ref_id) === String(refId))

    async function sync(client) {
        if (syncing || !import.meta.client || !navigator.onLine || !client) return
        syncing = true
        try {
            const userId = (await client.auth.getUser())?.data?.user?.id
            if (!userId) return
            const pending = await list(userId)
            if (!pending.length) return

            const { data: remote, error: fetchError } = await client
                .from('watch_history')
                .select('user_id, anime_ref_id, episode_number, updated_at')
                .eq('user_id', userId)
                .in('anime_ref_id', [...new Set(pending.map((e) => e.anime_ref_id))])
            if (fetchError) {
                console.error('Failed to load watch history for sync:', fetchError)
                return
            }

            const remoteByKey = new Map((remote || []).map((r) => [rowKey(r), r]))
            for (const entry of pending) {
                if (!navigator.onLine) break
                const cloud = remoteByKey.get(rowKey(entry))
                if (cloud && rowTime(cloud) > rowTime(entry)) {
                    await remove(entry)
                    continue
                }
                const { updated_at: _, ...row } = entry
                const { error } = await client.from('watch_history').upsert(row, {
                    onConflict: 'user_id, anime_ref_id, episode_number',
                })
                if (error) console.error('Failed to sync watch history:', error)
                else await remove(entry)
            }
        } finally {
            syncing = false
        }
    }

    /** Every 2 min while online + immediately on `online`. */
    function startPeriodicSync(client) {
        if (!import.meta.client || syncTimer) return
        const tick = () => navigator.onLine && sync(client)
        syncTimer = setInterval(tick, WATCH_HISTORY_SYNC_MS)
        window.addEventListener('online', tick)
    }

    return { put, list, listForAnime, remove, sync, startPeriodicSync }
}
