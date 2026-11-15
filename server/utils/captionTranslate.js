/**
 * On-demand AI captions (provider `aiCaptions`).
 * Cached per source_id + episode + lang (~1y). Source VTT via sealed download-proxy.
 *
 * Background job per episode+lang; polls get `{ status:'pending', caption? }` (partial VTT)
 * then `{ status:'ready', caption }`. Server owns timings — model returns `id|text` lines.
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
const TRANSLATOR_VERSION = 5
const CHUNK = 30
const CHUNK_PASSES = 3
const AI_MIN_INTERVAL_MS = 6_500
const AI_BUSY_ATTEMPTS = 2
const MAX_RETRY_DELAY_MS = 60_000
const USER_GEN_LIMIT = 20
const USER_GEN_WINDOW_MS = 60 * 60 * 1000
const FAIL_COOLDOWN_MS = 60_000

const log = moduleLogger('caption-translate')
const inflight = new Map()
const partials = new Map() // jobKey → progressive VTT
const failures = new Map()
const userGenAt = new Map()
let nextAiSlot = 0

const sha = (t) => createHash('sha256').update(String(t || '')).digest('hex')
const cacheKey = (vtt) => `v${TRANSLATOR_VERSION}:${sha(vtt)}`
const alive = (exp) => !exp || Date.parse(exp) > Date.now()
const fail = (statusCode, statusMessage, message) => createError({ statusCode, statusMessage, message })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const preview = (s) => String(s || '').replace(/\s+/g, ' ').slice(0, 160)
const plain = (s) => String(s || '').replace(/<\/?[^>]+>/g, '').replace(/\s+/g, ' ').trim()
const isTimeoutErr = (err) =>
    err?.name === 'TimeoutError' || err?.code === 23 || /timed? out/i.test(String(err?.message || ''))

function captionOut(langDef, vttText) {
    return { srclang: langDef.srclang, label: langDef.label, vttText }
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

function encodeLines(items) {
    return items.map((x) => `${x.id}|${String(x.text).replace(/\n/g, '\\n')}`).join('\n')
}

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

/** SFX / empty — skip language checks. Standalone "I"/"A" are real words. */
function isNonlinguistic(text) {
    const t = plain(text)
    if (!t || /^[IA]$/i.test(t)) return !t
    return t.replace(/[^A-Za-z0-9\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g, '').length <= 1
}

function postProcess(text, langDef) {
    let out = String(text || '')
    for (const [re, to] of langDef?.postReplace || []) out = out.replace(re, to)
    return out
}

/** Uses langDef.okScript / badScripts — no per-language branches here. */
function looksUntranslated(text, source, langDef) {
    if (!langDef?.okScript) return false
    const t = plain(text)
    if (!t || isNonlinguistic(t)) return false
    if ((langDef.badScripts || []).some((re) => re.test(t))) return true
    if (langDef.okScript.test(t)) return false
    if (/[A-Za-z]/.test(t)) return true
    const src = plain(source)
    return Boolean(src && t === src)
}

function systemPrompt(langDef, repair) {
    const target = langDef?.promptName || 'the target language'
    const head = repair
        ? `These cues are still NOT in ${target}. Rewrite each fully into ${target} only.`
        : `Translate every anime subtitle cue fully into ${target}.`
    const hint = langDef?.promptHint ? ` ${langDef.promptHint}` : ''
    return (
        `${head} No Japanese, English, Korean, or mixed leftovers.${hint} `
        + 'Input/output lines: `id|text`. Keep every id. Use \\n for cue line breaks. '
        + 'Translate questions, never answer them. No commentary.'
    )
}

async function translateIds(items, { langDef, repair = false, ...meta }) {
    const validIds = new Set(items.map((x) => x.id))
    const messages = [
        { role: 'system', content: systemPrompt(langDef, repair) },
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

/** Translate one chunk; retry missing / wrong-language ids. Unresolved keep source. */
async function translateChunk(bodies, meta) {
    const langDef = aiCaptionLang(meta?.targetLang)
    const out = bodies.map((t) => (t.trim() ? undefined : t))
    let pending = bodies.map((text, id) => ({ id, text })).filter((x) => out[x.id] === undefined)

    for (let pass = 1; pass <= CHUNK_PASSES && pending.length; pass++) {
        const map = await translateIds(pending, { ...meta, langDef, pass, repair: pass > 1 })
        for (const { id } of pending) {
            if (!map.has(id)) continue
            const text = postProcess(map.get(id), langDef)
            if (!looksUntranslated(text, bodies[id], langDef)) out[id] = text
        }
        pending = bodies
            .map((text, id) => ({ id, text }))
            .filter(({ id, text }) => text.trim() && (out[id] === undefined || looksUntranslated(out[id], text, langDef)))
        if (pending.length) log.warn({ ...meta, pass, pending: pending.length }, 'AI caption retry wrong/missing lang')
        if (pass === 1 && map.size === 0) break
    }

    const got = out.filter((t) => t != null).length
    if (got < Math.ceil(bodies.length * 0.5)) {
        throw fail(502, 'AI caption bad format', 'AI 字幕回傳格式錯誤。')
    }
    return out.map((t, i) => t ?? bodies[i])
}

async function translateVtt(sourceVtt, meta, onPartial) {
    const parsed = parseVtt(sourceVtt)
    if (!parsed) throw fail(502, 'Caption parse failed', '原始字幕格式錯誤。')

    const chunks = Math.ceil(parsed.cues.length / CHUNK)
    log.info({ ...meta, cues: parsed.cues.length, chunks, chunkSize: CHUNK }, 'AI caption translate start')
    const bodies = parsed.cues.map((c) => c.body)
    for (let i = 0; i < parsed.cues.length; i += CHUNK) {
        const slice = await translateChunk(
            parsed.cues.slice(i, i + CHUNK).map((c) => c.body),
            { ...meta, chunk: i / CHUNK + 1, chunks },
        )
        for (let j = 0; j < slice.length; j++) bodies[i + j] = slice[j]
        onPartial?.(buildVtt(parsed, bodies))
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
        .select('expires_at, vtt_text, source_vtt_hash')
        .eq('source_id', sourceId)
        .eq('episode_number', ep)
        .eq('target_lang', lang)
        .maybeSingle()
    if (!data?.vtt_text || !alive(data.expires_at)) return null
    if (!String(data.source_vtt_hash || '').startsWith(`v${TRANSLATOR_VERSION}:`)) return null
    return data.vtt_text
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

async function runJob(client, { media, sourceId, ep, sourceLang, langDef, jobKey }) {
    const meta = { sourceId, episode: ep, targetLang: langDef.srclang, promptName: langDef.promptName }
    const sourceVtt = await fetchVtt(media.url, media.cookie, media.referer, meta)
    if (!sourceVtt) throw fail(502, 'Caption source fetch failed', '無法取得原始字幕。')

    const vttText = await translateVtt(sourceVtt, meta, (partial) => {
        if (jobKey) partials.set(jobKey, partial)
    })
    const { error } = await client.from(TABLE).upsert(
        {
            source_id: sourceId,
            episode_number: ep,
            source_lang: sourceLang || CAPTION_EN.srclang,
            target_lang: langDef.srclang,
            source_vtt_hash: cacheKey(sourceVtt),
            vtt_text: vttText,
            expires_at: new Date(Date.now() + TTL_MS).toISOString(),
        },
        { onConflict: 'source_id,episode_number,target_lang' },
    )
    if (error) {
        log.warn({ err: error, ...meta }, 'caption upsert failed')
        throw fail(500, 'Caption save failed', '無法儲存翻譯字幕。')
    }
    if (jobKey) partials.delete(jobKey)
    log.info(meta, 'AI caption saved')
}

function pendingResult(langDef, jobKey) {
    const vttText = partials.get(jobKey)
    return vttText
        ? { status: 'pending', caption: captionOut(langDef, vttText) }
        : { status: 'pending' }
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

    if (inflight.has(jobKey)) return pendingResult(langDef, jobKey)

    const client = await serverSupabaseServiceRole(event)
    const cached = await readCachedVtt(client, job)
    if (cached) {
        partials.delete(jobKey)
        return { status: 'ready', caption: captionOut(langDef, cached) }
    }
    if (inflight.has(jobKey)) return pendingResult(langDef, jobKey)

    const failed = failures.get(jobKey)
    if (failed && failed.until > Date.now()) throw failed.error
    failures.delete(jobKey)
    claimUserQuota(userId)

    const work = runJob(client, { media, sourceId: job.sourceId, ep: job.ep, sourceLang, langDef, jobKey })
        .catch((err) => {
            log.warn({ err, ...job }, 'AI caption failed')
            partials.delete(jobKey)
            failures.set(jobKey, {
                until: Date.now() + FAIL_COOLDOWN_MS,
                error: err?.statusCode ? err : fail(502, 'Caption generate failed', 'AI 字幕產生失敗。'),
            })
        })
        .finally(() => inflight.delete(jobKey))
    inflight.set(jobKey, work)
    return pendingResult(langDef, jobKey)
}
