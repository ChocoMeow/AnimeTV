import * as cheerio from 'cheerio'
import { EPISODE_LIST_CACHE_LIFETIME } from '#shared/utils/global'
import { cfFetch } from '~~/server/utils/anime'
import { getRequestLogger } from '~~/server/utils/logger'
import { episodeRecord, normalizeEpisodeId } from '../helpers'

const HOST = 'anime1.me'
const SITE = `https://${HOST}`

/** Endpoints for this provider only — keep co-located with the plugin. */
export const ANIME1 = Object.freeze({
    id: 'anime1',
    baseUrl: `${SITE}/`,
    apiUrl: `https://v.${HOST}/api`,
    catalogUrl: `https://${HOST}/animelist.json`,
    referer: `${SITE}/`,
    defaultTserver: 'pt',
    hostMatchers: Object.freeze([HOST]),
    thumbBase: (tserver, vid) => `https://${tserver || 'pt'}.${HOST}/${vid}`,
})

function episodeKeyFromTitle(title) {
    const matches = title.match(/\[([^\]]+)\]/g)
    return matches?.length ? matches[matches.length - 1].slice(1, -1) : null
}

function videoCookieFromSetCookie(header) {
    if (!header) return ''
    return header
        .split(',')
        .map((c) => c.trim().split(';')[0])
        .filter((pair) => {
            const key = pair.split('=')[0]
            return key === 'e' || key === 'p' || key === 'h' || key.startsWith('_ga')
        })
        .join('; ')
}

async function listEpisodes(event, categoryId) {
    const log = getRequestLogger(event)
    const episodes = {}
    let nextPageUrl = `${ANIME1.baseUrl}?cat=${categoryId}`
    const fetchOpts = { headers: { Referer: ANIME1.referer }, cacheTtlMs: EPISODE_LIST_CACHE_LIFETIME }

    try {
        while (nextPageUrl) {
            const fetched = await cfFetch(nextPageUrl, fetchOpts)
            if (!fetched?.html) break
            const $ = cheerio.load(fetched.html)

            $('article').each((_, el) => {
                const fullTitle = $(el).find('h2.entry-title a').text().trim()
                const $video = $(el).find('.video-js')
                const token = $video.attr('data-apireq')
                const videoId = $video.attr('data-vid') || null
                const tserver = $video.attr('data-tserver')?.trim() || null
                if (!fullTitle || !token) return

                const identifier = episodeKeyFromTitle(fullTitle)
                if (!identifier) return

                const vid = videoId != null ? String(videoId).trim() : ''
                const thumbBase = vid ? ANIME1.thumbBase(tserver || ANIME1.defaultTserver, vid) : null

                for (const part of identifier.split('+')) {
                    episodes[normalizeEpisodeId(part.trim())] = episodeRecord(token, {
                        thumbJpg: thumbBase ? `${thumbBase}/thumbnails.jpg` : null,
                        thumbVtt: thumbBase ? `${thumbBase}/thumbnails.vtt` : null,
                    })
                }
            })

            nextPageUrl = $('.nav-previous a').attr('href') || null
        }
    } catch (err) {
        log.error({ err, categoryId, source: ANIME1.id }, 'listEpisodes failed')
    }

    return episodes
}

async function resolvePlayback(token) {
    const response = await fetch(ANIME1.apiUrl, {
        method: 'POST',
        headers: {
            accept: '*/*',
            'content-type': 'application/x-www-form-urlencoded',
        },
        credentials: 'include',
        body: `d=${token}`,
    })

    if (!response.ok) {
        let message = 'Failed to fetch video'
        try {
            message = (await response.json()).message || message
        } catch {
            /* keep default */
        }
        throw new Error(message)
    }

    const result = await response.json()
    return { ...result, videoCookie: videoCookieFromSetCookie(response.headers.get('set-cookie')) }
}

/** Auto-registered via modules/video-providers.ts → #video-providers. */
export default {
    id: ANIME1.id,
    default: true,
    referer: ANIME1.referer,
    hostMatchers: ANIME1.hostMatchers,
    videoIdHelp: '分類 cat ID（數字）',
    listEpisodes,
    resolvePlayback,
}
