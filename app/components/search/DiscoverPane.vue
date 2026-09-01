<script setup>
const props = defineProps({
    history: { type: Array, default: () => [] },
    activeHistoryId: { type: [String, Number], default: null },
})

const tab = defineModel('tab', { type: String, default: 'history' })
const emit = defineEmits([
    'select-anime',
    'select-tag',
    'select-category',
    'select-history',
    'remove-history',
    'hover-history',
    'hover-anime',
    'leave-anime',
])

const FORMAT_TYPES = [
    { id: '電影', icon: 'movie', hint: '劇場版與電影動畫' },
    { id: 'OVA', icon: 'video_library', hint: 'OVA 與特別篇' },
    { id: '雙語', icon: 'translate', hint: '雙語配音作品' },
    { id: '泡麵番', icon: 'schedule', hint: '短篇連載動畫' },
    { id: '真人演出', icon: 'live_tv', hint: '真人改編作品' },
    { id: '自訂作品', icon: 'edit_note', hint: '站內自訂收錄' },
]

const TAG_GROUPS = [
    { label: '動作與冒險', tags: ['動作', '冒險', '奇幻', '異世界', '魔法', '超能力'] },
    { label: '科幻與特攝', tags: ['科幻', '機甲', '特攝'] },
    { label: '日常與治癒', tags: ['校園', '喜劇', '戀愛', '青春', '勵志', '溫馨', '悠閒', '料理', '親情', '感人'] },
    { label: '競技與職場', tags: ['運動', '競技', '偶像', '音樂', '職場'] },
    { label: '懸疑與史詩', tags: ['推理', '懸疑', '時間穿越', '歷史', '戰爭'] },
    { label: '深色題材', tags: ['血腥暴力', '靈異神怪', '黑暗'] },
    { label: '戀愛向', tags: ['BL', 'GL'] },
]

const TABS = [
    { id: 'history', label: '紀錄', icon: 'history' },
    { id: 'trending', label: '熱門', icon: 'trending_up' },
    { id: 'categories', label: '分類', icon: 'category' },
]

const RANK_TONE = [
    'text-amber-700 dark:text-amber-300',
    'text-slate-500 dark:text-slate-300',
    'text-orange-700/85 dark:text-orange-300',
    'text-gray-400 dark:text-gray-500',
]

const CARD = 'rounded-2xl bg-white shadow-sm ring-1 ring-black/6 dark:bg-white/[0.04] dark:ring-white/10'
const TITLE = 'text-base font-semibold tracking-tight text-gray-900 dark:text-gray-100'
const SUBTITLE = 'mt-0.5 text-xs text-gray-500 dark:text-gray-400'
const META = 'text-[11px] text-gray-500 dark:text-gray-400'
const REMOVE_BTN =
    'inline-flex h-7 w-7 items-center justify-center rounded-full text-gray-400 opacity-0 transition-opacity hover:bg-black/8 hover:text-gray-600 group-hover:opacity-100 dark:hover:bg-white/10 dark:hover:text-gray-200'
const HOVER_ARROW =
    'material-symbols-rounded inline-flex h-7 w-7 items-center justify-center text-[20px] text-gray-300 opacity-0 transition-all duration-300 group-hover:translate-x-0.5 group-hover:opacity-100 dark:text-gray-600'
const POSTER_LG =
    'h-[7.5rem] w-[5rem] shrink-0 overflow-hidden rounded-xl bg-black/5 ring-1 ring-black/5 dark:bg-white/10 dark:ring-white/10'
const POSTER_SM =
    'h-[4.5rem] w-12 shrink-0 overflow-hidden rounded-lg bg-black/5 ring-1 ring-black/5 dark:bg-white/10 dark:ring-white/10'
const TAG_PILL =
    'rounded-full bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm ring-1 ring-black/6 transition-[transform,background-color] duration-200 hover:-translate-y-px hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-gray-900 dark:bg-white/[0.04] dark:text-gray-200 dark:ring-white/10 dark:hover:bg-white/[0.08] dark:focus-visible:ring-white'

const trending = ref([])
const loading = ref(false)
const scrollRef = ref(null)
let loaded = false

const sortedHistory = computed(() =>
    [...props.history].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
)

function stagger(i, step = 35, max = 12) {
    return { '--stagger': `${Math.min(i, max) * step}ms` }
}

function rankLabel(i) {
    return String(i + 1).padStart(2, '0')
}

function rankTone(i) {
    return RANK_TONE[Math.min(i, RANK_TONE.length - 1)]
}

function formatHistoryWhen(createdAt) {
    if (!createdAt) return ''
    const date = new Date(createdAt)
    const diffMs = Date.now() - date.getTime()
    const diffDays = Math.floor(diffMs / 86400000)
    if (diffDays === 0) {
        const hours = Math.floor(diffMs / 3600000)
        return hours === 0 ? `${Math.max(1, Math.floor(diffMs / 60000))} 分鐘前` : `${hours} 小時前`
    }
    if (diffDays === 1) return '昨天'
    if (diffDays < 7) return `${diffDays} 天前`
    return date.toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' })
}

function animeMeta(anime) {
    const parts = []
    if (anime.year) parts.push(anime.year)
    if (anime.views != null) parts.push(`${formatViews(anime.views)} 觀看`)
    return parts.join(' · ')
}

function historyShellClass(item, featured) {
    if (featured) {
        return [
            CARD,
            'mb-3 flex items-center',
            props.activeHistoryId === item.id ? 'ring-black/12 dark:ring-white/20' : '',
        ]
    }
    return [
        'group relative flex items-center rounded-xl px-2 py-1 transition-colors',
        props.activeHistoryId === item.id
            ? 'bg-white shadow-sm ring-1 ring-black/8 dark:bg-white/[0.08] dark:ring-white/15'
            : 'hover:bg-white/80 dark:hover:bg-white/[0.06]',
    ]
}

function isActive(id) {
    return props.activeHistoryId === id
}

async function loadTrending() {
    if (loaded || loading.value) return
    loading.value = true
    try {
        const res = await $fetch('/api/animeList', { query: { page: 1, sort: '2' } })
        trending.value = (res.results || []).filter((r) => r.refId && r.title)
        loaded = true
    } catch (err) {
        console.error('Failed to load trending anime:', err)
        trending.value = []
    } finally {
        loading.value = false
    }
}

watch(tab, (id) => {
    if (id === 'trending') loadTrending()
})

watch(
    () => props.history.length,
    (len) => {
        if (len === 0 && tab.value === 'history') tab.value = 'trending'
    },
)

onMounted(() => {
    if (!props.history.length) tab.value = 'trending'
    if (tab.value === 'trending') loadTrending()
})

defineExpose({ loadTrending, tab, scrollEl: scrollRef })
</script>

<template>
    <div class="flex h-full min-h-0 flex-col md:flex-row">
        <nav class="flex shrink-0 gap-1 overflow-x-auto px-3 py-2 md:w-52 md:flex-col md:gap-0.5 md:overflow-visible md:py-3 md:pl-4 md:pr-3">
            <button
                v-for="t in TABS"
                :key="t.id"
                type="button"
                class="flex h-9 shrink-0 items-center gap-2.5 rounded-full px-3.5 text-sm transition-colors md:w-full"
                :class="
                    tab === t.id
                        ? 'bg-white font-medium text-gray-900 shadow-sm dark:bg-white/10 dark:text-gray-100'
                        : 'text-gray-500 hover:bg-black/5 dark:text-gray-400 dark:hover:bg-white/5'
                "
                @click="tab = t.id"
            >
                <span class="material-symbols-rounded text-[18px]">{{ t.icon }}</span>
                <span>{{ t.label }}</span>
            </button>
        </nav>

        <div ref="scrollRef" class="min-h-0 min-w-0 flex-1 overflow-y-auto px-3 py-3 md:pl-4 md:pr-3">
            <!-- History -->
            <div v-if="tab === 'history'" class="pb-1">
                <div class="mb-4 flex items-end justify-between gap-3">
                    <div>
                        <h3 :class="TITLE">搜尋紀錄</h3>
                        <p :class="SUBTITLE">點選關鍵字即可再次搜尋</p>
                    </div>
                    <span
                        v-if="history.length"
                        class="inline-flex items-center rounded-full bg-sky-500/10 px-2.5 py-1 text-[11px] font-medium text-sky-700 dark:bg-sky-400/10 dark:text-sky-300"
                    >
                        {{ history.length }} 筆
                    </span>
                </div>

                <div
                    v-for="(item, i) in sortedHistory"
                    :key="item.id"
                    role="option"
                    :aria-selected="isActive(item.id)"
                    :data-active="isActive(item.id) ? 'true' : undefined"
                    :class="historyShellClass(item, i === 0)"
                    :style="i > 0 ? stagger(i - 1) : undefined"
                    class="discover-stagger group"
                    @mouseenter="emit('hover-history', item)"
                >
                    <button
                        type="button"
                        class="flex min-w-0 flex-1 items-center gap-3 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gray-900 dark:focus-visible:ring-white"
                        :class="i === 0 ? 'px-3' : 'py-2 pl-1'"
                        @mousedown.prevent="emit('select-history', item)"
                    >
                        <span
                            class="inline-flex shrink-0 items-center justify-center rounded-xl"
                            :class="
                                i === 0
                                    ? 'h-10 w-10 bg-sky-500/10 text-sky-700 dark:bg-sky-400/10 dark:text-sky-300'
                                    : 'h-9 w-9 bg-black/5 text-gray-500 dark:bg-white/10 dark:text-gray-400'
                            "
                        >
                            <span class="material-symbols-rounded" :class="i === 0 ? 'text-[22px]' : 'text-[18px]'">
                                {{ i === 0 ? 'search' : 'history' }}
                            </span>
                        </span>
                        <span class="min-w-0 flex-1">
                            <span
                                class="block truncate text-sm text-gray-900 dark:text-gray-100"
                                :class="i === 0 ? 'font-semibold' : 'font-medium'"
                            >
                                {{ item.query }}
                            </span>
                            <span :class="['mt-0.5 block', META]">
                                {{ i === 0 ? '最近搜尋 · ' : '' }}{{ formatHistoryWhen(item.created_at) }}
                            </span>
                        </span>
                    </button>
                    <span class="flex shrink-0 items-center gap-0.5 pr-3">
                        <button type="button" :class="REMOVE_BTN" title="移除紀錄" @mousedown.prevent.stop="emit('remove-history', item.id)">
                            <span class="material-symbols-rounded text-[18px]">close</span>
                        </button>
                        <span v-if="i === 0" :class="HOVER_ARROW" aria-hidden="true">arrow_forward</span>
                    </span>
                </div>

                <div v-if="!sortedHistory.length" :class="[CARD, 'flex flex-col items-center px-6 py-12 text-center']">
                    <span class="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-black/5 text-gray-400 dark:bg-white/10">
                        <span class="material-symbols-rounded text-[28px]">history</span>
                    </span>
                    <p class="text-sm font-medium text-gray-900 dark:text-gray-100">尚無搜尋紀錄</p>
                    <p :class="['mt-1 max-w-[14rem] leading-relaxed', META]">搜尋過的關鍵字會保存在這裡，方便你快速再次搜尋</p>
                </div>
            </div>

            <!-- Trending -->
            <div v-else-if="tab === 'trending'" class="pb-1">
                <div class="mb-4 flex items-end justify-between gap-3">
                    <div>
                        <h3 :class="TITLE">熱度榜</h3>
                        <p :class="SUBTITLE">依全站觀看次數排序</p>
                    </div>
                    <span class="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-2.5 py-1 text-[11px] font-medium text-rose-700 dark:bg-rose-400/10 dark:text-rose-300">
                        <span class="discover-pulse-dot" aria-hidden="true" />
                        即時
                    </span>
                </div>

                <button
                    v-for="(anime, i) in trending"
                    :key="anime.refId"
                    type="button"
                    :style="stagger(i)"
                    class="discover-stagger group flex w-full items-center gap-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-gray-900 dark:focus-visible:ring-white"
                    :class="
                        i === 0
                            ? `${CARD} mb-3 px-3 py-3 transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-md hover:shadow-black/10 dark:hover:shadow-black/40`
                            : 'rounded-xl px-2 py-2 hover:bg-white/80 dark:hover:bg-white/[0.06]'
                    "
                    @mouseenter="emit('hover-anime', anime, $event.currentTarget)"
                    @mouseleave="emit('leave-anime')"
                    @click="emit('select-anime', anime)"
                >
                    <span
                        class="shrink-0 text-center font-semibold tabular-nums leading-none"
                        :class="[rankTone(i), i === 0 ? 'w-11 text-[2rem]' : 'w-8 text-lg']"
                        aria-hidden="true"
                    >
                        {{ rankLabel(i) }}
                    </span>

                    <div :class="i === 0 ? POSTER_LG : POSTER_SM">
                        <NuxtImg
                            v-if="anime.image"
                            :src="anime.image"
                            :alt="anime.title"
                            class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                            :class="i === 0 ? 'duration-700' : ''"
                            loading="lazy"
                        />
                        <div v-else class="flex h-full w-full items-center justify-center text-gray-400">
                            <span class="material-symbols-rounded" :class="i === 0 ? '' : 'text-sm'">image</span>
                        </div>
                    </div>

                    <span class="min-w-0 flex-1" :class="i === 0 ? 'py-0.5' : ''">
                        <span
                            class="block text-sm text-gray-900 dark:text-gray-100"
                            :class="[i === 0 ? 'line-clamp-2 font-semibold leading-snug' : 'truncate font-medium']"
                        >
                            {{ anime.title }}
                        </span>
                        <span v-if="animeMeta(anime)" :class="['mt-0.5 block truncate', META]">{{ animeMeta(anime) }}</span>
                    </span>

                    <span v-if="i === 0" :class="HOVER_ARROW" aria-hidden="true">arrow_forward</span>
                </button>

                <p v-if="!trending.length && !loading" class="py-8 text-center text-sm text-gray-400">目前沒有熱門資料</p>
            </div>

            <!-- Categories -->
            <div v-else class="pb-1">
                <div class="mb-4">
                    <h3 :class="TITLE">分類探索</h3>
                    <p :class="SUBTITLE">依作品格式或題材標籤篩選</p>
                </div>

                <section class="mb-5">
                    <h4 class="mb-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400">作品類型</h4>
                    <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        <button
                            v-for="(format, i) in FORMAT_TYPES"
                            :key="format.id"
                            type="button"
                            :style="stagger(i, 40, 8)"
                            :class="[
                                CARD,
                                'discover-stagger group flex flex-col gap-2 p-3 text-left outline-none transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-md hover:shadow-black/10 focus-visible:ring-2 focus-visible:ring-gray-900 dark:hover:shadow-black/40 dark:focus-visible:ring-white',
                            ]"
                            @click="emit('select-category', format.id)"
                        >
                            <span class="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-black/5 text-gray-700 transition-colors group-hover:bg-black/8 dark:bg-white/10 dark:text-gray-200 dark:group-hover:bg-white/15">
                                <span class="material-symbols-rounded text-[20px]">{{ format.icon }}</span>
                            </span>
                            <span class="min-w-0">
                                <span class="block text-sm font-semibold text-gray-900 dark:text-gray-100">{{ format.id }}</span>
                                <span :class="['mt-0.5 block leading-snug', META]">{{ format.hint }}</span>
                            </span>
                        </button>
                    </div>
                </section>

                <section>
                    <h4 class="mb-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400">題材標籤</h4>
                    <div class="space-y-3">
                        <div v-for="group in TAG_GROUPS" :key="group.label">
                            <p class="mb-1.5 text-[11px] font-medium text-gray-400 dark:text-gray-500">{{ group.label }}</p>
                            <div class="flex flex-wrap gap-1.5">
                                <button
                                    v-for="tag in group.tags"
                                    :key="tag"
                                    type="button"
                                    :class="TAG_PILL"
                                    @click="emit('select-tag', tag)"
                                >
                                    {{ tag }}
                                </button>
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    </div>
</template>

<style scoped>
.discover-stagger {
    animation: discover-rise 0.42s cubic-bezier(0.22, 1, 0.36, 1) both;
    animation-delay: var(--stagger, 0ms);
}

.discover-pulse-dot {
    width: 0.4rem;
    height: 0.4rem;
    border-radius: 9999px;
    background: currentColor;
    animation: discover-pulse 1.6s ease-in-out infinite;
}

@keyframes discover-rise {
    from {
        opacity: 0;
        transform: translateY(8px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

@keyframes discover-pulse {
    0%,
    100% {
        opacity: 0.55;
    }
    50% {
        opacity: 1;
    }
}

@media (prefers-reduced-motion: reduce) {
    .discover-stagger,
    .discover-pulse-dot {
        animation: none;
    }
}
</style>
