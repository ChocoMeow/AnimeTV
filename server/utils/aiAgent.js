import { serverSupabaseClient } from '#supabase/server'

export const AI_CHAT_LIMITS = {
    maxMessageChars: 3000,
    maxHistoryMessages: 20,
    maxChatChars: 24000,
    maxRawChars: 80000,
}

const META_FIELDS = 'source_id, title, thumbnail, premiere_date, views, score, tags, production_company, description'
const PAGE_MAP = {
    home: { path: '/', label: '首頁' },
    history: { path: '/history', label: '觀看紀錄' },
    favorites: { path: '/favorites', label: '我的收藏' },
    profile: { path: '/profile', label: '個人資料' },
    settings: { path: '/settings', label: '帳號設定' },
    search: { path: '/show-all-anime', label: '全部作品' },
}

const SAFE_ANIME_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/
const INJECTION_PATTERNS = [
    /ignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|rules?)/i,
    /disregard\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?|rules?)/i,
    /forget\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?|rules?)/i,
    /you\s+are\s+now\s+(dan|jailbreak|unrestricted|developer\s+mode)/i,
    /\b(system\s*prompt|developer\s*mode|jailbreak)\b/i,
    /override\s+(the\s+)?(system|safety|security)\s+(prompt|rules?|instructions?)/i,
    /act\s+as\s+(if\s+you\s+have\s+)?no\s+(restrictions?|limits?|rules?)/i,
    /reveal\s+(your\s+)?(system\s+prompt|hidden\s+instructions?|tools?\s+schema)/i,
    /忽略(所有|先前|上面|之前)?(的)?(指令|提示|規則|系統提示)/,
    /不要遵守(系統|先前|任何)?(指令|規則|限制)/,
    /繞過(安全|限制|規則|審核)/,
    /顯示(你的)?(系統提示|隱藏指令|工具清單)/,
    /你現在是(沒有限制|越獄|DAN)/i,
]

const parseJson = (value, fallback = {}) => {
    try {
        return value ? JSON.parse(value) : fallback
    } catch {
        return fallback
    }
}
const text = (v) => (typeof v === 'string' ? v.trim() : '')
const bool = (v) => (v === true || v === false ? v : null)
const clamp = (n, min, max, fallback) => Math.min(Math.max(Number(n) || fallback, min), max)
const safeAnimeId = (v) => {
    const id = typeof v === 'number' && Number.isFinite(v) ? String(Math.trunc(v)) : text(String(v ?? ''))
    return SAFE_ANIME_ID.test(id) ? id : ''
}
const scrubText = (v, max = 3000) =>
    text(v)
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
        .slice(0, max)

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

export function sanitizeSettingsUpdates(args = {}) {
    const updates = {}
    const watch = bool(args.watch_history_enabled)
    const search = bool(args.search_history_enabled)
    if (watch !== null) updates.watch_history_enabled = watch
    if (search !== null) updates.search_history_enabled = search
    return updates
}

export function createAiErrorId() {
    return `AI-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`.toUpperCase()
}

export function logAiError(error, context = {}) {
    const errorId = createAiErrorId()
    const detail = {
        errorId,
        ...context,
        message: error?.message || String(error),
        statusCode: error?.statusCode || error?.status,
        data: error?.data,
        stack: error?.stack,
    }
    console.error(`[AI ${errorId}]`, detail)
    return {
        errorId,
        message: `助手目前無法使用，請稍後再試。（錯誤代碼：${errorId}）`,
    }
}

export function measureChatChars(messages = []) {
    return (Array.isArray(messages) ? messages : []).reduce((sum, m) => sum + String(m?.content || '').length, 0)
}

export function isChatOverLimit(messages = [], limit = AI_CHAT_LIMITS.maxChatChars) {
    return measureChatChars(messages) > limit
}

export function looksLikePromptInjection(content = '') {
    const value = scrubText(content, 4000)
    if (!value) return false
    return INJECTION_PATTERNS.some((re) => re.test(value))
}

export function sanitizeToolResult(result) {
    try {
        const raw = JSON.stringify(result ?? {})
        if (raw.length <= 4000) return result ?? {}
        return { truncated: true, preview: raw.slice(0, 3500) }
    } catch {
        return { error: '工具結果無法序列化。' }
    }
}

export function toAnimeCards(items = []) {
    const seen = new Set()
    const cards = []
    for (const item of items) {
        const id = String(item?.anime_ref_id || item?.source_id || item?.id || '').trim()
        const title = item?.anime_title || item?.title || ''
        if (!id || !title || seen.has(id)) continue
        seen.add(id)
        const subtitle =
            item.episodes ||
            (item.episode_number != null ? `第 ${item.episode_number} 集` : '') ||
            (item.premiere_date ? String(item.premiere_date).slice(0, 7) : '') ||
            (item.progress_percentage != null ? `進度 ${Math.round(item.progress_percentage)}%` : '') ||
            (item.score != null ? `評分 ${item.score}` : '')
        cards.push({ id, title, image: item.anime_image || item.thumbnail || '', subtitle })
        if (cards.length >= 12) break
    }
    return cards
}

const AGENT_TOOLS = [
    tool('get_watch_history', '取得目前使用者的觀看紀錄（由新到舊）。', {
        limit: { type: 'number', description: '1-20，預設 10' },
    }),
    tool('get_continue_watching', '取得尚未看完、可繼續觀看的動漫清單。', {
        limit: { type: 'number', description: '1-12，預設 6' },
    }),
    tool('get_favorites', '取得目前使用者的收藏清單。'),
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
        '提出新增或移除收藏；需 UI 確認後才會套用。',
        {
            action: { type: 'string', enum: ['add', 'remove'] },
            anime_ref_id: { type: 'string' },
            title: { type: 'string' },
        },
        ['action'],
    ),
    tool(
        'search_anime',
        '依關鍵字搜尋動漫作品。',
        {
            query: { type: 'string' },
            limit: { type: 'number', description: '1-10，預設 5' },
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

export function getAgentTools() {
    return AGENT_TOOLS
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
        const { data, error } = await client
            .from('watch_history_latest_updates')
            .select('anime_ref_id, anime_title, anime_image, episode_number, progress_percentage, updated_at')
            .eq('user_id', userId)
            .order('updated_at', { ascending: false })
            .limit(clamp(args.limit, 1, 20, 10))
        if (error) throw error
        return { items: data || [] }
    },

    async get_continue_watching({ client, userId, args }) {
        const { data, error } = await client
            .from('watch_history_latest_updates')
            .select('anime_ref_id, anime_title, anime_image, episode_number, progress_percentage, updated_at')
            .eq('user_id', userId)
            .lt('progress_percentage', 90)
            .order('updated_at', { ascending: false })
            .limit(clamp(args.limit, 1, 12, 6))
        if (error) throw error
        const seen = new Set()
        return {
            items: (data || []).filter((r) => !seen.has(r.anime_ref_id) && seen.add(r.anime_ref_id)),
            links: [{ path: '/history', label: '查看全部觀看紀錄' }],
        }
    },

    async get_favorites({ client, userId }) {
        const { data, error } = await client
            .from('favorites')
            .select('anime_ref_id, anime_title, anime_image, created_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(100)
        if (error) throw error
        return { items: data || [], links: [{ path: '/favorites', label: '打開收藏頁' }] }
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
            .select('playback_time, anime_ref_id')
            .eq('user_id', userId)
            .gte('updated_at', monthStart)
        if (error) throw error

        const list = rows || []
        const seconds = list.reduce((sum, r) => sum + (r.playback_time || 0), 0)
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
        const query = scrubText(args.query, 120).replace(/[%_]/g, '')
        if (!query) return { items: [] }
        const { data, error } = await client
            .from('anime_meta')
            .select('source_id, title, thumbnail, premiere_date, views, score')
            .ilike('title', `%${query}%`)
            .not('video_id', 'is', null)
            .order('views', { ascending: false })
            .limit(clamp(args.limit, 1, 10, 5))
        if (error) throw error
        return { items: data || [] }
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
        const image = found.thumbnail || ''
        const match = { user_id: userId, anime_ref_id: animeId }

        if (favoriteAction === 'add') {
            const { error } = await client.from('favorites').upsert(
                { ...match, anime_title: title, anime_image: image },
                { onConflict: 'user_id,anime_ref_id' },
            )
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
