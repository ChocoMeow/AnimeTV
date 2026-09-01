<script setup>
const props = defineProps({
    /** When true, pane is visible — focus + consume seed */
    active: { type: Boolean, default: false },
    /** Optional first user message to send when the pane opens */
    seedPrompt: { type: String, default: '' },
})

const emit = defineEmits(['back', 'navigate'])

const { siteName } = useAppConfig()

const {
    CHAT_TOO_LONG,
    messages,
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
    resizeInput,
    cleanup,
} = useAiChat()

watch(
    () => props.active,
    (active) => {
        if (active) {
            if (props.seedPrompt) seedPrompt(props.seedPrompt)
            nextTick(() => {
                onPaneOpen()
                consumePendingSeed()
            })
        } else {
            onDeactivate()
        }
    },
    { immediate: true },
)

watch(
    () => props.seedPrompt,
    (text) => {
        if (props.active && text) {
            seedPrompt(text)
            consumePendingSeed()
        }
    },
)

watch([aiConsent, user, () => props.active], () => {
    if (props.active) consumePendingSeed()
})

watch(aiConsent, (v) => {
    if (v && props.active) onPaneOpen()
})

watch(input, () => nextTick(resizeInput))

watch(
    () => [messages.value.length, loading.value, pendingAction.value, messages.value.at(-1)?.content],
    () => {
        if (props.active) {
            const el = listRef.value
            if (!el) return
            nextTick(() => el.scrollTo({ top: el.scrollHeight, behavior: 'auto' }))
        }
    },
)

function onNavigate() {
    emit('navigate')
}

onUnmounted(() => {
    cleanup()
})
</script>

<template>
    <div class="flex h-full min-h-0 flex-col">
        <div class="flex shrink-0 items-center justify-between gap-2 px-3 py-3 sm:px-4">
            <div class="flex min-w-0 items-center gap-2">
                <button
                    type="button"
                    class="icon-btn"
                    title="返回搜尋"
                    aria-label="返回搜尋"
                    @click="emit('back')"
                >
                    <span class="material-symbols-rounded text-[20px] text-gray-600 dark:text-gray-300">arrow_back</span>
                </button>
                <img src="/icons/icon.svg" :alt="siteName" class="h-5 w-5 object-contain" width="20" height="20" />
                <h3 class="truncate text-sm font-semibold leading-tight text-gray-900 dark:text-gray-100">AI 助手</h3>
            </div>
            <button type="button" class="icon-btn" :disabled="!canClear" title="建立新對話" @click="clearChat">
                <span class="material-symbols-rounded text-[18px] text-gray-600 dark:text-gray-300">delete</span>
            </button>
        </div>

        <!-- Privacy consent -->
        <div v-if="user && !aiConsent" class="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <div class="panel space-y-3">
                <div class="flex items-start gap-2">
                    <span class="material-symbols-rounded mt-0.5 shrink-0 text-[22px] text-gray-700 dark:text-gray-200">privacy_tip</span>
                    <div class="min-w-0 space-y-1.5">
                        <h4 class="text-sm font-semibold text-gray-900 dark:text-gray-100">使用前請先同意隱私授權</h4>
                        <p class="text-xs leading-relaxed text-gray-600 dark:text-gray-300">
                            AI 助手可能讀取你的觀看紀錄、收藏、設定與對話內容，以便回答問題與提供個人化建議。資料可能傳送至第三方 AI 服務處理。設定或收藏變更仍需你再次確認後才會套用。
                        </p>
                        <p class="text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
                            詳見
                            <NuxtLink to="/privacy" class="underline" @click="onNavigate">隱私政策</NuxtLink>
                            與
                            <NuxtLink to="/terms" class="underline" @click="onNavigate">服務條款</NuxtLink>
                            。
                        </p>
                    </div>
                </div>
                <div class="flex gap-2">
                    <button type="button" class="btn-ghost flex-1 py-2" @click="emit('back')">先不要</button>
                    <button type="button" class="btn-solid flex-1 py-2" @click="acceptConsent">同意並繼續</button>
                </div>
            </div>
        </div>

        <template v-else>
            <div
                ref="listRef"
                class="min-h-0 flex-1 space-y-2.5 overflow-y-auto bg-black/[0.01] px-3 py-3 dark:bg-white/[0.02]"
                @scroll.passive="onListScroll"
            >
                <div v-if="!user" class="rounded-2xl bg-black/5 px-3.5 py-3 text-sm text-gray-600 dark:bg-white/10 dark:text-gray-300">
                    請先登入後再使用 AI 助手。
                </div>

                <div
                    v-for="(msg, index) in messages"
                    :key="index"
                    class="msg-enter flex"
                    :class="msg.role === 'user' ? 'justify-end' : 'justify-start'"
                >
                    <div class="flex max-w-[92%] flex-col gap-1.5" :class="msg.role === 'user' ? 'items-end' : 'items-start'">
                        <div
                            v-if="msg.content || msg.streaming"
                            class="rounded-2xl px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap"
                            :class="
                                msg.role === 'user'
                                    ? 'rounded-br-md bg-gray-900 text-white dark:bg-white dark:text-black'
                                    : 'rounded-bl-md bg-black/5 text-gray-800 dark:bg-white/10 dark:text-gray-100'
                            "
                        >
                            <template v-if="msg.content">
                                <template v-for="(part, i) in formatParts(msg.content)" :key="i">
                                    <strong v-if="part.bold" class="font-semibold">{{ part.text }}</strong>
                                    <template v-else>{{ part.text }}</template>
                                </template>
                                <span v-if="msg.streaming" class="stream-caret" aria-hidden="true" />
                            </template>
                            <div v-else class="flex items-center gap-2 text-gray-500 dark:text-gray-400" :aria-label="waitStatus">
                                <div class="thinking-dots" aria-hidden="true"><span /><span /><span /></div>
                                <span class="text-xs">{{ waitStatus }}</span>
                            </div>
                        </div>

                        <div v-if="msg.anime?.length" class="w-full space-y-1.5">
                            <NuxtLink
                                v-for="anime in msg.anime"
                                :key="anime.id"
                                :to="`/anime/${anime.id}`"
                                class="flex items-center gap-2.5 rounded-xl bg-white/70 p-1.5 pr-2.5 ring-1 ring-black/5 hover:bg-black/[0.04] dark:bg-white/5 dark:ring-white/10 dark:hover:bg-white/10"
                                @click="onNavigate"
                            >
                                <div class="h-14 w-10 shrink-0 overflow-hidden rounded-lg bg-black/5 dark:bg-white/10">
                                    <NuxtImg
                                        v-if="anime.image"
                                        :src="anime.image"
                                        :alt="anime.title"
                                        class="h-full w-full object-cover"
                                        loading="lazy"
                                    />
                                    <div v-else class="flex h-full w-full items-center justify-center text-gray-400">
                                        <span class="material-symbols-rounded text-base">movie</span>
                                    </div>
                                </div>
                                <div class="min-w-0 flex-1">
                                    <p class="line-clamp-2 text-xs leading-snug font-medium text-gray-900 dark:text-gray-100">
                                        {{ anime.title }}
                                    </p>
                                    <p v-if="anime.subtitle" class="mt-0.5 truncate text-[11px] text-gray-500 dark:text-gray-400">
                                        {{ anime.subtitle }}
                                    </p>
                                </div>
                                <span class="material-symbols-rounded shrink-0 text-[18px] text-gray-400">chevron_right</span>
                            </NuxtLink>
                        </div>

                        <div v-if="msg.links?.length" class="flex w-full flex-wrap gap-1.5">
                            <NuxtLink
                                v-for="link in msg.links"
                                :key="link.path + link.label"
                                :to="link.path"
                                class="chip"
                                @click="onNavigate"
                            >
                                <span class="material-symbols-rounded text-[14px]">link</span>
                                {{ link.label || link.path }}
                            </NuxtLink>
                        </div>
                    </div>
                </div>

                <div v-if="activeSuggestions.length" class="flex flex-wrap gap-1.5 pt-1">
                    <button
                        v-for="item in activeSuggestions"
                        :key="item.label + item.text"
                        type="button"
                        class="chip"
                        @click="useSuggestion(item)"
                    >
                        {{ item.label }}
                    </button>
                </div>

                <div v-if="pendingAction && !loading" class="msg-enter panel p-3">
                    <p class="mb-2 text-xs font-semibold text-gray-900 dark:text-gray-100">
                        {{ pendingFavorite ? '確認收藏變更' : '確認設定變更' }}
                    </p>
                    <ul v-if="pendingChanges.length" class="mb-3 space-y-1">
                        <li
                            v-for="item in pendingChanges"
                            :key="item.key"
                            class="flex justify-between gap-2 text-xs text-gray-700 dark:text-gray-300"
                        >
                            <span>{{ item.label }}</span>
                            <span class="font-medium">{{ item.value }}</span>
                        </li>
                    </ul>
                    <div v-else-if="pendingFavorite" class="mb-3 flex items-center gap-2.5">
                        <div class="h-14 w-10 shrink-0 overflow-hidden rounded-lg bg-black/5 dark:bg-white/10">
                            <NuxtImg
                                v-if="pendingFavorite.anime_image"
                                :src="pendingFavorite.anime_image"
                                :alt="pendingFavorite.anime_title"
                                class="h-full w-full object-cover"
                                loading="lazy"
                            />
                        </div>
                        <div class="min-w-0">
                            <p class="line-clamp-2 text-xs font-medium text-gray-900 dark:text-gray-100">
                                {{ pendingFavorite.anime_title }}
                            </p>
                            <p class="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                                {{ pendingFavorite.action === 'add' ? '加入收藏' : '移出收藏' }}
                            </p>
                        </div>
                    </div>
                    <div class="flex gap-2">
                        <button type="button" class="btn-ghost flex-1 py-1.5" :disabled="confirming" @click="cancelPending">
                            取消
                        </button>
                        <button type="button" class="btn-solid flex-1 py-1.5" :disabled="confirming" @click="confirmPending">
                            {{ confirming ? '套用中…' : '確認' }}
                        </button>
                    </div>
                </div>
            </div>

            <form class="flex shrink-0 flex-col gap-2 border-t border-black/10 p-3 dark:border-white/10" @submit.prevent="sendMessage">
                <div
                    v-if="needsNewChat"
                    class="flex items-center justify-between gap-2 rounded-xl bg-black/[0.04] px-3 py-2 text-xs text-gray-700 ring-1 ring-black/5 dark:bg-white/[0.06] dark:text-gray-200 dark:ring-white/10"
                >
                    <span>{{ CHAT_TOO_LONG }}</span>
                    <button type="button" class="btn-solid shrink-0 px-2.5 py-1 text-[11px]" :disabled="busy" @click="clearChat">
                        建立新對話
                    </button>
                </div>
                <div class="flex items-end gap-2">
                    <textarea
                        ref="inputRef"
                        v-model="input"
                        rows="1"
                        maxlength="3000"
                        :disabled="!canUseAi || busy || chatAtLimit"
                        :placeholder="inputPlaceholder"
                        class="chat-input flex-1 resize-none overflow-y-auto rounded-2xl bg-black/5 px-3 py-2 text-sm leading-5 text-gray-800 outline-none placeholder-gray-500 disabled:opacity-60 dark:bg-white/10 dark:text-gray-100 dark:placeholder-gray-400"
                        @keydown="onInputKeydown"
                        @input="resizeInput"
                    />
                    <SearchMicButton
                        variant="inline"
                        tip-placement="above"
                        idle-class="bg-black/10 text-gray-900 dark:bg-white/15 dark:text-white"
                        hover-class="hover:bg-black/20 dark:hover:bg-white/30"
                        idle-title="語音輸入"
                        :listening="isListening"
                        :supported="speechSupported"
                        :error="micError"
                        :disabled="!canUseAi || busy || chatAtLimit"
                        @toggle="onMicToggle"
                    />
                    <button
                        v-if="showSend"
                        type="submit"
                        class="btn-solid flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-gray-800 dark:hover:bg-gray-100"
                        :disabled="!canSend"
                        aria-label="送出"
                    >
                        <span class="material-symbols-rounded text-[18px]">{{ loading ? 'hourglass_empty' : 'arrow_upward' }}</span>
                    </button>
                </div>
            </form>
        </template>
    </div>
</template>

<style scoped>
.icon-btn {
    @apply flex h-8 w-8 items-center justify-center rounded-full hover:bg-black/5 disabled:opacity-40 dark:hover:bg-white/10;
}
.chip {
    @apply inline-flex items-center gap-1 rounded-full bg-black/5 px-2.5 py-1 text-[11px] font-medium text-gray-700 hover:bg-black/10 dark:bg-white/10 dark:text-gray-200 dark:hover:bg-white/15;
}
.btn-ghost {
    @apply rounded-full bg-black/5 px-3 text-xs font-medium text-gray-700 hover:bg-black/10 disabled:opacity-50 dark:bg-white/10 dark:text-gray-200 dark:hover:bg-white/15;
}
.btn-solid {
    @apply rounded-full bg-gray-900 px-3 text-xs font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black;
}
.panel {
    @apply rounded-2xl bg-black/[0.03] p-3.5 ring-1 ring-black/10 dark:bg-white/[0.04] dark:ring-white/15;
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
