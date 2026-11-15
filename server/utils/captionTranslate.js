/**
 * On-demand AI captions (provider `aiCaptions`).
 * Cached per source_id + episode + lang (~1y). Source VTT via sealed download-proxy.
 *
 * Background job per episode+lang; API returns pending until cached.
 * Server owns WebVTT timings — Gemini only returns `id|translated text` lines.
 */
import { createHash } from 'node:crypto'
import { createError } from 'h3'
import { serverSupabaseServiceRole } from '#supabase/server'
import { AI_CAPTION_LANGS, CAPTION_EN, aiCaptionLang, trackMatchesAiLang } from '#shared/utils/aiCaptions'
import { getProvider } from '~~/server/lib/videoProviders'
import { completeAiChat } from '~~/server/utils/aiAgent'
import { moduleLogger } from '~~/server/utils/logger'
import { openMediaProxy } from '~~/server/utils/mediaTokens'
import { absoluteMediaUrl, videoUpstreamHeaders } from '~~/server/utils/videoUpstream'

const TABLE = 'caption_translations'
const TTL_MS = 365 * 24 * 60 * 60 * 1000
const TRANSLATOR_VERSION = 4 // line format id|text
const CHUNK = 30
const AI_MIN_INTERVAL_MS = 6_500 // shared free-tier pacing (~10 RPM)
const AI_BUSY_ATTEMPTS = 2
const MAX_RETRY_DELAY_MS = 60_000
const USER_GEN_LIMIT = 20
const USER_GEN_WINDOW_MS = 60 * 60 * 1000
const FAIL_COOLDOWN_MS = 60_000

const log = moduleLogger('caption-translate')
const inflight = new Map()
const failures = new Map()
const userGenAt = new Map()
let nextAiSlot = 0

const sha = (t) => createHash('sha256').update(String(t || '')).digest('hex')
const alive = (exp) => !exp || Date.parse(exp) > Date.now()
const fail = (statusCode, statusMessage, message) => createError({ statusCode, statusMessage, message })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const preview = (s) => String(s || '').replace(/\s+/g, ' ').slice(0, 160)

function isTimeoutErr(err) {
    return err?.name === 'TimeoutError' || err?.code === 23 || /timed? out/i.test(String(err?.message || ''))
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
        return !list.some((c) => trackMatchesAiLang(c, def))
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

/** Encode cues as stable `id|text` lines (`\n` in text → `\\n`). */
function encodeLines(items) {
    return items.map((x) => `${x.id}|${String(x.text).replace(/\n/g, '\\n')}`).join('\n')
}

/** Parse `id|text` lines; incomplete trailing line is ignored (truncation-safe). */
function parseLines(raw, validIds) {
    const out = new Map()
    for (const line of String(raw || '').split(/\n/)) {
        const m = line.match(/^(\d+)\|(.*)$/)
        if (!m) continue
        const id = Number(m[1])
        if (!validIds.has(id) || out.has(id)) continue
        out.set(id, m[2].replace(/\\n/g, '\n'))
    }
    return out
}

async function waitAiSlot() {
    const now = Date.now()
    const at = Math.max(now, nextAiSlot)
    nextAiSlot = at + AI_MIN_INTERVAL_MS
    if (at > now) await sleep(at - now)
}

function retryDelayMs(err, attempt) {
    const hint = JSON.stringify(err?.data ?? '').match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/)
    return hint ? Math.ceil(Number(hint[1]) * 1000) : 5_000 * 2 ** (attempt - 1)
}

function userFacingAiError(err) {
    if (isTimeoutErr(err)) return fail(503, 'AI provider timeout', 'AI 服務逾時，請稍後再試。')
    if (err?.statusCode === 429) return fail(429, 'AI rate limited', 'AI 服務忙碌中，請稍後再試。')
    if (err?.statusCode === 503) return fail(503, 'AI unavailable', 'AI 服務暫時無法使用，請稍後再試。')
    return fail(502, 'AI provider error', err?.message || 'AI 字幕產生失敗。')
}

/** One Gemini call → Map<id, text>. Retries only busy/timeout. */
async function translateIds(items, { promptName, ...meta }) {
    const validIds = new Set(items.map((x) => x.id))
    const messages = [
        {
            role: 'system',
            content:
                `Translate anime subtitle cues to ${promptName || 'the target language'}. `
                + 'Each input line is `id|text`. Reply with the same lines: `id|translated`. '
                + 'Keep every id, even when texts repeat. Use \\n for line breaks inside a cue. '
                + 'Translate questions, never answer them. No extra commentary.',
        },
        { role: 'user', content: encodeLines(items) },
    ]

    let useThinking = true
    async function callAi() {
        try {
            return await completeAiChat({
                messages,
                ...(useThinking ? { reasoningEffort: 'low' } : {}),
            })
        } catch (err) {
            if (err?.statusCode === 400 && useThinking) {
                useThinking = false
                return callAi()
            }
            throw err
        }
    }

    let lastErr = null
    for (let attempt = 1; attempt <= AI_BUSY_ATTEMPTS; attempt++) {
        await waitAiSlot()
        try {
            const data = await callAi()
            const map = parseLines(data?.choices?.[0]?.message?.content, validIds)
            if (map.size) {
                if (map.size < validIds.size) {
                    log.warn({ ...meta, got: map.size, want: validIds.size }, 'AI caption partial ok')
                }
                return map
            }
            // Don't retry empty — missing-id pass / source fallback handles it.
            log.warn({ ...meta, attempt, preview: preview(data?.choices?.[0]?.message?.content) }, 'AI caption empty parse')
            return new Map()
        } catch (err) {
            lastErr = err
            const status = isTimeoutErr(err) ? 408 : err?.statusCode || 0
            const waitMs = retryDelayMs(err, attempt)
            const busy = status === 408 || status === 429 || status === 503
            if (!busy || attempt >= AI_BUSY_ATTEMPTS || waitMs > MAX_RETRY_DELAY_MS) {
                log.warn({ ...meta, err, status, attempt }, 'AI caption call failed')
                throw userFacingAiError(err)
            }
            nextAiSlot = Math.max(nextAiSlot, Date.now() + waitMs)
            log.warn({ ...meta, status, attempt, waitMs }, 'AI caption retrying')
        }
    }
    throw userFacingAiError(lastErr)
}

/** Translate a chunk; one follow-up for missing ids. Gaps keep source text (timings safe). */
async function translateChunk(bodies, meta) {
    const out = bodies.map((t) => (t.trim() ? undefined : t))
    let pending = bodies.map((text, id) => ({ id, text })).filter((x) => out[x.id] === undefined)

    for (let pass = 1; pass <= 2 && pending.length; pass++) {
        const map = await translateIds(pending, { ...meta, pass })
        for (const { id } of pending) {
            if (map.has(id)) out[id] = map.get(id)
        }
        pending = pending.filter((x) => out[x.id] === undefined)
        if (pending.length) log.warn({ ...meta, pass, missing: pending.length }, 'AI caption missing ids')
        if (pass === 1 && map.size < Math.ceil(bodies.length * 0.3)) break
    }

    const got = out.filter((t) => t != null).length
    if (got < Math.ceil(bodies.length * 0.5)) {
        throw fail(502, 'AI caption bad format', 'AI 字幕回傳格式錯誤。')
    }
    return out.map((t, i) => t ?? bodies[i])
}

async function translateVtt(sourceVtt, meta) {
    const parsed = parseVtt(sourceVtt)
    if (!parsed) throw fail(502, 'Caption parse failed', '原始字幕格式錯誤。')

    const chunks = Math.ceil(parsed.cues.length / CHUNK)
    log.info({ ...meta, cues: parsed.cues.length, chunks, chunkSize: CHUNK }, 'AI caption translate start')
    const bodies = []
    for (let i = 0; i < parsed.cues.length; i += CHUNK) {
        bodies.push(...await translateChunk(
            parsed.cues.slice(i, i + CHUNK).map((c) => c.body),
            { ...meta, chunk: i / CHUNK + 1, chunks },
        ))
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
            source_lang: sourceLang || CAPTION_EN.srclang,
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

/** Cached → ready; else start/join job and return pending (client polls). */
export async function generateAiCaption(event, {
    source,
    sourceId,
    episode,
    sourceSrc,
    sourceLang = CAPTION_EN.srclang,
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
    if (inflight.has(jobKey)) return pending

    const failed = failures.get(jobKey)
    if (failed && failed.until > Date.now()) throw failed.error
    failures.delete(jobKey)
    claimUserQuota(userId)

    const work = runJob(client, { media, sourceId: job.sourceId, ep: job.ep, sourceLang, langDef })
        .catch((err) => {
            log.warn({ err, ...job }, 'AI caption failed')
            failures.set(jobKey, {
                until: Date.now() + FAIL_COOLDOWN_MS,
                error: err?.statusCode ? err : fail(502, 'Caption generate failed', 'AI 字幕產生失敗。'),
            })
        })
        .finally(() => inflight.delete(jobKey))
    inflight.set(jobKey, work)
    return pending
}
