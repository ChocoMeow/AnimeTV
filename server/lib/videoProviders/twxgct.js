import * as cheerio from 'cheerio'
import { cfFetch } from '~~/server/utils/anime'
import { getRequestLogger } from '~~/server/utils/logger'
import { TWXGCT } from './constants'
import { decodePrefixedToken, encodePrefixedToken, episodeRecord } from './helpers'

const TOKEN_PREFIX = `${TWXGCT.id}.`
const FETCH_OPTS = Object.freeze({ headers: { Referer: TWXGCT.referer } })
const CDN_HEADERS = Object.freeze({ Referer: TWXGCT.referer, 'User-Agent': 'Mozilla/5.0' })
/** Real episode tiles; excludes header 播放/收藏 links that also carry chapter_id. */
const CHAPTER_LINK_SEL = 'a.chapter-box[href*="chapter_id="], a.goto-chapter[href*="chapter_id="]'
const CHAPTER_LINK_FALLBACK_SEL = 'a[href*="chapter_id="]'

function extractChapterId(href) {
    if (!href) return null
    try {
        const url = new URL(href, TWXGCT.baseUrl)
        return url.searchParams.get('chapter_id') || url.pathname.match(/\/video\/[^/]+\/([^/.]+)/)?.[1] || null
    } catch {
        const q = String(href).match(/[?&]chapter_id=([^&]+)/)
        return q ? decodeURIComponent(q[1]) : null
    }
}

function decodeToken(token) {
    const parts = decodePrefixedToken(token, TOKEN_PREFIX, 2)
    return parts ? { cartoonId: parts[0], chapterId: parts[1] } : null
}

function extractVideoGuid(html) {
    const m =
        html?.match(/player\.htm\?[^"'\s]*vid=([0-9a-fA-F-]{36})/) ||
        html?.match(/[?&]vid=([0-9a-fA-F-]{36})/)
    return m?.[1] || null
}

function pad(n, w = 2) {
    return String(n).padStart(w, '0')
}

function vttTime(seconds) {
    const s = Math.max(0, Number(seconds) || 0)
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const rem = s % 60
    const whole = Math.floor(rem)
    return `${pad(h)}:${pad(m)}:${pad(whole)}.${pad(Math.round((rem - whole) * 1000), 3)}`
}

function seekThumbCount(durationSec, info) {
    const fromInfo = Number(info?.thumbnailCount ?? info?.frameCount)
    if (Number.isFinite(fromInfo) && fromInfo > 0) return Math.floor(fromInfo)
    if (!(durationSec > 0)) return 0
    return Math.ceil(durationSec / (durationSec < 600 ? 1 : 2))
}

/** Bunny seek sheets as WebVTT cues with #xywh crops. */
function buildSeekVtt(guid, durationSec, sheetStart, sheetCount, thumbCount) {
    const { cols, rows } = TWXGCT.seekGrid
    const { width, height } = TWXGCT.seekSheetSize
    if (!(durationSec > 0) || sheetCount <= 0) return null

    const cells = cols * rows
    const total = Math.min(Math.max(1, thumbCount), sheetCount * cells)
    const cellW = Math.floor(width / cols)
    const cellH = Math.floor(height / rows)
    const step = durationSec / total
    const lines = ['WEBVTT', '']

    for (let i = 0; i < total; i++) {
        const local = i % cells
        const x = (local % cols) * cellW
        const y = Math.floor(local / cols) * cellH
        const t0 = i * step
        const t1 = i === total - 1 ? durationSec : (i + 1) * step
        lines.push(`${vttTime(t0)} --> ${vttTime(t1)}`)
        lines.push(`${TWXGCT.seekThumbUrl(guid, sheetStart + Math.floor(i / cells))}#xywh=${x},${y},${cellW},${cellH}`)
        lines.push('')
    }
    return lines.join('\n')
}

function parseCaptions(guid, info) {
    if (!Array.isArray(info?.captions)) return []
    return info.captions
        .filter((c) => c?.srclang)
        .map((c) => {
            const srclang = String(c.srclang)
            return {
                srclang,
                label: String(c.label || srclang),
                src: TWXGCT.captionUrl(guid, srclang),
            }
        })
}

async function cdnFetch(url, init = {}) {
    return fetch(url, { ...init, headers: { ...CDN_HEADERS, ...init.headers } })
}

async function fetchVideoInfo(guid) {
    const res = await cdnFetch(TWXGCT.videoInfoUrl(guid), { headers: { Accept: 'application/json' } })
    if (!res.ok) return null
    return JSON.parse((await res.text()).replace(/^\uFEFF/, ''))
}

function buildSeekPreview(guid, info) {
    const duration = Number(info?.length) || 0
    const thumbs = seekThumbCount(duration, info)
    if (thumbs <= 0) return null
    const perSheet = TWXGCT.seekGrid.cols * TWXGCT.seekGrid.rows
    return buildSeekVtt(guid, duration, 0, Math.ceil(thumbs / perSheet), thumbs)
}

async function listEpisodes(event, videoId) {
    const log = getRequestLogger(event)
    const raw = String(videoId || '').trim()
    const at = raw.match(/^(.+?)@(\d+)$/)
    const cartoonId = at ? at[1] : raw
    const volume = at ? Math.max(1, Number(at[2]) || 1) : 1 // bare / @1 = 1st .volume-title
    const episodes = {}
    const seen = new Set()

    try {
        const fetched = await cfFetch(TWXGCT.detailUrl(cartoonId), FETCH_OPTS)
        if (!fetched?.html) {
            log.error({ cartoonId, source: TWXGCT.id }, 'detail fetch empty')
            return episodes
        }

        const $ = cheerio.load(fetched.html)
        const titles = $('.volume-title').toArray()
        const linkSel = $(CHAPTER_LINK_SEL).length ? CHAPTER_LINK_SEL : CHAPTER_LINK_FALLBACK_SEL
        let nodes = $(linkSel).toArray()
        if (titles.length) {
            const target = titles[volume - 1]
            nodes = []
            let on = false
            $(`.volume-title, ${linkSel}`).each((_, el) => {
                if ($(el).is('.volume-title')) {
                    on = el === target
                    return
                }
                if (on) nodes.push(el)
            })
        }

        let ep = 0
        for (const el of nodes) {
            const chapterId = extractChapterId($(el).attr('href'))
            if (!chapterId || seen.has(chapterId)) continue
            seen.add(chapterId)
            ep += 1
            episodes[String(ep)] = episodeRecord(encodePrefixedToken(TOKEN_PREFIX, [cartoonId, chapterId]))
        }
    } catch (err) {
        log.error({ err, cartoonId, source: TWXGCT.id }, 'listEpisodes failed')
    }

    return episodes
}

async function resolvePlayback({ cartoonId, chapterId }) {
    const fetched = await cfFetch(TWXGCT.pageDirectUrl(cartoonId, chapterId), FETCH_OPTS)
    if (!fetched?.html) throw new Error(`Failed to fetch ${TWXGCT.id} episode page`)

    const guid = extractVideoGuid(fetched.html)
    if (!guid) throw new Error(`${TWXGCT.id} video GUID not found`)

    let thumbnail_vtt_text = null
    let captions = []
    try {
        const info = await fetchVideoInfo(guid)
        captions = parseCaptions(guid, info)
        thumbnail_vtt_text = buildSeekPreview(guid, info)
    } catch {
        /* playback works without seek previews / captions */
    }

    return {
        s: [{ src: TWXGCT.playlistUrl(guid) }],
        videoCookie: '',
        video_id: guid,
        thumbnail_vtt_text,
        captions,
    }
}

export default {
    id: TWXGCT.id,
    tokenPrefix: TOKEN_PREFIX,
    referer: TWXGCT.referer,
    hostMatchers: TWXGCT.hostMatchers,
    listEpisodes,
    resolvePlayback,
    decodeToken,
}
