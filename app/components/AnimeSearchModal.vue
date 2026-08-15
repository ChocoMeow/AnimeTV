<script setup>
import { AI_PROMPT_SUGGESTIONS } from '~/composables/useAiChat'

const props = defineProps({
    modelValue: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])

const router = useRouter()
const { isMobile } = useMobile()
const { aiEnabled } = useRuntimeConfig().public
const { searchModalMode } = useMobileSearchState()
const {
    searchQuery,
    searchResults,
    loading,
    searchHistory,
    micError,
    speechSupported,
    isListening,
    onMicToggle,
    stopSpeech,
    searchFromHistory,
    saveSearchHistory,
    removeFromHistory,
    resetSearch,
    setSearchFetchEnabled,
} = useAnimeSearch()

const {
    hoveredAnime,
    animeDetails,
    tooltipLoading,
    tooltipError,
    tooltipPosition,
    handleMouseEnter,
    handleMouseLeave,
    handleTooltipEnter,
    handleTooltipLeave,
    setFavoriteStatus,
    clearTooltip,
    cleanup: cleanupAnimeTooltip,
} = useAnimeTooltip()

const TOOLTIP_SPACE = 360 + 16
const SHELL_HEIGHT = {
    mobile: { expanded: 'h-[92vh]', compact: 'h-[min(72vh,34rem)]' },
    desktop: { expanded: 'h-[min(88vh,800px)]', compact: 'h-[min(70vh,32rem)]' },
}

const inputRef = ref(null)
const listRef = ref(null)
const modalPanelRef = ref(null)
const discoverRef = ref(null)
const discoverTab = ref('history')
const activeIndex = ref(0)
const inputIntent = ref('search') // 'search' | 'ask'
const aiSeedPrompt = ref('')

const open = computed({
    get: () => props.modelValue,
    set: (v) => emit('update:modelValue', v),
})

const queryText = computed(() => searchQuery.value.trim())
const isAiMode = computed(() => aiEnabled && searchModalMode.value === 'ai')
const isAskIntent = computed(() => aiEnabled && inputIntent.value === 'ask')
const showAskAi = computed(() => aiEnabled && !isAskIntent.value && !!queryText.value)
const showDiscover = computed(() => !isAskIntent.value && !queryText.value)
const showEmptyResults = computed(
    () => !isAskIntent.value && !!queryText.value && !loading.value && !searchResults.value.length,
)
const contentPaneKey = computed(() => (isAskIntent.value ? 'ask' : 'search'))
const inputPlaceholder = computed(() =>
    isAskIntent.value ? '輸入想問 AI 的問題…' : '搜尋動漫名稱、簡介…',
)
const isShellExpanded = computed(() => isAiMode.value || !isAskIntent.value)
const modalShellClass = computed(() => {
    const sizes = isMobile.value ? SHELL_HEIGHT.mobile : SHELL_HEIGHT.desktop
    const height = isShellExpanded.value ? sizes.expanded : sizes.compact
    return `transition-[height] duration-[400ms] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[height] ${height}`
})

const flatItems = computed(() => {
    if (isAskIntent.value) {
        return AI_PROMPT_SUGGESTIONS.map((s) => ({ type: 'suggestion', id: `s-${s.text}`, suggestion: s }))
    }
    const items = []
    if (showAskAi.value) items.push({ type: 'askAi', id: 'ask-ai' })
    for (const r of searchResults.value) {
        items.push({ type: 'result', id: `r-${r.refId}`, result: r })
    }
    if (showDiscover.value && discoverTab.value === 'history') {
        for (const h of searchHistory.value) {
            items.push({ type: 'history', id: `h-${h.id}`, history: h })
        }
    }
    return items
})

const activeItem = computed(() => flatItems.value[activeIndex.value] || null)
const activeHistoryId = computed(() =>
    activeItem.value?.type === 'history' ? activeItem.value.history.id : null,
)
const activeSuggestionText = computed(() =>
    activeItem.value?.type === 'suggestion' ? activeItem.value.suggestion.text : null,
)

function resetActive() {
    activeIndex.value = 0
    clearTooltip()
}

function close() {
    open.value = false
}

function focusInput() {
    nextTick(() => inputRef.value?.focus())
}

function openAiPane(prompt) {
    if (!prompt || !aiEnabled) return
    clearTooltip()
    aiSeedPrompt.value = prompt
    searchModalMode.value = 'ai'
}

function setInputIntent(intent) {
    if (!aiEnabled && intent === 'ask') return
    inputIntent.value = intent === 'ask' ? 'ask' : 'search'
    setSearchFetchEnabled(inputIntent.value === 'search')
    resetActive()
    focusInput()
}

function openBrowse(query) {
    close()
    return router.push({ path: '/show-all-anime', query })
}

function setActive(index) {
    activeIndex.value = index
    clearTooltip()
}

function queryActiveEl(root = listRef.value || discoverRef.value?.scrollEl || modalPanelRef.value) {
    return root?.querySelector?.('[data-active="true"]')
}

function scrollActiveIntoView() {
    nextTick(() => queryActiveEl()?.scrollIntoView({ block: 'nearest' }))
}

function canFitSearchTooltip() {
    const panel = modalPanelRef.value
    if (!panel || typeof window === 'undefined') return false
    return window.innerWidth - panel.getBoundingClientRect().right >= TOOLTIP_SPACE
}

function getTooltipAnchor(rowEl) {
    const panel = modalPanelRef.value
    if (!panel) return rowEl
    const panelRect = panel.getBoundingClientRect()
    const rowRect = rowEl?.getBoundingClientRect?.() || panelRect
    return {
        getBoundingClientRect: () => ({
            left: panelRect.right,
            right: panelRect.right,
            top: rowRect.top,
            bottom: rowRect.bottom,
            width: 0,
            height: Math.max(rowRect.height, 1),
            x: panelRect.right,
            y: rowRect.top,
        }),
    }
}

function showResultTooltip(result, rowEl) {
    if (isAiMode.value || !result?.refId || !rowEl) return
    if (!canFitSearchTooltip()) {
        clearTooltip()
        return
    }
    handleMouseEnter(result, getTooltipAnchor(rowEl), {
        preferredPlacement: 'right',
        forcePreferred: true,
        delay: 0,
    })
}

function syncTooltipToActive() {
    const item = activeItem.value
    if (item?.type !== 'result' || !item.result) {
        clearTooltip()
        return
    }
    nextTick(() => {
        const el = queryActiveEl()
        if (el) showResultTooltip(item.result, el)
    })
}

function moveActive(delta) {
    const len = flatItems.value.length
    if (!len) return
    activeIndex.value = (activeIndex.value + delta + len) % len
    scrollActiveIntoView()
    syncTooltipToActive()
}

function onResultHover(result, index, el) {
    activeIndex.value = (showAskAi.value ? 1 : 0) + index
    showResultTooltip(result, el)
}

function onHistoryHover(item) {
    const idx = flatItems.value.findIndex((f) => f.type === 'history' && f.history.id === item.id)
    if (idx >= 0) setActive(idx)
}

async function selectResult(result) {
    if (!result?.refId) return
    if (queryText.value) await saveSearchHistory(queryText.value)
    close()
    return router.push(`/anime/${result.refId}`)
}

async function selectAskAi({ raw = false } = {}) {
    const q = queryText.value
    if (!q || !aiEnabled) return
    await saveSearchHistory(q)
    openAiPane(raw || isAskIntent.value ? q : `幫我找或介紹跟「${q}」相關的動漫`)
}

function selectHistory(item) {
    searchFromHistory(item.query)
    resetActive()
    focusInput()
}

function useAskSuggestion(item) {
    openAiPane(item?.text)
}

function backToSearch() {
    aiSeedPrompt.value = ''
    searchModalMode.value = 'search'
    setInputIntent('search')
}

async function activateCurrent() {
    const item = activeItem.value
    if (isAskIntent.value && queryText.value) return selectAskAi({ raw: true })
    if (item?.type === 'suggestion') return useAskSuggestion(item.suggestion)
    if (item?.type === 'history') return selectHistory(item.history)
    if (item?.type === 'askAi') return selectAskAi()
    if (item?.type === 'result') return selectResult(item.result)
    if (queryText.value && searchResults.value[0]) return selectResult(searchResults.value[0])
}

function onInputKeydown(e) {
    if (isAiMode.value) return
    const actions = {
        Tab: () => aiEnabled && setInputIntent(isAskIntent.value ? 'search' : 'ask'),
        ArrowDown: () => moveActive(1),
        ArrowUp: () => moveActive(-1),
        Enter: () => activateCurrent(),
        Escape: () => close(),
    }
    const action = actions[e.key]
    if (!action) return
    if (e.key === 'Tab' && !aiEnabled) return
    e.preventDefault()
    action()
}

function onGlobalKeydown(e) {
    if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        if (open.value) close()
        else {
            searchModalMode.value = 'search'
            open.value = true
        }
        return
    }
    if (e.key === 'Escape' && open.value) {
        e.preventDefault()
        e.stopPropagation()
        close()
    }
}

function onWindowResize() {
    if (open.value && hoveredAnime.value && !canFitSearchTooltip()) clearTooltip()
}

watch(
    () => flatItems.value.length,
    (len) => {
        if (activeIndex.value >= len) activeIndex.value = Math.max(0, len - 1)
    },
)
watch([searchQuery, discoverTab], resetActive)

watch(open, (isOpen) => {
    if (isOpen) {
        document.body.style.overflow = 'hidden'
        resetActive()
        if (!isAiMode.value) {
            setInputIntent('search')
            nextTick(() => discoverRef.value?.loadTrending?.())
        }
        return
    }
    stopSpeech()
    resetSearch()
    inputIntent.value = 'search'
    searchModalMode.value = 'search'
    aiSeedPrompt.value = ''
    clearTooltip()
    document.body.style.overflow = ''
})

watch(isAiMode, (ai) => {
    if (ai) clearTooltip()
})

onMounted(() => {
    window.addEventListener('keydown', onGlobalKeydown)
    window.addEventListener('resize', onWindowResize)
})

onUnmounted(() => {
    window.removeEventListener('keydown', onGlobalKeydown)
    window.removeEventListener('resize', onWindowResize)
    cleanupAnimeTooltip()
    document.body.style.overflow = ''
})
</script>

<template>
    <Teleport to="body">
        <Transition name="search-modal">
            <div
                v-if="open"
                class="fixed inset-0 z-[80] flex items-end justify-center sm:items-start sm:justify-center sm:pt-[10vh]"
                role="dialog"
                aria-modal="true"
                :aria-label="isAiMode ? 'AI 助手' : '搜尋動漫'"
            >
                <div class="absolute inset-0 bg-black/50" @click="close" />

                <!-- Centered search modal; preview floats outside to the right -->
                <div
                    class="relative z-10 w-full max-w-3xl sm:mx-4"
                    :class="modalShellClass"
                >
                    <!-- Search / AI panel -->
                    <div
                        ref="modalPanelRef"
                        class="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl ring-1 ring-black/10 dark:bg-gray-950 dark:ring-white/10 sm:rounded-2xl"
                        :aria-label="isAiMode ? 'AI 助手' : '搜尋動漫'"
                        @keydown="onInputKeydown"
                    >
                        <Transition name="search-pane" mode="out-in">
                            <SearchAiChatPane
                                v-if="aiEnabled && isAiMode"
                                :key="'ai'"
                                :active="open && isAiMode"
                                :seed-prompt="aiSeedPrompt"
                                @back="backToSearch"
                                @navigate="close"
                            />

                            <div v-else :key="'search-shell'" class="flex h-full min-h-0 flex-col">
                        <!-- Search input -->
                        <div class="flex shrink-0 items-center gap-2 px-3 py-3 sm:px-4">
                            <span
                                class="relative inline-flex h-10 w-6 shrink-0 items-center justify-center overflow-hidden text-gray-400"
                                aria-hidden="true"
                            >
                                <span
                                    class="material-symbols-rounded absolute text-[22px] leading-none transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
                                    :class="isAskIntent ? 'translate-y-2 scale-75 opacity-0' : 'translate-y-0 scale-100 opacity-100'"
                                >search</span>
                                <span
                                    class="material-symbols-rounded absolute text-[22px] leading-none transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
                                    :class="isAskIntent ? 'translate-y-0 scale-100 opacity-100' : '-translate-y-2 scale-75 opacity-0'"
                                >smart_toy</span>
                            </span>
                            <div class="relative flex h-10 min-w-0 flex-1 items-center">
                                <input
                                    ref="inputRef"
                                    v-model="searchQuery"
                                    type="search"
                                    :placeholder="inputPlaceholder"
                                    class="h-full w-full appearance-none bg-transparent py-0 pr-12 text-base leading-none text-gray-900 outline-none placeholder:text-gray-400 dark:text-gray-100 dark:placeholder:text-gray-500 sm:text-sm"
                                    :class="{ 'search-is-loading': loading && !isAskIntent }"
                                    autocomplete="off"
                                    @keydown.stop="onInputKeydown"
                                />
                                <div v-if="loading && !isAskIntent" class="pointer-events-none absolute right-10 top-1/2 -translate-y-1/2">
                                    <div
                                        class="h-4 w-4 animate-spin rounded-full border-2 border-black/10 border-t-gray-900 dark:border-white/15 dark:border-t-white"
                                    />
                                </div>
                                <SearchMicButton
                                    idle-class="bg-transparent text-gray-400 dark:text-gray-500"
                                    hover-class="hover:bg-black/5 hover:text-gray-700 dark:hover:bg-white/10 dark:hover:text-gray-200"
                                    :listening="isListening"
                                    :supported="speechSupported"
                                    :error="micError"
                                    @toggle="onMicToggle"
                                />
                            </div>
                            <SearchIntentSwitcher
                                v-if="aiEnabled"
                                class="hidden h-8 w-[6.5rem] shrink-0 sm:block"
                                :ask="isAskIntent"
                                ask-label="AI"
                                @select="setInputIntent"
                            />
                            <button
                                type="button"
                                class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-black/5 dark:hover:bg-white/10 sm:hidden"
                                aria-label="關閉"
                                @click="close"
                            >
                                <span class="material-symbols-rounded text-[22px] leading-none">close</span>
                            </button>
                        </div>

                        <SearchIntentSwitcher
                            v-if="aiEnabled"
                            class="mx-3 mb-2 h-9 shrink-0 sm:hidden"
                            :ask="isAskIntent"
                            ask-label="問 AI"
                            @select="setInputIntent"
                        />

                        <!-- Results list -->
                        <div class="relative min-h-0 flex-1 overflow-hidden" role="listbox">
                            <Transition name="search-pane" mode="out-in">
                                <div
                                    :key="showDiscover ? 'discover' : contentPaneKey"
                                    ref="listRef"
                                    class="absolute inset-0"
                                    :class="showDiscover ? '' : 'overflow-y-auto px-2 py-2'"
                                >
                                    <SearchDiscoverPane
                                        v-if="showDiscover"
                                        ref="discoverRef"
                                        v-model:tab="discoverTab"
                                        :history="searchHistory"
                                        :active-history-id="activeHistoryId"
                                        class="h-full min-h-0"
                                        @select-anime="selectResult"
                                        @select-tag="(tag) => openBrowse({ tags: tag })"
                                        @select-category="(category) => openBrowse({ category })"
                                        @select-history="selectHistory"
                                        @remove-history="removeFromHistory"
                                        @hover-history="onHistoryHover"
                                        @hover-anime="showResultTooltip"
                                        @leave-anime="handleMouseLeave"
                                    />
                                    <template v-else>
                                        <!-- Ask intent: suggestions stay visible while composing -->
                                        <div
                                            v-if="isAskIntent"
                                            class="flex min-h-full flex-col px-2 py-3 sm:px-3"
                                        >
                                <div class="mb-4 flex items-start gap-3 px-2">
                                    <img
                                        src="/icons/icon.svg"
                                        alt=""
                                        class="mt-0.5 h-8 w-8 shrink-0 object-contain"
                                        width="32"
                                        height="32"
                                    />
                                    <div class="min-w-0">
                                        <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100">有什麼想問的？</h3>
                                        <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                                            直接輸入問題，或選一個建議 — 不會搜尋動漫資料庫
                                        </p>
                                    </div>
                                </div>

                                <h4 class="mb-1.5 px-2 text-[11px] font-semibold tracking-wide text-gray-400 uppercase">
                                    建議問題
                                </h4>
                                <ul class="space-y-0.5">
                                    <li
                                        v-for="(item, i) in AI_PROMPT_SUGGESTIONS"
                                        :key="item.text"
                                    >
                                        <button
                                            type="button"
                                            role="option"
                                            :aria-selected="activeSuggestionText === item.text"
                                            :data-active="activeSuggestionText === item.text ? 'true' : undefined"
                                            class="group flex w-full items-center gap-3 rounded-full py-2.5 pl-3 pr-5 text-left transition-colors"
                                            :class="
                                                activeSuggestionText === item.text
                                                    ? 'bg-black/8 dark:bg-white/10'
                                                    : 'hover:bg-black/5 dark:hover:bg-white/5'
                                            "
                                            @mouseenter="setActive(i)"
                                            @mousedown.prevent="useAskSuggestion(item)"
                                        >
                                            <span
                                                class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/5 text-gray-600 dark:bg-white/10 dark:text-gray-300"
                                            >
                                                <span class="material-symbols-rounded text-[20px]">{{ item.icon }}</span>
                                            </span>
                                            <span class="min-w-0 flex-1">
                                                <span class="block text-sm font-medium text-gray-900 dark:text-gray-100">{{ item.label }}</span>
                                                <span class="mt-0.5 block truncate text-xs text-gray-500 dark:text-gray-400">{{ item.text }}</span>
                                            </span>
                                            <span
                                                class="material-symbols-rounded shrink-0 text-[18px] text-gray-300 transition-opacity dark:text-gray-600"
                                                :class="activeSuggestionText === item.text ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'"
                                            >
                                                arrow_forward
                                            </span>
                                        </button>
                                    </li>
                                </ul>
                            </div>

                            <!-- Ask AI -->
                            <template v-if="showAskAi">
                                <div class="px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                                    AI
                                </div>
                                <ul>
                                    <li
                                        role="option"
                                        :aria-selected="activeItem?.type === 'askAi'"
                                        :data-active="activeItem?.type === 'askAi' ? 'true' : undefined"
                                        class="flex cursor-pointer items-center gap-3 rounded-xl px-4 py-3 transition-colors"
                                        :class="
                                            activeItem?.type === 'askAi'
                                                ? 'bg-black/8 dark:bg-white/10'
                                                : 'hover:bg-black/5 dark:hover:bg-white/5'
                                        "
                                        @mouseenter="setActive(0)"
                                        @mousedown.prevent="selectAskAi()"
                                    >
                                        <div
                                            class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                                        >
                                            <span class="material-symbols-rounded">smart_toy</span>
                                        </div>
                                        <div class="min-w-0 flex-1">
                                            <AppTooltip text="開啟 AI 助手並繼續對話">
                                                <p class="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                                                    詢問 AI：「{{ queryText }}」
                                                </p>
                                            </AppTooltip>
                                            <p class="truncate text-xs text-gray-500 dark:text-gray-400">
                                                用 AI 搜尋、介紹或推薦相關動漫
                                            </p>
                                        </div>
                                        <kbd
                                            class="hidden shrink-0 rounded-full bg-black/5 px-1.5 py-0.5 text-[10px] text-gray-500 dark:bg-white/10 sm:inline"
                                        >
                                            ↵
                                        </kbd>
                                    </li>
                                </ul>
                            </template>

                            <!-- Results -->
                            <template v-if="!isAskIntent && searchResults.length">
                                <div class="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                                    動漫
                                </div>
                                <ul>
                                    <SearchResultItem
                                        v-for="(result, i) in searchResults"
                                        :key="result.refId"
                                        :result="result"
                                        :query="searchQuery"
                                        :active="activeItem?.type === 'result' && activeItem.result.refId === result.refId"
                                        @hover="(el) => onResultHover(result, i, el)"
                                        @select="selectResult(result)"
                                    />
                                </ul>
                            </template>

                            <!-- Empty search results -->
                            <div
                                v-if="showEmptyResults"
                                class="flex flex-col items-center justify-center px-4 text-center"
                                :class="showAskAi ? 'py-8' : 'py-16'"
                            >
                                <span class="material-symbols-rounded mb-2 text-4xl text-gray-300 dark:text-gray-600">search_off</span>
                                <p class="text-sm text-gray-500 dark:text-gray-400">找不到「{{ searchQuery }}」的相關結果</p>
                                <p v-if="showAskAi" class="mt-1 text-xs text-gray-400">可以改問上方的 AI 助手</p>
                            </div>
                                    </template>
                                </div>
                            </Transition>
                        </div>

                        <!-- Footer hints -->
                        <div
                            class="hidden shrink-0 items-center gap-5 px-4 py-2.5 text-xs text-gray-500 dark:text-gray-400 sm:flex"
                        >
                            <template v-if="flatItems.length || isAskIntent">
                                <AppTooltip v-if="flatItems.length" text="鍵盤上下選擇">
                                    <span class="inline-flex items-center gap-1.5">
                                        <kbd class="inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-black/5 px-1.5 text-xs font-medium leading-none text-gray-600 dark:bg-white/10 dark:text-gray-300">↑</kbd>
                                        <kbd class="inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-black/5 px-1.5 text-xs font-medium leading-none text-gray-600 dark:bg-white/10 dark:text-gray-300">↓</kbd>
                                        導覽
                                    </span>
                                </AppTooltip>
                                <AppTooltip :text="isAskIntent ? '送出給 AI' : '開啟選取項目'">
                                    <span class="inline-flex items-center gap-1.5">
                                        <kbd class="inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-black/5 px-1.5 text-xs font-medium leading-none text-gray-600 dark:bg-white/10 dark:text-gray-300">↵</kbd>
                                        {{ isAskIntent ? '送出' : '開啟' }}
                                    </span>
                                </AppTooltip>
                            </template>
                            <AppTooltip v-if="aiEnabled" text="切換搜尋 / AI 模式">
                                <span class="inline-flex items-center gap-1.5">
                                    <kbd class="inline-flex h-6 min-w-9 items-center justify-center rounded-md bg-black/5 px-1.5 text-[11px] font-medium uppercase leading-none tracking-wide text-gray-600 dark:bg-white/10 dark:text-gray-300">tab</kbd>
                                    {{ isAskIntent ? '搜尋' : 'AI' }}
                                </span>
                            </AppTooltip>
                            <AppTooltip text="關閉搜尋">
                                <span class="inline-flex items-center gap-1.5">
                                    <kbd class="inline-flex h-6 min-w-9 items-center justify-center rounded-md bg-black/5 px-1.5 text-[11px] font-medium uppercase leading-none tracking-wide text-gray-600 dark:bg-white/10 dark:text-gray-300">esc</kbd>
                                    關閉
                                </span>
                            </AppTooltip>
                        </div>
                            </div>
                        </Transition>
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>

    <AnimeTooltip
        :hovered-anime="hoveredAnime"
        :anime-details="animeDetails"
        :tooltip-loading="tooltipLoading"
        :tooltip-error="tooltipError"
        :tooltip-position="tooltipPosition"
        :on-tooltip-enter="handleTooltipEnter"
        :on-tooltip-leave="handleTooltipLeave"
        :on-favorite-toggled="({ refId, isFavorite }) => setFavoriteStatus(refId, isFavorite)"
    />
</template>

<style scoped>
.search-pane-enter-active,
.search-pane-leave-active {
    transition:
        opacity 0.22s ease,
        transform 0.22s cubic-bezier(0.22, 1, 0.36, 1);
}
.search-pane-enter-from,
.search-pane-leave-to {
    opacity: 0;
    transform: translateY(6px);
}

input[type='search']::-webkit-search-cancel-button {
    -webkit-appearance: none;
    display: block;
    height: 1rem;
    width: 1rem;
    margin: 0;
    background: currentColor;
    mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z'/%3E%3C/svg%3E")
        center / contain no-repeat;
    -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z'/%3E%3C/svg%3E")
        center / contain no-repeat;
    cursor: pointer;
}
input[type='search'].search-is-loading::-webkit-search-cancel-button {
    visibility: hidden;
    pointer-events: none;
}

.search-modal-enter-active,
.search-modal-leave-active {
    transition: opacity 0.18s ease;
}
.search-modal-enter-active .relative.z-10,
.search-modal-leave-active .relative.z-10 {
    transition:
        transform 0.2s ease,
        opacity 0.18s ease;
}
.search-modal-enter-from,
.search-modal-leave-to {
    opacity: 0;
}
.search-modal-enter-from .relative.z-10,
.search-modal-leave-to .relative.z-10 {
    opacity: 0;
    transform: translateY(12px) scale(0.98);
}
</style>
