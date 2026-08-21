/** Server-only in-memory caches (do not put mutable Maps in shared/). */

export const ANIME1_LIST_CACHE = {
    fetchPromise: null,
    timestamp: 0,
    data: null,
}

export const RESPONSE_CACHE = new Map()

export let ANIME_CACHE = {
    timestamp: 0,
    data: null,
}
