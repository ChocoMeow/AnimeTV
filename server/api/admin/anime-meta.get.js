import { serverSupabaseClient } from '#supabase/server'

// Fallback list so the admin UI always sees all important columns,
// even when the current page has no rows (e.g. after a filtered search).
const DEFAULT_FIELDS = [
    'id',
    'source_id',
    'title',
    'description',
    'thumbnail',
    'premiere_date',
    'director',
    'distributor',
    'production_company',
    'tags',
    'views',
    'score',
    'votes',
    'related_anime_source_ids',
    'source_details_id',
    'video_id',
    'season',
    'created_at',
    'updated_at',
]

export default defineEventHandler(async (event) => {
    await authAdmin(event)

    const client = await serverSupabaseClient(event)
    const query = getQuery(event)

    const page = Number.parseInt(query.page) > 0 ? Number.parseInt(query.page) : 1
    const pageSize = Number.parseInt(query.pageSize) > 0 ? Number.parseInt(query.pageSize) : 50
    const search = typeof query.search === 'string' ? query.search.trim() : ''
    const field = typeof query.field === 'string' ? query.field.trim() : ''
    const operator = (typeof query.operator === 'string' ? query.operator.trim().toLowerCase() : 'eq') || 'eq'

    let dbQuery = client.from('anime_meta').select('*', { count: 'exact' }).order('updated_at', { ascending: false, nullsFirst: false })

    if (search && field) {
        switch (operator) {
            case 'like':
            case 'contains':
                dbQuery = dbQuery.ilike(field, `%${search}%`)
                break
            case 'gte':
            case '>=':
                dbQuery = dbQuery.gte(field, search)
                break
            case 'lte':
            case '<=':
                dbQuery = dbQuery.lte(field, search)
                break
            case 'in':
                const inValues = search.split(',').map((s) => s.trim()).filter(Boolean)
                if (inValues.length > 0) {
                    dbQuery = dbQuery.in(field, inValues)
                }
                break
            case 'neq':
            case '!=':
                dbQuery = dbQuery.neq(field, search)
                break
            case 'eq':
            default:
                dbQuery = dbQuery.eq(field, search)
                break
        }
    }

    const from = (page - 1) * pageSize
    const to = from + pageSize - 1
    dbQuery = dbQuery.range(from, to)

    const { data, error, count } = await dbQuery

    if (error) {
        console.error('Failed to fetch anime_meta for admin:', error)
        throw createError({
            statusCode: 500,
            statusMessage: 'Failed to load anime meta records',
        })
    }

    const items = data || []

    // Merge actual keys from the first row with our default list,
    // so the dropdown always contains all fields even when there are no results.
    const dynamicKeys = items[0] ? Object.keys(items[0]) : []
    const fields = Array.from(new Set([...dynamicKeys, ...DEFAULT_FIELDS]))

    return {
        items,
        total: count ?? items.length,
        page,
        pageSize,
        fields,
    }
})
