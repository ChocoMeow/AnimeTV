/** Shared episode / token helpers for provider plugins. */

export function normalizeEpisodeId(id) {
    return /^\d+$/.test(id) ? String(Number(id)) : id
}

export function episodeRecord(token, { videoId = null, thumbJpg = null, thumbVtt = null } = {}) {
    return {
        video_id: videoId,
        token,
        thumbnails_jpg_url: thumbJpg,
        thumbnails_vtt_url: thumbVtt,
    }
}

/** `prefix` + base64url(parts joined by sep) — for non-default providers. */
export function encodePrefixedToken(prefix, parts, sep = '|') {
    return `${prefix}${Buffer.from(parts.join(sep), 'utf8').toString('base64url')}`
}

export function decodePrefixedToken(token, prefix, expectedParts = 2, sep = '|') {
    if (!token?.startsWith?.(prefix)) return null
    try {
        const parts = Buffer.from(token.slice(prefix.length), 'base64url').toString('utf8').split(sep)
        return parts.length >= expectedParts && parts.every(Boolean) ? parts : null
    } catch {
        return null
    }
}
