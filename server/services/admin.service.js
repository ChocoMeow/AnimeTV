import { serverSupabaseClient } from '#supabase/server'
import { createError } from 'h3'
import { CUSTOM_SOURCE_ID_MIN } from '#shared/utils/anime'
import { DEFAULT_VIDEO_SOURCE, VIDEO_ID_FORMATS, VIDEO_SOURCES } from '~~/server/lib/videoProviders'
import { stripSelfRelated, syncRelatedLinks } from '~~/server/lib/anime/animeMetaRelated'
import { scrapeAcgDetail } from '~~/server/lib/anime/scrapeAcgDetail'
import { matchAnime } from '~~/server/lib/anime/match'
import { createLoggedError, moduleLogger } from '~~/server/utils/logger'

const log = moduleLogger('admin-anime-meta')
const autofillLog = moduleLogger('admin-anime-meta-autofill')
const fieldTypesLog = moduleLogger('fieldTypes')

/** Infer column types from sample rows for admin form / body coercion. */
async function getFieldTypesFromData(client, tableName, fields) {
    const fieldTypes = {}

    let sampleRows = []
    try {
        const { data } = await client
            .from(tableName)
            .select('*')
            .limit(10)
        sampleRows = data || []
    } catch (error) {
        fieldTypesLog.error({ err: error, tableName }, 'Error fetching sample rows for type inference')
        sampleRows = []
    }

    for (const field of fields) {
        let detectedType = null

        for (const row of sampleRows || []) {
            const value = row[field]
            if (value === null || value === undefined) continue

            if (Array.isArray(value)) {
                detectedType = 'array'
                break
            }

            if (typeof value === 'object' && value !== null && !(value instanceof Date)) {
                detectedType = 'jsonb'
                break
            }

            if (typeof value === 'number') {
                const isInt = Number.isInteger(value)
                if (!detectedType) {
                    detectedType = isInt ? 'number' : 'double'
                } else if (detectedType === 'number' && !isInt) {
                    detectedType = 'double'
                }
                continue
            }

            if (typeof value === 'boolean') {
                detectedType = 'boolean'
                break
            }

            if (typeof value === 'string') {
                const looksLikeDateField = field.includes('date') || field.includes('time') || field.endsWith('_at')
                if (looksLikeDateField) {
                    const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/
                    if (dateOnlyPattern.test(value) && !value.includes('T') && !value.includes(' ')) {
                        detectedType = 'date'
                        break
                    }
                    const parsed = new Date(value)
                    if (!isNaN(parsed.getTime())) {
                        detectedType = 'datetime'
                        break
                    }
                }

                if (field === 'description' || value.length > 100) {
                    detectedType = 'textbox'
                    continue
                }

                if (!detectedType) {
                    detectedType = 'text'
                }
            }
        }

        if (!detectedType) {
            if (field.endsWith('_at') || field.includes('time')) {
                detectedType = 'datetime'
            } else if (field.includes('date')) {
                detectedType = 'date'
            } else if (field === 'description') {
                detectedType = 'textbox'
            } else if (field === 'id' || (field.includes('_id') && !field.includes('source_ids'))) {
                detectedType = 'number'
            } else if (field.includes('score') || field.includes('rating')) {
                detectedType = 'double'
            } else if (field.includes('count') || field.includes('views') || field.includes('votes')) {
                detectedType = 'number'
            } else if (field.includes('tags') || (field.includes('ids') && field.includes('array'))) {
                detectedType = 'array'
            } else {
                detectedType = 'text'
            }
        }

        fieldTypes[field] = detectedType
    }

    return fieldTypes
}

function convertValue(value, fieldType) {
    if (value === null || value === undefined || value === '') {
        return null
    }

    switch (fieldType) {
        case 'number': {
            const num = Number(value)
            return isNaN(num) ? null : Math.floor(num)
        }
        case 'double': {
            const dbl = Number(value)
            return isNaN(dbl) ? null : Math.round(dbl * 10) / 10
        }
        case 'date':
            if (value instanceof Date) {
                return value.toISOString().slice(0, 10)
            }
            if (typeof value === 'string') {
                const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/
                if (dateOnlyPattern.test(value)) {
                    return value
                }
                const date = new Date(value)
                return isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10)
            }
            return null
        case 'array':
            if (Array.isArray(value)) {
                return value.length === 0 ? null : value
            }
            if (typeof value === 'string') {
                try {
                    const parsed = JSON.parse(value)
                    if (Array.isArray(parsed)) {
                        return parsed.length === 0 ? null : parsed
                    }
                    return [value]
                } catch {
                    const arr = value.split(',').map(s => s.trim()).filter(Boolean)
                    return arr.length === 0 ? null : arr
                }
            }
            return null
        case 'datetime':
            if (value instanceof Date) return value.toISOString()
            if (typeof value === 'string') {
                const date = new Date(value)
                return isNaN(date.getTime()) ? null : date.toISOString()
            }
            return null
        case 'boolean':
            if (typeof value === 'boolean') return value
            if (typeof value === 'string') {
                const lower = value.toLowerCase()
                return lower === 'true' || lower === '1' || lower === 'yes'
            }
            return Boolean(value)
        case 'jsonb':
            if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
                return value
            }
            if (typeof value === 'string') {
                try {
                    const parsed = JSON.parse(value)
                    return typeof parsed === 'object' && parsed !== null ? parsed : null
                } catch {
                    return null
                }
            }
            return null
        case 'textbox':
        case 'text':
        default:
            return String(value)
    }
}

function convertBody(body, fieldTypes) {
    const converted = {}
    for (const [key, value] of Object.entries(body)) {
        const fieldType = fieldTypes[key] || 'text'
        converted[key] = convertValue(value, fieldType)
    }
    return converted
}

const FIELD_LABELS = {
    id: '內部編號',
    source_id: '外部作品編號',
    title: '作品標題',
    description: '作品簡介',
    thumbnail: '封面圖片',
    premiere_date: '首播日期',
    director: '導演',
    distributor: '發行商',
    production_company: '製作公司',
    tags: '標籤',
    views: '觀看次數',
    score: '評分',
    votes: '評分人數',
    related_anime_source_ids: '相關作品編號',
    source_details_id: '詳細資料編號',
    video_id: '片源 ID',
    video_source: '片源站',
    season: '季數',
    created_at: '建立時間',
    updated_at: '更新時間',
}

/** Optional help text → admin info tooltip. */
const FIELD_HELP = {
    source_id: '外部來源作品 ID，作為編輯主鍵；建立後通常不應更動。',
    related_anime_source_ids: '相關作品的 source_id 陣列，用於頁面「相關推薦」。',
    source_details_id: '詳細資料來源 ID。填入後可按自動填入，從外部帶入標題、簡介、封面等。',
    video_source:
        `影片來源站台。目前：${VIDEO_SOURCES.join('、')}；需與 video_id 格式對應。` +
        '新增來源：在 server/lib/videoProviders/sources/ 新增 *.js（default export），重啟即可。',
    video_id:
        '依 video_source 填寫：\n' +
        Object.entries(VIDEO_ID_FORMATS)
            .map(([id, format]) => `• ${id}：${format}`)
            .join('\n'),
    season: '播出季節（春／夏／秋／冬）。變更首播日期時可自動推算。',
    thumbnail: '封面圖片完整 URL。',
    tags: '作品標籤陣列，用於搜尋與分類。',
}

/** Unknown columns go to 其他. */
const FORM_SECTIONS = [
    { id: 'basic', title: '基本資料', keys: ['title', 'description', 'thumbnail', 'season', 'premiere_date'] },
    { id: 'video', title: '片源設定', keys: ['video_source', 'video_id'] },
    { id: 'ids', title: '編號與關聯', keys: ['source_id', 'source_details_id', 'related_anime_source_ids'] },
    { id: 'credits', title: '製作資訊', keys: ['director', 'distributor', 'production_company'] },
    { id: 'stats', title: '標籤與數據', keys: ['tags', 'views', 'score', 'votes'] },
    { id: 'system', title: '系統', keys: [ 'id', 'created_at', 'updated_at'] },
]

const READ_ONLY = new Set(['id', 'created_at', 'updated_at'])
const WIDE_TYPES = new Set(['textbox', 'array', 'jsonb'])

function buildField(name, fieldTypes) {
    const type = fieldTypes[name] || 'text'
    return {
        name,
        type,
        label: FIELD_LABELS[name] || name,
        description: FIELD_HELP[name] || null,
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

/** Next custom source_id (>= CUSTOM_SOURCE_ID_MIN). Avoids full-table scan of Bahamut SNs. */
async function nextSourceId(client) {
    const { data, error } = await client
        .from('anime_meta')
        .select('source_id')
        .gte('source_id', CUSTOM_SOURCE_ID_MIN)

    if (error) {
        autofillLog.error({ err: error }, 'Failed to fetch max source_id')
        return String(CUSTOM_SOURCE_ID_MIN)
    }

    let maxId = CUSTOM_SOURCE_ID_MIN - 1
    for (const row of data || []) {
        const n = Number(row.source_id)
        if (n > maxId) maxId = n
    }
    return String(maxId + 1)
}

export async function listAnimeMeta(event, { page, pageSize, search, field, operator, orderBy, order }) {
    const client = await serverSupabaseClient(event)
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
        videoSources: VIDEO_SOURCES,
        defaultVideoSource: DEFAULT_VIDEO_SOURCE,
    }
}

export async function createAnimeMeta(event, body) {
    const client = await serverSupabaseClient(event)
    const fieldTypes = await getFieldTypesFromData(client, 'anime_meta', Object.keys(body))
    const convertedBody = stripSelfRelated(convertBody(body, fieldTypes))

    const { data, error } = await client.from('anime_meta').insert(convertedBody).select('*').single()
    if (error) {
        throw createLoggedError(event, {
            statusCode: 500,
            statusMessage: 'Failed to create anime meta record',
            err: error,
            context: { module: 'admin-anime-meta' },
        })
    }

    try {
        await syncRelatedLinks(client, data.source_id, data.related_anime_source_ids)
    } catch (err) {
        throw createLoggedError(event, {
            statusCode: 500,
            statusMessage: 'Created anime meta, but failed to sync related links',
            err,
            context: { module: 'admin-anime-meta', sourceId: data.source_id },
        })
    }

    return data
}

export async function updateAnimeMeta(event, sourceId, body) {
    const client = await serverSupabaseClient(event)

    const [{ data: existing, error: existingError }, fieldTypes] = await Promise.all([
        client.from('anime_meta').select('related_anime_source_ids').eq('source_id', sourceId).maybeSingle(),
        getFieldTypesFromData(client, 'anime_meta', Object.keys(body)),
    ])

    if (existingError) {
        throw createLoggedError(event, {
            statusCode: 500,
            statusMessage: 'Failed to load anime meta record',
            err: existingError,
            context: { module: 'admin-anime-meta', sourceId },
        })
    }
    if (!existing) throw createError({ statusCode: 404, statusMessage: 'Anime meta record not found' })

    const { data, error } = await client
        .from('anime_meta')
        .update(stripSelfRelated(convertBody(body, fieldTypes), sourceId))
        .eq('source_id', sourceId)
        .select('*')
        .maybeSingle()

    if (error) {
        throw createLoggedError(event, {
            statusCode: 500,
            statusMessage: 'Failed to update anime meta record',
            err: error,
            context: { module: 'admin-anime-meta', sourceId },
        })
    }
    if (!data) throw createError({ statusCode: 404, statusMessage: 'Anime meta record not found' })

    try {
        await syncRelatedLinks(client, data.source_id, data.related_anime_source_ids, existing.related_anime_source_ids)
    } catch (err) {
        throw createLoggedError(event, {
            statusCode: 500,
            statusMessage: 'Updated anime meta, but failed to sync related links',
            err,
            context: { module: 'admin-anime-meta', sourceId: data.source_id },
        })
    }

    return data
}

export async function deleteAnimeMeta(event, sourceId) {
    const client = await serverSupabaseClient(event)

    const { data: existing, error: existingError } = await client
        .from('anime_meta')
        .select('source_id, related_anime_source_ids')
        .eq('source_id', sourceId)
        .maybeSingle()

    if (existingError) {
        throw createLoggedError(event, {
            statusCode: 500,
            statusMessage: 'Failed to load anime meta record',
            err: existingError,
            context: { module: 'admin-anime-meta', sourceId },
        })
    }
    if (!existing) throw createError({ statusCode: 404, statusMessage: 'Anime meta record not found' })

    try {
        await syncRelatedLinks(client, existing.source_id, [], existing.related_anime_source_ids)
    } catch (err) {
        throw createLoggedError(event, {
            statusCode: 500,
            statusMessage: 'Failed to sync related links before delete',
            err,
            context: { module: 'admin-anime-meta', sourceId },
        })
    }

    const { error } = await client.from('anime_meta').delete().eq('source_id', sourceId)
    if (error) {
        throw createLoggedError(event, {
            statusCode: 500,
            statusMessage: 'Failed to delete anime meta record',
            err: error,
            context: { module: 'admin-anime-meta', sourceId },
        })
    }

    return { success: true }
}

export async function autofillAnimeMeta(event, detailId) {
    // Skip wiki sanitize — largest CPU cost when scraping.
    const scraped = await scrapeAcgDetail(detailId, { includeWiki: false })
    if (!scraped?.title) {
        throw createError({ statusCode: 404, statusMessage: 'Anime details not found' })
    }

    const { wikiContentHtml: _wiki, ...data } = scraped

    const client = await serverSupabaseClient(event)
    const [sourceId, matched] = await Promise.all([
        nextSourceId(client),
        matchAnime([{
            refId: detailId,
            title: data.title,
            year: data.premiere_date?.slice(0, 4) || data.premiere_date,
        }]).then((rows) => rows[0] ?? null),
    ])

    if (sourceId) data.source_id = sourceId
    data.video_id = matched?.matchedVideo?.id ?? null
    data.video_source = data.video_id ? DEFAULT_VIDEO_SOURCE : null
    data.season = matched?.matchedVideo?.season ?? null

    return data
}
