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
 * Seal provider episode credentials + list-time thumbs.
 * `sourceId` / `episode` are server-only (caption cache) — not returned in API JSON.
 */
export function sealEpisodeToken(source, ep, userId, { sourceId, episode } = {}) {
    if (!userId) throw new Error('sealEpisodeToken: userId required')
    if (!ep?.token) throw new Error('sealEpisodeToken: token required')
    return seal('ep', {
        s: source,
        t: ep.token,
        i: userId,
        ...ifSet('j', ep.thumbnails?.sheetUrl),
        ...ifSet('w', ep.thumbnails?.vttUrl),
        ...ifSet('a', sourceId),
        ...ifSet('n', episode),
    })
}

/** Open episode token and require it belongs to `userId`. */
export function openOwnedEpisodeToken(sealed, userId) {
    const p = open('ep', sealed)
    if (!p.s || !p.t || !p.i) throw createError({ statusCode: 400, statusMessage: 'Invalid episode token' })
    if (p.i !== userId) throw createError({ statusCode: 403, statusMessage: 'Episode token user mismatch' })
    const sourceId = p.a != null && p.a !== '' ? Number(p.a) : null
    return {
        source: p.s,
        token: p.t,
        userId: p.i,
        thumbJpg: p.j || null,
        thumbVtt: p.w || null,
        sourceId: Number.isFinite(sourceId) ? sourceId : null,
        episode: p.n || null,
    }
}

/**
 * @param {{ url: string, cookie?: string, referer?: string, hls?: boolean, exp?: number, userId: string }} payload
 * `hls: true` — treat non-m3u8 URLs as HLS parts (segments/keys); skip progressive Content-Length path.
 */
export function sealMediaProxy({ url, cookie = '', referer = '', hls = false, exp, userId } = {}) {
    if (!userId) throw new Error('sealMediaProxy: userId required')
    return seal('media', {
        u: url,
        c: cookie || undefined,
        r: referer || undefined,
        h: hls ? 1 : undefined,
        i: userId,
    }, exp)
}

export function openMediaProxy(token) {
    const p = open('media', token)
    if (!p.u || !p.i) throw createError({ statusCode: 400, statusMessage: 'Invalid media token' })
    return {
        url: p.u,
        cookie: p.c || '',
        referer: p.r || '',
        hls: p.h === 1 || p.h === true,
        exp: p.e || 0,
        userId: p.i,
    }
}

export function mediaProxyUrl(api, payload) {
    return `/api/${api}?t=${encodeURIComponent(sealMediaProxy(payload))}`
}

/**
 * Rewrite seek-thumbnail WebVTT image URLs → `/api/media/file`.
 * Seals each distinct URL once; keeps #xywh= for client crops.
 */
export function rewriteThumbnailsVtt(text, vttUrl, { api = 'media/file', cookie = '', referer = '', userId } = {}) {
    if (!text || !userId || !vttUrl) return text || ''
    let base
    try {
        base = new URL(vttUrl)
    } catch {
        return text
    }

    const sealedByAbs = new Map()
    const tokenRe =
        /(?:https?:\/\/[^\s"'<>#]+|(?:[\w.~+-]+\/)*[\w.~+-]+\.(?:jpe?g|png|webp|gif|avif))(?=(?:#xywh=[\d,]+)?(?:\s|$))/gi

    return String(text).replace(tokenRe, (raw) => {
        try {
            const abs = new URL(raw, base)
            abs.hash = ''
            const key = abs.toString()
            let proxied = sealedByAbs.get(key)
            if (!proxied) {
                proxied = mediaProxyUrl(api, { url: key, cookie, referer, userId })
                sealedByAbs.set(key, proxied)
            }
            return proxied
        } catch {
            return raw
        }
    })
}
