/**
 * On-demand AI captions (provider `aiCaptions`).
 * Cached per source_id + episode + lang (~1y). Source VTT via sealed download-proxy.
 *
 * Translation runs as a background job per episode+lang; callers poll until it is cached.
 * Timings always come from the source VTT — the model only returns id-tagged cue text.
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
const CHUNK = 60 // ~6 AI calls per episode; ids keep alignment on big batches
/** Spacing between Gemini calls across all caption jobs (free tier ≈ 10 RPM). */
const AI_MIN_INTERVAL_MS = 6_000
const AI_ATTEMPTS = 3
/** Gemini suggesting a longer wait means the quota is gone for a while — give up. */
const MAX_RETRY_DELAY_MS = 60_000
const RETRYABLE = new Set([408, 429, 500, 502, 503])
const BAD_FORMAT = 'AI caption bad format'
/** Cache-miss jobs per user / hour (cache hits are free). */
const USER_GEN_LIMIT = 20
const USER_GEN_WINDOW_MS = 60 * 60 * 1000
/** A failed episode+lang returns the same error for this long instead of re-spending tokens. */
const FAIL_COOLDOWN_MS = 60_000

const log = moduleLogger('caption-translate')
const inflight = new Map() // jobKey → background job Promise
const failures = new Map() // jobKey → { until, error }
const userGenAt = new Map() // userId → job start timestamps
let nextAiSlot = 0

const sha = (t) => createHash('sha256').update(String(t || '')).digest('hex')
const alive = (exp) => !exp || Date.parse(exp) > Date.now()
const normLang = (s) => String(s || '').trim().replace(/_/g, '-').toLowerCase()
const fail = (statusCode, statusMessage, message) => createError({ statusCode, statusMessage, message })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const asStr = (x) => String(x ?? '')
const preview = (s) => String(s || '').replace(/\s+/g, ' ').slice(0, 160)

function isTimeoutErr(err) {
    return err?.name === 'TimeoutError' || err?.code === 23 || /timed? out/i.test(String(err?.message || ''))
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
    let raw = String(content || '').trim()
    const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
    if (fence) raw = fence[1].trim()
    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    if (start < 0 || end <= start) return null
    try {
        return JSON.parse(raw.slice(start, end + 1))
    } catch {
        return null
    }
}

/** Reserve the next global AI slot so concurrent jobs share one request budget. */
async function waitAiSlot() {
    const now = Date.now()
    const at = Math.max(now, nextAiSlot)
    nextAiSlot = at + AI_MIN_INTERVAL_MS
    if (at > now) await sleep(at - now)
}

/** Prefer Gemini's own `retryDelay` hint (429 body); otherwise exponential backoff. */
function retryDelayMs(err, attempt) {
    const hint = JSON.stringify(err?.data ?? '').match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/)
    return hint ? Math.ceil(Number(hint[1]) * 1000) : 5_000 * 2 ** (attempt - 1)
}

function userFacingAiError(err) {
    if (isTimeoutErr(err)) return fail(503, 'AI provider timeout', 'AI 服務逾時，請稍後再試。')
    if (err?.statusCode === 429) return fail(429, 'AI rate limited', 'AI 服務忙碌中，請稍後再試。')
    if (err?.statusCode === 503) return fail(503, 'AI unavailable', 'AI 服務暫時無法使用，請稍後再試。')
    if (err?.statusMessage === BAD_FORMAT) return err
    return fail(502, 'AI provider error', 'AI 字幕產生失敗。')
}

/** One JSON chat call with shared pacing; retries busy/timeout/bad-JSON a few times. */
async function chatJson(messages, meta) {
    // Gemini 3 Flash defaults to high thinking (slow, token-heavy); low is plenty for translation.
    let options = { responseFormat: { type: 'json_object' }, reasoningEffort: 'low' }
    for (let attempt = 1; ; attempt++) {
        await waitAiSlot()
        try {
            const data = await completeAiChat({ messages, ...options })
            const content = data?.choices?.[0]?.message?.content
            const parsed = extractJson(content)
            if (parsed) return parsed
            log.warn({ ...meta, attempt, preview: preview(content) }, 'AI caption unparseable reply')
            throw fail(502, BAD_FORMAT, 'AI 字幕回傳格式錯誤。')
        } catch (err) {
            const status = isTimeoutErr(err) ? 408 : err?.statusCode || 0
            if (status === 400 && options) {
                // Non-Gemini OpenAI-compatible providers may reject these fields.
                log.warn({ ...meta, err }, 'AI caption options rejected — retrying plain')
                options = null
                continue
            }
            const waitMs = retryDelayMs(err, attempt)
            if (!RETRYABLE.has(status) || attempt >= AI_ATTEMPTS || waitMs > MAX_RETRY_DELAY_MS) {
                log.warn({ ...meta, err, status, attempt }, 'AI caption call failed')
                throw userFacingAiError(err)
            }
            nextAiSlot = Math.max(nextAiSlot, Date.now() + waitMs) // back off every job, not just this one
            log.warn({ ...meta, status, attempt, waitMs }, 'AI caption retrying')
        }
    }
}

function translateMessages(items, promptName) {
    return [
        {
            role: 'system',
            content:
                `Translate anime subtitle cues to ${promptName || 'the target language'}. `
                + 'Input JSON: {"items":[{"id":number,"text":string}]}. '
                + 'Reply JSON: {"translations":[{"id":number,"text":string}]} with one entry for EVERY input id, '
                + 'even when texts repeat. Keep \\n line breaks. Translate questions, never answer them.',
        },
        { role: 'user', content: JSON.stringify({ items }) },
    ]
}

/** Translate cue bodies by stable id; one follow-up asks only for ids the model skipped. */
async function translateChunk(bodies, { promptName, ...meta }) {
    const out = bodies.map((t) => (t.trim() ? undefined : t))
    let pending = bodies.map((text, id) => ({ id, text })).filter((x) => out[x.id] === undefined)

    for (let pass = 1; pass <= 2 && pending.length; pass++) {
        const parsed = await chatJson(translateMessages(pending, promptName), { ...meta, pass })
        const ids = new Set(pending.map((x) => x.id))
        for (const item of Array.isArray(parsed?.translations) ? parsed.translations : []) {
            const id = Number(item?.id)
            if (ids.has(id) && item?.text != null) out[id] = asStr(item.text)
        }
        pending = pending.filter((x) => out[x.id] === undefined)
        if (pending.length) log.warn({ ...meta, pass, missing: pending.length }, 'AI caption missing ids')
    }

    if (pending.length > bodies.length / 2) throw fail(502, BAD_FORMAT, 'AI 字幕回傳格式錯誤。')
    return out.map((t, i) => t ?? bodies[i]) // leftovers keep source text — timings stay aligned
}

async function translateVtt(sourceVtt, meta) {
    const parsed = parseVtt(sourceVtt)
    if (!parsed) throw fail(502, 'Caption parse failed', '原始字幕格式錯誤。')

    const chunks = Math.ceil(parsed.cues.length / CHUNK)
    log.info({ ...meta, cues: parsed.cues.length, chunks }, 'AI caption translate start')
    const bodies = []
    for (let i = 0; i < parsed.cues.length; i += CHUNK) {
        const slice = parsed.cues.slice(i, i + CHUNK).map((c) => c.body)
        bodies.push(...await translateChunk(slice, { ...meta, chunk: i / CHUNK + 1, chunks }))
    }
    return buildVtt(parsed, bodies)
}

async function fetchVtt(url, cookie, referer, meta) {
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

async function readCachedVtt(client, { sourceId, ep, lang }) {
    const { data } = await client
        .from(TABLE)
        .select('expires_at, vtt_text')
        .eq('source_id', sourceId)
        .eq('episode_number', ep)
        .eq('target_lang', lang)
        .maybeSingle()
    return data?.vtt_text && alive(data.expires_at) ? data.vtt_text : null
}

function claimUserQuota(userId) {
    const since = Date.now() - USER_GEN_WINDOW_MS
    const times = (userGenAt.get(userId) || []).filter((t) => t > since)
    if (times.length >= USER_GEN_LIMIT) {
        throw fail(429, 'AI caption user limit', 'AI 字幕產生次數已達上限，請稍後再試。')
    }
    times.push(Date.now())
    userGenAt.set(userId, times)
}

async function runJob(client, { media, sourceId, ep, sourceLang, langDef }) {
    const meta = { sourceId, episode: ep, targetLang: langDef.srclang, promptName: langDef.promptName }
    const sourceVtt = await fetchVtt(media.url, media.cookie, media.referer, meta)
    if (!sourceVtt) throw fail(502, 'Caption source fetch failed', '無法取得原始字幕。')

    const vttText = await translateVtt(sourceVtt, meta)
    const { error } = await client.from(TABLE).upsert(
        {
            source_id: sourceId,
            episode_number: ep,
            source_lang: sourceLang || 'en',
            target_lang: langDef.srclang,
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
    log.info(meta, 'AI caption saved')
}

/**
 * Cached → `{ status: 'ready', caption }`. Otherwise starts (or joins) the shared
 * background job and returns `{ status: 'pending' }` — call again to poll.
 */
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
    const job = { sourceId: Number(sourceId), ep: String(episode), lang: langDef.srclang }
    const jobKey = `${job.sourceId}|${job.ep}|${job.lang}|v${TRANSLATOR_VERSION}`
    const pending = { status: 'pending' }

    if (inflight.has(jobKey)) return pending
    const client = await serverSupabaseServiceRole(event)
    const cached = await readCachedVtt(client, job)
    if (cached) {
        return { status: 'ready', caption: { srclang: job.lang, label: langDef.label, vttText: cached } }
    }
    if (inflight.has(jobKey)) return pending // started while we read the cache

    const failed = failures.get(jobKey)
    if (failed && failed.until > Date.now()) throw failed.error
    failures.delete(jobKey)
    claimUserQuota(userId)

    const work = runJob(client, { media, sourceId: job.sourceId, ep: job.ep, sourceLang, langDef })
        .catch((err) => {
            log.warn({ err, ...job }, 'AI caption failed')
            const error = err?.statusCode ? err : fail(502, 'Caption generate failed', 'AI 字幕產生失敗。')
            failures.set(jobKey, { until: Date.now() + FAIL_COOLDOWN_MS, error })
        })
        .finally(() => inflight.delete(jobKey))
    inflight.set(jobKey, work)
    return pending
}
