import { createEventStream } from 'h3'
import {
    AI_CHAT_LIMITS,
    isChatOverLimit,
    logAiError,
    measureChatChars,
    normalizeChatMessages,
    requireAiConfig,
    runChatAgent,
    throwChatTooLong,
} from '~~/server/utils/aiAgent'

export default defineEventHandler(async (event) => {
    const config = useRuntimeConfig(event)

    try {
        requireAiConfig(config)
    } catch (error) {
        const safe = logAiError(error, { path: '/api/ai/chat', stage: 'config' })
        throw createError({
            statusCode: 500,
            statusMessage: 'AI config error',
            message: safe.message,
            data: { errorId: safe.errorId },
        })
    }

    const user = await authUser(event)
    const userId = user.id || user.sub
    const body = await readBody(event)
    const rawMessages = Array.isArray(body?.messages) ? body.messages : []
    if (measureChatChars(rawMessages) > AI_CHAT_LIMITS.maxRawChars) throwChatTooLong()

    const userMessages = normalizeChatMessages(rawMessages)
    if (!userMessages.length) {
        throw createError({ statusCode: 400, statusMessage: 'Bad request', message: '缺少有效的使用者訊息。' })
    }
    if (isChatOverLimit(userMessages)) throwChatTooLong()

    const stream = createEventStream(event)
    const send = async (payload) => stream.push(JSON.stringify(payload))

    ;(async () => {
        try {
            await runChatAgent({ event, config, userId, userMessages, send })
        } catch (error) {
            const safe = logAiError(error, { path: '/api/ai/chat', userId, stage: 'agent' })
            await send({ type: 'error', message: safe.message, errorId: safe.errorId })
        } finally {
            await stream.close()
        }
    })()

    return stream.send()
})
