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
        /** Cue looks translated when it contains this script. */
        okScript: /[\u4e00-\u9fff\u3400-\u4dbf]/,
        /** Leftover scripts / tokens → re-translate. */
        badScripts: Object.freeze([
            /[\u3040-\u309f\u30a0-\u30ff]/, // JP kana
            /[\uac00-\ud7af\u1100-\u11ff]/, // KR hangul
            /\b(?:I'm|I've|I'll|I'd|I)\b/, // EN "I" left in Chinese
        ]),
        promptHint: 'Always translate pronouns (I/I\'m → 我, you → 你, we → 我們). Never leave English "I".',
        /** Applied after the model reply (order matters: I'm before I). */
        postReplace: Object.freeze([
            [/\bI'm\b/g, '我'],
            [/\bI've\b/g, '我已經'],
            [/\bI'll\b/g, '我會'],
            [/\bI'd\b/g, '我'],
            [/\bI\b/g, '我'],
        ]),
        /** Google Translate `tl` when using engine=google. */
        googleTl: 'zh-TW',
    }),
})

export const CAPTION_EN = Object.freeze({
    srclang: 'en',
    label: '英文',
    aliases: Object.freeze(['en', 'eng', 'english']),
    labelHint: /english|\beng\b/i,
})

const TW = AI_CAPTION_LANGS.TW
const codesOf = (def) => new Set([normCaptionCode(def.srclang), ...(def.aliases || []).map(normCaptionCode)])
const labelMap = (def) => Object.fromEntries([...codesOf(def)].map((c) => [c, def.label]))
const canonMap = (def) => Object.fromEntries([...codesOf(def)].map((c) => [c, def.srclang]))

const TW_CODES = codesOf(TW)
const EN_CODES = codesOf(CAPTION_EN)
/** Upstream 简体 only — never preferred (site is 繁中). */
const CN_HINT = /simplified|zh-hans|zh-cn|简体|簡體/i
const CN_CODES = new Set(['cn', 'zh-cn', 'zh-hans', 'simplified'].map(normCaptionCode))

export const CAPTION_CANONICAL = Object.freeze({
    ...canonMap(TW),
    ...canonMap(CAPTION_EN),
})

const LABEL_ZH = Object.freeze({
    ...labelMap(TW),
    ...labelMap(CAPTION_EN),
    cn: '中文', 'zh-cn': '中文', 'zh-hans': '中文',
    ja: '日文', jp: '日文', jpn: '日文', japanese: '日文',
    ko: '韓文', kr: '韓文', kor: '韓文', korean: '韓文',
    zh: '中文', chinese: '中文',
    id: '印尼文', ind: '印尼文', indonesian: '印尼文',
    th: '泰文', thai: '泰文',
    vi: '越南文', vie: '越南文', vietnamese: '越南文',
    es: '西班牙文', spa: '西班牙文', spanish: '西班牙文',
    fr: '法文', fre: '法文', fra: '法文', french: '法文',
    de: '德文', ger: '德文', deu: '德文', german: '德文',
    pt: '葡萄牙文', por: '葡萄牙文', portuguese: '葡萄牙文',
    ru: '俄文', rus: '俄文', russian: '俄文',
    ar: '阿拉伯文', ara: '阿拉伯文', arabic: '阿拉伯文',
    hi: '印地文', hin: '印地文', hindi: '印地文',
    it: '義大利文', ita: '義大利文', italian: '義大利文',
    pl: '波蘭文', pol: '波蘭文', polish: '波蘭文',
    tr: '土耳其文', tur: '土耳其文', turkish: '土耳其文',
    nl: '荷蘭文', dut: '荷蘭文', dutch: '荷蘭文',
    sv: '瑞典文', swe: '瑞典文', swedish: '瑞典文',
    ms: '馬來文', may: '馬來文', malay: '馬來文',
    fil: '菲律賓文', tl: '菲律賓文', filipino: '菲律賓文',
})

const LABEL_NAME_HINTS = Object.freeze([
    [TW.labelHint, TW.label],
    [CAPTION_EN.labelHint, CAPTION_EN.label],
    [CN_HINT, LABEL_ZH.zh],
    [/japanese|\bja\b|\bjpn\b/i, LABEL_ZH.ja],
    [/korean|\bko\b|\bkor\b/i, LABEL_ZH.ko],
    [/portuguese|portugu/i, LABEL_ZH.pt],
    [/spanish|espa[nñ]ol/i, LABEL_ZH.es],
    [/french|fran[cç]ais/i, LABEL_ZH.fr],
    [/german|deutsch/i, LABEL_ZH.de],
    [/italian|italiano/i, LABEL_ZH.it],
    [/russian|russk/i, LABEL_ZH.ru],
    [/polish|polski/i, LABEL_ZH.pl],
    [/arabic|عربي/i, LABEL_ZH.ar],
    [/indonesian|bahasa/i, LABEL_ZH.id],
    [/thai/i, LABEL_ZH.th],
    [/vietnamese/i, LABEL_ZH.vi],
    [/turkish/i, LABEL_ZH.tr],
    [/dutch|nederlands/i, LABEL_ZH.nl],
    [/swedish/i, LABEL_ZH.sv],
    [/malay/i, LABEL_ZH.ms],
    [/filipino|tagalog/i, LABEL_ZH.fil],
    [/\bchinese\b|中文/i, LABEL_ZH.zh],
])

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

/** Sort key: 繁中 → en → other. */
export function captionMenuRank(track) {
    if (isTwCaptionTrack(track)) return 0
    if (isEnCaptionTrack(track)) return 1
    return 2
}

/** Bare "Chinese" / 中文 → TW. Simplified tagged CN (never preferred). */
export function resolveCaptionSrclang(label, map = CAPTION_CANONICAL) {
    const l = String(label || '')
    if (TW.labelHint.test(l)) return TW.srclang
    if (CN_HINT.test(l)) return 'CN'
    if (/\bchinese\b|中文/i.test(l)) return TW.srclang
    const key = normCaptionCode(l.split(/[\s(/_-]+/).filter(Boolean)[0] || '')
    if (CN_CODES.has(key)) return 'CN'
    return map[key] || map[normCaptionCode(l)] || key || CAPTION_EN.srclang
}

/** Default pick: 繁中 → en → first. */
export function pickPreferredCaptionLang(tracks) {
    if (!tracks?.length) return null
    return tracks.find(isTwCaptionTrack)?.srclang
        || tracks.find(isEnCaptionTrack)?.srclang
        || tracks[0].srclang
}

function labelFromHint(text) {
    const l = String(text || '')
    for (const [re, name] of LABEL_NAME_HINTS) {
        if (re.test(l)) return name
    }
    return ''
}

/** Prefer Chinese names in the player caption menu. */
export function captionDisplayLabel(srclang, label) {
    const raw = String(label || '').trim()
    if (raw && /^[\u4e00-\u9fff（）()]+$/.test(raw)) return raw

    const code = normCaptionCode(srclang)
    return LABEL_ZH[code]
        || LABEL_ZH[code.split('-')[0]]
        || labelFromHint(raw)
        || raw
        || String(srclang || '')
}
