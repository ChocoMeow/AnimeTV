import { applyConfirmedAction, logAiError } from '~~/server/utils/aiAgent'

export default defineEventHandler(async (event) => {
    try {
        const user = await authUser(event)
        const userId = user.id || user.sub
        const body = await readBody(event)
        return await applyConfirmedAction(event, userId, body?.action)
    } catch (error) {
        if (error?.statusCode === 401 || error?.statusCode === 400 || error?.statusCode === 404) {
            throw error
        }
        const safe = logAiError(error, { route: '/api/ai/confirm', userId: event.context?.user?.id })
        throw createError({
            statusCode: 500,
            statusMessage: 'AI confirm failed',
            message: safe.message,
            data: { errorId: safe.errorId },
        })
    }
})
