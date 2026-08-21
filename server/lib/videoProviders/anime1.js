import * as cheerio from 'cheerio'
import { cfFetch } from '~~/server/utils/anime'
import { getRequestLogger } from '~~/server/utils/logger'
import { EPISODE_LIST_CACHE_LIFETIME } from '~~/shared/global'
import { ANIME1 } from './constants'
import { episodeRecord, normalizeEpisodeId } from './helpers'

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
                        videoId,
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

export default {
    id: ANIME1.id,
    tokenPrefix: null,
    referer: ANIME1.referer,
    hostMatchers: ANIME1.hostMatchers,
    listEpisodes,
    resolvePlayback,
}
