import { moduleLogger, createErrorId } from '~~/server/utils/logger'

export const AI_CHAT_LIMITS = {
    maxMessageChars: 3000,
    maxHistoryMessages: 20,
    maxChatChars: 24000,
    maxRawChars: 80000,
}

export const CHAT_TOO_LONG_MESSAGE = '對話內容已達上限，請建立新對話後再繼續。'
export const INJECTION_REFUSAL = '我無法處理這類要求。請只詢問動漫相關問題，例如推薦、搜尋、觀看紀錄或收藏設定。'

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

export const parseJson = (value, fallback = {}) => {
    try {
        return value ? JSON.parse(value) : fallback
    } catch {
        return fallback
    }
}
export const text = (v) => (typeof v === 'string' ? v.trim() : '')
export const bool = (v) => (v === true || v === false ? v : null)
export const clamp = (n, min, max, fallback) => Math.min(Math.max(Number(n) || fallback, min), max)
export const safeAnimeId = (v) => {
    const id = typeof v === 'number' && Number.isFinite(v) ? String(Math.trunc(v)) : text(String(v ?? ''))
    return SAFE_ANIME_ID.test(id) ? id : ''
}
export const scrubText = (v, max = 3000) =>
    text(v)
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
        .slice(0, max)

export function sanitizeSettingsUpdates(args = {}) {
    const updates = {}
    const watch = bool(args.watch_history_enabled)
    const search = bool(args.search_history_enabled)
    if (watch !== null) updates.watch_history_enabled = watch
    if (search !== null) updates.search_history_enabled = search
    return updates
}

export function logAiError(error, context = {}) {
    const errorId = createErrorId()
    moduleLogger('ai').error(
        {
            errorId,
            ...context,
            err: error,
            statusCode: error?.statusCode || error?.status,
            data: error?.data,
        },
        error?.message || String(error) || 'AI error'
    )
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

/** Kept with sanitizeToolResult to avoid a safety↔tools circular import. */
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
        if (cards.length >= 50) break
    }
    return cards
}

export function sanitizeToolResult(result) {
    try {
        const value = result ?? {}
        const raw = JSON.stringify(value)
        if (raw.length <= 4000) return value

        // Prefer a compact, UI-friendly shape over a raw preview string so cards stay usable.
        const compact = {
            ...(value.message ? { message: scrubText(value.message, 200) } : {}),
            ...(value.error ? { error: scrubText(value.error, 200) } : {}),
            ...(value.ok != null ? { ok: value.ok } : {}),
            ...(value.requires_confirmation ? { requires_confirmation: true, action_type: value.action_type, proposed: value.proposed } : {}),
            ...(Array.isArray(value.items)
                ? {
                      items: toAnimeCards(value.items).map((card) => ({
                          anime_ref_id: card.id,
                          anime_title: card.title,
                          anime_image: card.image,
                          subtitle: card.subtitle,
                      })),
                      items_total: value.items.length,
                  }
                : {}),
            ...(Array.isArray(value.links) ? { links: value.links.slice(0, 4) } : {}),
            ...(value.detail
                ? {
                      detail: {
                          id: value.detail.id,
                          title: value.detail.title,
                          tags: Array.isArray(value.detail.tags) ? value.detail.tags.slice(0, 8) : [],
                          score: value.detail.score ?? null,
                          studio: value.detail.studio || '',
                          premiere_date: value.detail.premiere_date || '',
                          description: scrubText(value.detail.description, 400),
                      },
                  }
                : {}),
            ...(Array.isArray(value.results)
                ? {
                      results: value.results.slice(0, 5).map((row) => ({
                          title: scrubText(row?.title, 120),
                          url: scrubText(row?.url, 300),
                          snippet: scrubText(row?.snippet, 220),
                      })),
                  }
                : {}),
            ...(value.settings ? { settings: value.settings } : {}),
            ...(value.month_watch_label || value.top_tags
                ? {
                      month: value.month,
                      month_watch_label: value.month_watch_label,
                      unique_anime_count: value.unique_anime_count,
                      top_tags: Array.isArray(value.top_tags) ? value.top_tags.slice(0, 5) : [],
                  }
                : {}),
            truncated: true,
        }

        const compactRaw = JSON.stringify(compact)
        if (compactRaw.length <= 4000) return compact
        return { truncated: true, preview: compactRaw.slice(0, 3500) }
    } catch {
        return { error: '工具結果無法序列化。' }
    }
}

/** Strip model-invented markup so replies stay plain text for the chat UI. */
export function sanitizeAssistantText(content = '') {
    return scrubText(
        String(content || '')
            .replace(/```[\s\S]*?```/g, '')
            .replace(/<\/?[a-zA-Z][^>]*>/g, '')
            .replace(/&nbsp;/gi, ' ')
            .replace(/&amp;/gi, '&')
            .replace(/&lt;/gi, '<')
            .replace(/&gt;/gi, '>')
            .replace(/&quot;/gi, '"')
            .replace(/&#39;/g, "'")
            .replace(/[ \t]+\n/g, '\n')
            .replace(/\n{3,}/g, '\n\n'),
        AI_CHAT_LIMITS.maxMessageChars,
    )
}
