export const GAMER_BASE_URL = "https://ani.gamer.com.tw/";
export const ACG_GAMER_BASE_URL = "https://acg.gamer.com.tw/"
export const ANIME1_BASE_URL = "https://anime1.me/";

export const ANIME1_LIST_CACHE = {
    fetchPromise: null,
    timestamp: 0,
    data: null
}

export const CACHE_LIFETIME = 1000 * 60 * 12 // 12 hours
export const RESPONSE_CACHE = new Map()

export const CHINESE_WEEKDAY_MAP = {
    "一": "1",
    "二": "2",
    "三": "3",
    "四": "4",
    "五": "5",
    "六": "6",
    "日": "7"
}

export const ROMAN_CHARACTERS = {
    "Ⅰ": "I",
    "Ⅱ": "II",
    "Ⅲ": "III",
    "Ⅳ": "IV",
    "Ⅴ": "V",
    "Ⅵ": "VI",
    "Ⅶ": "VII",
    "Ⅷ": "VIII",
    "Ⅸ": "IX",
    "Ⅹ": "X"
}

export let ANIME_CACHE = {
    timestamp: 0,
    data: null
}