import { join } from 'node:path'
import { createError } from 'h3'
import pino from 'pino'

const LOG_DIR = 'logs'
const LEVELS = new Set(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
const REDACT = [
    'req.headers.authorization',
    'req.headers.cookie',
    'headers.authorization',
    'headers.cookie',
    'authorization',
    'cookie',
    'accessToken',
    'password',
    'token',
    '*.authorization',
    '*.cookie',
    '*.accessToken',
    '*.password',
    '*.token',
]

let root = null
let ready = null

const isProd = () => process.env.NODE_ENV === 'production'
const env = (key) => {
    const v = process.env[key]
    return v != null && String(v).trim() !== '' ? String(v).trim() : undefined
}
const bool = (value, fallback) => {
    if (value === undefined || value === null || value === '') return fallback
    if (typeof value === 'boolean') return value
    const s = String(value).trim().toLowerCase()
    if (['1', 'true', 'yes', 'on'].includes(s)) return true
    if (['0', 'false', 'no', 'off'].includes(s)) return false
    return fallback
}
const shortId = () => `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`

export const createRequestId = () => `req_${shortId()}`
export const createErrorId = () => `err_${shortId()}`

/** @param {{ logLevel?: string, logMaxDays?: number|string, logToFile?: boolean|string }} [overrides] */
export function resolveLogConfig(overrides = {}) {
    const raw = String(overrides.logLevel || env('NUXT_LOG_LEVEL') || '').toLowerCase()
    const level = LEVELS.has(raw) ? raw : isProd() ? 'info' : 'debug'
    const maxDays = Math.max(1, Number.parseInt(String(overrides.logMaxDays ?? env('NUXT_LOG_MAX_DAYS') ?? 30), 10) || 30)
    const toFile = bool(overrides.logToFile ?? env('NUXT_LOG_TO_FILE'), true)
    return { level, maxDays, toFile, pretty: !isProd() }
}

function pinoOpts(level) {
    return {
        level,
        base: { service: 'animetv' },
        redact: { paths: REDACT, censor: '[Redacted]' },
        serializers: { err: pino.stdSerializers.err, error: pino.stdSerializers.err },
    }
}

async function buildStreams(level, maxDays, pretty, toFile) {
    const streams = [{ level, stream: process.stdout }]

    if (pretty) {
        try {
            const prettyFactory = (await import('pino-pretty')).default
            streams[0] = {
                level,
                stream: prettyFactory({
                    colorize: true,
                    translateTime: 'SYS:standard',
                    ignore: 'pid,hostname,service',
                }),
            }
        } catch {
            /* keep raw stdout */
        }
    }

    if (toFile) {
        try {
            const roll = (await import('pino-roll')).default
            streams.push({
                level,
                stream: await roll({
                    file: join(LOG_DIR, 'app'),
                    frequency: 'daily',
                    mkdir: true,
                    extension: '.log',
                    dateFormat: 'yyyy-MM-dd',
                    limit: { count: Math.max(1, maxDays - 1), removeOtherLogFiles: true },
                }),
            })
        } catch (err) {
            pino(pinoOpts(level)).warn({ err }, 'log file sink unavailable')
        }
    }

    return streams
}

/** @param {{ logLevel?: string, logMaxDays?: number|string, logToFile?: boolean|string }} [overrides] */
export async function initLogger(overrides = {}) {
    if (root?.__ready) return root
    if (ready) return ready

    ready = (async () => {
        const { level, maxDays, pretty, toFile } = resolveLogConfig(overrides)
        const streams = await buildStreams(level, maxDays, pretty, toFile)
        root = pino(pinoOpts(level), streams.length > 1 ? pino.multistream(streams) : streams[0].stream)
        root.__ready = true
        root.info({ logLevel: level, logMaxDays: maxDays, logToFile: toFile }, 'Logger initialized')
        return root
    })().catch((err) => {
        ready = null
        root = pino(pinoOpts(resolveLogConfig().level))
        root.warn({ err }, 'Logger init failed; using stdout fallback')
        return root
    })

    return ready
}

export function getLogger() {
    if (root?.__ready) return root
    if (!root) {
        root = pino(pinoOpts(resolveLogConfig().level))
        initLogger().catch(() => {})
    }
    return root
}

export const childLogger = (bindings = {}) => getLogger().child(bindings)

/** Lazy module logger — always uses the current root (safe before/after init). */
export function moduleLogger(module, extra = {}) {
    const bindings = { module, ...extra }
    return new Proxy(
        {},
        {
            get(_, prop) {
                if (prop === 'child') return (more = {}) => getLogger().child({ ...bindings, ...more })
                const log = getLogger().child(bindings)
                const value = log[prop]
                return typeof value === 'function' ? value.bind(log) : value
            },
        }
    )
}

export function getRequestLogger(event) {
    const raw = event?.path || event?.node?.req?.url
    const path = raw ? String(raw).split('?')[0] : undefined
    const userId = event?.context?.user?.id || event?.context?.user?.sub
    return childLogger({
        ...(event?.context?.requestId && { requestId: event.context.requestId }),
        ...(path && { path }),
        ...(userId && { userId }),
    })
}

const forEvent = (event) => (event ? getRequestLogger(event) : getLogger())

export function logError(event, err, context = {}) {
    const errorId = context.errorId || createErrorId()
    const { errorId: _drop, ...rest } = context
    forEvent(event).error(
        { errorId, ...rest, err, statusCode: err?.statusCode || err?.status },
        err?.message || String(err) || 'Error'
    )
    return { errorId }
}

export function createLoggedError(event, opts = {}) {
    const statusCode = opts.statusCode ?? 500
    const statusMessage = opts.statusMessage ?? 'Internal Server Error'
    const errorId = createErrorId()
    forEvent(event).error(
        { errorId, ...opts.context, err: opts.err, statusCode },
        opts.message || statusMessage || opts.err?.message || 'Request failed'
    )
    return createError({
        statusCode,
        statusMessage,
        message: opts.message || statusMessage,
        data: { ...opts.data, errorId },
    })
}
