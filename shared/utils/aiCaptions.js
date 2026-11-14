/**
 * Allowlisted AI caption targets (v1: TW only).
 * Extend here — server + client share this map; no new API shape.
 */
export const AI_CAPTION_LANGS = Object.freeze({
    TW: Object.freeze({
        srclang: 'TW',
        label: '繁體中文',
        promptName: 'Traditional Chinese (繁體中文)',
        aliases: Object.freeze(['tw', 'zh-hant', 'zh-tw', 'zh-hk']),
    }),
})

export function aiCaptionLang(code) {
    return AI_CAPTION_LANGS[String(code || '').trim()] || null
}
