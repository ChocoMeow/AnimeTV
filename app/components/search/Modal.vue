<script setup>
import { AI_PROMPT_SUGGESTIONS } from '~/composables/useAiChat'

const props = defineProps({
    modelValue: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])

const router = useRouter()
const route = useRoute()
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

const TOOLTIP_SPACE = 376
const ROW_ACTIVE = 'bg-black/8 dark:bg-white/10'
const ROW_IDLE = 'hover:bg-black/5 dark:hover:bg-white/5'
const KBD =
    'inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-black/5 px-1.5 text-xs font-medium leading-none text-gray-600 dark:bg-white/10 dark:text-gray-300'
const KBD_WIDE =
    'inline-flex h-6 min-w-9 items-center justify-center rounded-md bg-black/5 px-1.5 text-[11px] font-medium uppercase leading-none tracking-wide text-gray-600 dark:bg-white/10 dark:text-gray-300'
const DESKTOP_MIC_IDLE =
    '!h-9 !w-9 bg-white text-gray-500 shadow-sm ring-1 ring-black/8 dark:bg-gray-950 dark:text-gray-400 dark:ring-white/10'
const DESKTOP_MIC_HOVER =
    'hover:text-gray-800 hover:ring-black/15 dark:hover:text-gray-200 dark:hover:ring-white/20'

const inputBarRef = ref(null)
const listRef = ref(null)
const modalPanelRef = ref(null)
const discoverRef = ref(null)
const discoverTab = ref('history')
const activeIndex = ref(0)
const inputIntent = ref('search')
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
const panelHeightClass = computed(() => {
    if (isMobile.value) return 'flex-1 min-h-0'
    return isShellExpanded.value ? 'h-[min(80vh,720px)]' : 'h-[min(58vh,24rem)]'
})
const shellClass = computed(() =>
    isMobile.value
        ? 'fixed inset-0 z-[80] flex flex-col bg-white dark:bg-gray-950 md:hidden'
        : 'absolute inset-x-0 top-0 z-20 hidden overflow-hidden rounded-b-2xl bg-gray-100 shadow-lg ring-1 ring-black/5 dark:bg-[#141414] dark:ring-white/10 md:block',
)
const panelClass = computed(() =>
    [
        'flex min-h-0 w-full flex-col overflow-hidden transition-[height] duration-[400ms] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[height]',
        isMobile.value ? 'flex-1 bg-white dark:bg-gray-950' : 'bg-transparent',
        panelHeightClass.value,
    ].join(' '),
)

const flatItems = computed(() => {
    if (isAskIntent.value) {
        return AI_PROMPT_SUGGESTIONS.map((s) => ({ type: 'suggestion', id: `s-${s.text}`, suggestion: s }))
    }
    const items = []
    if (showAskAi.value) items.push({ type: 'askAi', id: 'ask-ai' })
    for (const r of searchResults.value) items.push({ type: 'result', id: `r-${r.refId}`, result: r })
    if (showDiscover.value && discoverTab.value === 'history') {
        for (const h of searchHistory.value) items.push({ type: 'history', id: `h-${h.id}`, history: h })
    }
    return items
})

const activeItem = computed(() => flatItems.value[activeIndex.value] || null)
const activeHistoryId = computed(() => (activeItem.value?.type === 'history' ? activeItem.value.history.id : null))

const keyboardHints = computed(() => {
    const hints = []
    if (flatItems.value.length) hints.push({ keys: ['↑', '↓'], label: '導覽', tip: '鍵盤上下選擇' })
    if (flatItems.value.length || isAskIntent.value) {
        hints.push({ keys: ['↵'], label: isAskIntent.value ? '送出' : '開啟', tip: isAskIntent.value ? '送出給 AI' : '開啟選取項目' })
    }
    if (aiEnabled) hints.push({ keys: ['tab'], label: isAskIntent.value ? '搜尋' : 'AI', tip: '切換搜尋 / AI 模式', wide: true })
    hints.push({ keys: ['esc'], label: '關閉', tip: '關閉搜尋', wide: true })
    return hints
})

function rowClass(active) {
    return active ? ROW_ACTIVE : ROW_IDLE
}

function isSuggestionActive(text) {
    return activeItem.value?.type === 'suggestion' && activeItem.value.suggestion.text === text
}

function isResultActive(refId) {
    return activeItem.value?.type === 'result' && activeItem.value.result.refId === refId
}

function resetActive() {
    activeIndex.value = 0
    clearTooltip()
}

function close() {
    open.value = false
}

function focusInput() {
    nextTick(() => inputBarRef.value?.focus())
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
    if (!canFitSearchTooltip()) return clearTooltip()
    handleMouseEnter(result, getTooltipAnchor(rowEl), { preferredPlacement: 'right', forcePreferred: true, delay: 0 })
}

function syncTooltipToActive() {
    const item = activeItem.value
    if (item?.type !== 'result' || !item.result) return clearTooltip()
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
    if (isAskIntent.value && queryText.value) return selectAskAi({ raw: true })
    const item = activeItem.value
    const actions = {
        suggestion: () => useAskSuggestion(item.suggestion),
        history: () => selectHistory(item.history),
        askAi: () => selectAskAi(),
        result: () => selectResult(item.result),
    }
    if (item?.type && actions[item.type]) return actions[item.type]()
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
    if (!action || (e.key === 'Tab' && !aiEnabled)) return
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

function onDocumentPointerDown(e) {
    if (!open.value || isMobile.value) return
    if (e.target.closest?.('[data-search-shell], [data-search-header]')) return
    close()
}

function setBodyScrollLocked(locked) {
    document.body.style.overflow = locked ? 'hidden' : ''
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
        if (isMobile.value) setBodyScrollLocked(true)
        resetActive()
        if (!isAiMode.value) {
            setInputIntent('search')
            nextTick(() => discoverRef.value?.loadTrending?.())
        }
        focusInput()
        return
    }
    stopSpeech()
    resetSearch()
    inputIntent.value = 'search'
    searchModalMode.value = 'search'
    aiSeedPrompt.value = ''
    clearTooltip()
    setBodyScrollLocked(false)
})

watch(isMobile, (mobile) => {
    if (open.value) setBodyScrollLocked(mobile)
})
watch(isAiMode, (ai) => {
    if (ai) clearTooltip()
})

watch(() => route.fullPath, () => {
    if (open.value) close()
})

onMounted(() => {
    window.addEventListener('keydown', onGlobalKeydown)
    window.addEventListener('resize', onWindowResize)
    document.addEventListener('pointerdown', onDocumentPointerDown)
})

onUnmounted(() => {
    window.removeEventListener('keydown', onGlobalKeydown)
    window.removeEventListener('resize', onWindowResize)
    document.removeEventListener('pointerdown', onDocumentPointerDown)
    cleanupAnimeTooltip()
    setBodyScrollLocked(false)
})
</script>

<template>
    <Teleport to="body">
        <Transition name="search-backdrop">
            <div
                v-if="open && !isMobile"
                class="fixed inset-0 z-40 bg-black/60"
                aria-hidden="true"
                @click="close"
            />
        </Transition>
    </Teleport>

    <Teleport v-if="open && !isMobile && !isAiMode" to="#desktop-search-anchor">
        <div class="flex w-full items-center justify-center gap-2">
            <div class="w-full max-w-xl">
                <SearchInputBar
                    ref="inputBarRef"
                    v-model="searchQuery"
                    embedded
                    class="w-full"
                    :show-mic="false"
                    :placeholder="inputPlaceholder"
                    :loading="loading"
                    :is-ask-intent="isAskIntent"
                    :is-listening="isListening"
                    :speech-supported="speechSupported"
                    :mic-error="micError"
                    :show-intent-desktop="false"
                    @keydown="onInputKeydown"
                    @mic-toggle="onMicToggle"
                />
            </div>
            <SearchMicButton
                variant="inline"
                tip-placement="below"
                class="shrink-0"
                :idle-class="DESKTOP_MIC_IDLE"
                :hover-class="DESKTOP_MIC_HOVER"
                :listening="isListening"
                :supported="speechSupported"
                :error="micError"
                @toggle="onMicToggle"
            />
            <SearchIntentSwitcher v-if="aiEnabled" class="shrink-0" :ask="isAskIntent" ask-label="AI" @select="setInputIntent" />
        </div>
    </Teleport>

    <Teleport to="body" :disabled="!isMobile">
        <Transition name="search-dropdown">
            <div
                v-if="open"
                :data-search-shell="isMobile ? undefined : ''"
                role="dialog"
                :aria-modal="isMobile ? 'true' : undefined"
                :aria-label="isAiMode ? 'AI 助手' : '搜尋動漫'"
                :class="shellClass"
            >
                <SearchInputBar
                    v-if="isMobile && !isAiMode"
                    ref="inputBarRef"
                    v-model="searchQuery"
                    :placeholder="inputPlaceholder"
                    :loading="loading"
                    :is-ask-intent="isAskIntent"
                    :ai-enabled="aiEnabled"
                    :is-listening="isListening"
                    :speech-supported="speechSupported"
                    :mic-error="micError"
                    show-close
                    :show-intent-mobile="aiEnabled"
                    @keydown="onInputKeydown"
                    @close="close"
                    @set-intent="setInputIntent"
                    @mic-toggle="onMicToggle"
                />

                <div :class="isMobile ? 'flex min-h-0 flex-1 flex-col' : 'pb-3 pt-[4.5rem]'">
                    <div ref="modalPanelRef" :class="panelClass" @keydown="onInputKeydown">
                        <Transition name="search-pane" mode="out-in">
                            <SearchAiChatPane
                                v-if="aiEnabled && isAiMode"
                                key="ai"
                                :active="open && isAiMode"
                                :seed-prompt="aiSeedPrompt"
                                @back="backToSearch"
                                @navigate="close"
                            />

                            <div v-else key="search" class="flex h-full min-h-0 flex-col">
                                <div class="relative min-h-0 flex-1 overflow-hidden" role="listbox">
                                    <Transition name="search-pane" mode="out-in">
                                        <div
                                            :key="showDiscover ? 'discover' : contentPaneKey"
                                            ref="listRef"
                                            class="absolute inset-0"
                                            :class="showDiscover ? '' : 'overflow-y-auto px-3 py-1'"
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
                                                <div v-if="isAskIntent" class="flex min-h-full flex-col px-2 py-3 sm:px-3">
                                                    <div class="mb-4 flex items-start gap-3 px-2">
                                                        <img src="/icons/icon.svg" alt="" class="mt-0.5 h-8 w-8 shrink-0 object-contain" width="32" height="32" />
                                                        <div class="min-w-0">
                                                            <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100">有什麼想問的？</h3>
                                                            <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">直接輸入問題，或選一個建議 — 不會搜尋動漫資料庫</p>
                                                        </div>
                                                    </div>
                                                    <h4 class="mb-1.5 px-2 text-[11px] font-semibold tracking-wide text-gray-400 uppercase">建議問題</h4>
                                                    <ul class="space-y-0.5">
                                                        <li v-for="(item, i) in AI_PROMPT_SUGGESTIONS" :key="item.text">
                                                            <button
                                                                type="button"
                                                                role="option"
                                                                :aria-selected="isSuggestionActive(item.text)"
                                                                :data-active="isSuggestionActive(item.text) ? 'true' : undefined"
                                                                class="group flex w-full items-center gap-3 rounded-full py-2.5 pl-3 pr-5 text-left transition-colors"
                                                                :class="rowClass(isSuggestionActive(item.text))"
                                                                @mouseenter="setActive(i)"
                                                                @mousedown.prevent="useAskSuggestion(item)"
                                                            >
                                                                <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/5 text-gray-600 dark:bg-white/10 dark:text-gray-300">
                                                                    <span class="material-symbols-rounded text-[20px]">{{ item.icon }}</span>
                                                                </span>
                                                                <span class="min-w-0 flex-1">
                                                                    <span class="block text-sm font-medium text-gray-900 dark:text-gray-100">{{ item.label }}</span>
                                                                    <span class="mt-0.5 block truncate text-xs text-gray-500 dark:text-gray-400">{{ item.text }}</span>
                                                                </span>
                                                                <span
                                                                    class="material-symbols-rounded shrink-0 text-[18px] text-gray-300 transition-opacity dark:text-gray-600"
                                                                    :class="isSuggestionActive(item.text) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'"
                                                                >
                                                                    arrow_forward
                                                                </span>
                                                            </button>
                                                        </li>
                                                    </ul>
                                                </div>

                                                <template v-if="showAskAi">
                                                    <div class="px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">AI</div>
                                                    <ul>
                                                        <li
                                                            role="option"
                                                            :aria-selected="activeItem?.type === 'askAi'"
                                                            :data-active="activeItem?.type === 'askAi' ? 'true' : undefined"
                                                            class="flex min-w-0 cursor-pointer items-center gap-3 rounded-xl px-4 py-3 transition-colors"
                                                            :class="rowClass(activeItem?.type === 'askAi')"
                                                            @mouseenter="setActive(0)"
                                                            @mousedown.prevent="selectAskAi()"
                                                        >
                                                            <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-900 text-white dark:bg-white dark:text-gray-900">
                                                                <span class="material-symbols-rounded">smart_toy</span>
                                                            </div>
                                                            <div class="min-w-0 flex-1 overflow-hidden">
                                                                <p
                                                                    class="min-w-0 truncate text-sm font-medium text-gray-900 dark:text-gray-100"
                                                                    :title="`詢問 AI：「${queryText}」`"
                                                                >
                                                                    詢問 AI：「{{ queryText }}」
                                                                </p>
                                                                <p class="truncate text-xs text-gray-500 dark:text-gray-400">用 AI 搜尋、介紹或推薦相關動漫</p>
                                                            </div>
                                                            <kbd class="hidden shrink-0 rounded-full bg-black/5 px-1.5 py-0.5 text-[10px] text-gray-500 dark:bg-white/10 sm:inline">↵</kbd>
                                                        </li>
                                                    </ul>
                                                </template>

                                                <template v-if="!isAskIntent && searchResults.length">
                                                    <div class="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">動漫</div>
                                                    <ul>
                                                        <SearchResultItem
                                                            v-for="(result, i) in searchResults"
                                                            :key="result.refId"
                                                            :result="result"
                                                            :query="searchQuery"
                                                            :active="isResultActive(result.refId)"
                                                            @hover="(el) => onResultHover(result, i, el)"
                                                            @select="selectResult(result)"
                                                        />
                                                    </ul>
                                                </template>

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

                                <div class="hidden shrink-0 items-center gap-4 px-3 pt-2 text-xs text-gray-500 dark:text-gray-400 md:flex">
                                    <AppTooltip v-for="hint in keyboardHints" :key="hint.label" :text="hint.tip">
                                        <span class="inline-flex items-center gap-1.5">
                                            <kbd v-for="key in hint.keys" :key="key" :class="hint.wide ? KBD_WIDE : KBD">{{ key }}</kbd>
                                            {{ hint.label }}
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

.search-dropdown-enter-active,
.search-dropdown-leave-active {
    transition:
        opacity 0.18s ease,
        transform 0.22s cubic-bezier(0.22, 1, 0.36, 1);
}
.search-dropdown-enter-from,
.search-dropdown-leave-to {
    opacity: 0;
    transform: translateY(-6px);
}

.search-backdrop-enter-active,
.search-backdrop-leave-active {
    transition: opacity 0.3s ease;
}
.search-backdrop-enter-from,
.search-backdrop-leave-to {
    opacity: 0;
}
</style>
