import * as cheerio from 'cheerio'
import { serverSupabaseClient } from '#supabase/server'
import { WATCH_ANIME_META, WATCH_ANIME_META_INNER, withAnimeCovers } from '#shared/utils/anime'
import { searchAnimeMeta } from '~~/server/lib/anime/pgroongaSearch'
import {
    clamp,
    parseJson,
    safeAnimeId,
    sanitizeSettingsUpdates,
    scrubText,
    text,
} from '~~/server/services/ai/safety.js'

const META_FIELDS = 'source_id, title, thumbnail, premiere_date, views, score, tags, production_company, description'
const PAGE_MAP = {
    home: { path: '/', label: '首頁' },
    history: { path: '/history', label: '觀看紀錄' },
    favorites: { path: '/favorites', label: '我的收藏' },
    profile: { path: '/profile', label: '個人資料' },
    settings: { path: '/settings', label: '帳號設定' },
    search: { path: '/show-all-anime', label: '全部作品' },
}

const WEB_SEARCH_TIMEOUT_MS = 30_000
let cachedProxy = null

function tool(name, description, properties = {}, required) {
    return {
        type: 'function',
        function: {
            name,
            description,
            parameters: {
                type: 'object',
                properties,
                ...(required ? { required } : {}),
            },
        },
    }
}

function formatDuration(seconds) {
    const s = Math.max(0, Math.floor(Number(seconds) || 0))
    if (s < 60) return `${s} 秒`
    const m = Math.floor(s / 60)
    const h = Math.floor(m / 60)
    return h > 0 ? `${h} 小時 ${m % 60} 分鐘` : `${m} 分鐘`
}

function topTagsFrom(rows, limit = 5) {
    const counts = new Map()
    for (const row of rows || []) {
        for (const tag of Array.isArray(row?.tags) ? row.tags : Array.isArray(row?.anime_meta?.tags) ? row.anime_meta.tags : []) {
            const t = String(tag).trim()
            if (t) counts.set(t, (counts.get(t) || 0) + 1)
        }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit)
}

function escapeIlike(value) {
    return scrubText(value, 120).replace(/[%_\\]/g, '')
}

function normalizePremiereBound(value, end = false) {
    const raw = scrubText(String(value ?? ''), 20)
    if (!raw) return ''
    if (/^\d{4}$/.test(raw)) return end ? `${raw}-12-31` : `${raw}-01-01`
    if (/^\d{4}-\d{2}$/.test(raw)) {
        const [y, m] = raw.split('-').map(Number)
        if (end) {
            const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
            return `${raw}-${String(lastDay).padStart(2, '0')}`
        }
        return `${raw}-01`
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
    return ''
}

function normalizeSearchTags(args = {}) {
    const tags = [...(Array.isArray(args.tags) ? args.tags : []), args.tag]
        .map((t) => scrubText(t, 40))
        .filter(Boolean)
    return [...new Set(tags)].slice(0, 8)
}

function premiereRange(args) {
    const year = Number(args.premiere_year)
    if (Number.isFinite(year) && year >= 1900 && year <= 2100) {
        const y = Math.trunc(year)
        return { from: `${y}-01-01`, to: `${y}-12-31` }
    }
    return {
        from: normalizePremiereBound(args.premiere_from, false),
        to: normalizePremiereBound(args.premiere_to, true),
    }
}

export const AGENT_TOOLS = [
    tool('get_watch_history', '取得目前使用者的觀看紀錄（由新到舊）。依使用者問題自行決定要不要依標題篩選、要取幾筆。', {
        title: { type: 'string', description: '標題關鍵字，模糊比對（例如只查某部作品）' },
        limit: { type: 'number', description: '回傳筆數，依需求決定，最多 100，預設 20' },
        unfinished_only: { type: 'boolean', description: 'true 時只回傳尚未看完（進度 < 90%）的項目' },
    }),
    tool('get_continue_watching', '取得尚未看完、可繼續觀看的動漫清單。', {
        limit: { type: 'number', description: '1-12，預設 6' },
    }),
    tool('get_favorites', '取得目前使用者的收藏清單。依使用者問題自行決定標題篩選與筆數；清單會以卡片顯示。', {
        title: { type: 'string', description: '標題關鍵字，模糊比對' },
        limit: { type: 'number', description: '回傳筆數，依需求決定，最多 100，預設 30' },
    }),
    tool('get_recommendations', '依照使用者觀看紀錄與標籤偏好推薦動漫。', {
        limit: { type: 'number', description: '1-12，預設 8' },
    }),
    tool('get_anime_details', '取得單一動漫詳情（劇情、標籤、製作公司、評分等）。', {
        anime_ref_id: { type: 'string' },
        title: { type: 'string' },
    }),
    tool('get_profile_stats', '取得使用者觀看統計摘要（本月時數、最愛類型等）。'),
    tool('get_user_settings', '取得目前使用者設定與隱私開關。'),
    tool('update_user_settings', '提出使用者設定變更；需 UI 確認後才會套用。', {
        watch_history_enabled: { type: 'boolean' },
        search_history_enabled: { type: 'boolean' },
    }),
    tool(
        'manage_favorite',
        '提出新增或移除收藏；系統 UI 會顯示確認卡片，你只需用純文字告知使用者點下方確認，不要輸出 HTML。',
        {
            action: { type: 'string', enum: ['add', 'remove'] },
            anime_ref_id: { type: 'string' },
            title: { type: 'string' },
        },
        ['action'],
    ),
    tool(
        'search_anime',
        '搜尋站內動漫。可依標題、標籤、首播日期、製作公司、評分篩選；至少提供一個條件。',
        {
            query: { type: 'string', description: '標題關鍵字（與 title 相同，擇一即可）' },
            title: { type: 'string', description: '標題關鍵字，模糊比對' },
            tags: {
                type: 'array',
                items: { type: 'string' },
                description: '標籤列表，作品需包含其中任一標籤（例如：戀愛、奇幻、戰鬥）',
            },
            tag: { type: 'string', description: '單一標籤（等同 tags 只傳一個）' },
            premiere_year: { type: 'number', description: '首播年份，例如 2024' },
            premiere_from: { type: 'string', description: '首播日期起（含），格式 YYYY 或 YYYY-MM 或 YYYY-MM-DD' },
            premiere_to: { type: 'string', description: '首播日期迄（含），格式 YYYY 或 YYYY-MM 或 YYYY-MM-DD' },
            studio: { type: 'string', description: '製作公司關鍵字，例如 MAPPA、京都動畫' },
            min_score: { type: 'number', description: '最低評分（含）' },
            sort: {
                type: 'string',
                enum: ['views', 'premiere_date', 'score'],
                description: '排序：views（預設）| premiere_date | score',
            },
            limit: { type: 'number', description: '1-12，預設 8' },
        },
    ),
    tool(
        'web_search',
        '搜尋網路以取得最新動漫新聞、播出資訊、劇情更新、聲優動態等即時資訊。當站內資料不足或使用者詢問最新/今年/近期內容時優先使用。',
        {
            query: { type: 'string', description: '搜尋關鍵字，建議使用繁體中文或日文作品名' },
            limit: { type: 'number', description: '1-8，預設 5' },
        },
        ['query'],
    ),
    tool(
        'open_page',
        '提供站內頁面連結：home | history | favorites | profile | settings | search | anime。',
        {
            page: { type: 'string' },
            anime_ref_id: { type: 'string' },
            label: { type: 'string' },
        },
        ['page'],
    ),
]

export async function fetchWithProxy(url, init, proxyUrl) {
    if (!proxyUrl) return fetch(url, init)
    if (typeof Bun !== 'undefined') return fetch(url, { ...init, proxy: proxyUrl })
    const { ProxyAgent, fetch: undiciFetch } = await import('undici')
    if (!cachedProxy || cachedProxy.url !== proxyUrl) cachedProxy = { url: proxyUrl, agent: new ProxyAgent(proxyUrl) }
    return undiciFetch(url, { ...init, dispatcher: cachedProxy.agent })
}

async function searchWeb(query, { limit = 5, proxyUrl } = {}) {
    const q = scrubText(query, 200)
    if (!q) return { query: q, results: [], searched_at: new Date().toISOString() }

    const res = await fetchWithProxy(
        'https://html.duckduckgo.com/html/',
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                Accept: 'text/html',
            },
            body: new URLSearchParams({ q }).toString(),
            signal: AbortSignal.timeout(WEB_SEARCH_TIMEOUT_MS),
        },
        proxyUrl,
    )
    if (!res.ok) throw new Error(`Web search failed with status ${res.status}`)

    const $ = cheerio.load(await res.text())
    const results = []
    const max = clamp(limit, 1, 8, 5)

    $('.result').each((_, el) => {
        if (results.length >= max) return false
        const title = $(el).find('.result__a').text().trim()
        const snippet = $(el).find('.result__snippet').text().trim()
        let url = $(el).find('.result__a').attr('href') || ''
        const match = url.match(/uddg=([^&]+)/)
        if (match) {
            try {
                url = decodeURIComponent(match[1])
            } catch {}
        }
        if (title && url) results.push({ title, url, snippet })
    })

    return { query: q, results, searched_at: new Date().toISOString() }
}

async function findAnime(client, { id, title }) {
    const animeId = safeAnimeId(id)
    if (animeId) {
        const { data, error } = await client.from('anime_meta').select(META_FIELDS).eq('source_id', animeId).maybeSingle()
        if (error) throw error
        return data
    }
    const q = scrubText(title, 120)
    if (!q) return null
    const { data, error } = await client
        .from('anime_meta')
        .select(META_FIELDS)
        .ilike('title', `%${q.replace(/[%_]/g, '')}%`)
        .not('video_id', 'is', null)
        .order('views', { ascending: false })
        .limit(1)
        .maybeSingle()
    if (error) throw error
    return data
}

async function getRecommendations(client, userId, limit) {
    const { data: history } = await client
        .from('watch_history_latest_updates')
        .select('anime_ref_id, anime_meta!anime_ref_id(tags)')
        .eq('user_id', userId)
        .limit(200)
    if (!history?.length) return []

    const watched = new Set(history.map((r) => r.anime_ref_id))
    const tags = topTagsFrom(history, 8).map(([tag]) => tag)
    if (!tags.length) return []

    let query = client
        .from('anime_meta')
        .select('source_id, title, thumbnail, premiere_date, views, tags, score')
        .overlaps('tags', tags)
        .not('video_id', 'is', null)
        .order('views', { ascending: false })
        .order('score', { ascending: false })
        .limit(limit)
    if (watched.size) query = query.not('source_id', 'in', `(${[...watched].join(',')})`)

    const { data } = await query
    return (data || [])
        .map((row) => ({ ...row, _score: tags.filter((t) => row.tags?.map(String).includes(t)).length }))
        .sort((a, b) => b._score - a._score || (b.views || 0) - (a.views || 0))
}

const handlers = {
    async get_watch_history({ client, userId, args }) {
        const title = escapeIlike(args.title)
        const limit = clamp(args.limit, 1, 100, 20)
        let dbQuery = client
            .from('watch_history_latest_updates')
            .select(`anime_ref_id, episode_number, progress_percentage, updated_at, ${title ? WATCH_ANIME_META_INNER : WATCH_ANIME_META}`)
            .eq('user_id', userId)

        if (title) dbQuery = dbQuery.ilike('anime_meta.title', `%${title}%`)
        if (args.unfinished_only === true) dbQuery = dbQuery.lt('progress_percentage', 90)

        const { data, error } = await dbQuery.order('updated_at', { ascending: false }).limit(limit)
        if (error) throw error
        return {
            items: withAnimeCovers(data),
            ...(title ? { filtered_by_title: title } : {}),
            links: [{ path: '/history', label: '查看全部觀看紀錄' }],
        }
    },

    async get_continue_watching({ client, userId, args }) {
        const { data, error } = await client
            .from('watch_history_latest_updates')
            .select(`anime_ref_id, episode_number, progress_percentage, updated_at, ${WATCH_ANIME_META}`)
            .eq('user_id', userId)
            .lt('progress_percentage', 90)
            .order('updated_at', { ascending: false })
            .limit(clamp(args.limit, 1, 12, 6))
        if (error) throw error
        const seen = new Set()
        return {
            items: withAnimeCovers(data).filter((r) => !seen.has(r.anime_ref_id) && seen.add(r.anime_ref_id)),
            links: [{ path: '/history', label: '查看全部觀看紀錄' }],
        }
    },

    async get_favorites({ client, userId, args }) {
        const title = escapeIlike(args.title)
        const limit = clamp(args.limit, 1, 100, 30)
        let dbQuery = client
            .from('favorites')
            .select(`anime_ref_id, created_at, ${title ? WATCH_ANIME_META_INNER : WATCH_ANIME_META}`, { count: 'exact' })
            .eq('user_id', userId)
        if (title) dbQuery = dbQuery.ilike('anime_meta.title', `%${title}%`)

        const { data, count, error } = await dbQuery.order('created_at', { ascending: false }).limit(limit)
        if (error) throw error
        return {
            items: withAnimeCovers(data),
            total: count ?? (data || []).length,
            ...(title ? { filtered_by_title: title } : {}),
            links: [{ path: '/favorites', label: '打開收藏頁' }],
        }
    },

    async get_recommendations({ client, userId, args }) {
        return { items: await getRecommendations(client, userId, clamp(args.limit, 1, 12, 8)) }
    },

    async get_anime_details({ client, args }) {
        const row = await findAnime(client, { id: args.anime_ref_id, title: args.title })
        if (!row) return { error: '找不到這部動漫。' }
        return {
            detail: {
                id: row.source_id,
                title: row.title,
                image: row.thumbnail,
                description: row.description || '',
                tags: Array.isArray(row.tags) ? row.tags.slice(0, 12) : [],
                score: row.score ?? null,
                studio: row.production_company || '',
                premiere_date: row.premiere_date || '',
                views: row.views ?? null,
            },
            items: [row],
            links: [{ path: `/anime/${row.source_id}`, label: `打開「${row.title}」` }],
        }
    },

    async get_profile_stats({ client, userId }) {
        const now = new Date()
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
        const { data: rows, error } = await client
            .from('watch_history')
            .select('total_playback_time, playback_time, anime_ref_id')
            .eq('user_id', userId)
            .gte('updated_at', monthStart)
        if (error) throw error

        const list = rows || []
        const seconds = list.reduce((sum, r) => sum + (r.total_playback_time ?? r.playback_time ?? 0), 0)
        const ids = [...new Set(list.map((r) => r.anime_ref_id).filter(Boolean))]
        const { data: meta } = ids.length ? await client.from('anime_meta').select('tags').in('source_id', ids) : { data: [] }

        return {
            month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
            month_watch_seconds: seconds,
            month_watch_label: formatDuration(seconds),
            unique_anime_count: ids.length,
            episode_rows: list.length,
            top_tags: topTagsFrom(meta, 5).map(([label, count]) => ({ label, count })),
            links: [{ path: '/profile', label: '查看完整個人資料' }],
        }
    },

    async get_user_settings({ client, userId }) {
        const { data, error } = await client.from('user_settings').select('*').eq('id', userId).single()
        if (error && error.code !== 'PGRST116') throw error
        return {
            settings: data || { id: userId, watch_history_enabled: true, search_history_enabled: true, custom_shortcuts: null },
            links: [{ path: '/settings', label: '打開帳號設定' }],
        }
    },

    async update_user_settings({ args }) {
        const proposed = sanitizeSettingsUpdates(args)
        if (!Object.keys(proposed).length) return { ok: false, message: '沒有可更新的有效設定。' }
        return {
            ok: false,
            requires_confirmation: true,
            action_type: 'update_user_settings',
            proposed,
            message: '已提出設定變更，等待使用者確認。',
        }
    },

    async manage_favorite({ client, args }) {
        const action = args.action === 'add' || args.action === 'remove' ? args.action : null
        if (!action) return { ok: false, message: 'action 必須是 add 或 remove。' }

        let animeId = safeAnimeId(args.anime_ref_id)
        let title = scrubText(args.title, 120)
        let image = ''
        const found = await findAnime(client, { id: animeId, title })
        if (!found && !animeId) return { ok: false, message: '找不到要收藏的動漫。' }
        if (found) {
            animeId = String(found.source_id)
            title = found.title
            image = found.thumbnail || ''
        }
        if (!safeAnimeId(animeId)) return { ok: false, message: '請提供有效的 anime_ref_id 或 title。' }

        return {
            ok: false,
            requires_confirmation: true,
            action_type: 'update_favorite',
            proposed: { action, anime_ref_id: animeId, anime_title: title || animeId, anime_image: image },
            items: [{ anime_ref_id: animeId, anime_title: title || animeId, anime_image: image }],
            message: `已提出${action === 'add' ? '新增' : '移除'}收藏，等待使用者確認。`,
        }
    },

    async search_anime({ client, args }) {
        const rawTitle = scrubText(args.title || args.query, 200)
        const tags = normalizeSearchTags(args)
        const studio = escapeIlike(args.studio)
        const { from: premiereFrom, to: premiereTo } = premiereRange(args)
        const minScore = Number.isFinite(Number(args.min_score)) ? Number(args.min_score) : null
        const sort = ['views', 'premiere_date', 'score'].includes(args.sort) ? args.sort : 'views'
        const limit = clamp(args.limit, 1, 12, 8)

        if (!rawTitle && !tags.length && !studio && !premiereFrom && !premiereTo && minScore == null) {
            return { items: [], message: '請至少提供標題、標籤、首播日期、製作公司或評分其中一項條件。' }
        }

        if (rawTitle && !tags.length && !studio && !premiereFrom && !premiereTo && minScore == null) {
            const data = await searchAnimeMeta(client, rawTitle, { limit, requireVideo: true })
            return { items: data || [] }
        }

        let dbQuery = client
            .from('anime_meta')
            .select('source_id, title, thumbnail, premiere_date, views, score, tags, production_company')
            .not('video_id', 'is', null)

        if (rawTitle) dbQuery = dbQuery.ilike('title', `%${escapeIlike(rawTitle)}%`)
        if (tags.length) dbQuery = dbQuery.overlaps('tags', tags)
        if (studio) dbQuery = dbQuery.ilike('production_company', `%${studio}%`)
        if (premiereFrom) dbQuery = dbQuery.gte('premiere_date', premiereFrom)
        if (premiereTo) dbQuery = dbQuery.lte('premiere_date', premiereTo)
        if (minScore != null) dbQuery = dbQuery.gte('score', minScore)

        const { data, error } = await dbQuery.order(sort, { ascending: false, nullsFirst: false }).limit(limit)
        if (error) throw error
        return { items: data || [] }
    },

    async web_search({ event, args }) {
        const query = scrubText(args.query, 200)
        if (!query) return { results: [], message: '請提供搜尋關鍵字。' }
        try {
            return await searchWeb(query, {
                limit: clamp(args.limit, 1, 8, 5),
                proxyUrl: useRuntimeConfig(event).aiProxyUrl || '',
            })
        } catch (error) {
            return { query, results: [], error: '網路搜尋暫時無法使用，請稍後再試。', detail: error?.message || String(error) }
        }
    },

    async open_page({ args }) {
        const page = text(args.page).toLowerCase()
        if (page === 'anime') {
            const id = safeAnimeId(args.anime_ref_id)
            if (!id) return { ok: false, message: '打開動漫頁需要有效的 anime_ref_id。' }
            return { links: [{ path: `/anime/${id}`, label: scrubText(args.label, 40) || '打開動漫頁面' }] }
        }
        const mapped = PAGE_MAP[page]
        if (!mapped) return { ok: false, message: '不支援的頁面。' }
        return { links: [{ path: mapped.path, label: scrubText(args.label, 40) || mapped.label }] }
    },
}

export async function runAgentTool(event, userId, name, rawArgs = '{}') {
    const handler = handlers[name]
    if (!handler) return { error: `未知工具：${name}` }
    return handler({
        client: await serverSupabaseClient(event),
        userId,
        event,
        args: typeof rawArgs === 'string' ? parseJson(rawArgs) : rawArgs || {},
    })
}

export function pendingFromToolResult(result) {
    if (!result?.requires_confirmation || !result?.proposed) return null
    return result.action_type === 'update_favorite'
        ? { type: 'update_favorite', ...result.proposed }
        : { type: 'update_user_settings', updates: result.proposed }
}

export async function applyConfirmedAction(event, userId, action) {
    if (!userId || !action || typeof action !== 'object') {
        throw createError({ statusCode: 400, statusMessage: 'Bad request', message: '缺少有效的確認動作。' })
    }

    const client = await serverSupabaseClient(event)

    if (action.type === 'update_user_settings') {
        const updates = sanitizeSettingsUpdates(action.updates)
        if (!Object.keys(updates).length) {
            throw createError({ statusCode: 400, statusMessage: 'Bad request', message: '沒有可更新的有效設定。' })
        }
        const { error } = await client.from('user_settings').update(updates).eq('id', userId)
        if (error) throw error
        return {
            ok: true,
            type: 'update_user_settings',
            updates,
            message: '已依你的確認更新設定。',
        }
    }

    if (action.type === 'update_favorite') {
        const favoriteAction = action.action === 'add' || action.action === 'remove' ? action.action : null
        const animeId = safeAnimeId(action.anime_ref_id)
        if (!favoriteAction || !animeId) {
            throw createError({ statusCode: 400, statusMessage: 'Bad request', message: '收藏確認資料無效。' })
        }

        const found = await findAnime(client, { id: animeId })
        if (!found) {
            throw createError({ statusCode: 404, statusMessage: 'Not found', message: '找不到要收藏的動漫。' })
        }

        const title = found.title || animeId
        const match = { user_id: userId, anime_ref_id: animeId }

        if (favoriteAction === 'add') {
            const { error } = await client.from('favorites').upsert(match, { onConflict: 'user_id,anime_ref_id' })
            if (error) throw error
        } else {
            const { error } = await client.from('favorites').delete().match(match)
            if (error) throw error
        }

        return {
            ok: true,
            type: 'update_favorite',
            action: favoriteAction,
            anime_ref_id: animeId,
            anime_title: title,
            message: `已將「${title}」${favoriteAction === 'add' ? '加入' : '移出'}收藏。`,
        }
    }

    throw createError({ statusCode: 400, statusMessage: 'Bad request', message: '不支援的確認動作。' })
}
