import { getRequestLogger, logError } from '~~/server/utils/logger'
import { generateAiCaption } from '~~/server/utils/captionTranslate'
import { openOwnedEpisodeToken } from '~~/server/utils/mediaTokens'

/**
 * On-demand AI caption — body `{ token, lang, sourceSrc, sourceLang? }`.
 * Returns `{ status: 'ready', caption }` or `{ status: 'pending' }` (client polls).
 */
export default defineEventHandler(async (event) => {
    const userId = (await authUser(event)).sub
    const log = getRequestLogger(event)
    const body = await readBody(event).catch(() => ({}))
    const token = typeof body?.token === 'string' ? body.token.trim() : ''
    const lang = typeof body?.lang === 'string' ? body.lang.trim() : ''
    const sourceSrc = typeof body?.sourceSrc === 'string' ? body.sourceSrc.trim() : ''
    const sourceLang = typeof body?.sourceLang === 'string' ? body.sourceLang.trim() : 'en'

    if (!token) throw createError({ statusCode: 400, statusMessage: 'Missing episode token', message: '缺少集數憑證。' })
    if (!lang) throw createError({ statusCode: 400, statusMessage: 'Missing lang', message: '請指定字幕語言。' })
    if (!sourceSrc) throw createError({ statusCode: 400, statusMessage: 'Missing sourceSrc', message: '缺少原始字幕。' })

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
        })
        if (result.caption) log.info({ source: sealed.source, episode: sealed.episode, lang }, 'AI caption ready')
        return result
    } catch (err) {
        const status = Number(err?.statusCode) || 500
        if (status >= 500 && status !== 503) logError(event, err, { module: 'caption-ai', userId, lang })
        if (err?.statusCode) throw err
        throw createError({ statusCode: 500, statusMessage: 'AI caption failed', message: 'AI 字幕產生失敗。' })
    }
})
