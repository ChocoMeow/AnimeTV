import { CACHE_LIFETIME } from '#shared/utils/anime'
import { moduleLogger } from '~~/server/utils/logger'
import { ANIME1 } from '~~/server/lib/videoProviders/sources/anime1'

/** Server-only in-memory caches used by Anime1 catalog / cfFetch. */
const ANIME1_LIST_CACHE = {
    fetchPromise: null,
    timestamp: 0,
    data: null,
}

const RESPONSE_CACHE = new Map()

const animeLog = moduleLogger('anime')

export function anime1ListCacheTimestamp() {
    return ANIME1_LIST_CACHE.timestamp
}

export async function fetchAnimeData() {
    const currentTime = Date.now()

    if (ANIME1_LIST_CACHE.data && (currentTime - ANIME1_LIST_CACHE.timestamp < CACHE_LIFETIME)) {
        return ANIME1_LIST_CACHE.data
    }

    // Wait for any ongoing fetch if it exists
    if (ANIME1_LIST_CACHE.fetchPromise) return ANIME1_LIST_CACHE.fetchPromise;

    // Start a new fetch and cache the promise
    ANIME1_LIST_CACHE.fetchPromise = (async () => {
        try {
            animeLog.info('Fetching anime data from source')
            const response = await fetch(ANIME1.catalogUrl);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const rawList = await response.json();
            ANIME1_LIST_CACHE.data = rawList.map(([id, title, episodes, year, season, subtitleGroup]) => ({
                id,
                title,
                episodes,
                year,
                season,
                subtitleGroup,
            }));

            ANIME1_LIST_CACHE.timestamp = currentTime;
            ANIME1_LIST_CACHE.fetchPromise = null;
            return ANIME1_LIST_CACHE.data;
        } catch (error) {
            animeLog.error({ err: error }, 'Error fetching anime data')
            ANIME1_LIST_CACHE.fetchPromise = null; // Reset on error to allow retries
            throw error;
        }
    })();

    return ANIME1_LIST_CACHE.fetchPromise;
}

let flareSessionId = null

const DEFAULT_FETCH_HEADERS = Object.freeze({
    'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
})

async function flareRequest(solver, body) {
    const res = await fetch(solver, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    })
    const data = await res.json()
    if (data.status !== 'ok') throw new Error(data.message || 'FlareSolverr failed')
    return data
}

/**
 * Cached HTML fetch. Uses FlareSolverr when configured; otherwise plain fetch
 * with browser-like headers (override via opts.headers).
 * @param {string} url
 * @param {{ headers?: Record<string, string>, timeoutMs?: number }} [opts]
 */
export async function cfFetch(url, opts = {}) {
    try {
        const now = Date.now()
        const cacheKey = url
        const cacheTtlMs = opts.cacheTtlMs ?? CACHE_LIFETIME
        const cached = RESPONSE_CACHE.get(cacheKey)
        if (cached && now - cached.timestamp < cacheTtlMs) {
            animeLog.debug({ url, bytes: cached.html.length }, 'cfFetch cache hit')
            return cached
        }

        const solver = (useRuntimeConfig().cfFetchFlaresolverr || '').trim()
        const headers = { ...DEFAULT_FETCH_HEADERS, ...opts.headers }
        const timeoutMs = opts.timeoutMs ?? 20_000
        let html

        if (solver) {
            if (!flareSessionId) {
                flareSessionId = (await flareRequest(solver, { cmd: 'sessions.create' })).session
            }
            let data
            try {
                data = await flareRequest(solver, {
                    cmd: 'request.get',
                    url,
                    session: flareSessionId,
                    maxTimeout: 60000,
                })
            } catch {
                flareSessionId = (await flareRequest(solver, { cmd: 'sessions.create' })).session
                data = await flareRequest(solver, {
                    cmd: 'request.get',
                    url,
                    session: flareSessionId,
                    maxTimeout: 60000,
                })
            }
            html = data.solution.response
        } else {
            const response = await fetch(url, {
                headers,
                redirect: 'follow',
                signal: AbortSignal.timeout(timeoutMs),
            })
            if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`)
            html = await response.text()
        }

        const result = { html, timestamp: now }

        if (cacheTtlMs > 0) {
            RESPONSE_CACHE.set(cacheKey, result)
            while (RESPONSE_CACHE.size > 200) {
                const firstKey = RESPONSE_CACHE.keys().next().value
                RESPONSE_CACHE.delete(firstKey)
            }
        }

        return result
    } catch (error) {
        animeLog.error({ err: error, url }, 'cfFetch failed')
        return null
    }
}
