/**
 * Durable download staging in one IDB store.
 * Keys: `${jobId}::meta` | `${jobId}::${index}`
 */
import {
    OFFLINE_PARTS_STORE,
    offlinePartKey,
    offlinePartMetaKey,
} from '#shared/utils/offline'
import { idbDelete, idbGet, idbKeys, idbPut } from '~/utils/offlineDb'

async function deletePrefix(jobId, keepMeta = false) {
    const prefix = `${jobId}::`
    for (const key of await idbKeys(OFFLINE_PARTS_STORE)) {
        const s = String(key)
        if (!s.startsWith(prefix)) continue
        if (keepMeta && s.endsWith('::meta')) continue
        await idbDelete(OFFLINE_PARTS_STORE, key)
    }
}

export const getJob = (jobId) => idbGet(OFFLINE_PARTS_STORE, offlinePartMetaKey(jobId))
export const putJob = (job) => idbPut(OFFLINE_PARTS_STORE, offlinePartMetaKey(job.id), job)
export const putPart = (jobId, index, blob) => idbPut(OFFLINE_PARTS_STORE, offlinePartKey(jobId, index), blob)
export const hasPart = async (jobId, index) => !!(await idbGet(OFFLINE_PARTS_STORE, offlinePartKey(jobId, index)))
export const clearParts = (jobId) => deletePrefix(jobId, true)
export const clearJob = (jobId) => deletePrefix(jobId, false)

/** Contiguous Blobs from index 0 (stops at first hole). */
export async function getParts(jobId) {
    const parts = []
    for (let i = 0; ; i++) {
        const blob = await idbGet(OFFLINE_PARTS_STORE, offlinePartKey(jobId, i))
        if (!blob) return parts
        parts.push(blob)
    }
}

/** All parts 0..total-1, or null if any gap. */
export async function getPartsExact(jobId, total) {
    const parts = []
    for (let i = 0; i < total; i++) {
        const blob = await idbGet(OFFLINE_PARTS_STORE, offlinePartKey(jobId, i))
        if (!blob) return null
        parts.push(blob)
    }
    return parts
}

export async function stagedBytes(jobId) {
    return (await getParts(jobId)).reduce((n, b) => n + (b?.size || 0), 0)
}

export async function listJobs() {
    const jobs = []
    for (const key of await idbKeys(OFFLINE_PARTS_STORE)) {
        if (!String(key).endsWith('::meta')) continue
        const job = await idbGet(OFFLINE_PARTS_STORE, key)
        if (job?.id) jobs.push(job)
    }
    return jobs
}
