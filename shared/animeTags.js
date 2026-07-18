/** Shared anime filter tags (exclude「全部」). Used by show-all-anime + admin autofill. */
export const ANIME_TAGS = [
    '動作',
    '冒險',
    '奇幻',
    '異世界',
    '魔法',
    '超能力',
    '科幻',
    '機甲',
    '校園',
    '喜劇',
    '戀愛',
    '青春',
    '勵志',
    '溫馨',
    '悠閒',
    '料理',
    '親情',
    '感人',
    '運動',
    '競技',
    '偶像',
    '音樂',
    '職場',
    '推理',
    '懸疑',
    '時間穿越',
    '歷史',
    '戰爭',
    '血腥暴力',
    '靈異神怪',
    '黑暗',
    '特攝',
    'BL',
    'GL',
]

/** Match known tags inside a compound label, e.g. 奇幻冒險 → [奇幻, 冒險] */
export function matchAnimeTags(raw) {
    const text = String(raw || '').trim()
    if (!text) return []

    const known = [...ANIME_TAGS].sort((a, b) => b.length - a.length)
    const matched = []
    let remaining = text

    for (const tag of known) {
        if (remaining.includes(tag)) {
            matched.push(tag)
            remaining = remaining.split(tag).join('')
        }
    }

    return matched
}
