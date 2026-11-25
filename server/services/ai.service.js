/**
 * Public AI service API — thin re-export so existing imports keep working:
 *   import { ... } from '~~/server/services/ai.service.js'
 */
export {
    AI_CHAT_LIMITS,
    isChatOverLimit,
    logAiError,
    looksLikePromptInjection,
    measureChatChars,
    sanitizeAssistantText,
    sanitizeSettingsUpdates,
    sanitizeToolResult,
    toAnimeCards,
} from '~~/server/services/ai/safety.js'

export {
    applyConfirmedAction,
    pendingFromToolResult,
    runAgentTool,
} from '~~/server/services/ai/tools.js'

export {
    completeAiChat,
    getSystemPrompt,
    normalizeChatMessages,
    requireAiConfig,
    runChatAgent,
    throwChatTooLong,
} from '~~/server/services/ai/chat.js'
