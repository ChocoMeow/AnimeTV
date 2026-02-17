import { serverSupabaseClient } from '#supabase/server'

import { getFieldTypesFromData } from '../../utils/fieldTypes'

// Get field names from database by querying actual data
async function getFieldsFromDatabase(client) {
    try {
        // Try to get at least one row to get column names
        // Even if filtered search returns no results, we can get schema from any row
        const { data: sampleData } = await client
            .from('anime_meta')
            .select('*')
            .limit(1)
            .maybeSingle()
        
        if (sampleData && typeof sampleData === 'object') {
            return Object.keys(sampleData)
        }
        
        return []
    } catch (error) {
        console.error('Error fetching fields from database:', error)
        return []
    }
}

export default defineEventHandler(async (event) => {
    await authAdmin(event)

    const client = await serverSupabaseClient(event)
    const query = getQuery(event)

    const page = Number.parseInt(query.page) > 0 ? Number.parseInt(query.page) : 1
    const pageSize = Number.parseInt(query.pageSize) > 0 ? Number.parseInt(query.pageSize) : 50
    const search = typeof query.search === 'string' ? query.search.trim() : ''
    const field = typeof query.field === 'string' ? query.field.trim() : ''
    const operator = (typeof query.operator === 'string' ? query.operator.trim().toLowerCase() : 'eq') || 'eq'
    const orderBy = typeof query.orderBy === 'string' ? query.orderBy.trim() : 'updated_at'
    const order = (typeof query.order === 'string' ? query.order.trim().toLowerCase() : 'desc') || 'desc'
    const ascending = order === 'asc'

    // Build query with ordering
    let dbQuery = client.from('anime_meta').select('*', { count: 'exact' })
    
    // Apply ordering - use search field if provided, otherwise default to updated_at
    if (orderBy) {
        dbQuery = dbQuery.order(orderBy, { ascending, nullsFirst: false })
    } else {
        dbQuery = dbQuery.order('updated_at', { ascending: false, nullsFirst: false })
    }

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

    // Get field names from database (from actual data rows)
    let fieldNames = []
    
    // First, try to get fields from current page results
    if (items.length > 0 && items[0]) {
        fieldNames = Object.keys(items[0])
    }
    
    // If no fields found in current results, query database directly
    if (fieldNames.length === 0) {
        fieldNames = await getFieldsFromDatabase(client)
    }
    
    // Ensure we have unique field names
    fieldNames = Array.from(new Set(fieldNames))

    // Get field types dynamically by analyzing actual data
    const fieldTypes = await getFieldTypesFromData(client, 'anime_meta', fieldNames)

    // Field labels (can be moved to database or config file later)
    const fieldLabels = {
        id: '內部編號',
        source_id: '外部作品編號（source_id）',
        title: '作品標題',
        description: '作品簡介',
        thumbnail: '封面圖片連結',
        premiere_date: '首播日期',
        director: '導演',
        distributor: '發行商',
        production_company: '製作公司',
        tags: '標籤（tags）',
        views: '觀看次數',
        score: '評分（score）',
        votes: '評分人數（votes）',
        related_anime_source_ids: '相關作品編號（related_anime_source_ids）',
        source_details_id: '詳細資料編號（source_details_id）',
        video_id: '站內片源 ID（video_id）',
        season: '季數（season）',
        created_at: '建立時間',
        updated_at: '更新時間',
    }

    // Build fields array with name, type, and label
    const fields = fieldNames.map(name => ({
        name,
        type: fieldTypes[name] || 'text',
        label: fieldLabels[name] || name,
        readOnly: ['id', 'created_at', 'updated_at'].includes(name),
        isPrimaryKey: name === 'source_id',
    }))

    return {
        items,
        total: count ?? items.length,
        page,
        pageSize,
        fields,
    }
})
