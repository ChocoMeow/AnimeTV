/**
 * Provider opt-in (`aiCaptions`): on-demand AI-translate → WebVTT text.
 * Cached per anime_meta.source_id + episode + target_lang (~1 year).
 * Source VTT from the episode's sealed download-proxy URL — no second provider resolve.
 */
import { createHash } from 'node:crypto'
import { createError } from 'h3'
import { serverSupabaseServiceRole } from '#supabase/server'
import { AI_CAPTION_LANGS, aiCaptionLang } from '#shared/utils/aiCaptions'
import { getProvider } from '~~/server/lib/videoProviders'
import { completeAiChat } from '~~/server/utils/aiAgent'
import { moduleLogger } from '~~/server/utils/logger'
import { openMediaProxy } from '~~/server/utils/mediaTokens'
import { absoluteMediaUrl, videoUpstreamHeaders } from '~~/server/utils/videoUpstream'

const TABLE = 'caption_translations'
const TTL_MS = 365 * 24 * 60 * 60 * 1000
const CHUNK = 40
const AI_RETRIES = 3

const log = moduleLogger('caption-translate')
const inflight = new Map()

const sha = (t) => createHash('sha256').update(String(t || '')).digest('hex')
const alive = (exp) => !exp || Date.parse(exp) > Date.now()
const normLang = (s) => String(s || '').trim().replace(/_/g, '-').toLowerCase()
const fail = (statusCode, statusMessage, message) => createError({ statusCode, statusMessage, message })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const asStr = (x) => String(x ?? '')

/** Model sometimes returns ±N cues — pad/truncate so cue timings stay aligned. */
function alignBodies(out, chunk) {
    if (!Array.isArray(out) || !out.length) return null
    const bodies = out.map(asStr)
    if (bodies.length === chunk.length) return bodies
    if (bodies.length > chunk.length) return bodies.slice(0, chunk.length)
    return [...bodies, ...chunk.slice(bodies.length).map(asStr)]
}

function trackMatchesTarget(track, langDef) {
    const n = normLang(track?.srclang)
    if (!n) return false
    if (n === normLang(langDef.srclang)) return true
    return (langDef.aliases || []).some((a) => n === String(a).toLowerCase())
}

export function providerSupportsAiCaptions(source) {
    const p = getProvider(source)
    return Boolean(p?.aiCaptions || p?.ensureTwCaptions)
}

/** Allowlisted AI langs not already present in upstream captions. */
export function availableAiCaptionLangs(captions, { source } = {}) {
    if (!source || !providerSupportsAiCaptions(source)) return []
    const list = Array.isArray(captions) ? captions.filter((c) => c?.src || c?.vttText) : []
    if (!list.length) return []
    return Object.keys(AI_CAPTION_LANGS).filter((code) => {
        const def = AI_CAPTION_LANGS[code]
        return !list.some((c) => trackMatchesTarget(c, def))
    })
}

/** Open sealed `/api/download-proxy?t=…` — provider-agnostic. */
function openSealedCaptionSource(src, userId) {
    let path = ''
    let token = ''
    try {
        const u = new URL(String(src || ''), 'http://local.invalid')
        path = u.pathname
        token = u.searchParams.get('t') || ''
    } catch { /* fall through */ }
    if (!token || !path.endsWith('/download-proxy')) {
        throw fail(400, 'Invalid caption source', '無效的字幕來源。')
    }
    const media = openMediaProxy(token)
    if (media.userId !== userId) throw fail(403, 'Caption source user mismatch', '字幕來源與使用者不符。')
    return media
}

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
        return Array.isArray(arr) ? arr.map(asStr) : null
    } catch {
        return null
    }
}

async function chatJsonArray(chunk, { promptName, ...meta } = {}) {
    const n = chunk.length
    const messages = [
        {
            role: 'system',
            content:
                `Translate anime subtitle cues to ${promptName || 'the target language'}. `
                + `Reply with ONLY a JSON string array of exactly ${n} items (same order). `
                + 'Do not split or merge cues. No markdown.',
        },
        { role: 'user', content: JSON.stringify(chunk) },
    ]

    let lastErr = null
    for (let attempt = 0; attempt <= AI_RETRIES; attempt++) {
        try {
            const data = await completeAiChat({ messages, temperature: 0.2 })
            const parsed = parseJsonArray(data?.choices?.[0]?.message?.content)
            const aligned = alignBodies(parsed, chunk)
            if (!aligned) {
                log.warn({ ...meta, expected: n, got: parsed?.length ?? null }, 'AI caption length mismatch')
                throw fail(502, 'AI caption length mismatch', 'AI 字幕回傳格式錯誤。')
            }
            if (parsed.length !== n) log.warn({ ...meta, expected: n, got: parsed.length }, 'AI caption length aligned')
            return aligned
        } catch (err) {
            lastErr = err
            const status = err?.statusCode || 0
            const retryable = status === 429 || status === 503 || status === 502
            if (!retryable || attempt >= AI_RETRIES) break
            const waitMs = status === 502 ? 400 : 1500 * 2 ** attempt
            log.warn({ ...meta, status, attempt: attempt + 1, waitMs }, 'AI caption retrying')
            await sleep(waitMs)
        }
    }

    const status = lastErr?.statusCode || 502
    if (status === 429) throw fail(429, 'AI rate limited', 'AI 服務忙碌中，請稍後再試。')
    log.warn({ err: lastErr, ...meta, status }, 'AI caption HTTP error')
    throw fail(
        status >= 400 && status < 600 ? status : 502,
        lastErr?.statusMessage || 'AI provider error',
        lastErr?.message || 'AI 字幕產生失敗。',
    )
}

async function translateVtt(sourceVtt, meta = {}) {
    const parsed = parseVtt(sourceVtt)
    if (!parsed) {
        log.warn({ ...meta, vttBytes: String(sourceVtt || '').length }, 'AI caption VTT parse failed')
        return null
    }
    const bodies = []
    for (let i = 0; i < parsed.cues.length; i += CHUNK) {
        if (i > 0) await sleep(400) // pace chunks — avoid provider 429
        bodies.push(...(await chatJsonArray(
            parsed.cues.slice(i, i + CHUNK).map((c) => c.body),
            { ...meta, chunkIndex: Math.floor(i / CHUNK) + 1 },
        )))
    }
    return buildVtt(parsed, bodies)
}

async function fetchVtt(url, cookie, referer, meta = {}) {
    const abs = absoluteMediaUrl(url)
    if (!abs) {
        log.warn({ ...meta }, 'AI caption source URL invalid')
        return null
    }
    try {
        const res = await fetch(abs, {
            headers: videoUpstreamHeaders(abs, { cookie, referer, accept: 'text/vtt,*/*' }),
            signal: AbortSignal.timeout(30_000),
        })
        if (!res.ok) {
            log.warn({ ...meta, status: res.status }, 'AI caption source fetch failed')
            return null
        }
        const text = (await res.text()).replace(/^\uFEFF/, '')
        if (!/WEBVTT/i.test(text)) {
            log.warn({ ...meta, bytes: text.length }, 'AI caption source not WebVTT')
            return null
        }
        return text
    } catch (err) {
        log.warn({ err, ...meta }, 'AI caption source fetch error')
        return null
    }
}

async function resolveCaptionVtt(event, { sourceId, episode, sourceLang, cookie, referer, upstreamUrl, langDef }) {
    const ep = String(episode)
    const targetLang = langDef.srclang
    const meta = { sourceId, episode: ep, targetLang, promptName: langDef.promptName }

    const sourceVtt = await fetchVtt(upstreamUrl, cookie, referer, meta)
    if (!sourceVtt) throw fail(502, 'Caption source fetch failed', '無法取得原始字幕。')

    const hash = sha(sourceVtt)
    const client = await serverSupabaseServiceRole(event)
    const { data: hit } = await client
        .from(TABLE)
        .select('id, source_vtt_hash, expires_at, vtt_text')
        .eq('source_id', sourceId)
        .eq('episode_number', ep)
        .eq('target_lang', targetLang)
        .maybeSingle()

    if (hit?.vtt_text && hit.source_vtt_hash === hash && alive(hit.expires_at)) {
        log.info({ ...meta, cacheId: hit.id }, 'AI caption cache hit')
        return hit.vtt_text
    }

    log.info(meta, 'AI caption translate start')
    const vttText = await translateVtt(sourceVtt, meta)
    if (!vttText) throw fail(502, 'Caption translate failed', '字幕翻譯失敗。')

    const { error } = await client.from(TABLE).upsert(
        {
            source_id: sourceId,
            episode_number: ep,
            source_lang: sourceLang || 'en',
            target_lang: targetLang,
            source_vtt_hash: hash,
            vtt_text: vttText,
            expires_at: new Date(Date.now() + TTL_MS).toISOString(),
        },
        { onConflict: 'source_id,episode_number,target_lang' },
    )
    if (error) {
        log.warn({ err: error, ...meta }, 'caption upsert failed')
        throw fail(500, 'Caption save failed', '無法儲存翻譯字幕。')
    }
    return vttText
}

/** @returns {{ srclang: string, label: string, vttText: string }} */
export async function generateAiCaption(event, {
    source,
    sourceId,
    episode,
    sourceSrc,
    sourceLang = 'en',
    userId,
    targetLang,
} = {}) {
    const langDef = aiCaptionLang(targetLang)
    if (!langDef) throw fail(400, 'Unsupported caption language', '不支援的字幕語言。')
    if (!userId) throw fail(401, 'Unauthorized', '請先登入。')
    if (!source || !providerSupportsAiCaptions(source)) {
        throw fail(400, 'AI captions unavailable', '此來源不支援 AI 字幕。')
    }
    if (!Number.isFinite(Number(sourceId)) || episode == null || episode === '') {
        throw fail(400, 'Invalid episode context', '缺少作品或集數資訊。')
    }
    if (!sourceSrc) throw fail(400, 'Missing caption source', '缺少原始字幕。')

    const media = openSealedCaptionSource(sourceSrc, userId)
    const sid = Number(sourceId)
    const dedupe = `${sid}|${episode}|${media.url}|${langDef.srclang}`

    let work = inflight.get(dedupe)
    if (!work) {
        work = resolveCaptionVtt(event, {
            sourceId: sid,
            episode,
            sourceLang,
            cookie: media.cookie,
            referer: media.referer,
            upstreamUrl: media.url,
            langDef,
        })
            .catch((err) => {
                log.warn({ err, sourceId: sid, episode, targetLang: langDef.srclang }, 'AI caption failed')
                throw err
            })
            .finally(() => {
                if (inflight.get(dedupe) === work) inflight.delete(dedupe)
            })
        inflight.set(dedupe, work)
    }

    const vttText = await work
    if (!vttText) throw fail(502, 'Caption generate failed', 'AI 字幕產生失敗。')
    return { srclang: langDef.srclang, label: langDef.label, vttText }
}
