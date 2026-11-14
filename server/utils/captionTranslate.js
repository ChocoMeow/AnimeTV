/**
 * Provider opt-in (`ensureTwCaptions`): AI-translate → TW WebVTT.
 * Cached per anime_meta.source_id + episode (~1 year).
 */
import { createHash } from 'node:crypto'
import { serverSupabaseServiceRole } from '#supabase/server'
import { getProvider } from '~~/server/lib/videoProviders'
import { requireAiConfig } from '~~/server/utils/aiAgent'
import { moduleLogger } from '~~/server/utils/logger'
import { captionCacheUrl } from '~~/server/utils/mediaTokens'
import { absoluteMediaUrl, videoUpstreamHeaders } from '~~/server/utils/videoUpstream'

const TABLE = 'caption_translations'
const TTL_MS = 365 * 24 * 60 * 60 * 1000
const CHUNK = 40
/** Don't block episode resolve — miss keeps filling cache in background. */
const BUDGET_MS = 25_000
const TW = { srclang: 'TW', label: '繁體中文' }

const log = moduleLogger('caption-translate')
const inflight = new Map()

const isTw = (c) => /^(tw|zh-hant|zh-tw|zh-hk)$/i.test(String(c?.srclang || '').replace(/_/g, '-'))
const sha = (t) => createHash('sha256').update(String(t || '')).digest('hex')
const alive = (exp) => !exp || Date.parse(exp) > Date.now()

/** Keep timings; translate cue bodies only. */
function parseVtt(raw) {
    const text = String(raw || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
    if (!/WEBVTT/i.test(text)) return null
    const header = []
    const cues = []
    let inCues = false
    for (const block of text.split(/\n\n+/)) {
        const lines = block.split('\n')
        const i = lines.findIndex((l) => l.includes('-->'))
        if (i < 0) {
            if (!inCues) header.push(block)
            continue
        }
        inCues = true
        cues.push({ prefix: lines.slice(0, i), timing: lines[i], body: lines.slice(i + 1).join('\n') })
    }
    return cues.length ? { header: header.join('\n\n'), cues } : null
}

function buildVtt({ header, cues }, bodies) {
    const blocks = header ? [header.trimEnd()] : []
    for (let i = 0; i < cues.length; i++) {
        const c = cues[i]
        const head = c.prefix.length ? `${c.prefix.join('\n')}\n` : ''
        blocks.push(`${head}${c.timing}\n${bodies[i] ?? c.body}`.trimEnd())
    }
    return `${blocks.join('\n\n')}\n`
}

function parseJsonArray(content) {
    const raw = String(content || '').trim().replace(/^```(?:json)?\s*|\s*```$/gi, '')
    const start = raw.indexOf('[')
    const end = raw.lastIndexOf(']')
    if (start < 0 || end <= start) return null
    try {
        const arr = JSON.parse(raw.slice(start, end + 1))
        return Array.isArray(arr) ? arr.map((x) => String(x ?? '')) : null
    } catch {
        return null
    }
}

async function chatJsonArray(chunk) {
    const config = useRuntimeConfig()
    requireAiConfig(config)
    const res = await fetch(`${String(config.aiBaseUrl).replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.aiApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: config.aiModel,
            temperature: 0.2,
            messages: [
                {
                    role: 'system',
                    content:
                        'Translate anime subtitle cues to Traditional Chinese (繁體中文). '
                        + 'Reply with ONLY a JSON string array — same length/order. No markdown.',
                },
                { role: 'user', content: JSON.stringify(chunk) },
            ],
        }),
        signal: AbortSignal.timeout(180_000),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) throw new Error(data?.error?.message || res.statusText || 'AI error')
    const out = parseJsonArray(data?.choices?.[0]?.message?.content)
    if (!out || out.length !== chunk.length) throw new Error('AI caption length mismatch')
    return out
}

async function translateVtt(sourceVtt) {
    const parsed = parseVtt(sourceVtt)
    if (!parsed) return null
    const bodies = []
    for (let i = 0; i < parsed.cues.length; i += CHUNK) {
        bodies.push(...(await chatJsonArray(parsed.cues.slice(i, i + CHUNK).map((c) => c.body))))
    }
    return buildVtt(parsed, bodies)
}

async function fetchVtt(url, cookie, referer) {
    const abs = absoluteMediaUrl(url)
    if (!abs) return null
    const res = await fetch(abs, {
        headers: videoUpstreamHeaders(abs, { cookie, referer, accept: 'text/vtt,*/*' }),
        signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) return null
    const text = (await res.text()).replace(/^\uFEFF/, '')
    return /WEBVTT/i.test(text) ? text : null
}

async function resolveTwId(event, { sourceId, episode, srcTrack, cookie, referer }) {
    const sourceVtt = await fetchVtt(srcTrack.src, cookie, referer)
    if (!sourceVtt) return null

    const hash = sha(sourceVtt)
    const ep = String(episode)
    const client = await serverSupabaseServiceRole(event)

    const { data: hit } = await client
        .from(TABLE)
        .select('id, source_vtt_hash, expires_at')
        .eq('source_id', sourceId)
        .eq('episode_number', ep)
        .eq('target_lang', 'TW')
        .maybeSingle()
    if (hit?.id && hit.source_vtt_hash === hash && alive(hit.expires_at)) return hit.id

    const vttText = await translateVtt(sourceVtt)
    if (!vttText) return null

    const { data: saved, error } = await client
        .from(TABLE)
        .upsert(
            {
                source_id: sourceId,
                episode_number: ep,
                source_lang: srcTrack.srclang || 'en',
                target_lang: 'TW',
                source_vtt_hash: hash,
                vtt_text: vttText,
                expires_at: new Date(Date.now() + TTL_MS).toISOString(),
            },
            { onConflict: 'source_id,episode_number,target_lang' },
        )
        .select('id')
        .single()
    if (error) {
        log.warn({ err: error, sourceId, episode: ep }, 'caption upsert failed')
        return null
    }
    return saved?.id || null
}

/** Prepend TW track when provider opts in. Soft-fail — never breaks playback. */
export async function ensureTwCaptions(event, captions, {
    source,
    sourceId,
    episode,
    cookie = '',
    referer = '',
    userId,
} = {}) {
    const list = Array.isArray(captions) ? captions.filter(Boolean) : []
    if (!list.length || !userId || !source || !getProvider(source)?.ensureTwCaptions) return list
    if (!Number.isFinite(Number(sourceId)) || episode == null || episode === '') return list
    if (list.some(isTw)) return list

    const srcTrack =
        list.find((c) => c?.src && !isTw(c) && String(c.srclang || '').toLowerCase() === 'en')
        || list.find((c) => c?.src && !isTw(c))
    if (!srcTrack) return list

    const sid = Number(sourceId)
    const dedupe = `${sid}|${episode}|${srcTrack.src}`
    let work = inflight.get(dedupe)
    if (!work) {
        work = resolveTwId(event, { sourceId: sid, episode, srcTrack, cookie, referer })
            .catch((err) => {
                log.warn({ err, sourceId: sid, episode }, 'TW caption failed')
                return null
            })
            .finally(() => {
                if (inflight.get(dedupe) === work) inflight.delete(dedupe)
            })
        inflight.set(dedupe, work)
    }

    const id = await Promise.race([
        work,
        new Promise((r) => setTimeout(() => r(null), BUDGET_MS)),
    ])
    return id ? [{ src: captionCacheUrl(id, userId), ...TW }, ...list] : list
}

export async function loadCaptionVtt(event, id) {
    if (!id) return null
    const client = await serverSupabaseServiceRole(event)
    const { data } = await client.from(TABLE).select('vtt_text, expires_at').eq('id', id).maybeSingle()
    return data?.vtt_text && alive(data.expires_at) ? data.vtt_text : null
}
