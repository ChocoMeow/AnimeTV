import { loadCaptionVtt } from '~~/server/utils/captionTranslate'
import { openCaptionCache } from '~~/server/utils/mediaTokens'

/** Cached AI WebVTT — sealed row id + owning user. */
export default defineEventHandler(async (event) => {
    const userId = (await authUser(event)).sub
    const { t } = getQuery(event)
    const { id } = openCaptionCache(typeof t === 'string' ? t : '', userId)
    const text = await loadCaptionVtt(event, id)
    if (!text) throw createError({ statusCode: 404, statusMessage: 'Caption not found' })
    setResponseHeader(event, 'Content-Type', 'text/vtt; charset=utf-8')
    setResponseHeader(event, 'Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800')
    setResponseHeader(event, 'CDN-Cache-Control', 'public, max-age=86400')
    return text
})
