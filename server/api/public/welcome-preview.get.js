import { serverSupabaseServiceRole } from '#supabase/server'
import { CACHE_LIFETIME } from '~~/shared/global'
import { logError } from '~~/server/utils/logger'
import { toYearMonthSlash } from '~~/server/utils/functions'

const ROW_LIMIT = 60
const SPOTLIGHT_LIMIT = 5
const BROWSE_LIMIT = 12
const POSTER_LIMIT = 40

/** Map JS weekday (0=Sun) to app day codes used on the home schedule. */
function premiereToDayCode(premiereDate) {
    if (!premiereDate) return null
    const d = new Date(premiereDate)
    if (!Number.isFinite(d.getTime())) return null
    const map = { 0: '7', 1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6' }
    return map[d.getDay()] ?? null
}

function mapRow(row) {
    return {
        refId: String(row.source_id),
        title: row.title,
        image: row.thumbnail,
        thumbnail: row.thumbnail,
        year: toYearMonthSlash(row.premiere_date),
        views: row.views ?? null,
    }
}

export default defineCachedEventHandler(
    async (event) => {
        try {
            const client = await serverSupabaseServiceRole(event)
            const { data, error } = await client
                .from('anime_meta')
                .select('source_id, title, thumbnail, premiere_date, views')
                .not('thumbnail', 'is', null)
                .not('video_id', 'is', null)
                .order('views', { ascending: false, nullsFirst: false })
                .order('premiere_date', { ascending: false, nullsFirst: false })
                .limit(ROW_LIMIT)

            if (error) throw error

            const rows = data ?? []
            const mapped = rows.map(mapRow)

            const spotlight = mapped.slice(0, SPOTLIGHT_LIMIT)
            const browse = mapped.slice(0, BROWSE_LIMIT)
            const posters = rows
                .map((row) => row.thumbnail)
                .filter((url) => typeof url === 'string' && /^https?:\/\//.test(url))
                .slice(0, POSTER_LIMIT)

            const byDay = {}
            for (const row of rows) {
                const dayCode = premiereToDayCode(row.premiere_date)
                if (!dayCode) continue
                const item = mapRow(row)
                ;(byDay[dayCode] ??= []).push(item)
            }

            return { spotlight, byDay, browse, posters }
        } catch (err) {
            logError(event, err, { module: 'public-welcome-preview' })
            return { spotlight: [], byDay: {}, browse: [], posters: [] }
        }
    },
    { maxAge: CACHE_LIFETIME / 1000, swr: true, getKey: () => 'public-welcome-preview' },
)
