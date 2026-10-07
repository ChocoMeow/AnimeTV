import { OFFLINE_HISTORY_STORE, offlineHistoryKey } from '#shared/utils/offline'
import { idbDelete, idbPairs, idbPut } from '~/utils/offlineDb'

let syncing = false

function rowKey(entry) {
    return offlineHistoryKey(entry.user_id, entry.anime_ref_id, entry.episode_number)
}

export function useOfflineWatchHistory() {
    const put = (entry) => idbPut(OFFLINE_HISTORY_STORE, rowKey(entry), { ...entry, updated_at: Date.now() })

    async function list(userId) {
        if (!userId) return []
        const prefix = `${userId}::`
        return (await idbPairs(OFFLINE_HISTORY_STORE))
            .filter(({ key, value }) => String(key).startsWith(prefix) && value)
            .map(({ value }) => value)
    }

    const remove = (entry) => idbDelete(OFFLINE_HISTORY_STORE, rowKey(entry))

    async function sync(client) {
        if (syncing || !import.meta.client || !navigator.onLine || !client) return
        syncing = true
        try {
            const userId = (await client.auth.getUser())?.data?.user?.id
            if (!userId) return
            for (const entry of await list(userId)) {
                if (!navigator.onLine) break
                const row = { ...entry }
                delete row.updated_at
                const { error } = await client.from('watch_history').upsert(row, {
                    onConflict: 'user_id, anime_ref_id, episode_number',
                })
                if (error) {
                    console.error('Failed to sync watch history:', error)
                    continue
                }
                await remove(entry)
                await new Promise((r) => setTimeout(r, 1000))
            }
        } finally {
            syncing = false
        }
    }

    return { put, list, remove, sync }
}
