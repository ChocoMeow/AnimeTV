import { initLogger, logError } from '~~/server/utils/logger'

export default defineNitroPlugin(async (nitroApp) => {
    const { logLevel, logMaxDays, logToFile } = useRuntimeConfig()
    await initLogger({ logLevel, logMaxDays, logToFile })

    nitroApp.hooks.hook('error', (error, { event } = {}) => {
        if (error?.data?.errorId) return
        const status = error?.statusCode || error?.status
        // 4xx already show up on the request-completed line; skip ERROR stack spam
        if (typeof status === 'number' && status >= 400 && status < 500) return

        const { errorId } = logError(event, error, { stage: 'unhandled' })
        if (event?.context) event.context.lastErrorId = errorId
        if (error && typeof error === 'object') {
            error.data = { ...(error.data || {}), errorId }
        }
    })
})
