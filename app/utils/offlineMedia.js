/**
 * Download transport: always returns a progressive MP4 Blob.
 * HLS vs MP4 is fetch-only — nothing here is stored.
 */
import { DIRECT_HLS_HOST } from '#shared/utils/videoSources'
import {
    OFFLINE_SEGMENT_CONCURRENCY,
    PROGRESSIVE_IDLE_TIMEOUT_MS,
    RETRY_STATUSES,
    SEGMENT_503_RETRIES,
    SEGMENT_FETCH_TIMEOUT_MS,
    SEGMENT_RETRIES,
    SEGMENT_RETRY_MS,
    STAGE_CHUNK_BYTES,
    VIDEO_MP4,
    abortError,
    downloadProxyUrl,
    heightLabel,
    httpStatusFromError,
    throwIfAborted,
} from '#shared/utils/offline'
import { hlsSegmentsToMp4 } from '~/utils/hlsToMp4'
import { clearParts, getParts, getPartsExact, hasPart, putPart, stagedBytes } from '~/utils/offlineStaging'

const HTTP_URL = /^https?:\/\//i
const PROXY_PATH = /\/api\/(?:proxy-video|download-proxy)/

function pageUrl(uri) {
    return new URL(uri, typeof location !== 'undefined' ? location.origin : 'http://localhost')
}

function unwrapMediaUrl(uri, cookie = '') {
    if (cookie || !uri) return uri
    try {
        const page = pageUrl(uri)
        const upstream = PROXY_PATH.test(page.pathname) ? page.searchParams.get('url') || uri : uri
        return DIRECT_HLS_HOST.test(new URL(upstream, page).hostname) ? upstream : uri
    } catch {
        return uri
    }
}

function isDirectCdn(url) {
    try {
        const page = pageUrl(url)
        const upstream = PROXY_PATH.test(page.pathname) ? page.searchParams.get('url') || url : url
        return DIRECT_HLS_HOST.test(new URL(upstream, page).hostname)
    } catch {
        return false
    }
}

/** bzcdn: CORS. Other CDNs: one hop through download-proxy (no CORS probe). */
function assetUrl(url) {
    if (!url) return url
    try {
        if (PROXY_PATH.test(pageUrl(url).pathname) || isDirectCdn(url)) return url
    } catch {
        /* proxy */
    }
    return downloadProxyUrl(url, '')
}

function cancelBody(res) {
    try {
        res?.body?.cancel?.()
    } catch {
        /* ignore */
    }
}

function throwHttp(prefix, status) {
    throw new Error(`${prefix}：${status}`)
}

async function waitReady(waitWhilePaused, signal) {
    await waitWhilePaused?.()
    throwIfAborted(signal)
}

function linkAbort(parent) {
    const local = new AbortController()
    const onAbort = () => local.abort()
    parent?.addEventListener?.('abort', onAbort)
    return {
        signal: local.signal,
        abort() {
            parent?.removeEventListener?.('abort', onAbort)
            if (!local.signal.aborted) local.abort()
        },
    }
}

/** Parent abort + wall-clock timeout (frees hung same-origin fetches). */
function timedSignal(parent, ms) {
    const local = new AbortController()
    const timer = setTimeout(() => local.abort(abortError()), ms)
    const onParent = () => local.abort(parent?.reason)
    parent?.addEventListener?.('abort', onParent)
    return {
        signal: local.signal,
        dispose() {
            clearTimeout(timer)
            parent?.removeEventListener?.('abort', onParent)
        },
    }
}

async function fetchWithTimeout(url, { signal, ms = SEGMENT_FETCH_TIMEOUT_MS, ...init } = {}) {
    const timed = timedSignal(signal, ms)
    try {
        return await fetch(url, { ...init, signal: timed.signal })
    } finally {
        timed.dispose()
    }
}

function sleep(ms, signal) {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(abortError())
            return
        }
        const timer = setTimeout(resolve, ms)
        signal?.addEventListener?.('abort', () => {
            clearTimeout(timer)
            reject(abortError())
        }, { once: true })
    })
}

export async function mapPool(items, concurrency, task, { signal, onFail } = {}) {
    const results = new Array(items.length)
    let i = 0
    const worker = async () => {
        while (i < items.length) {
            throwIfAborted(signal)
            const idx = i++
            results[idx] = await task(items[idx], idx)
        }
    }
    try {
        if (items.length) {
            await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, worker))
        }
        return results
    } catch (err) {
        onFail?.()
        throw err
    }
}

function isMasterPlaylist(text) {
    return /#EXT-X-STREAM-INF/i.test(text)
}

function resolveUri(raw, baseUrl) {
    try {
        return new URL(raw, baseUrl).href
    } catch {
        return raw
    }
}

function parseVariants(text, baseUrl) {
    const lines = text.split(/\r?\n/)
    const byHeight = new Map()
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim()
        if (!line.startsWith('#EXT-X-STREAM-INF')) continue
        const height = Number(/RESOLUTION=\d+x(\d+)/i.exec(line)?.[1] || 0)
        const bandwidth = Number(/BANDWIDTH=(\d+)/i.exec(line)?.[1] || 0)
        const urlLine = lines.slice(i + 1).find((l) => l.trim() && !l.trim().startsWith('#'))
        if (!urlLine) continue
        const prev = byHeight.get(height)
        if (!prev || bandwidth > prev.bandwidth) {
            byHeight.set(height, {
                height,
                bandwidth,
                url: resolveUri(urlLine.trim(), baseUrl),
                label: height ? heightLabel(height) : bandwidth ? `${Math.round(bandwidth / 1000)}k` : '來源畫質',
            })
        }
    }
    return [...byHeight.values()].sort((a, b) => (b.height || 0) - (a.height || 0) || b.bandwidth - a.bandwidth)
}

function pickVariantUrl(text, baseUrl, preferredHeight) {
    const variants = parseVariants(text, baseUrl)
    if (!variants.length) return null
    if (!preferredHeight) return variants[0].url
    return (
        variants.find((v) => v.height === preferredHeight)?.url ||
        variants.find((v) => v.height > 0 && v.height <= preferredHeight)?.url ||
        variants.at(-1).url
    )
}

function parseByteRange(spec) {
    const m = /^(\d+)(?:@(\d+))?$/.exec(String(spec || '').trim())
    if (!m) return null
    return { length: Number(m[1]), offset: m[2] ? Number(m[2]) : 0 }
}

function parseMediaPlaylist(text, baseUrl) {
    if ([...text.matchAll(/#EXT-X-KEY:([^\n]+)/gi)].some((m) => !/METHOD=NONE/i.test(m[1]))) {
        throw new Error('此影片已加密，無法下載離線')
    }
    let map = null
    let pendingDuration = null
    let pendingRange = null
    const segments = []
    for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim()
        if (line.startsWith('#EXT-X-MAP:')) {
            const uri = /URI="([^"]+)"/i.exec(line)?.[1]
            if (uri) map = { uri: resolveUri(uri, baseUrl), byterange: /BYTERANGE="([^"]+)"/i.exec(line)?.[1] || null }
        } else if (line.startsWith('#EXT-X-BYTERANGE:')) {
            pendingRange = line.replace(/^#EXT-X-BYTERANGE:/i, '').trim()
        } else if (line.startsWith('#EXTINF:')) {
            pendingDuration = parseFloat(/^#EXTINF:([\d.]+)/.exec(line)?.[1] || '10')
        } else if (line && !line.startsWith('#')) {
            segments.push({ uri: resolveUri(line, baseUrl), byterange: pendingRange, duration: pendingDuration ?? 10 })
            pendingDuration = pendingRange = null
        }
    }
    return { map, segments }
}

async function fetchText(url, signal) {
    return (await fetchWithTimeout(url, { signal })).text()
}

async function resolveMediaPlaylistUrl(playlistUrl, signal, preferredHeight) {
    let url = playlistUrl
    let text = await fetchText(url, signal)
    for (let guard = 0; isMasterPlaylist(text) && guard < 5; guard++) {
        const next = pickVariantUrl(text, url, preferredHeight)
        if (!next) break
        url = unwrapMediaUrl(next)
        text = await fetchText(url, signal)
    }
    return { mediaPlaylistUrl: url, text }
}

function parseContentTotal(res, resumeFrom) {
    const range = res.headers.get('content-range')
    const rangeTotal = /\/(\d+)\s*$/.exec(range || '')?.[1]
    if (rangeTotal) return parseInt(rangeTotal, 10) || 0
    const len = parseInt(res.headers.get('content-length') || res.headers.get('x-content-length') || '0', 10) || 0
    return resumeFrom > 0 && res.status === 206 ? resumeFrom + len : len
}

/** Progressive MP4 → staged ~1MB Blobs; resume via Range. */
async function fetchBlobWithProgress(url, onProgress, { signal, waitWhilePaused, jobId, onJob } = {}) {
    if (!jobId) throw new Error('缺少下載任務')
    await waitReady(waitWhilePaused, signal)
    let loaded = await stagedBytes(jobId)
    let partIndex = (await getParts(jobId)).length

    const headers = loaded > 0 ? { Range: `bytes=${loaded}-` } : {}
    const res = await fetchWithTimeout(url, { signal, headers })
    if (!res.ok && res.status !== 206) {
        cancelBody(res)
        throwHttp('下載失敗', res.status)
    }
    if (loaded > 0 && res.status === 200) {
        cancelBody(res)
        await clearParts(jobId)
        return fetchBlobWithProgress(url, onProgress, { signal, waitWhilePaused, jobId, onJob })
    }

    const total = parseContentTotal(res, loaded)
    const emit = async (n) => {
        onProgress?.({ phase: 'progressive', current: n, total })
        await onJob?.({ done: n, total })
    }
    await emit(loaded)

    const reader = res.body?.getReader()
    if (!reader) {
        const buf = await res.arrayBuffer()
        await putPart(jobId, partIndex, new Blob([buf], { type: VIDEO_MP4 }))
        loaded += buf.byteLength
        await emit(loaded)
        return new Blob(await getParts(jobId), { type: VIDEO_MP4 })
    }

    const pending = []
    let pendingSize = 0
    let lastAt = 0
    let idle = null
    const resetIdle = () => {
        idle?.dispose()
        idle = timedSignal(signal, PROGRESSIVE_IDLE_TIMEOUT_MS)
        idle.signal.addEventListener('abort', () => reader.cancel().catch(() => {}), { once: true })
    }
    const flush = async (force = false) => {
        if (!pendingSize || (!force && pendingSize < STAGE_CHUNK_BYTES)) return
        await putPart(jobId, partIndex++, new Blob(pending, { type: VIDEO_MP4 }))
        pending.length = 0
        pendingSize = 0
        await onJob?.({ done: loaded, total })
    }
    try {
        resetIdle()
        while (true) {
            await waitReady(waitWhilePaused, signal)
            const { done, value } = await reader.read()
            if (idle.signal.aborted && !signal?.aborted) throw abortError()
            if (done) break
            resetIdle()
            pending.push(value)
            pendingSize += value.byteLength
            loaded += value.byteLength
            await flush(false)
            if (Date.now() - lastAt >= 80) {
                lastAt = Date.now()
                onProgress?.({ phase: 'progressive', current: loaded, total })
            }
        }
        await flush(true)
    } catch (err) {
        reader.cancel().catch(() => {})
        throw err
    } finally {
        idle?.dispose()
    }
    await emit(loaded)
    return new Blob(await getParts(jobId), { type: VIDEO_MP4 })
}

/**
 * Cover hosts are often outside connect-src, so requests go through same-origin
 * download-proxy (session cookies required). Non-image responses are rejected.
 */
export async function fetchEpisodeThumbnailBlob(jpgUrl, signal) {
    if (!jpgUrl || String(jpgUrl).startsWith('blob:') || String(jpgUrl).startsWith('data:')) return null
    try {
        const res = await fetch(assetUrl(jpgUrl), { signal, mode: 'cors', credentials: 'same-origin' })
        if (!res.ok) {
            cancelBody(res)
            return null
        }
        const type = (res.headers.get('content-type') || '').toLowerCase()
        if (type && !type.startsWith('image/')) {
            cancelBody(res)
            return null
        }
        const blob = await res.blob()
        return blob.size ? blob : null
    } catch (err) {
        if (signal?.aborted || err?.name === 'AbortError') throw err
        return null
    }
}

export async function fetchEpisodeThumbnailVtt(vttUrl, signal) {
    if (!vttUrl) return null
    try {
        const res = await fetch(assetUrl(vttUrl), { signal })
        return res.ok ? await res.text() : null
    } catch (err) {
        if (signal?.aborted || err?.name === 'AbortError') throw err
        return null
    }
}

const SEEK_FRAME = /_\d+\.(jpe?g|png|webp)(\?|$)/i

export function collectThumbnailUrls(vttText, jpgUrl) {
    const urls = new Set()
    if (jpgUrl && HTTP_URL.test(jpgUrl)) urls.add(jpgUrl)
    const re = /https?:\/\/[^\s#]+/gi
    let m
    while ((m = re.exec(String(vttText || '')))) {
        const url = m[0]
        if (jpgUrl && SEEK_FRAME.test(url) && url !== jpgUrl) continue
        urls.add(url)
    }
    return [...urls]
}

function retryBudget(err) {
    return RETRY_STATUSES.has(httpStatusFromError(err)) ? SEGMENT_503_RETRIES : SEGMENT_RETRIES
}

async function fetchSegmentBuffer(uri, byterange, { signal, waitWhilePaused } = {}) {
    const url = unwrapMediaUrl(uri)
    for (let attempt = 0; ; attempt++) {
        await waitReady(waitWhilePaused, signal)
        try {
            const headers = {}
            const range = parseByteRange(byterange)
            if (range) headers.Range = `bytes=${range.offset}-${range.offset + range.length - 1}`
            const res = await fetchWithTimeout(url, {
                signal,
                headers,
                mode: 'cors',
                credentials: 'omit',
            })
            if (!res.ok) {
                cancelBody(res)
                throwHttp('片段下載失敗', res.status)
            }
            let bytes = new Uint8Array(await res.arrayBuffer())
            if (byterange && !res.headers.get('content-range')) {
                const slice = parseByteRange(byterange)
                if (slice) bytes = bytes.subarray(slice.offset, slice.offset + slice.length)
            }
            return bytes.buffer
        } catch (err) {
            if (signal?.aborted || err?.name === 'AbortError') throw err
            if (attempt >= retryBudget(err)) throw err
            const status = httpStatusFromError(err)
            await sleep(SEGMENT_RETRY_MS * 2 ** attempt * (status === 503 || status === 429 ? 2 : 1), signal)
        }
    }
}

async function fetchHlsAsMp4(playlistUrl, onProgress, { signal, waitWhilePaused, qualityHeight, jobId, onJob } = {}) {
    if (!jobId) throw new Error('缺少下載任務')
    await waitReady(waitWhilePaused, signal)
    const linked = linkAbort(signal)
    try {
        const { mediaPlaylistUrl, text } = await resolveMediaPlaylistUrl(playlistUrl, linked.signal, qualityHeight)
        const { map, segments } = parseMediaPlaylist(text, mediaPlaylistUrl)
        if (!segments.length) throw new Error('無法解析播放清單')
        const jobs = map ? [map, ...segments] : segments
        const total = jobs.length

        let done = 0
        for (let i = 0; i < total; i++) {
            if (await hasPart(jobId, i)) done++
        }
        onProgress?.({ phase: 'segment', current: done, total })
        await onJob?.({ done, total })

        await mapPool(
            jobs,
            OFFLINE_SEGMENT_CONCURRENCY,
            async (job, idx) => {
                if (await hasPart(jobId, idx)) return
                const buf = await fetchSegmentBuffer(job.uri, job.byterange, { signal: linked.signal, waitWhilePaused })
                await putPart(jobId, idx, new Blob([buf]))
                done++
                const n = Math.min(done, total)
                onProgress?.({ phase: 'segment', current: n, total })
                await onJob?.({ done: n, total })
            },
            { signal: linked.signal, onFail: () => linked.abort() },
        )

        onProgress?.({ phase: 'remux', current: 0, total: 1 })
        try {
            const staged = await getPartsExact(jobId, total)
            if (!staged) throw new Error('片段不完整')
            const blob = hlsSegmentsToMp4(await Promise.all(staged.map((b) => b.arrayBuffer())))
            onProgress?.({ phase: 'remux', current: 1, total: 1 })
            return blob
        } catch (err) {
            throw new Error(err?.message ? `無法轉成 MP4：${err.message}` : '無法轉成 MP4')
        }
    } catch (err) {
        linked.abort()
        throw err
    }
}

/** @returns {Promise<Blob>} */
export async function fetchEpisodeMp4(source, onProgress, opts, qualityHeight) {
    if (source?.kind === 'hls' && source.playlistUrl) {
        onProgress?.({ phase: 'playlist', current: 0, total: 1 })
        return fetchHlsAsMp4(source.playlistUrl, onProgress, { ...opts, qualityHeight })
    }
    if (source?.kind === 'mp4' && source.downloadUrl) {
        return fetchBlobWithProgress(source.downloadUrl, onProgress, opts)
    }
    throw new Error('影片下載來源無效')
}
