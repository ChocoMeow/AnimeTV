import { createRequestId, getRequestLogger } from '~~/server/utils/logger'

const SKIP = ['/_nuxt', '/icons', '/__nuxt', '/_ipx']
const STATIC = /\.(ico|png|jpe?g|gif|svg|webp|css|js|mjs|map|woff2?|ttf|eot|txt|xml)$/i

export default defineEventHandler((event) => {
    const incoming = getRequestHeader(event, 'x-request-id')
    const requestId = incoming && /^[\w.-]{8,128}$/.test(incoming) ? incoming : createRequestId()
    event.context.requestId = requestId
    setResponseHeader(event, 'x-request-id', requestId)

    const path = event.path || event.node?.req?.url || ''
    const bare = path.split('?')[0]
    if (!bare || SKIP.some((p) => bare.startsWith(p)) || STATIC.test(bare)) return

    const started = Date.now()
    event.node.res.on('finish', () => {
        getRequestLogger(event).info(
            {
                method: event.method || event.node?.req?.method || 'GET',
                statusCode: event.node.res.statusCode,
                durationMs: Date.now() - started,
            },
            'request completed'
        )
    })
})
