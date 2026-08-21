import anime1 from './anime1'
import twxgct from './twxgct'
import { DEFAULT_VIDEO_SOURCE, normalizeVideoSource } from '~~/shared/videoSources'

export {
    VIDEO_SOURCE,
    VIDEO_SOURCES,
    DEFAULT_VIDEO_SOURCE,
    isValidVideoSource,
    normalizeVideoSource,
} from '~~/shared/videoSources'

/** Register providers here when adding a source. */
const providerList = [anime1, twxgct]
const providers = Object.fromEntries(providerList.map((p) => [p.id, p]))
const prefixedProviders = providerList
    .filter((p) => p.tokenPrefix)
    .sort((a, b) => b.tokenPrefix.length - a.tokenPrefix.length)

export function getProvider(source) {
    return providers[normalizeVideoSource(source) || DEFAULT_VIDEO_SOURCE]
}

export function detectSourceFromToken(token) {
    if (typeof token !== 'string') return DEFAULT_VIDEO_SOURCE
    return prefixedProviders.find((p) => token.startsWith(p.tokenPrefix))?.id || DEFAULT_VIDEO_SOURCE
}

export function resolveVideoReferer(hostname, fallbackOrigin = '') {
    const match = providerList.find((p) => p.hostMatchers?.some((m) => hostname.includes(m)))
    if (match) return match.referer
    return fallbackOrigin ? `${fallbackOrigin.replace(/\/$/, '')}/` : ''
}

export async function listEpisodesForSource(event, source, videoId) {
    const provider = getProvider(source)
    if (!provider) throw new Error(`Unknown video source: ${source}`)
    return provider.listEpisodes(event, videoId)
}

export async function resolvePlaybackForToken(token) {
    const source = detectSourceFromToken(token)
    const provider = getProvider(source)
    if (!provider) throw new Error(`Unknown video source for token`)

    if (typeof provider.decodeToken === 'function') {
        const payload = provider.decodeToken(token)
        if (!payload) throw new Error(`Invalid ${source} token`)
        return provider.resolvePlayback(payload)
    }
    return provider.resolvePlayback(token)
}
