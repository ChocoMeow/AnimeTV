/**
 * AniKoto autofill: anilist-chinese → AniList English → AniKoto watch slug.
 */
import { lookupAnilist } from './anilistLookup.js'
import { matchAnikoto } from './search.js'
import { moduleLogger } from '~~/server/utils/logger'

const log = moduleLogger('anikoto-autofill')

/**
 * @param {string} title
 * @param {{ year?: string|number|null }} [opts]
 * @returns {Promise<{
 *   video_id: string|null,
 *   anilist_id: number|null,
 *   english_title: string|null,
 * }>}
 */
export async function autofillFromTitle(title, opts = {}) {
    const year = opts.year ?? null
    const anilist = await lookupAnilist(title, { year }).catch((err) => {
        log.warn({ err, title }, 'AniList lookup failed')
        return null
    })

    const searchTitle = anilist?.english_title || title
    const matched = (
        await matchAnikoto([{ title: searchTitle, year }])
    )[0] ?? null

    return {
        video_id: matched?.matchedVideo?.id ?? null,
        anilist_id: anilist?.anilist_id ?? null,
        english_title: anilist?.english_title ?? null,
    }
}
