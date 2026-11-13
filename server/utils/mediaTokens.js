import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

/**
 * Opaque AEAD tokens (episode credentials + media proxy URLs).
 * AES-128-GCM + cached key — fast on Pi 4 (ARM AES), still authenticated encryption.
 */
const TTL_MS = 6 * 60 * 60 * 1000
const ALGO = 'aes-128-gcm'

let cachedKey

function key() {
    if (cachedKey) return cachedKey
    // Dedicated secret only — never reuse NUXT_SUPABASE_SECRET_KEY (DB blast radius).
    const raw = useRuntimeConfig().mediaProxySecret
    if (!raw || typeof raw !== 'string') {
        throw createError({
            statusCode: 500,
            statusMessage: 'NUXT_MEDIA_PROXY_SECRET not set (openssl rand -base64 32)',
        })
    }
    cachedKey = createHash('sha256').update(`app-media-v1:${raw}`).digest().subarray(0, 16)
    return cachedKey
}

function seal(kind, data, exp = Date.now() + TTL_MS) {
    const iv = randomBytes(12)
    const cipher = createCipheriv(ALGO, key(), iv)
    const enc = Buffer.concat([cipher.update(JSON.stringify({ k: kind, e: exp, ...data }), 'utf8'), cipher.final()])
    return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64url')
}

function open(kind, token) {
    if (!token || typeof token !== 'string') {
        throw createError({ statusCode: 400, statusMessage: 'Missing token' })
    }
    try {
        const raw = Buffer.from(token, 'base64url')
        const decipher = createDecipheriv(ALGO, key(), raw.subarray(0, 12))
        decipher.setAuthTag(raw.subarray(12, 28))
        const p = JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8'))
        if (p?.k !== kind) throw new Error('kind')
        if (typeof p.e === 'number' && Date.now() > p.e) {
            throw createError({ statusCode: 401, statusMessage: 'Token expired' })
        }
        return p
    } catch (err) {
        if (err?.statusCode) throw err
        throw createError({ statusCode: 400, statusMessage: 'Invalid token' })
    }
}

function ifSet(key, value) {
    if (value == null || value === '') return {}
    return { [key]: typeof value === 'string' ? value : String(value) }
}

/**
 * Seal provider episode credentials (+ list-time meta so /api/episode can return thumbs/video_id).
 * Thumbs/video_id are plain when returned — only the provider token + stream proxy are sensitive.
 */
export function sealEpisodeToken(source, ep, userId) {
    if (!userId) throw new Error('sealEpisodeToken: userId required')
    if (!ep?.token) throw new Error('sealEpisodeToken: token required')
    return seal('ep', {
        s: source,
        t: ep.token,
        i: userId,
        ...ifSet('v', ep.video_id),
        ...ifSet('j', ep.thumbnails_jpg_url),
        ...ifSet('w', ep.thumbnails_vtt_url),
    })
}

/** Open episode token and require it belongs to `userId`. */
export function openOwnedEpisodeToken(sealed, userId) {
    const p = open('ep', sealed)
    if (!p.s || !p.t || !p.i) throw createError({ statusCode: 400, statusMessage: 'Invalid episode token' })
    if (p.i !== userId) throw createError({ statusCode: 403, statusMessage: 'Episode token user mismatch' })
    return {
        source: p.s,
        token: p.t,
        userId: p.i,
        videoId: p.v ?? null,
        thumbJpg: p.j || null,
        thumbVtt: p.w || null,
    }
}

/** List-time meta merged with resolvePlayback (thumbs stay plain URLs). */
export function playbackMetaFrom(sealed, result) {
    return {
        video_id: result?.video_id || sealed.videoId || null,
        thumbnails_vtt_text: result?.thumbnails_vtt_text || result?.thumbnail_vtt_text || null,
        thumbnails_jpg_url: result?.thumbnails_jpg_url || sealed.thumbJpg || null,
        thumbnails_vtt_url: result?.thumbnails_vtt_url || sealed.thumbVtt || null,
    }
}

/** @param {{ url: string, cookie?: string, exp?: number, userId: string }} payload */
export function sealMediaProxy({ url, cookie = '', exp, userId } = {}) {
    if (!userId) throw new Error('sealMediaProxy: userId required')
    return seal('media', { u: url, c: cookie || undefined, i: userId }, exp)
}

export function openMediaProxy(token) {
    const p = open('media', token)
    if (!p.u || !p.i) throw createError({ statusCode: 400, statusMessage: 'Invalid media token' })
    return { url: p.u, cookie: p.c || '', exp: p.e || 0, userId: p.i }
}

export function mediaProxyUrl(api, payload) {
    return `/api/${api}?t=${encodeURIComponent(sealMediaProxy(payload))}`
}
