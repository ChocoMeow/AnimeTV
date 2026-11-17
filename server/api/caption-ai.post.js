import { CAPTION_EN } from '#shared/utils/aiCaptions'
import { getRequestLogger, logError } from '~~/server/utils/logger'
import { generateAiCaption } from '~~/server/utils/captionTranslate'
import { openOwnedEpisodeToken } from '~~/server/utils/mediaTokens'

const str = (v) => (typeof v === 'string' ? v.trim() : '')

/** Body `{ token, lang, sourceSrc, sourceLang?, engine? }` → ready | pending (+ optional partial caption). */
export default defineEventHandler(async (event) => {
    const userId = (await authUser(event)).sub
    const log = getRequestLogger(event)
    const body = await readBody(event).catch(() => ({}))
    const token = str(body?.token)
    const lang = str(body?.lang)
    const sourceSrc = str(body?.sourceSrc)
    const sourceLang = str(body?.sourceLang) || CAPTION_EN.srclang
    const engine = str(body?.engine).toLowerCase() === 'google' ? 'google' : 'ai'
    const aiEnabled = Boolean(useRuntimeConfig().public.aiEnabled)

    if (!token) throw createError({ statusCode: 400, statusMessage: 'Missing episode token', message: '缺少集數憑證。' })
    if (!lang) throw createError({ statusCode: 400, statusMessage: 'Missing lang', message: '請指定字幕語言。' })
    if (!sourceSrc) throw createError({ statusCode: 400, statusMessage: 'Missing sourceSrc', message: '缺少原始字幕。' })
    if (engine === 'ai' && !aiEnabled) {
        throw createError({ statusCode: 403, statusMessage: 'AI captions disabled', message: 'AI 字幕未啟用。' })
    }

    try {
        const sealed = openOwnedEpisodeToken(token, userId)
        const result = await generateAiCaption(event, {
            source: sealed.source,
            sourceId: sealed.sourceId,
            episode: sealed.episode,
            sourceSrc,
            sourceLang,
            userId,
            targetLang: lang,
            engine,
        })
        if (result.caption) log.info({ source: sealed.source, episode: sealed.episode, lang, engine }, 'caption ready')
        return result
    } catch (err) {
        // 502/503 from the model / Google are expected user-facing failures — don't treat as unhandled.
        if ((Number(err?.statusCode) || 500) === 500) logError(event, err, { module: 'caption-ai', userId, lang, engine })
        if (err?.statusCode) throw err
        throw createError({
            statusCode: 500,
            statusMessage: 'Caption translate failed',
            message: engine === 'google' ? 'Google 字幕翻譯失敗。' : 'AI 字幕產生失敗。',
        })
    }
})
