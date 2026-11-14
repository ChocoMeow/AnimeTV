/**
 * On-demand AI captions (provider `aiCaptions`).
 * Cached per source_id + episode + lang (~1y). Source VTT via sealed download-proxy.
 * Timings always from source VTT; model returns index-keyed cue text only.
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
const TRANSLATOR_VERSION = 2 // bump + delete DB row to force retranslate
const CHUNK = 36
const CHUNK_GAP_MS = 450
const AI_RETRIES = 5
/** Cache-miss AI jobs per user / hour (cache hits are free). */
const USER_GEN_LIMIT = 20
const USER_GEN_WINDOW_MS = 60 * 60 * 1000
/** Shared cooldown after a failed generate for the same episode+lang. */
const FAIL_COOLDOWN_MS = 90_000

const log = moduleLogger('caption-translate')
const inflight = new Map() // episode+lang → Promise
const userGenAt = new Map() // userId → AI-start timestamps
const failUntil = new Map() // `${sid}|${ep}|${lang}` → cooldown until ms

const sha = (t) => createHash('sha256').update(String(t || '')).digest('hex')
const alive = (exp) => !exp || Date.parse(exp) > Date.now()
const normLang = (s) => String(s || '').trim().replace(/_/g, '-').toLowerCase()
const fail = (statusCode, statusMessage, message) => createError({ statusCode, statusMessage, message })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const asStr = (x) => String(x ?? '')

function isTimeoutErr(err) {
    return err?.name === 'TimeoutError' || err?.code === 23 || /timed? out/i.test(String(err?.message || ''))
}

function isRetryableAiErr(err) {
    if (isTimeoutErr(err)) return true
    const s = err?.statusCode || 0
    return s === 408 || s === 429 || s === 502 || s === 503
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

function openSealedCaptionSource(src, userId) {
    let path = ''
    let token = ''
    try {
        const u = new URL(String(src || ''), 'http://local.invalid')
        path = u.pathname
        token = u.searchParams.get('t') || ''
    } catch { /* ignore */ }
    if (!token || !path.endsWith('/download-proxy')) {
        throw fail(400, 'Invalid caption source', '無效的字幕來源。')
    }
    const media = openMediaProxy(token)
    if (media.userId !== userId) throw fail(403, 'Caption source user mismatch', '字幕來源與使用者不符。')
    return media
}

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

function extractJson(content) {
    const raw = String(content || '').trim().replace(/^```(?:json)?\s*|\s*```$/gi, '')
    const obj = raw.indexOf('{')
    const arr = raw.indexOf('[')
    const start = obj >= 0 && (arr < 0 || obj < arr) ? obj : arr
    const end = start >= 0 ? raw.lastIndexOf(start === obj ? '}' : ']') : -1
    if (start < 0 || end <= start) return null
    try {
        return JSON.parse(raw.slice(start, end + 1))
    } catch {
        return null
    }
}

/** Map model JSON onto cue order — never truncate a wrong-length array (shifts timings). */
function bodiesFromModel(parsed, chunk) {
    const n = chunk.length
    if (!parsed) return null
    if (Array.isArray(parsed)) return parsed.length === n ? parsed.map(asStr) : null

    if (typeof parsed !== 'object') return null
    const byIndex = new Map()
    for (const [k, v] of Object.entries(parsed)) {
        const i = Number(k)
        if (Number.isInteger(i) && i >= 0 && i < n && v != null) byIndex.set(i, asStr(v))
    }
    if (byIndex.size < Math.ceil(n * 0.85)) return null
    return chunk.map((orig, i) => (byIndex.has(i) ? byIndex.get(i) : asStr(orig)))
}

async function translateChunk(chunk, { promptName, ...meta } = {}) {
    const n = chunk.length
    const payload = Object.fromEntries(chunk.map((t, i) => [String(i), t]))
    const messages = [
        {
            role: 'system',
            content:
                `Translate anime subtitle cues to ${promptName || 'the target language'}. `
                + `Input is a JSON object keyed "0".."${n - 1}". `
                + 'Reply with ONLY a JSON object using the SAME keys and translated values. '
                + 'Do not add/remove/renumber keys or split/merge cues. Keep \\n in values. No markdown.',
        },
        { role: 'user', content: JSON.stringify(payload) },
    ]

    let lastErr = null
    for (let attempt = 0; attempt <= AI_RETRIES; attempt++) {
        try {
            const data = await completeAiChat({ messages, temperature: 0.15 })
            const parsed = extractJson(data?.choices?.[0]?.message?.content)
            const bodies = bodiesFromModel(parsed, chunk)
            if (!bodies) {
                log.warn({
                    ...meta,
                    expected: n,
                    got: parsed && typeof parsed === 'object' ? Object.keys(parsed).length : null,
                }, 'AI caption index mismatch')
                throw fail(502, 'AI caption length mismatch', 'AI 字幕回傳格式錯誤。')
            }
            return bodies
        } catch (err) {
            lastErr = err
            if (!isRetryableAiErr(err) || attempt >= AI_RETRIES) break
            const status = err?.statusCode || (isTimeoutErr(err) ? 408 : 0)
            const waitMs = (status === 429 || status === 503 ? 2000 : 500) * 2 ** attempt
            log.warn({ ...meta, status, attempt: attempt + 1, waitMs }, 'AI caption retrying')
            await sleep(waitMs)
        }
    }

    if (isTimeoutErr(lastErr)) throw fail(503, 'AI provider timeout', 'AI 服務逾時，請稍後再試。')
    const status = lastErr?.statusCode || 502
    if (status === 429) throw fail(429, 'AI rate limited', 'AI 服務忙碌中，請稍後再試。')
    if (status === 503) throw fail(503, 'AI unavailable', 'AI 服務暫時無法使用，請稍後再試。')
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
    const total = Math.ceil(parsed.cues.length / CHUNK)
    log.info({ ...meta, totalCues: parsed.cues.length, chunks: total, chunkSize: CHUNK }, 'AI caption chunks')

    for (let i = 0; i < parsed.cues.length; i += CHUNK) {
        if (i > 0) await sleep(CHUNK_GAP_MS)
        const slice = parsed.cues.slice(i, i + CHUNK).map((c) => c.body)
        bodies.push(...await translateChunk(slice, {
            ...meta,
            chunkIndex: Math.floor(i / CHUNK) + 1,
            chunks: total,
        }))
    }
    return buildVtt(parsed, bodies)
}

async function fetchVtt(url, cookie, referer, meta = {}) {
    const abs = absoluteMediaUrl(url)
    if (!abs) return null
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

function recentUserGens(userId) {
    const since = Date.now() - USER_GEN_WINDOW_MS
    const times = (userGenAt.get(userId) || []).filter((t) => t > since)
    userGenAt.set(userId, times)
    return times
}

/** Reserve a cache-miss AI slot (fail cooldown + per-user hourly quota). */
function claimGenerate(userId, jobKey) {
    if ((failUntil.get(jobKey) || 0) > Date.now()) {
        throw fail(429, 'AI caption cooldown', '此集字幕剛產生失敗，請稍後再試。')
    }
    const times = recentUserGens(userId)
    if (times.length >= USER_GEN_LIMIT) {
        throw fail(429, 'AI caption user limit', 'AI 字幕產生次數已達上限，請稍後再試。')
    }
    times.push(Date.now())
}

function markFail(jobKey) {
    failUntil.set(jobKey, Date.now() + FAIL_COOLDOWN_MS)
}

async function resolveCaptionVtt(event, {
    sourceId, episode, sourceLang, cookie, referer, upstreamUrl, langDef, userId, jobKey,
}) {
    const ep = String(episode)
    const targetLang = langDef.srclang
    const meta = { sourceId, episode: ep, targetLang, promptName: langDef.promptName }
    const client = await serverSupabaseServiceRole(event)

    const { data: hit } = await client
        .from(TABLE)
        .select('id, expires_at, vtt_text')
        .eq('source_id', sourceId)
        .eq('episode_number', ep)
        .eq('target_lang', targetLang)
        .maybeSingle()

    // Live cache wins — no retranslate. Force refresh: delete row or expire it.
    if (hit?.vtt_text && alive(hit.expires_at)) {
        log.info({ ...meta, cacheId: hit.id }, 'AI caption cache hit')
        return hit.vtt_text
    }

    const sourceVtt = await fetchVtt(upstreamUrl, cookie, referer, meta)
    if (!sourceVtt) throw fail(502, 'Caption source fetch failed', '無法取得原始字幕。')

    claimGenerate(userId, jobKey)
    log.info(meta, 'AI caption translate start')

    let vttText
    try {
        vttText = await translateVtt(sourceVtt, meta)
    } catch (err) {
        markFail(jobKey)
        throw err
    }
    if (!vttText) {
        markFail(jobKey)
        throw fail(502, 'Caption translate failed', '字幕翻譯失敗。')
    }
    failUntil.delete(jobKey)

    const { error } = await client.from(TABLE).upsert(
        {
            source_id: sourceId,
            episode_number: ep,
            source_lang: sourceLang || 'en',
            target_lang: targetLang,
            source_vtt_hash: sha(`v${TRANSLATOR_VERSION}:${sourceVtt}`),
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
    const lang = langDef.srclang
    const jobKey = `${sid}|${episode}|${lang}` // shared AI job + fail cooldown
    const dedupe = `${jobKey}|v${TRANSLATOR_VERSION}`

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
            userId,
            jobKey,
        })
            .catch((err) => {
                log.warn({ err, sourceId: sid, episode, targetLang: lang }, 'AI caption failed')
                throw err
            })
            .finally(() => {
                if (inflight.get(dedupe) === work) inflight.delete(dedupe)
            })
        inflight.set(dedupe, work)
    }

    const vttText = await work
    if (!vttText) throw fail(502, 'Caption generate failed', 'AI 字幕產生失敗。')
    return { srclang: lang, label: langDef.label, vttText }
}
