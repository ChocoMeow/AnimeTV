/**
 * Shared caption language defs (AI allowlist + player preference / labels).
 * Extend AI targets in AI_CAPTION_LANGS — server + client share this map.
 */

export const normCaptionCode = (s) => String(s || '').trim().replace(/_/g, '-').toLowerCase()

export const AI_CAPTION_LANGS = Object.freeze({
    TW: Object.freeze({
        srclang: 'TW',
        label: '繁體中文',
        promptName: 'Traditional Chinese (繁體中文)',
        aliases: Object.freeze(['tw', 'zh-hant', 'zh-tw', 'zh-hk']),
        labelHint: /traditional|zh-hant|zh-tw|zh-hk|繁體|繁体/i,
    }),
})

/** Default after 繁中. */
export const CAPTION_EN = Object.freeze({
    srclang: 'en',
    label: '英文',
    aliases: Object.freeze(['en', 'eng', 'english']),
    labelHint: /english|\beng\b/i,
})

/** Labels / upstream normalize only — never preferred over 繁中 or en. */
export const CAPTION_CN = Object.freeze({
    srclang: 'CN',
    label: '簡體中文',
    aliases: Object.freeze(['cn', 'zh-cn', 'zh-hans', 'simplified']),
    labelHint: /simplified|zh-hans|zh-cn|简体|簡體/i,
})

const codesOf = (def) => new Set([normCaptionCode(def.srclang), ...(def.aliases || []).map(normCaptionCode)])

const TW = AI_CAPTION_LANGS.TW
const TW_CODES = codesOf(TW)
const EN_CODES = codesOf(CAPTION_EN)
const CN_CODES = codesOf(CAPTION_CN)

function canonicalEntries(def) {
    return [...codesOf(def)].map((c) => [c, def.srclang])
}

/** alias → canonical srclang (TW / CN / en). Providers may spread into a wider map. */
export const CAPTION_CANONICAL = Object.freeze(Object.fromEntries([
    ...canonicalEntries(TW),
    ...canonicalEntries(CAPTION_CN),
    ...canonicalEntries(CAPTION_EN),
]))

/** Menu labels: codes + common upstream aliases. */
const LABEL_ZH = Object.freeze({
    ...Object.fromEntries([...TW_CODES].map((c) => [c, TW.label])),
    ...Object.fromEntries([...CN_CODES].map((c) => [c, CAPTION_CN.label])),
    ...Object.fromEntries([...EN_CODES].map((c) => [c, CAPTION_EN.label])),
    ja: '日文', jp: '日文', jpn: '日文', japanese: '日文',
    ko: '韓文', kr: '韓文', kor: '韓文', korean: '韓文',
    zh: '中文', chinese: '中文',
    id: '印尼文', ind: '印尼文',
    th: '泰文', vi: '越南文', es: '西班牙文', fr: '法文',
    de: '德文', pt: '葡萄牙文', ru: '俄文', ar: '阿拉伯文', hi: '印地文',
})

const matchesCode = (code, set) => set.has(normCaptionCode(code))
const matchesTrack = (track, set, hint) =>
    matchesCode(track?.srclang, set) || hint.test(String(track?.label || ''))

export function aiCaptionLang(code) {
    return AI_CAPTION_LANGS[String(code || '').trim()] || null
}

export function trackMatchesAiLang(track, langDef) {
    return Boolean(langDef && matchesCode(track?.srclang, codesOf(langDef)))
}

export const isTwCaptionTrack = (t) => matchesTrack(t, TW_CODES, TW.labelHint)
export const isEnCaptionTrack = (t) => matchesTrack(t, EN_CODES, CAPTION_EN.labelHint)
export const isEnCaptionCode = (code) => matchesCode(code, EN_CODES)

/**
 * Resolve upstream track label → srclang.
 * Bare "Chinese" / 中文 → TW. Pass a wider `map` for provider-specific langs.
 */
export function resolveCaptionSrclang(label, map = CAPTION_CANONICAL) {
    const l = String(label || '')
    if (TW.labelHint.test(l)) return TW.srclang
    if (CAPTION_CN.labelHint.test(l)) return CAPTION_CN.srclang
    if (/\bchinese\b|中文/i.test(l)) return TW.srclang
    const key = normCaptionCode(l.split(/[\s(/_-]+/).filter(Boolean)[0] || '')
    return map[key] || map[normCaptionCode(l)] || key || CAPTION_EN.srclang
}

/** Default pick: 繁中 → en → first. */
export function pickPreferredCaptionLang(tracks) {
    if (!tracks?.length) return null
    return tracks.find(isTwCaptionTrack)?.srclang
        || tracks.find(isEnCaptionTrack)?.srclang
        || tracks[0].srclang
}

/** Prefer Chinese names in the player caption menu. */
export function captionDisplayLabel(srclang, label) {
    const raw = String(label || '').trim()
    if (/[\u4e00-\u9fff]/.test(raw)) return raw

    const code = normCaptionCode(srclang)
    const byCode = LABEL_ZH[code] || LABEL_ZH[code.split('-')[0]]
    if (byCode) return byCode

    const l = raw.toLowerCase()
    if (TW.labelHint.test(l)) return TW.label
    if (CAPTION_CN.labelHint.test(l)) return CAPTION_CN.label
    if (CAPTION_EN.labelHint.test(l)) return CAPTION_EN.label
    if (/japanese/.test(l)) return LABEL_ZH.ja
    if (/korean/.test(l)) return LABEL_ZH.ko
    if (/chinese/.test(l)) return LABEL_ZH.zh
    return raw || String(srclang || '')
}
