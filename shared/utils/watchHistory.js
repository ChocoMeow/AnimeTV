/** Title/image come from anime_meta via anime_ref_id — not denormalized on watch_history. */

export const WATCH_ANIME_META = 'anime_meta!anime_ref_id(title, thumbnail)'
export const WATCH_ANIME_META_INNER = 'anime_meta!anime_ref_id!inner(title, thumbnail)'

export function withAnimeCover(row) {
    if (!row) return row
    const { anime_meta: meta, ...rest } = row
    return {
        ...rest,
        anime_title: meta?.title || '',
        anime_image: meta?.thumbnail || '',
    }
}

export function withAnimeCovers(rows) {
    return (rows || []).map(withAnimeCover)
}
