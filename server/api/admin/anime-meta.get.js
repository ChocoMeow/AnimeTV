import { serverSupabaseClient } from '#supabase/server'
import { getFieldTypesFromData } from '../../utils/fieldTypes'
import { createLoggedError, moduleLogger } from '~~/server/utils/logger'

const log = moduleLogger('admin-anime-meta')

const FIELD_LABELS = {
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
    video_id: '片源 ID（anime1 cat / twxgct cartoon slug）',
    video_source: '片源站（anime1 | twxgct）',
    season: '季數（season）',
    created_at: '建立時間',
    updated_at: '更新時間',
}

/** Unknown columns go to 其他. */
const FORM_SECTIONS = [
    { id: 'basic', title: '基本資料', keys: ['title', 'description', 'thumbnail', 'season', 'premiere_date'] },
    { id: 'video', title: '片源設定', keys: ['video_source', 'video_id'] },
    { id: 'ids', title: '編號與關聯', keys: ['source_id', 'source_details_id', 'related_anime_source_ids', 'id'] },
    { id: 'credits', title: '製作資訊', keys: ['director', 'distributor', 'production_company'] },
    { id: 'stats', title: '標籤與數據', keys: ['tags', 'views', 'score', 'votes'] },
    { id: 'system', title: '系統', keys: ['created_at', 'updated_at'] },
]

const READ_ONLY = new Set(['id', 'created_at', 'updated_at'])
const WIDE_TYPES = new Set(['textbox', 'array', 'jsonb'])

function buildField(name, fieldTypes) {
    const type = fieldTypes[name] || 'text'
    return {
        name,
        type,
        label: FIELD_LABELS[name] || name,
        readOnly: READ_ONLY.has(name),
        isPrimaryKey: name === 'source_id',
        wide: WIDE_TYPES.has(type),
    }
}

function buildForm(fieldNames, fieldTypes) {
    const byName = new Map(fieldNames.map((name) => [name, buildField(name, fieldTypes)]))
    const used = new Set()
    const formSections = FORM_SECTIONS.map((s) => {
        const fields = s.keys.map((k) => byName.get(k)).filter(Boolean)
        for (const f of fields) used.add(f.name)
        return { id: s.id, title: s.title, fields }
    }).filter((s) => s.fields.length)

    const rest = fieldNames.filter((n) => !used.has(n)).map((n) => byName.get(n)).filter(Boolean)
    if (rest.length) formSections.push({ id: 'other', title: '其他', fields: rest })

    return { fields: formSections.flatMap((s) => s.fields), formSections }
}

async function getFieldsFromDatabase(client) {
    try {
        const { data: sampleData } = await client.from('anime_meta').select('*').limit(1).maybeSingle()
        if (sampleData && typeof sampleData === 'object') return Object.keys(sampleData)
        return []
    } catch (error) {
        log.error({ err: error }, 'Error fetching fields from database')
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

    let dbQuery = client.from('anime_meta').select('*', { count: 'exact' })

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
            case 'in': {
                const inValues = search.split(',').map((s) => s.trim()).filter(Boolean)
                if (inValues.length > 0) dbQuery = dbQuery.in(field, inValues)
                break
            }
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
        throw createLoggedError(event, {
            statusCode: 500,
            statusMessage: 'Failed to load anime meta records',
            err: error,
            context: { module: 'admin-anime-meta' },
        })
    }

    const items = data || []
    let fieldNames = items[0] ? Object.keys(items[0]) : await getFieldsFromDatabase(client)
    fieldNames = Array.from(new Set(fieldNames))

    const fieldTypes = await getFieldTypesFromData(client, 'anime_meta', fieldNames)
    const { fields, formSections } = buildForm(fieldNames, fieldTypes)

    return {
        items,
        total: count ?? items.length,
        page,
        pageSize,
        fields,
        formSections,
    }
})
