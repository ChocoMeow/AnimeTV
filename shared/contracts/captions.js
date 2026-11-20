/**
 * POST /api/captions body contract.
 * `{ token, lang, sourceSrc, sourceLang?, engine? }` → ready | pending (+ optional caption).
 */

import { createError } from 'h3'
import { CAPTION_EN } from '#shared/utils/captions'

const str = (v) => (typeof v === 'string' ? v.trim() : '')

/**
 * @param {unknown} body
 * @returns {{ token: string, lang: string, sourceSrc: string, sourceLang: string, engine: 'ai' | 'google' }}
 */
export function parseCaptionTranslateBody(body) {
    const token = str(body?.token)
    const lang = str(body?.lang)
    const sourceSrc = str(body?.sourceSrc)
    const sourceLang = str(body?.sourceLang) || CAPTION_EN.srclang
    const rawEngine = str(body?.engine).toLowerCase()
    const engine = rawEngine === 'google' ? 'google' : 'ai'

    if (!token) {
        throw createError({ statusCode: 400, statusMessage: 'Missing episode token', message: '缺少集數憑證。' })
    }
    if (!lang) {
        throw createError({ statusCode: 400, statusMessage: 'Missing lang', message: '請指定字幕語言。' })
    }
    if (!sourceSrc) {
        throw createError({ statusCode: 400, statusMessage: 'Missing sourceSrc', message: '缺少原始字幕。' })
    }
    if (rawEngine && rawEngine !== 'ai' && rawEngine !== 'google') {
        throw createError({ statusCode: 400, statusMessage: 'Invalid engine', message: '字幕引擎無效。' })
    }

    return { token, lang, sourceSrc, sourceLang, engine }
}
