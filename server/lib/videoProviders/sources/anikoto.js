/**
 * AniKoto source plugin — self-contained (list + MegaPlay HLS resolve).
 * Inspired by https://github.com/walterwhite-69/Anivexa-API
 *
 * Admin video_id: watch slug, optional :sub / :dub —
 * e.g. `frieren-beyond-journeys-end` or `frieren-beyond-journeys-end:dub`.
 */
import crypto from 'node:crypto'
import vm from 'node:vm'
import { getRequestLogger } from '~~/server/utils/logger'
import {
    decodePrefixedToken,
    encodePrefixedToken,
    episodeRecord,
    normalizeEpisodeId,
} from '../helpers'

const ID = 'anikoto'
const TOKEN_PREFIX = 'anikoto.'
const DEFAULT_AUDIO = 'sub'
const SITE = 'https://anikoto.cz'
const MAPPER = 'https://mapper.nekostream.site/api/mal'
const SPOOF_REF = 'https://hianimes.re/'
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

/** Short TTL caches — MegaPlay scrape is expensive; reuse across play / download. */
const SHOW_TTL_MS = 10 * 60 * 1000
const PLAYBACK_TTL_MS = 5 * 60 * 1000
const SCRIPT_TTL_MS = 30 * 60 * 1000

function createTtlCache(ttlMs, max = 80) {
    const map = new Map()
    return {
        async getOrSet(key, factory) {
            const now = Date.now()
            const hit = map.get(key)
            if (hit?.expires > now) return hit.value
            if (hit?.inflight) return hit.inflight
            const inflight = Promise.resolve()
                .then(factory)
                .then((value) => {
                    map.set(key, { expires: Date.now() + ttlMs, value })
                    while (map.size > max) map.delete(map.keys().next().value)
                    return value
                })
                .catch((err) => {
                    map.delete(key)
                    throw err
                })
            map.set(key, { expires: 0, inflight })
            return inflight
        },
    }
}

const showCache = createTtlCache(SHOW_TTL_MS)
const playbackCache = createTtlCache(PLAYBACK_TTL_MS)
const megaScriptCache = createTtlCache(SCRIPT_TTL_MS)

const ANIKOTO = Object.freeze({
    id: ID,
    tokenPrefix: TOKEN_PREFIX,
    referer: `${SITE}/`,
    hostMatchers: Object.freeze([
        'anikototv.to',
        'anikoto.cz',
        'megaplay',
        'megacloud',
        'hianimes',
        'anih1',
    ]),
})

/* ─── MegaPlay ─────────────────────────────────────────────────────── */

function decodeScriptString(value) {
    return value.replace(/\\u([\dA-Fa-f]{4})|\\x([\dA-Fa-f]{2})|\\([\\'"bnfrtv0])/g, (_, unicode, hex, escaped) => {
        if (unicode) return String.fromCharCode(Number.parseInt(unicode, 16));
        if (hex) return String.fromCharCode(Number.parseInt(hex, 16));
        return { b: "\b", n: "\n", f: "\f", r: "\r", t: "\t", v: "\v", 0: "\0" }[escaped] ?? escaped;
    });
}

function getScriptStrings(script) {
    const strings = [];
    let index = 0;
    let previous = "";
    while (index < script.length) {
        const char = script[index];
        if (char === "/" && script[index + 1] === "/") {
            index = script.indexOf("\n", index + 2);
            if (index < 0) break;
            continue;
        }
        if (char === "/" && script[index + 1] === "*") {
            index = script.indexOf("*/", index + 2);
            if (index < 0) break;
            index += 2;
            continue;
        }
        if (char === "/" && /[=(:,[!&|?{};]/.test(previous)) {
            index++;
            let inClass = false;
            while (index < script.length) {
                if (script[index] === "\\") {
                    index += 2;
                    continue;
                }
                if (script[index] === "[") inClass = true;
                if (script[index] === "]") inClass = false;
                if (script[index] === "/" && !inClass) {
                    index++;
                    while (/[a-z]/i.test(script[index] ?? "")) index++;
                    break;
                }
                index++;
            }
            continue;
        }
        if (char === "'" || char === '"') {
            const quote = char;
            let value = "";
            index++;
            while (index < script.length && script[index] !== quote) {
                if (script[index] === "\\" && index + 1 < script.length) value += script[index++];
                value += script[index++];
            }
            strings.push(decodeScriptString(value));
            index++;
            continue;
        }
        if (char === "`") {
            index++;
            while (index < script.length && script[index] !== "`") index += script[index] === "\\" ? 2 : 1;
            index++;
            continue;
        }
        if (!/\s/.test(char)) previous = char;
        index++;
    }
    return [...new Set(strings)];
}

function getMegaPlayRoutes(script) {
    const routes = getScriptStrings(script)
        .filter((value) => /^stream\/getSources[\w/-]*$/i.test(value))
        .sort((left, right) => left.length - right.length);
    const legacy = routes[0] ?? null;
    const modern = routes.find((route) => route !== legacy && route.startsWith(legacy)) ?? null;
    return { legacy, modern };
}

function decryptMegaPlaySource(value, script) {
    if (!value) return null;
    const encrypted = Buffer.from(value, "base64url");
    if (!encrypted.length || encrypted.length % 16) return null;
    const values = getScriptStrings(script).filter((item) => Buffer.byteLength(item) > 0 && Buffer.byteLength(item) <= 32);
    const ivs = values.filter((item) => Buffer.byteLength(item) === 16);
    for (const keyValue of values) {
        const key = Buffer.alloc(32);
        Buffer.from(keyValue).copy(key);
        for (const ivValue of ivs) {
            try {
                const decipher = crypto.createDecipheriv("aes-256-cbc", key, Buffer.from(ivValue));
                const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
                const data = JSON.parse(decrypted.toString("utf8"));
                const source = data?.file ?? data?.url ?? data?.sources?.file ?? data?.sources?.[0]?.file;
                if (typeof source === "string" && source) return source;
            } catch { }
        }
    }
    return null;
}

function getMegaPlaySigningKey(script) {
    const objectName = script.match(/\blet\s+([A-Za-z_$][\w$]*)\s*;\s*!\s*function\s*\(\)\s*\{/i)?.[1];
    const entry = script.match(/\bconst\s+[A-Za-z_$][\w$]*\s*=\s*new URLSearchParams\b/);
    if (!objectName || !entry) return null;

    const encoderIndex = script.indexOf("new TextEncoder();return");
    if (encoderIndex < 0) return null;

    const keyVar = script
        .slice(encoderIndex, encoderIndex + 1600)
        .match(/new TextEncoder\(\);return[\s\S]{0,1200}?\]\(([A-Za-z_$][\w$]*)\),\{/i)?.[1];
    if (!keyVar) return null;

    const keyExpression = script.match(
        new RegExp(`(?:const|let|var)\\s+${keyVar}\\s*=\\s*(${objectName}\\.[A-Za-z_$][\\w$]*\\(\\d+\\))`)
    )?.[1];
    if (!keyExpression) return null;

    try {
        const context = { console, decodeURI, encodeURI, Math, String, Array, Object, RegExp, Error, SyntaxError };
        context.globalThis = context;
        vm.runInNewContext(
            `${script.slice(0, entry.index)};globalThis.__megaPlaySigningKey=${keyExpression};`,
            context,
            { timeout: 5000 }
        );
        return typeof context.__megaPlaySigningKey === "string" ? context.__megaPlaySigningKey : null;
    } catch {
        return null;
    }
}

function signMegaPlayUrl(value, signingKey) {
    if (!value || !signingKey || /[?&]token=/i.test(value)) return value;
    const match = String(value).match(/\/([a-f0-9]{32})\/([a-f0-9]{32})\//i);
    if (!match) return value;

    const pathKey = `${match[1].toLowerCase()}/${match[2].toLowerCase()}`;
    const payload = `${Math.floor(Date.now() / 1000) + 90}|${pathKey}`;
    const signature = crypto.createHmac("sha256", signingKey).update(payload).digest("base64url");
    const token = `${Buffer.from(payload).toString("base64url")}.${signature}`;
    const endpoint = new URL(value);
    endpoint.searchParams.set("token", token);
    return endpoint.href;
}

function buildSourceUrl(origin, path, fileId, cdnHint) {
    const endpoint = new URL(path, origin);
    endpoint.searchParams.append("id", fileId);
    endpoint.searchParams.append("id", fileId);
    // AniKoto embeds pass ?s=tcdn|bcdn — without it MegaPlay omits thumbnail tracks.
    if (cdnHint) endpoint.searchParams.set("s", cdnHint);
    return endpoint;
}

async function fetchText(fetchImpl, url, headers) {
    const response = await fetchImpl(url, { headers });
    if (!response.ok) throw new Error(`MegaPlay HTTP ${response.status}: ${url}`);
    return response.text();
}

async function fetchJson(fetchImpl, url, headers) {
    const response = await fetchImpl(url, { headers });
    if (!response.ok) throw new Error(`MegaPlay HTTP ${response.status}: ${url}`);
    return response.json();
}

async function extractMegaPlayDetails(embedUrl, { fetchImpl = fetch, userAgent = UA, referer } = {}) {
    const pageUrl = new URL(String(embedUrl));
    const cdnHint = (pageUrl.searchParams.get("s") || "").replace(/[^a-z0-9_-]/gi, "") || "tcdn";
    const pageHeaders = {
        "User-Agent": userAgent,
        "Accept": "text/html,*/*",
        "Referer": referer ?? `${pageUrl.origin}/`,
    };
    const pageHtml = await fetchText(fetchImpl, pageUrl, pageHeaders);
    const fileId = pageHtml.match(/data-id=["']([^"']+)["']/i)?.[1];
    if (!fileId) throw new Error(`MegaPlay file id not found: ${embedUrl}`);
    const { script, signingScript } = await megaScriptCache.getOrSet(pageUrl.origin, async () => {
        const scriptUrls = [...pageHtml.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)]
            .map((match) => new URL(match[1], pageUrl).href);
        const scripts = await Promise.all(scriptUrls.map(async (url) => {
            try { return await fetchText(fetchImpl, url, { "User-Agent": userAgent, "Referer": pageUrl.href }); } catch { return null; }
        }));
        const found = scripts.find((value) => value && /getSources/i.test(value) && /AES-CBC/i.test(value));
        const signing = scripts.find((value) => value && value.includes("[a-f0-9]{32}") && value.includes("token="));
        if (!found) throw new Error(`MegaPlay client script not found: ${embedUrl}`);
        return { script: found, signingScript: signing || null };
    });
    const { legacy, modern } = getMegaPlayRoutes(script);
    if (!legacy && !modern) throw new Error(`MegaPlay source routes not found: ${embedUrl}`);
    const sourceHeaders = {
        "User-Agent": userAgent,
        "Accept": "application/json,*/*",
        "Referer": pageUrl.href,
        "X-Requested-With": "XMLHttpRequest",
    };
    const [modernData, legacyData] = await Promise.all([
        modern ? fetchJson(fetchImpl, buildSourceUrl(pageUrl.origin, modern, fileId, cdnHint), sourceHeaders).catch(() => null) : null,
        legacy ? fetchJson(fetchImpl, buildSourceUrl(pageUrl.origin, legacy, fileId, cdnHint), sourceHeaders).catch(() => null) : null,
    ]);
    const signingKey = signingScript ? getMegaPlaySigningKey(signingScript) : null;
    const modernUrl = signMegaPlayUrl(
        modernData?.sources?.file ?? decryptMegaPlaySource(modernData?.enc, script),
        signingKey
    );
    const legacyUrl = signMegaPlayUrl(
        legacyData?.sources?.file ?? decryptMegaPlaySource(legacyData?.enc, script),
        signingKey
    );
    const sources = [
        modernUrl ? { url: modernUrl, variant: "modern" } : null,
        legacyUrl ? { url: legacyUrl, variant: "legacy" } : null,
    ].filter((source, index, all) => source && all.findIndex((candidate) => candidate?.url === source.url) === index);
  if (!sources.length) throw new Error(`MegaPlay response has no sources: ${embedUrl}`);
  // Prefer modern tracks, but keep legacy-only entries (thumbnails sometimes only on one variant).
  const trackMap = new Map();
  for (const t of [...(Array.isArray(modernData?.tracks) ? modernData.tracks : []), ...(Array.isArray(legacyData?.tracks) ? legacyData.tracks : [])]) {
    const key = String(t?.file || t?.url || "");
    if (key && !trackMap.has(key)) trackMap.set(key, t);
  }
  return {
    origin: pageUrl.origin,
    sources,
    tracks: [...trackMap.values()],
  };
}

/* ─── AniKoto site client ──────────────────────────────────────────── */

const LANG_MAP = Object.freeze({
    en: 'en',
    english: 'en',
    ja: 'ja',
    japanese: 'ja',
    fr: 'fr',
    french: 'fr',
    de: 'de',
    german: 'de',
    es: 'es',
    spanish: 'es',
    pt: 'pt',
    portuguese: 'pt',
    tw: 'TW', 'zh-tw': 'TW', 'zh-hant': 'TW', 'zh-hk': 'TW', chinese: 'TW', traditional: 'TW',
})

function decodeEntities(s = '') {
    return s
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
        .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .trim()
}

async function httpGet(url, headers = {}) {
    const res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'text/html,*/*', ...headers },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`)
    return res.text()
}

async function getJSON(url, headers = {}) {
    const res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'application/json,*/*', ...headers },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`)
    return res.json()
}

function parseEpisodeRows(html) {
    const rows = []
    const re = /<a\s+[^>]*data-id="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g
    for (const match of html.matchAll(re)) {
        const tag = match[0]
        const getAttr = (name) => tag.match(new RegExp(`data-${name}="([^"]*)"`))?.[1] ?? ''
        const number = Number.parseInt(getAttr('num'), 10)
        if (!Number.isInteger(number)) continue
        const title = decodeEntities(
            match[2].match(/<span\s+class="d-title"[^>]*>([\s\S]*?)<\/span>/i)?.[1]?.replace(/<[^>]*>/g, '').trim() ?? '',
        )
        rows.push({
            number,
            ids: getAttr('ids'),
            hasSub: getAttr('sub') === '1',
            hasDub: getAttr('dub') === '1',
            malId: Number.parseInt(getAttr('mal'), 10) || null,
            slug: getAttr('slug'),
            timestamp: getAttr('timestamp'),
            title: title || `Episode ${number}`,
        })
    }
    return rows
}

/** Load show episode rows by AniKoto watch slug. */
async function loadShowBySlugUncached(slug) {
    const clean = String(slug || '').trim().replace(/^\/+|\/+$/g, '')
    if (!clean) throw new Error('Missing AniKoto slug')

    const watchHtml = await httpGet(`${SITE}/watch/${clean}`, { Referer: `${SITE}/` })
    const showId = watchHtml.match(/data-id="(\d+)"/)?.[1]
    if (!showId) throw new Error(`AniKoto show id not found for slug: ${clean}`)

    const listJson = await getJSON(`${SITE}/ajax/episode/list/${showId}`, {
        'X-Requested-With': 'XMLHttpRequest',
        Referer: `${SITE}/watch/${clean}`,
    })
    const episodes = parseEpisodeRows(listJson.result || '')
    if (!episodes.length) throw new Error(`No episodes for AniKoto slug: ${clean}`)
    return { slug: clean, showId, episodes }
}

function subtitleTypeFromServerType(typeName) {
    if (typeName === 'hsub') return 'hardsub'
    if (typeName === 'sub') return 'softsub'
    return null
}

function isThumbnailTrack(t) {
    const kind = String(t?.kind || '').toLowerCase()
    const file = String(t?.file || t?.url || '')
    const label = String(t?.label || '').toLowerCase()
    return (
        kind === 'thumbnails'
        || kind === 'thumbnail'
        || label === 'thumbnails'
        || label === 'thumbnail'
        || /thumbnails?\.vtt(?:\?|$)/i.test(file)
    )
}

/** Map MegaPlay track → client caption contract `{ src, label, srclang }`. */
function mapCaptionTrack(t) {
    const file = t?.file || t?.url
    if (!file || typeof file !== 'string') return null
    const label = String(t.label || 'English')
    const langKey = label.toLowerCase().split(' ')[0]
    return { src: file, label, srclang: LANG_MAP[langKey] ?? 'en' }
}

function mapThumbnailTrack(t) {
    const url = t?.file || t?.url
    if (!url || typeof url !== 'string') return null
    return { url }
}

function parseServerListHtml(serverHtml, audio) {
    const serverItems = []
    const typeRe = /<div class="type" data-type="([^"]+)">([\s\S]*?)<\/ul>\s*<\/div>/g
    let typeM
    while ((typeM = typeRe.exec(serverHtml)) !== null) {
        const typeName = typeM[1]
        if (typeName === 'dl') continue
        if (!(typeName === audio || (audio === 'sub' && typeName === 'hsub'))) continue
        for (const li of typeM[2].matchAll(/<li\s+([^>]*data-link-id[^>]*)>([\s\S]*?)<\/li>/g)) {
            const linkId = li[1].match(/data-link-id="([^"]+)"/)?.[1]
            const name = li[2].replace(/<[^>]+>/g, '').trim()
            if (!linkId || /download|kiwi/i.test(name)) continue
            serverItems.push({
                linkId,
                name,
                serverType: typeName,
                subtitleType: subtitleTypeFromServerType(typeName),
            })
        }
    }
    return serverItems
}

function mergeMapperServers(mapperData, audio, serverItems) {
    if (!mapperData) return
    for (const [sKey, sObj] of Object.entries(mapperData)) {
        if (sKey === 'status') continue
        const url = sObj?.[audio]?.url
        if (!url) continue
        serverItems.push({
            linkId: url,
            name: sKey.replace(/[-_]+$/, '').trim(),
            serverType: audio,
            subtitleType: subtitleTypeFromServerType(audio),
        })
    }
}

async function tryServers(serverItems, audio) {
    const streams = []
    const subtitles = []
    const thumbnails = []
    const serverSeen = new Set()
    const subSeen = new Set()
    const thumbSeen = new Set()

    for (const item of serverItems) {
        const serverKey = `${item.name}:${item.subtitleType || item.serverType || audio}`
        if (serverSeen.has(serverKey)) continue
        serverSeen.add(serverKey)

        const resolved = item.linkId.startsWith('http')
            ? { result: { url: item.linkId } }
            : await getJSON(`${SITE}/ajax/server?get=${encodeURIComponent(item.linkId)}`, {
                'X-Requested-With': 'XMLHttpRequest',
                Referer: `${SITE}/`,
            }).catch(() => null)

        const embedUrl = resolved?.result?.url
        if (!embedUrl) continue

        const hlsSources = []
        if (embedUrl.includes('#aHR0c')) {
            const b64 = embedUrl.split('#')[1]
            try {
                const decodedUrl = Buffer.from(b64, 'base64').toString('utf8')
                if (decodedUrl.includes('.m3u8')) hlsSources.push({ url: decodedUrl, variant: null })
            } catch {
                /* ignore */
            }
        }

        let extracted = null
        try {
            extracted = await extractMegaPlayDetails(embedUrl, { userAgent: UA, referer: SPOOF_REF })
        } catch {
            /* try next server */
        }

        const itemSubs = []
        if (extracted?.sources?.length) {
            for (const source of extracted.sources) {
                if (!hlsSources.some((s) => s.url === source.url)) hlsSources.push(source)
            }
            for (const t of extracted.tracks ?? []) {
                if (isThumbnailTrack(t)) {
                    const thumb = mapThumbnailTrack(t)
                    if (thumb?.url && !thumbSeen.has(thumb.url)) {
                        thumbSeen.add(thumb.url)
                        thumbnails.push(thumb)
                    }
                    continue
                }
                const mapped = mapCaptionTrack(t)
                if (!mapped || subSeen.has(mapped.src)) continue
                subSeen.add(mapped.src)
                itemSubs.push(mapped)
                subtitles.push(mapped)
            }
        }

        if (!hlsSources.length) continue

        const referer = extracted?.origin
            ? `${extracted.origin}/`
            : `${new URL(embedUrl).origin}/`

        for (const source of hlsSources) {
            streams.push({
                url: source.url,
                type: 'hls',
                referer,
                subtitles: itemSubs,
                variant: source.variant || null,
            })
        }
        // First working server is enough — avoid scraping every MegaPlay embed.
        break
    }

    streams.sort((a, b) => (a.variant === 'modern' ? 0 : 1) - (b.variant === 'modern' ? 0 : 1))
    return { streams, subtitles, thumbnails }
}

/**
 * Resolve playable HLS (+ captions) for one episode.
 * @param {{ ids: string, audio: 'sub'|'dub', malId?: number|null, slug?: string|null, timestamp?: string|null }} ep
 */
async function resolveEpisodeStreamsUncached(ep) {
    const audio = ep.audio === 'dub' ? 'dub' : 'sub'
    if (!ep?.ids) throw new Error('Missing episode server ids')

    const serverData = await getJSON(`${SITE}/ajax/server/list?servers=${encodeURIComponent(ep.ids)}`, {
        'X-Requested-With': 'XMLHttpRequest',
        Referer: `${SITE}/`,
    }).catch(() => null)

    const serverItems = parseServerListHtml(serverData?.result || '', audio)
    let out = await tryServers(serverItems, audio)
    if (out.streams.length) return out

    // Mapper only as fallback when HTML servers yield nothing.
    if (ep.malId && ep.slug && ep.timestamp) {
        const mapperData = await getJSON(`${MAPPER}/${ep.malId}/${ep.slug}/${ep.timestamp}`, {
            Referer: `${SITE}/`,
        }).catch(() => null)
        mergeMapperServers(mapperData, audio, serverItems)
        out = await tryServers(serverItems, audio)
    }
    return out
}

function loadShowBySlug(slug) {
    const clean = String(slug || '').trim().replace(/^\/+|\/+$/g, '')
    return showCache.getOrSet(clean, () => loadShowBySlugUncached(clean))
}

function resolveEpisodeStreams(ep) {
    const audio = ep.audio === 'dub' ? 'dub' : 'sub'
    const key = [ep.ids, audio, ep.malId || '', ep.slug || '', ep.timestamp || ''].join('|')
    return playbackCache.getOrSet(key, () => resolveEpisodeStreamsUncached(ep))
}

/* ─── Plugin surface ───────────────────────────────────────────────── */

/** `slug` or `slug:sub` / `slug:dub` */
function parseVideoId(videoId) {
    const raw = String(videoId || '').trim().replace(/^\/+|\/+$/g, '')
    if (!raw) return null
    const m = raw.match(/^(.+?)(?::(sub|dub))?$/i)
    if (!m) return null
    const slug = m[1].replace(/^watch\//i, '').trim()
    if (!slug || /[:\s]/.test(slug)) return null
    return { slug, audio: (m[2] || DEFAULT_AUDIO).toLowerCase() }
}

function pickAudio(row, preferred) {
    if (preferred === 'dub' && row.hasDub) return 'dub'
    if (preferred === 'sub' && row.hasSub) return 'sub'
    if (row.hasSub) return 'sub'
    if (row.hasDub) return 'dub'
    return null
}

function mapCaptions(subtitles) {
    const seen = new Set()
    const out = []
    for (const t of subtitles || []) {
        const src = t?.src || t?.url || t?.file
        if (!src || typeof src !== 'string' || seen.has(src)) continue
        seen.add(src)
        out.push({
            src,
            label: String(t.label || t.srclang || 'English'),
            srclang: String(t.srclang || 'en'),
        })
    }
    return out
}

async function listEpisodes(event, videoId) {
    const log = getRequestLogger(event)
    const parsed = parseVideoId(videoId)
    if (!parsed) {
        log.warn({ videoId, source: ID }, 'invalid anikoto video_id')
        return {}
    }

    try {
        const show = await loadShowBySlug(parsed.slug)
        const episodes = {}
        for (const row of show.episodes) {
            const audio = pickAudio(row, parsed.audio)
            if (!audio || !row.ids) continue
            const key = normalizeEpisodeId(String(row.number))
            const token = encodePrefixedToken(TOKEN_PREFIX, [
                show.slug,
                audio,
                String(row.number),
                row.ids,
                String(row.malId || '-'),
                row.slug || '-',
                row.timestamp || '-',
            ])
            episodes[key] = episodeRecord(token)
        }
        return episodes
    } catch (err) {
        log.error({ err, videoId, source: ID }, 'listEpisodes failed')
        return {}
    }
}

function decodeToken(token) {
    const parts = decodePrefixedToken(token, TOKEN_PREFIX, 4)
    if (!parts) return null
    const [slug, audio, ep, ids, malId = '-', epSlug = '-', timestamp = '-'] = parts
    if (!slug || (audio !== 'sub' && audio !== 'dub') || !/^\d+$/.test(ep) || !ids) return null
    const opt = (v) => (!v || v === '-' ? null : v)
    return {
        slug,
        audio,
        ep,
        ids,
        malId: opt(malId) ? Number(malId) || null : null,
        epSlug: opt(epSlug),
        timestamp: opt(timestamp),
    }
}

async function resolvePlayback(payload) {
    const { streams, subtitles, thumbnails } = await resolveEpisodeStreams({
        ids: payload.ids,
        audio: payload.audio,
        malId: payload.malId,
        slug: payload.epSlug,
        timestamp: payload.timestamp,
    })

    const hls = streams
        .filter((s) => s?.type === 'hls' && s.url)
        .sort((a, b) => (a.variant === 'modern' ? 0 : 1) - (b.variant === 'modern' ? 0 : 1))
    const best = hls[0]
    if (!best?.url) throw new Error('No HLS stream from AniKoto')

    const thumbUrl = thumbnails?.find((t) => t?.url)?.url || null

    return {
        s: [{ src: best.url, type: 'hls' }],
        captions: mapCaptions(best.subtitles?.length ? best.subtitles : subtitles),
        thumbnails_vtt_url: thumbUrl,
        videoCookie: '',
        videoReferer: best.referer || `${SITE}/`,
    }
}

export default {
    id: ANIKOTO.id,
    tokenPrefix: ANIKOTO.tokenPrefix,
    referer: ANIKOTO.referer,
    hostMatchers: ANIKOTO.hostMatchers,
    offlineQuality: true,
    /** Core AI-translates missing TW captions and caches in Supabase (~1 year). */
    ensureTwCaptions: true,
    videoIdHelp: 'AniKoto watch slug（網址 /watch/ 後段）；可加 :sub / :dub',
    listEpisodes,
    decodeToken,
    resolvePlayback,
}
