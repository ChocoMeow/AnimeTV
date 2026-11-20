import { parseCaptionTranslateBody } from '#shared/contracts/captions'
import { getRequestLogger, logError } from '~~/server/utils/logger'
import { generateAiCaption } from '~~/server/services/captions.service.js'
import { openOwnedEpisodeToken } from '~~/server/utils/mediaTokens'

/** POST /api/captions — body via shared contract → ready | pending (+ optional partial caption). */
export default defineEventHandler(async (event) => {
    const userId = (await authUser(event)).sub
    const log = getRequestLogger(event)
    const body = await readBody(event).catch(() => ({}))
    const { token, lang, sourceSrc, sourceLang, engine } = parseCaptionTranslateBody(body)
    const aiEnabled = Boolean(useRuntimeConfig().public.aiEnabled)

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
        if ((Number(err?.statusCode) || 500) === 500) logError(event, err, { module: 'captions', userId, lang, engine })
        if (err?.statusCode) throw err
        throw createError({
            statusCode: 500,
            statusMessage: 'Caption translate failed',
            message: engine === 'google' ? 'Google 字幕翻譯失敗。' : 'AI 字幕產生失敗。',
        })
    }
})
