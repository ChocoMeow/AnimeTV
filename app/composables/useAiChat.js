/** Starter prompts for AI compose (modal) + chat chip suggestions. */
export const AI_PROMPT_SUGGESTIONS = [
    { icon: 'play_circle', label: '繼續觀看', text: '有哪些還沒看完可以繼續看？' },
    { icon: 'auto_awesome', label: '個人推薦', text: '依照我的觀看紀錄推薦一部動漫' },
    { icon: 'bar_chart', label: '本月統計', text: '我這個月看了多久？最愛類型是什麼？' },
    { icon: 'bookmark', label: '我的收藏', text: '列出我的收藏' },
    { icon: 'new_releases', label: '近期新番', text: '最近有什麼值得追的新番？' },
    { icon: 'mood', label: '心情推薦', text: '我想看輕鬆療癒的動漫，有什麼推薦？' },
]

/**
 * AI chat logic for the search-modal AI pane.
 * Local refs only — history is cleared when leaving the pane.
 */
export function useAiChat() {
    const user = useSupabaseUser()
    const { userSettings } = useUserSettings()
    const { showToast } = useToast()
    const { siteName } = useAppConfig()

    const WELCOME = `嗨！我是你的 ${siteName} 助手，可以回答動漫問題，也能查詢你的觀看資料與協助調整設定。`
    const CHAT_TOO_LONG = '對話內容已達上限，請建立新對話後再繼續。'
    const MAX_CHARS = 24000
    const CONSENT_KEY = (id) => `app.ai.privacyConsent.${id}`
    const CONSENT_VER = 'v1'
    const SUGGESTIONS = AI_PROMPT_SUGGESTIONS.slice(0, 4).map(({ label, text }) => ({ label, text }))
    const STATUS = {
        thinking: '正在思考中',
        tools: '正在查詢資料',
        searching: '正在搜尋網路',
        suggesting: '正在產生建議',
        replying: '正在回覆',
    }
    const SETTING_LABELS = { watch_history_enabled: '觀看紀錄', search_history_enabled: '搜尋紀錄' }

    const messages = ref([{ role: 'assistant', content: WELCOME }])
    const pendingSeed = ref(null)
    const loading = ref(false)
    const confirming = ref(false)
    const statusText = ref('')
    const input = ref('')
    const listRef = ref(null)
    const inputRef = ref(null)
    const stickToBottom = ref(true)
    const pendingAction = ref(null)
    const aiConsent = ref(false)
    const followUpSuggestions = ref([])
    const micError = ref('')
    let abortCtrl = null
    let micErrorTimeout = null

    const userId = computed(() => user.value?.sub || user.value?.id || null)
    const busy = computed(() => loading.value || confirming.value)
    const chatLen = computed(() =>
        messages.value.reduce(
            (n, m, i) => (i > 0 && !m.meta && (m.role === 'user' || m.role === 'assistant') ? n + String(m.content || '').length : n),
            0,
        ),
    )
    const chatAtLimit = computed(() => chatLen.value >= MAX_CHARS)
    const needsNewChat = computed(() => chatAtLimit.value || chatLen.value + input.value.trim().length > MAX_CHARS)
    const canUseAi = computed(() => !!user.value && aiConsent.value)
    const canSend = computed(() => canUseAi.value && !!input.value.trim() && !busy.value && !needsNewChat.value)
    const showSend = computed(() => !!input.value.trim() || loading.value)
    const activeSuggestions = computed(() => {
        if (!canUseAi.value || loading.value || pendingAction.value) return []
        if (messages.value.length === 1) return SUGGESTIONS
        return followUpSuggestions.value
    })
    const canClear = computed(() => canUseAi.value && !busy.value && messages.value.length > 1)
    const pendingFavorite = computed(() => (pendingAction.value?.type === 'update_favorite' ? pendingAction.value : null))
    const pendingChanges = computed(() =>
        pendingAction.value?.type === 'update_user_settings'
            ? Object.entries(pendingAction.value.updates || {}).map(([key, value]) => ({
                  key,
                  label: SETTING_LABELS[key] || key,
                  value: value ? '開啟' : '關閉',
              }))
            : [],
    )
    const waitStatus = computed(() => statusText.value || STATUS.thinking)
    const inputPlaceholder = computed(() =>
        !user.value ? '請先登入才能使用 AI 助手' : chatAtLimit.value ? '請先建立新對話' : '輸入你想問的內容...',
    )

    function clearMicError() {
        if (micErrorTimeout) {
            clearTimeout(micErrorTimeout)
            micErrorTimeout = null
        }
        micError.value = ''
    }

    const { isSupported: speechSupported, isListening, toggle: toggleSpeech, stop: stopSpeech } = useSpeechRecognition({
        onResult: (transcript) => {
            clearMicError()
            input.value = transcript
            nextTick(resizeInput)
        },
        onError: (message) => {
            clearMicError()
            micError.value = message
            micErrorTimeout = setTimeout(clearMicError, 2000)
        },
    })

    function onMicToggle() {
        if (!canUseAi.value || busy.value || chatAtLimit.value) return
        toggleSpeech()
    }

    function loadConsent() {
        try {
            aiConsent.value = !!userId.value && localStorage.getItem(CONSENT_KEY(userId.value)) === CONSENT_VER
        } catch {
            aiConsent.value = false
        }
    }

    function acceptConsent() {
        if (!userId.value) return
        try {
            localStorage.setItem(CONSENT_KEY(userId.value), CONSENT_VER)
        } catch {}
        aiConsent.value = true
    }

    function pushMeta(content) {
        messages.value.push({ role: 'assistant', content, meta: true })
        scrollToBottom(true)
    }

    function resizeInput() {
        const el = inputRef.value
        if (!el) return
        el.style.height = 'auto'
        el.style.height = `${Math.min(el.scrollHeight, 76)}px`
    }

    function focusInput() {
        if (!canUseAi.value || busy.value || chatAtLimit.value) return
        nextTick(() => {
            inputRef.value?.focus()
            resizeInput()
        })
    }

    function scrollToBottom(force = false) {
        const el = listRef.value
        if (!el || (!force && !stickToBottom.value)) return
        nextTick(() => el.scrollTo({ top: el.scrollHeight, behavior: force ? 'smooth' : 'auto' }))
    }

    function onPaneOpen() {
        stickToBottom.value = true
        scrollToBottom(true)
        focusInput()
    }

    function onListScroll() {
        const el = listRef.value
        if (!el) return
        stickToBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight <= 56
    }

    function resetChatState() {
        pendingAction.value = null
        followUpSuggestions.value = []
    }

    function clearChat() {
        if (busy.value) return
        resetThread()
    }

    /** Always wipe thread (used when leaving the pane). */
    function resetThread() {
        abortCtrl?.abort()
        abortCtrl = null
        stopSpeech()
        clearMicError()
        messages.value = [{ role: 'assistant', content: WELCOME }]
        resetChatState()
        statusText.value = ''
        input.value = ''
        pendingSeed.value = null
        loading.value = false
        confirming.value = false
        nextTick(resizeInput)
    }

    function useSuggestion(item) {
        if (!item?.text || busy.value || !canUseAi.value || chatAtLimit.value) return
        input.value = item.text
        nextTick(() => {
            resizeInput()
            sendMessage()
        })
    }

    function clientError(err, fallback = '助手目前無法使用，請稍後再試。') {
        const code = err?.data?.data?.code || err?.data?.code
        if (code === 'CHAT_TOO_LONG' || err?.statusCode === 413 || err?.status === 413) return CHAT_TOO_LONG
        const id = err?.data?.data?.errorId || err?.data?.errorId || err?.errorId
        const msg = err?.data?.message || err?.message || err?.statusMessage || fallback
        return id && !String(msg).includes(id) ? `${fallback}（錯誤代碼：${id}）` : msg || fallback
    }

    function finishAssistant(index, content) {
        const msg = messages.value[index]
        if (!msg) return
        msg.streaming = false
        if (!msg.content) msg.content = content || '我目前無法回答這個問題，請稍後再試。'
    }

    function formatParts(text = '') {
        return String(text)
            .replace(/<\/?[a-zA-Z][^>]*>/g, '')
            .split(/(\*\*.+?\*\*)/g)
            .filter(Boolean)
            .map((part) =>
                part.startsWith('**') && part.endsWith('**') ? { bold: true, text: part.slice(2, -2) } : { bold: false, text: part },
            )
    }

    async function readSse(res, onEvent) {
        const reader = res.body?.getReader()
        if (!reader) throw new Error('助手目前無法使用，請稍後再試。')
        const decoder = new TextDecoder()
        let buffer = ''
        while (true) {
            const { done, value } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })
            const chunks = buffer.split('\n\n')
            buffer = chunks.pop() || ''
            for (const chunk of chunks) {
                const line = chunk.split('\n').find((l) => l.startsWith('data:'))
                if (!line) continue
                let event
                try {
                    event = JSON.parse(line.slice(5).trim())
                } catch {
                    continue
                }
                onEvent(event)
            }
        }
    }

    function isNetworkError(error) {
        const msg = String(error?.message || error || '')
        return (
            error?.name === 'TypeError' ||
            /load failed|failed to fetch|networkerror|network request failed|fetch failed/i.test(msg)
        )
    }

    function handleChatEvent(event, idx) {
        const msg = messages.value[idx]
        if (!msg) return

        if (event.type === 'status') {
            statusText.value = STATUS[event.status] || STATUS.thinking
        } else if (event.type === 'delta' && event.content) {
            statusText.value = STATUS.replying
            msg.content += event.content
            scrollToBottom()
        } else if (event.type === 'done') {
            msg.anime = event.anime || []
            msg.links = event.links || []
            if (event.message && !msg.content) msg.content = event.message
            const action = event.pendingAction
            pendingAction.value = action?.type === 'update_user_settings' || action?.type === 'update_favorite' ? action : null
            if (pendingAction.value) followUpSuggestions.value = []
            finishAssistant(idx)
        } else if (event.type === 'suggestions') {
            followUpSuggestions.value = Array.isArray(event.suggestions) ? event.suggestions : []
            scrollToBottom()
        } else if (event.type === 'error') {
            throw Object.assign(new Error(clientError({ message: event.message, errorId: event.errorId })), {
                errorId: event.errorId,
                fromServer: true,
            })
        }
    }

    async function sendMessage() {
        const content = input.value.trim()
        if (!content || busy.value || !canUseAi.value) return
        if (chatLen.value + content.length > MAX_CHARS) return pushMeta(CHAT_TOO_LONG)

        stopSpeech()
        clearMicError()
        abortCtrl?.abort()
        abortCtrl = new AbortController()
        resetChatState()
        messages.value.push({ role: 'user', content })
        input.value = ''
        nextTick(resizeInput)
        loading.value = true
        statusText.value = STATUS.thinking
        stickToBottom.value = true
        scrollToBottom(true)

        const idx = messages.value.push({ role: 'assistant', content: '', anime: [], links: [], streaming: true }) - 1

        try {
            const history = messages.value.filter((m, i) => i > 0 && i !== idx && !m.meta && (m.role === 'user' || m.role === 'assistant'))
            const res = await fetch('/api/ai/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
                body: JSON.stringify({ messages: history }),
                signal: abortCtrl.signal,
            })
            if (!res.ok) {
                const err = await res.json().catch(() => null)
                throw Object.assign(new Error(clientError(err)), { statusCode: res.status, data: err })
            }

            await readSse(res, (event) => handleChatEvent(event, idx))
            finishAssistant(idx)
        } catch (error) {
            if (error?.name === 'AbortError') return
            const fallback = isNetworkError(error)
                ? '連線中斷，請稍後再試。若問題持續，可能是回應時間過長。'
                : error?.message || '助手目前無法使用，請稍後再試。'
            finishAssistant(idx, fallback)
            resetChatState()
        } finally {
            loading.value = false
            statusText.value = ''
            scrollToBottom()
            focusInput()
        }
    }

    async function confirmPending() {
        const action = pendingAction.value
        if (!action || confirming.value) return
        confirming.value = true
        try {
            const result = await $fetch('/api/ai/confirm', { method: 'POST', body: { action } })
            if (result?.type === 'update_user_settings' && result.updates) {
                userSettings.value = { ...userSettings.value, ...result.updates }
                showToast?.('設定已儲存', 'success')
            } else if (result?.type === 'update_favorite') {
                showToast?.(result.action === 'add' ? '已加入收藏' : '已移除收藏', 'success')
            }
            pendingAction.value = null
            pushMeta(result?.message || '已完成變更。')
        } catch (error) {
            const text = clientError(error, '變更失敗，請稍後再試。')
            showToast?.(text, 'error')
            pushMeta(text)
        } finally {
            confirming.value = false
        }
    }

    function cancelPending() {
        if (confirming.value) return
        const favorite = pendingAction.value?.type === 'update_favorite'
        pendingAction.value = null
        pushMeta(favorite ? '已取消收藏變更。' : '已取消設定變更。')
    }

    function seedPrompt(text) {
        const trimmed = typeof text === 'string' ? text.trim() : ''
        pendingSeed.value = trimmed ? { text: trimmed } : null
    }

    async function consumePendingSeed() {
        const pending = pendingSeed.value
        if (!pending?.text) return
        if (!user.value || !aiConsent.value) return
        if (busy.value || chatAtLimit.value) return

        const text = pending.text
        pendingSeed.value = null
        input.value = text
        await nextTick()
        resizeInput()
        await sendMessage()
    }

    function onInputKeydown(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            sendMessage()
        }
    }

    function onDeactivate() {
        resetThread()
    }

    function cleanup() {
        resetThread()
    }

    watch(userId, loadConsent, { immediate: true })

    return {
        CHAT_TOO_LONG,
        messages,
        pendingSeed,
        loading,
        confirming,
        input,
        listRef,
        inputRef,
        pendingAction,
        aiConsent,
        micError,
        user,
        busy,
        chatAtLimit,
        needsNewChat,
        canUseAi,
        canSend,
        showSend,
        activeSuggestions,
        canClear,
        pendingFavorite,
        pendingChanges,
        waitStatus,
        inputPlaceholder,
        speechSupported,
        isListening,
        acceptConsent,
        clearChat,
        useSuggestion,
        formatParts,
        sendMessage,
        confirmPending,
        cancelPending,
        seedPrompt,
        consumePendingSeed,
        onMicToggle,
        onInputKeydown,
        onListScroll,
        onPaneOpen,
        onDeactivate,
        focusInput,
        resizeInput,
        cleanup,
        resetThread,
    }
}
