<script setup>
import { ANIME_TAGS } from '~~/shared/animeTags'

const props = defineProps({
    history: { type: Array, default: () => [] },
    /** Currently keyboard-highlighted history item id */
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

const TYPE_CATEGORIES = ['電影', 'OVA', '雙語', '泡麵番', '真人演出', '自訂作品']

const trending = ref([])
const loading = ref(false)
const scrollRef = ref(null)
let loaded = false

const tabs = [
    { id: 'history', label: '紀錄', icon: 'history' },
    { id: 'trending', label: '熱門', icon: 'trending_up' },
    { id: 'categories', label: '分類', icon: 'category' },
]

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

onMounted(() => {
    if (!props.history.length) tab.value = 'trending'
    if (tab.value === 'trending') loadTrending()
})

watch(
    () => props.history.length,
    (len) => {
        if (len === 0 && tab.value === 'history') tab.value = 'trending'
    },
)

defineExpose({ loadTrending, tab, scrollEl: scrollRef })
</script>

<template>
    <!-- Tabs stay outside the scroll area so they pin with the search header -->
    <div class="flex h-full min-h-0 flex-col sm:flex-row">
        <nav
            class="flex shrink-0 gap-1 overflow-x-auto bg-white px-2 py-2 dark:bg-gray-950 sm:h-fit sm:w-48 sm:flex-col sm:gap-0.5 sm:overflow-visible sm:px-1.5 sm:py-2"
        >
            <button
                v-for="t in tabs"
                :key="t.id"
                type="button"
                class="flex h-10 shrink-0 items-center gap-2 rounded-full px-4 text-xs transition-colors sm:w-full sm:text-sm"
                :class="
                    tab === t.id
                        ? 'bg-black/8 font-medium text-gray-900 dark:bg-white/10 dark:text-gray-100'
                        : 'text-gray-500 hover:bg-black/5 dark:text-gray-400 dark:hover:bg-white/5'
                "
                @click="tab = t.id"
            >
                <span class="material-symbols-rounded text-[20px]">{{ t.icon }}</span>
                <span>{{ t.label }}</span>
            </button>
        </nav>

        <div ref="scrollRef" class="min-h-0 min-w-0 flex-1 overflow-y-auto px-3 py-2 sm:px-4">
            <!-- History -->
            <template v-if="tab === 'history'">
                <h3 class="mb-2 text-xs font-semibold tracking-wide text-gray-500 dark:text-gray-400">最近搜尋</h3>

                <ul v-if="history.length" class="-mx-1">
                    <li
                        v-for="item in history"
                        :key="item.id"
                        role="option"
                        :aria-selected="activeHistoryId === item.id"
                        :data-active="activeHistoryId === item.id ? 'true' : undefined"
                        class="group flex h-10 cursor-pointer items-center justify-between gap-2 rounded-full pl-4 pr-2 transition-colors"
                        :class="
                            activeHistoryId === item.id
                                ? 'bg-black/8 dark:bg-white/10'
                                : 'hover:bg-black/5 dark:hover:bg-white/5'
                        "
                        @mouseenter="emit('hover-history', item)"
                        @mousedown.prevent="emit('select-history', item)"
                    >
                        <div class="flex min-w-0 items-center gap-2">
                            <span class="material-symbols-rounded text-sm text-gray-400">history</span>
                            <span class="truncate text-sm text-gray-700 dark:text-gray-300">{{ item.query }}</span>
                        </div>
                        <button
                            type="button"
                            class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full opacity-0 transition-opacity hover:bg-black/10 group-hover:opacity-100 dark:hover:bg-white/10"
                            title="移除紀錄"
                            @mousedown.prevent.stop="emit('remove-history', item.id)"
                        >
                            <span class="material-symbols-rounded text-sm text-gray-500">close</span>
                        </button>
                    </li>
                </ul>

                <div v-else class="flex flex-col items-center justify-center px-4 py-12 text-center">
                    <span class="material-symbols-rounded mb-2 text-3xl text-gray-300 dark:text-gray-600">history</span>
                    <p class="text-sm text-gray-500 dark:text-gray-400">尚無搜尋紀錄</p>
                    <p class="mt-1 text-xs text-gray-400">搜尋過的關鍵字會顯示在這裡</p>
                </div>
            </template>

            <!-- Trending -->
            <template v-else-if="tab === 'trending'">
                <h3 class="mb-3 text-xs font-semibold tracking-wide text-gray-500 dark:text-gray-400">熱門排行</h3>

                <div v-if="loading" class="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <div
                        v-for="n in 9"
                        :key="n"
                        class="aspect-[2/3] overflow-hidden rounded-2xl bg-black/5 dark:bg-white/10"
                    >
                        <div class="h-full w-full animate-pulse bg-black/10 dark:bg-white/10" />
                    </div>
                </div>

                <div v-else-if="trending.length" class="grid grid-cols-2 gap-3 pb-2 sm:grid-cols-3">
                    <button
                        v-for="(anime, i) in trending"
                        :key="anime.refId"
                        type="button"
                        class="group relative aspect-[2/3] w-full overflow-hidden rounded-2xl bg-black/5 text-left outline-none ring-1 ring-black/5 transition-shadow duration-300 hover:shadow-md hover:shadow-black/10 focus-visible:ring-2 focus-visible:ring-gray-900 dark:bg-white/10 dark:ring-white/10 dark:hover:shadow-black/40 dark:focus-visible:ring-white"
                        @mouseenter="emit('hover-anime', anime, $event.currentTarget)"
                        @mouseleave="emit('leave-anime')"
                        @click="emit('select-anime', anime)"
                    >
                        <NuxtImg
                            v-if="anime.image"
                            :src="anime.image"
                            :alt="anime.title"
                            class="absolute inset-0 h-full w-full object-cover [backface-visibility:hidden] transform-gpu transition-transform duration-700 ease-out will-change-transform group-hover:scale-[1.06]"
                            loading="lazy"
                        />
                        <div v-else class="absolute inset-0 flex items-center justify-center text-gray-400">
                            <span class="material-symbols-rounded">image</span>
                        </div>

                        <div class="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                        <span
                            class="absolute left-2 top-2 flex h-7 min-w-7 items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular-nums backdrop-blur-md"
                            :class="i < 3 ? 'bg-white text-gray-900 shadow-sm' : 'bg-black/45 text-white'"
                        >
                            {{ i + 1 }}
                        </span>

                        <div class="absolute inset-x-0 bottom-0 p-2.5 sm:p-3">
                            <p class="line-clamp-2 text-sm font-medium leading-snug text-white">
                                {{ anime.title }}
                            </p>
                            <p v-if="anime.views != null" class="mt-0.5 text-[11px] text-white/70">
                                {{ formatViews(anime.views) }} 觀看
                            </p>
                        </div>
                    </button>
                </div>

                <p v-else class="py-10 text-center text-sm text-gray-400">目前沒有熱門資料</p>
            </template>

            <!-- Categories -->
            <template v-else>
                <h3 class="mb-2 text-xs font-semibold tracking-wide text-gray-500 dark:text-gray-400">作品類型</h3>
                <div class="mb-4 flex flex-wrap gap-1.5">
                    <button
                        v-for="cat in TYPE_CATEGORIES"
                        :key="cat"
                        type="button"
                        class="rounded-full bg-black/5 px-4 py-2 text-xs text-gray-700 transition-colors hover:bg-black/10 dark:bg-white/10 dark:text-gray-200 dark:hover:bg-white/15"
                        @click="emit('select-category', cat)"
                    >
                        {{ cat }}
                    </button>
                </div>

                <h3 class="mb-2 text-xs font-semibold tracking-wide text-gray-500 dark:text-gray-400">題材標籤</h3>
                <div class="flex flex-wrap gap-1.5 pb-2">
                    <button
                        v-for="tag in ANIME_TAGS"
                        :key="tag"
                        type="button"
                        class="rounded-full bg-black/5 px-4 py-2 text-xs text-gray-700 transition-colors hover:bg-black/10 dark:bg-white/10 dark:text-gray-200 dark:hover:bg-white/15"
                        @click="emit('select-tag', tag)"
                    >
                        {{ tag }}
                    </button>
                </div>
            </template>
        </div>
    </div>
</template>
