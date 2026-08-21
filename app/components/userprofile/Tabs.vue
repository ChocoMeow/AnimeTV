<script setup>
const props = defineProps({
    mobile: { type: Boolean, default: false },
    recentlyWatched: { type: Array, default: () => [] },
    favorites: { type: Array, default: () => [] },
    mutualFriends: { type: Array, default: () => [] },
})
const emit = defineEmits(['select'])

const TABS = [
    { id: 'history', label: '觀看紀錄', icon: 'history' },
    { id: 'favorites', label: '他的收藏', icon: 'bookmark' },
    { id: 'mutual', label: '共同好友', icon: 'group' },
]

const activeTab = ref('history')
const activeTabIndex = computed(() => Math.max(0, TABS.findIndex((t) => t.id === activeTab.value)))

/* ---- Sliding underline ---- */
const tabBarEl = ref(null)
const buttonEls = ref([])
const underline = ref({ width: '0px', transform: 'translateX(0px)', opacity: 0 })

function setButtonRef(el, i) {
    if (el) buttonEls.value[i] = el
}

function updateUnderline() {
    const container = tabBarEl.value
    const btn = buttonEls.value[activeTabIndex.value]
    if (!container || !btn) return
    const containerRect = container.getBoundingClientRect()
    const btnRect = btn.getBoundingClientRect()
    underline.value = {
        width: `${btnRect.width}px`,
        transform: `translateX(${btnRect.left - containerRect.left}px)`,
        opacity: 1,
    }
}

/* ---- Active panel height ---- */
const panelEls = ref([])
const panelsHeight = ref(0)
const sliderEl = ref(null)
let panelResizeObserver
let tabBarResizeObserver

function setPanelRef(el, i) {
    if (el) panelEls.value[i] = el
    else delete panelEls.value[i]
}

function updatePanelsHeight() {
    const panel = panelEls.value[activeTabIndex.value]
    if (!panel) return
    panelsHeight.value = panel.scrollHeight
}

function observeActivePanel() {
    panelResizeObserver?.disconnect()
    const panel = panelEls.value[activeTabIndex.value]
    if (!panel) return
    updatePanelsHeight()
    panelResizeObserver = new ResizeObserver(updatePanelsHeight)
    panelResizeObserver.observe(panel)
}

function scrollDrawerToTop() {
    if (!props.mobile || typeof window === 'undefined') return
    let node = sliderEl.value?.parentElement || tabBarEl.value?.parentElement
    while (node && node !== document.body) {
        const { overflowY } = getComputedStyle(node)
        if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) {
            node.scrollTo({ top: 0, behavior: 'smooth' })
            return
        }
        node = node.parentElement
    }
}

function selectTab(id) {
    if (id === activeTab.value) return
    activeTab.value = id
    if (props.mobile) nextTick(scrollDrawerToTop)
}

/* ---- Mobile touch swipe (transform slider; no scroll-snap bleed) ---- */
const touchStart = { x: 0, y: 0 }

function onTouchStart(e) {
    if (!props.mobile) return
    const t = e.changedTouches[0]
    touchStart.x = t.clientX
    touchStart.y = t.clientY
}

function onTouchEnd(e) {
    if (!props.mobile) return
    const t = e.changedTouches[0]
    const dx = t.clientX - touchStart.x
    const dy = t.clientY - touchStart.y
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy)) return
    const next = activeTabIndex.value + (dx < 0 ? 1 : -1)
    if (next >= 0 && next < TABS.length) selectTab(TABS[next].id)
}

onMounted(() => {
    nextTick(() => {
        updateUnderline()
        observeActivePanel()
    })
    document.fonts?.ready?.then(updateUnderline)
    tabBarResizeObserver = new ResizeObserver(updateUnderline)
    if (tabBarEl.value) tabBarResizeObserver.observe(tabBarEl.value)
})
onBeforeUnmount(() => {
    tabBarResizeObserver?.disconnect()
    panelResizeObserver?.disconnect()
})
watch(activeTabIndex, () => nextTick(() => {
    updateUnderline()
    observeActivePanel()
}))
watch(
    [() => props.recentlyWatched, () => props.favorites, () => props.mutualFriends, () => props.mobile],
    () => nextTick(observeActivePanel),
)

function reset() {
    activeTab.value = 'history'
    nextTick(() => {
        updateUnderline()
        observeActivePanel()
    })
}
defineExpose({ reset })
</script>

<template>
    <div class="space-y-4">
        <!-- Tab bar -->
        <div
            ref="tabBarEl"
            class="relative flex border-b border-black/10 dark:border-white/10"
            :class="mobile ? '' : 'gap-6'"
        >
            <button
                v-for="(tab, i) in TABS"
                :key="tab.id"
                :ref="(el) => setButtonRef(el, i)"
                type="button"
                class="relative inline-flex items-center gap-1.5 pb-3 text-sm font-medium transition-colors duration-200"
                :class="[
                    mobile ? 'flex-1 justify-center text-xs' : '',
                    activeTab === tab.id
                        ? 'text-gray-950 dark:text-white'
                        : 'text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300',
                ]"
                @click="selectTab(tab.id)"
            >
                <span class="material-symbols-rounded" :class="[mobile ? 'text-[18px]' : 'text-[20px]', activeTab !== tab.id && 'outlined']">{{ tab.icon }}</span>
                {{ tab.label }}
            </button>
            <span
                class="pointer-events-none absolute bottom-0 left-0 h-0.5 rounded-full bg-gray-950 dark:bg-white transition-[transform,width,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
                :style="underline"
            />
        </div>

        <!-- Shared transform slider (mobile + desktop) -->
        <div
            ref="sliderEl"
            class="overflow-hidden transition-[height] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
            :class="mobile ? '-mx-4' : ''"
            :style="panelsHeight ? { height: `${panelsHeight}px` } : undefined"
            @touchstart.passive="onTouchStart"
            @touchend="onTouchEnd"
        >
            <div
                class="flex w-full items-start will-change-transform transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
                :style="{ transform: `translate3d(-${activeTabIndex * 100}%, 0, 0)` }"
            >
                <!-- History -->
                <section
                    :ref="(el) => setPanelRef(el, 0)"
                    class="box-border w-full min-w-full shrink-0 overflow-hidden"
                    :class="mobile ? 'px-4 pt-1 pb-1' : 'px-0.5 py-0.5'"
                >
                    <div v-if="recentlyWatched.length" class="grid gap-2.5 p-0.5" :class="mobile ? 'grid-cols-3' : 'grid-cols-4 lg:grid-cols-5 gap-3'">
                        <NuxtLink
                            v-for="anime in recentlyWatched"
                            :key="anime.anime_ref_id"
                            :to="`/anime/${anime.anime_ref_id}`"
                            class="group block rounded-xl shadow-sm transition-all"
                            :class="anime.isMutual
                                ? 'ring-2 ring-sky-400/80 hover:ring-sky-400'
                                : mobile
                                    ? 'ring-1 ring-black/5 dark:ring-white/10'
                                    : 'ring-1 ring-black/5 dark:ring-white/5 hover:ring-black/20 dark:hover:ring-white/20'"
                            @click="emit('select')"
                        >
                            <div class="relative aspect-[2/3] overflow-hidden rounded-[inherit]">
                                <NuxtImg
                                    :src="anime.anime_image"
                                    :alt="anime.anime_title"
                                    class="w-full h-full object-cover"
                                    :class="!mobile && 'transition-transform duration-300 group-hover:scale-105'"
                                    loading="lazy"
                                />
                                <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent opacity-80" />
                                <div
                                    v-if="anime.isMutual"
                                    class="absolute inline-flex items-center justify-center rounded-full bg-sky-500 text-white shadow"
                                    :class="mobile ? 'top-1.5 right-1.5 size-5' : 'top-2 right-2 size-6 shadow-md shadow-sky-500/40'"
                                    title="共同觀看"
                                >
                                    <span class="material-symbols-rounded" :class="mobile ? 'text-[11px]' : 'text-[13px]'">group</span>
                                </div>
                                <div class="absolute bottom-0 left-0 right-0 space-y-1" :class="mobile ? 'p-1.5' : 'p-2'">
                                    <p class="font-medium text-gray-100 truncate" :class="mobile ? 'text-[10px]' : 'text-[11px]'">{{ anime.anime_title }}</p>
                                    <div class="flex items-center justify-between text-gray-300" :class="mobile ? 'text-[9px]' : 'text-[10px]'">
                                        <span>第 {{ anime.episode_number }} 集</span>
                                        <span>{{ anime.progress_percentage }}%</span>
                                    </div>
                                    <div class="rounded-full bg-white/10 overflow-hidden" :class="mobile ? 'h-0.5' : 'h-1'">
                                        <div class="h-full rounded-full bg-white" :style="{ width: `${anime.progress_percentage}%` }" />
                                    </div>
                                </div>
                            </div>
                        </NuxtLink>
                    </div>
                    <div
                        v-else
                        class="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-black/10 dark:border-white/10 px-6 text-xs text-gray-500 dark:text-gray-400"
                        :class="mobile ? 'py-24' : 'py-20'"
                    >
                        <span class="material-symbols-rounded text-3xl opacity-50">history_toggle_off</span>
                        尚未有任何觀看活動
                    </div>
                </section>

                <!-- Favorites -->
                <section
                    :ref="(el) => setPanelRef(el, 1)"
                    class="box-border w-full min-w-full shrink-0 overflow-hidden"
                    :class="mobile ? 'px-4 pt-1 pb-1' : 'px-0.5 py-0.5'"
                >
                    <div v-if="favorites.length" class="grid gap-2.5 p-0.5" :class="mobile ? 'grid-cols-3' : 'grid-cols-4 lg:grid-cols-5 gap-3'">
                        <NuxtLink
                            v-for="anime in favorites"
                            :key="anime.anime_ref_id"
                            :to="`/anime/${anime.anime_ref_id}`"
                            class="group block rounded-xl shadow-sm transition-all"
                            :class="anime.isMutual
                                ? 'ring-2 ring-rose-400/80 hover:ring-rose-400'
                                : mobile
                                    ? 'ring-1 ring-black/5 dark:ring-white/10'
                                    : 'ring-1 ring-black/5 dark:ring-white/5 hover:ring-rose-400/50'"
                            @click="emit('select')"
                        >
                            <div class="relative aspect-[2/3] overflow-hidden rounded-[inherit]">
                                <NuxtImg
                                    :src="anime.anime_image"
                                    :alt="anime.anime_title"
                                    class="w-full h-full object-cover"
                                    :class="!mobile && 'transition-transform duration-300 group-hover:scale-105'"
                                    loading="lazy"
                                />
                                <div class="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
                                <div
                                    class="absolute inline-flex items-center justify-center rounded-full text-white"
                                    :class="[
                                        anime.isMutual ? 'bg-rose-500' : 'bg-rose-500/90',
                                        mobile ? 'top-1.5 right-1.5 size-5 shadow' : 'top-2 right-2 size-6 shadow-lg shadow-rose-500/50',
                                    ]"
                                    :title="anime.isMutual ? '共同收藏' : '收藏'"
                                >
                                    <span class="material-symbols-rounded" :class="mobile ? 'text-[11px]' : 'text-[13px]'">{{ anime.isMutual ? 'favorite' : 'bookmark' }}</span>
                                </div>
                                <div class="absolute bottom-0 left-0 right-0" :class="mobile ? 'p-1.5' : 'p-2'">
                                    <p class="font-medium text-gray-100 truncate" :class="mobile ? 'text-[10px]' : 'text-[11px]'">{{ anime.anime_title }}</p>
                                    <p class="text-gray-300" :class="mobile ? 'text-[9px]' : 'text-[10px]'">收藏於 {{ formatRelativeDate(anime.created_at) }}</p>
                                </div>
                            </div>
                        </NuxtLink>
                    </div>
                    <div
                        v-else
                        class="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-black/10 dark:border-white/10 px-6 text-xs text-gray-500 dark:text-gray-400"
                        :class="mobile ? 'py-24' : 'py-20'"
                    >
                        <span class="material-symbols-rounded text-3xl opacity-50">bookmark_remove</span>
                        尚未收藏任何動漫
                    </div>
                </section>

                <!-- Mutual friends -->
                <section
                    :ref="(el) => setPanelRef(el, 2)"
                    class="box-border w-full min-w-full shrink-0 overflow-hidden"
                    :class="mobile ? 'px-4 pt-1 pb-1' : 'px-0.5 py-0.5'"
                >
                    <div v-if="mutualFriends.length" class="p-0.5" :class="mobile ? 'space-y-2' : 'grid grid-cols-2 sm:grid-cols-3 gap-3'">
                        <div
                            v-for="person in mutualFriends"
                            :key="person.id"
                            class="flex items-center gap-3 rounded-xl bg-black/[0.02] dark:bg-white/[0.03] ring-1 ring-black/5 dark:ring-white/10 p-3"
                        >
                            <UserAvatar :src="person.avatar" :name="person.name" :max-initials="2" class="w-11 h-11 text-sm" />
                            <p class="min-w-0 flex-1 text-sm font-medium truncate" :class="mobile ? 'text-gray-900 dark:text-gray-100' : ''">{{ person.name }}</p>
                        </div>
                    </div>
                    <div
                        v-else
                        class="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-black/10 dark:border-white/10 px-6 text-xs text-gray-500 dark:text-gray-400"
                        :class="mobile ? 'py-24' : 'py-20'"
                    >
                        <span class="material-symbols-rounded text-3xl opacity-50">group_off</span>
                        目前沒有共同好友
                    </div>
                </section>
            </div>
        </div>
    </div>
</template>
