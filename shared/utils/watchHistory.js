export const WATCH_ANIME_META = 'anime_meta!anime_ref_id(title, thumbnail, premiere_date)'
export const WATCH_ANIME_META_INNER = 'anime_meta!anime_ref_id!inner(title, thumbnail, premiere_date)'

export function withAnimeCover(row) {
    if (!row) return row
    const { anime_meta: meta, ...rest } = row
    return {
        ...rest,
        anime_title: meta?.title || '',
        anime_image: meta?.thumbnail || '',
        premiere_date: meta?.premiere_date ?? null,
    }
}

export function withAnimeCovers(rows) {
    return (rows || []).map(withAnimeCover)
}
