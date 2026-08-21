import { VIDEO_SOURCE } from '~~/shared/videoSources'

const ANIME1_HOST = 'anime1.me'
const ANIME1_SITE = `https://${ANIME1_HOST}`

const TWXGCT_HOST = 'twxgct.com'
const TWXGCT_SITE = `https://www.${TWXGCT_HOST}`
const TWXGCT_CDN = 'https://xgct-video.bzcdn.net'

/** Per-provider URLs / hosts — edit endpoints here only. */
export const ANIME1 = Object.freeze({
    id: VIDEO_SOURCE.ANIME1,
    baseUrl: `${ANIME1_SITE}/`,
    apiUrl: `https://v.${ANIME1_HOST}/api`,
    catalogUrl: `https://${ANIME1_HOST}/animelist.json`,
    referer: `${ANIME1_SITE}/`,
    defaultTserver: 'pt',
    hostMatchers: Object.freeze([ANIME1_HOST]),
    thumbBase: (tserver, vid) => `https://${tserver || 'pt'}.${ANIME1_HOST}/${vid}`,
})

export const TWXGCT = Object.freeze({
    id: VIDEO_SOURCE.TWXGCT,
    baseUrl: TWXGCT_SITE,
    cdnBase: TWXGCT_CDN,
    referer: `${TWXGCT_SITE}/`,
    hostMatchers: Object.freeze(['bzcdn.net', 'xgcartoon', TWXGCT_HOST]),
    detailUrl: (id) => `${TWXGCT_SITE}/detail/${encodeURIComponent(id)}`,
    pframeApiUrl: (chapterId) =>
        `${TWXGCT_SITE}/user/amp/content_pframe_url?chapter_id=${encodeURIComponent(chapterId)}&level=middle&expires=3600`,
    playlistUrl: (guid) => `${TWXGCT_CDN}/${guid}/playlist.m3u8`,
    videoInfoUrl: (guid) => `${TWXGCT_CDN}/${guid}/video_info.json`,
    captionUrl: (guid, srclang) => `${TWXGCT_CDN}/${guid}/captions/${encodeURIComponent(srclang)}.vtt`,
    seekThumbUrl: (guid, i) => `${TWXGCT_CDN}/${guid}/seek/_${i}.jpg`,
    seekGrid: Object.freeze({ cols: 6, rows: 6 }),
    seekSheetSize: Object.freeze({ width: 1800, height: 1008 }),
})
