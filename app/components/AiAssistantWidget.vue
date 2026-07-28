<script setup>
const user = useSupabaseUser()
const { userSettings } = useUserSettings()
const { showToast } = useToast()
const route = useRoute()

const WELCOME = '嗨！我是你的 AnimeTV 助手，可以回答動漫問題，也能查詢你的觀看資料與協助調整設定。'
const CHAT_TOO_LONG = '對話內容已達上限，請建立新對話後再繼續。'
const MAX_CHARS = 24000
const CONSENT_KEY = (id) => `animetv.ai.privacyConsent.${id}`
const CONSENT_VER = 'v1'
const SUGGESTIONS = [
    { label: '繼續觀看', text: '有哪些還沒看完可以繼續看？' },
    { label: '推薦一部', text: '依照我的觀看紀錄推薦一部動漫' },
    { label: '本月統計', text: '我這個月看了多久？最愛類型是什麼？' },
    { label: '我的收藏', text: '列出我的收藏' },
]
const STATUS = { thinking: '正在思考中…', tools: '正在查詢資料…', replying: '正在回覆…' }
const SETTING_LABELS = { watch_history_enabled: '觀看紀錄', search_history_enabled: '搜尋紀錄' }

const open = useState('ai-widget-open', () => false)
const loading = ref(false)
const confirming = ref(false)
const statusText = ref('')
const input = ref('')
const listRef = ref(null)
const inputRef = ref(null)
const stickToBottom = ref(true)
const pendingAction = ref(null)
const aiConsent = ref(false)
const showMobilePwaNav = useState('app-show-mobile-pwa-nav', () => false)
const messages = ref([{ role: 'assistant', content: WELCOME }])
let abortCtrl = null

const userId = computed(() => user.value?.sub || user.value?.id || null)
const busy = computed(() => loading.value || confirming.value)
const chatLen = computed(() =>
    messages.value.reduce((n, m, i) => (i > 0 && !m.meta && (m.role === 'user' || m.role === 'assistant') ? n + String(m.content || '').length : n), 0),
)
const chatAtLimit = computed(() => chatLen.value >= MAX_CHARS)
const needsNewChat = computed(() => chatAtLimit.value || chatLen.value + input.value.trim().length > MAX_CHARS)
const canUseAi = computed(() => !!user.value && aiConsent.value)
const canSend = computed(() => canUseAi.value && !!input.value.trim() && !busy.value && !needsNewChat.value)
const showSuggestions = computed(() => canUseAi.value && !loading.value && messages.value.length === 1 && !pendingAction.value)
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
const headerStatus = computed(() => {
    if (!user.value) return '請先登入後再使用'
    if (!aiConsent.value) return '使用前需同意隱私授權'
    if (loading.value) return statusText.value || STATUS.thinking
    if (pendingFavorite.value) return '等待你確認收藏變更'
    if (pendingAction.value) return '等待你確認設定變更'
    return '隨時幫你找動漫'
})
const inputPlaceholder = computed(() =>
    !user.value ? '請先登入才能使用 AI 助手' : chatAtLimit.value ? '請先建立新對話' : '輸入你想問的內容...',
)
const isAuthRoute = computed(() => route.path.startsWith('/login'))
const widgetRootClass = computed(() => {
    if (showMobilePwaNav.value) {
        return 'fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom,0px))] z-[70] px-2'
    }
    return 'fixed inset-x-0 bottom-0 z-[70] px-2 pb-2 md:inset-x-auto md:left-4 md:bottom-4 md:px-0 md:pb-0'
})
const panelClass = computed(() =>
    showMobilePwaNav.value
        ? 'w-full rounded-2xl ring-1 ring-black/10 dark:ring-white/15 bg-white dark:bg-gray-950 shadow-2xl overflow-hidden flex flex-col'
        : 'w-full md:w-[min(92vw,380px)] mb-2 md:mb-3 rounded-2xl ring-1 ring-black/10 dark:ring-white/15 bg-white dark:bg-gray-950 shadow-2xl overflow-hidden flex flex-col',
)

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
    if (!open.value || !canUseAi.value || busy.value || chatAtLimit.value) return
    nextTick(() => {
        inputRef.value?.focus()
        resizeInput()
    })
}

function scrollToBottom(force = false) {
    const el = listRef.value
    if (!el || (!force && !stickToBottom.value)) return
    nextTick(() => el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }))
}

function onListScroll() {
    const el = listRef.value
    if (!el) return
    stickToBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight <= 56
}

function clearChat() {
    if (busy.value) return
    abortCtrl?.abort()
    messages.value = [{ role: 'assistant', content: WELCOME }]
    pendingAction.value = null
    statusText.value = ''
    input.value = ''
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
        .split(/(\*\*.+?\*\*)/g)
        .filter(Boolean)
        .map((part) => (part.startsWith('**') && part.endsWith('**') ? { bold: true, text: part.slice(2, -2) } : { bold: false, text: part }))
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
            try {
                onEvent(JSON.parse(line.slice(5).trim()))
            } catch {}
        }
    }
}

async function sendMessage() {
    const content = input.value.trim()
    if (!content || busy.value || !canUseAi.value) return
    if (chatLen.value + content.length > MAX_CHARS) return pushMeta(CHAT_TOO_LONG)

    abortCtrl?.abort()
    abortCtrl = new AbortController()
    pendingAction.value = null
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

        await readSse(res, (event) => {
            const msg = messages.value[idx]
            if (!msg) return
            if (event.type === 'status') statusText.value = STATUS[event.status] || STATUS.thinking
            else if (event.type === 'delta' && event.content) {
                statusText.value = STATUS.replying
                msg.content += event.content
                scrollToBottom()
            } else if (event.type === 'done') {
                msg.anime = event.anime || []
                msg.links = event.links || []
                if (event.message && !msg.content) msg.content = event.message
                const action = event.pendingAction
                pendingAction.value = action?.type === 'update_user_settings' || action?.type === 'update_favorite' ? action : null
                finishAssistant(idx)
            } else if (event.type === 'error') {
                throw new Error(clientError({ message: event.message, errorId: event.errorId }))
            }
        })
        finishAssistant(idx)
    } catch (error) {
        if (error?.name === 'AbortError') return
        finishAssistant(idx, error?.message || '助手目前無法使用，請稍後再試。')
        pendingAction.value = null
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

watch(userId, loadConsent, { immediate: true })
watch(() => [messages.value.length, loading.value, pendingAction.value, messages.value.at(-1)?.content], () => scrollToBottom())
watch(open, (v) => v && ((stickToBottom.value = true), scrollToBottom(true)))
watch(input, () => nextTick(resizeInput))
watch(isAuthRoute, (v) => v && (open.value = false))

function onInputKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        sendMessage()
    }
}

function onEsc(e) {
    if (e.key === 'Escape') open.value = false
}

onMounted(() => window.addEventListener('keydown', onEsc))
onUnmounted(() => {
    window.removeEventListener('keydown', onEsc)
    abortCtrl?.abort()
})
</script>

<template>
    <div :class="widgetRootClass">
        <transition name="fade-up">
            <div
                v-if="open && !isAuthRoute"
                :class="panelClass"
            >
                <div class="flex items-center justify-between px-4 py-3 border-b border-black/10 dark:border-white/10">
                    <div class="flex items-center gap-2 min-w-0">
                        <span class="material-symbols-rounded text-gray-700 dark:text-gray-200 text-[20px]">smart_toy</span>
                        <div class="min-w-0">
                            <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-tight">AI 助手</h3>
                            <p class="text-[11px] text-gray-500 dark:text-gray-400 truncate">{{ headerStatus }}</p>
                        </div>
                    </div>
                    <div class="flex items-center gap-1 shrink-0">
                        <button type="button" class="icon-btn" :disabled="!canClear" title="建立新對話" @click="clearChat">
                            <span class="material-symbols-rounded text-gray-600 dark:text-gray-300 text-[18px]">delete</span>
                        </button>
                        <button type="button" class="icon-btn" @click="open = false">
                            <span class="material-symbols-rounded text-gray-600 dark:text-gray-300 text-[18px]">close</span>
                        </button>
                    </div>
                </div>

                <!-- Privacy consent -->
                <div v-if="user && !aiConsent" class="px-4 py-4 max-h-[46vh] overflow-y-auto">
                    <div class="panel space-y-3">
                        <div class="flex items-start gap-2">
                            <span class="material-symbols-rounded text-gray-700 dark:text-gray-200 text-[22px] shrink-0 mt-0.5">privacy_tip</span>
                            <div class="min-w-0 space-y-1.5">
                                <h4 class="text-sm font-semibold text-gray-900 dark:text-gray-100">使用前請先同意隱私授權</h4>
                                <p class="text-xs leading-relaxed text-gray-600 dark:text-gray-300">
                                    AI 助手可能讀取你的觀看紀錄、收藏、設定與對話內容，以便回答問題與提供個人化建議。資料可能傳送至第三方 AI 服務處理。設定或收藏變更仍需你再次確認後才會套用。
                                </p>
                                <p class="text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
                                    詳見
                                    <NuxtLink to="/privacy" class="underline" @click="open = false">隱私政策</NuxtLink>
                                    與
                                    <NuxtLink to="/terms" class="underline" @click="open = false">服務條款</NuxtLink>
                                    。
                                </p>
                            </div>
                        </div>
                        <div class="flex gap-2">
                            <button type="button" class="btn-ghost flex-1 py-2" @click="open = false">先不要</button>
                            <button type="button" class="btn-solid flex-1 py-2" @click="acceptConsent">同意並繼續</button>
                        </div>
                    </div>
                </div>

                <template v-else>
                    <div ref="listRef" class="px-3 py-3 space-y-2.5 max-h-[46vh] overflow-y-auto bg-black/[0.01] dark:bg-white/[0.02]" @scroll.passive="onListScroll">
                        <div v-if="!user" class="rounded-2xl px-3.5 py-3 text-sm text-gray-600 dark:text-gray-300 bg-black/5 dark:bg-white/10">
                            請先登入後再使用 AI 助手。
                        </div>

                        <div v-for="(msg, index) in messages" :key="index" class="flex msg-enter" :class="msg.role === 'user' ? 'justify-end' : 'justify-start'">
                            <div class="max-w-[92%] flex flex-col gap-1.5" :class="msg.role === 'user' ? 'items-end' : 'items-start'">
                                <div
                                    v-if="msg.content || msg.streaming"
                                    class="rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap leading-relaxed"
                                    :class="msg.role === 'user' ? 'bg-gray-900 text-white dark:bg-white dark:text-black rounded-br-md' : 'bg-black/5 text-gray-800 dark:bg-white/10 dark:text-gray-100 rounded-bl-md'"
                                >
                                    <template v-if="msg.content">
                                        <template v-for="(part, i) in formatParts(msg.content)" :key="i">
                                            <strong v-if="part.bold" class="font-semibold">{{ part.text }}</strong>
                                            <template v-else>{{ part.text }}</template>
                                        </template>
                                        <span v-if="msg.streaming" class="stream-caret" aria-hidden="true" />
                                    </template>
                                    <div v-else class="thinking-dots" aria-label="正在思考"><span /><span /><span /></div>
                                </div>

                                <div v-if="msg.anime?.length" class="w-full space-y-1.5">
                                    <NuxtLink
                                        v-for="anime in msg.anime"
                                        :key="anime.id"
                                        :to="`/anime/${anime.id}`"
                                        class="flex items-center gap-2.5 p-1.5 pr-2.5 rounded-xl ring-1 ring-black/5 dark:ring-white/10 bg-white/70 dark:bg-white/5 hover:bg-black/[0.04] dark:hover:bg-white/10"
                                        @click="open = false"
                                    >
                                        <div class="w-10 h-14 rounded-lg overflow-hidden bg-black/5 dark:bg-white/10 shrink-0">
                                            <NuxtImg v-if="anime.image" :src="anime.image" :alt="anime.title" class="w-full h-full object-cover" loading="lazy" />
                                            <div v-else class="w-full h-full flex items-center justify-center text-gray-400">
                                                <span class="material-symbols-rounded text-base">movie</span>
                                            </div>
                                        </div>
                                        <div class="min-w-0 flex-1">
                                            <p class="text-xs font-medium text-gray-900 dark:text-gray-100 line-clamp-2 leading-snug">{{ anime.title }}</p>
                                            <p v-if="anime.subtitle" class="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 truncate">{{ anime.subtitle }}</p>
                                        </div>
                                        <span class="material-symbols-rounded text-gray-400 text-[18px] shrink-0">chevron_right</span>
                                    </NuxtLink>
                                </div>

                                <div v-if="msg.links?.length" class="w-full flex flex-wrap gap-1.5">
                                    <NuxtLink v-for="link in msg.links" :key="link.path + link.label" :to="link.path" class="chip" @click="open = false">
                                        <span class="material-symbols-rounded text-[14px]">link</span>
                                        {{ link.label || link.path }}
                                    </NuxtLink>
                                </div>
                            </div>
                        </div>

                        <div v-if="showSuggestions" class="flex flex-wrap gap-1.5 pt-1">
                            <button v-for="item in SUGGESTIONS" :key="item.label" type="button" class="chip" @click="useSuggestion(item)">
                                {{ item.label }}
                            </button>
                        </div>

                        <div v-if="pendingAction && !loading" class="msg-enter panel p-3">
                            <p class="text-xs font-semibold text-gray-900 dark:text-gray-100 mb-2">{{ pendingFavorite ? '確認收藏變更' : '確認設定變更' }}</p>
                            <ul v-if="pendingChanges.length" class="space-y-1 mb-3">
                                <li v-for="item in pendingChanges" :key="item.key" class="text-xs text-gray-700 dark:text-gray-300 flex justify-between gap-2">
                                    <span>{{ item.label }}</span>
                                    <span class="font-medium">{{ item.value }}</span>
                                </li>
                            </ul>
                            <div v-else-if="pendingFavorite" class="flex items-center gap-2.5 mb-3">
                                <div class="w-10 h-14 rounded-lg overflow-hidden bg-black/5 dark:bg-white/10 shrink-0">
                                    <NuxtImg v-if="pendingFavorite.anime_image" :src="pendingFavorite.anime_image" :alt="pendingFavorite.anime_title" class="w-full h-full object-cover" loading="lazy" />
                                </div>
                                <div class="min-w-0">
                                    <p class="text-xs font-medium text-gray-900 dark:text-gray-100 line-clamp-2">{{ pendingFavorite.anime_title }}</p>
                                    <p class="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{{ pendingFavorite.action === 'add' ? '加入收藏' : '移出收藏' }}</p>
                                </div>
                            </div>
                            <div class="flex gap-2">
                                <button type="button" class="btn-ghost flex-1 py-1.5" :disabled="confirming" @click="cancelPending">取消</button>
                                <button type="button" class="btn-solid flex-1 py-1.5" :disabled="confirming" @click="confirmPending">{{ confirming ? '套用中…' : '確認' }}</button>
                            </div>
                        </div>
                    </div>

                    <form class="p-3 border-t border-black/10 dark:border-white/10 flex flex-col gap-2" @submit.prevent="sendMessage">
                        <div v-if="needsNewChat" class="rounded-xl px-3 py-2 text-xs text-gray-700 dark:text-gray-200 bg-black/[0.04] dark:bg-white/[0.06] ring-1 ring-black/5 dark:ring-white/10 flex items-center justify-between gap-2">
                            <span>{{ CHAT_TOO_LONG }}</span>
                            <button type="button" class="btn-solid shrink-0 px-2.5 py-1 text-[11px]" :disabled="busy" @click="clearChat">建立新對話</button>
                        </div>
                        <div class="flex items-end gap-2">
                            <textarea
                                ref="inputRef"
                                v-model="input"
                                rows="1"
                                maxlength="3000"
                                :disabled="!canUseAi || busy || chatAtLimit"
                                :placeholder="inputPlaceholder"
                                class="chat-input flex-1 bg-black/5 dark:bg-white/10 rounded-2xl px-3 py-2 text-sm leading-5 text-gray-800 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 outline-none disabled:opacity-60 resize-none overflow-y-auto"
                                @keydown="onInputKeydown"
                                @input="resizeInput"
                            />
                            <button type="submit" class="btn-solid h-9 w-9 shrink-0 rounded-full flex items-center justify-center" :disabled="!canSend" aria-label="送出">
                                <span class="material-symbols-rounded text-[18px]">{{ loading ? 'hourglass_empty' : 'send' }}</span>
                            </button>
                        </div>
                    </form>
                </template>
            </div>
        </transition>

        <button
            v-if="!showMobilePwaNav && !isAuthRoute"
            type="button"
            class="hidden md:flex h-12 w-12 rounded-full shadow-lg ring-1 ring-black/10 dark:ring-white/15 bg-gray-900 text-white dark:bg-white dark:text-black items-center justify-center active:scale-95"
            aria-label="切換 AI 助手視窗"
            @click="open = !open"
        >
            <span class="material-symbols-rounded">{{ open ? 'close' : 'smart_toy' }}</span>
        </button>
    </div>
</template>

<style scoped>
.icon-btn {
    @apply h-7 w-7 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-40;
}
.chip {
    @apply inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-black/5 dark:bg-white/10 text-gray-700 dark:text-gray-200 hover:bg-black/10 dark:hover:bg-white/15;
}
.btn-ghost {
    @apply px-3 rounded-full text-xs font-medium bg-black/5 dark:bg-white/10 text-gray-700 dark:text-gray-200 hover:bg-black/10 dark:hover:bg-white/15 disabled:opacity-50;
}
.btn-solid {
    @apply px-3 rounded-full text-xs font-medium bg-gray-900 text-white dark:bg-white dark:text-black disabled:opacity-50;
}
.panel {
    @apply rounded-2xl ring-1 ring-black/10 dark:ring-white/15 bg-black/[0.03] dark:bg-white/[0.04] p-3.5;
}
.fade-up-enter-active,
.fade-up-leave-active {
    transition: all 0.18s ease;
}
.fade-up-enter-from,
.fade-up-leave-to {
    opacity: 0;
    transform: translateY(8px);
}
.msg-enter {
    animation: msg-in 0.22s ease both;
}
@keyframes msg-in {
    from {
        opacity: 0;
        transform: translateY(6px);
    }
    to {
        opacity: 1;
        transform: none;
    }
}
.chat-input {
    max-height: 4.75rem;
}
.stream-caret {
    display: inline-block;
    width: 2px;
    height: 0.9em;
    margin-left: 2px;
    vertical-align: -1px;
    background: currentColor;
    animation: caret-blink 1s steps(1) infinite;
}
@keyframes caret-blink {
    50% {
        opacity: 0;
    }
}
.thinking-dots {
    display: flex;
    align-items: center;
    gap: 5px;
    height: 1rem;
}
.thinking-dots span {
    width: 6px;
    height: 6px;
    border-radius: 9999px;
    background: currentColor;
    opacity: 0.35;
    animation: thinking-bounce 1.05s ease-in-out infinite;
}
.thinking-dots span:nth-child(2) {
    animation-delay: 0.15s;
}
.thinking-dots span:nth-child(3) {
    animation-delay: 0.3s;
}
@keyframes thinking-bounce {
    0%,
    80%,
    100% {
        opacity: 0.28;
        transform: none;
    }
    40% {
        opacity: 0.9;
        transform: translateY(-3px);
    }
}
</style>
