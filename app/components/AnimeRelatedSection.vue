<script setup>
/**
 * Related / tag-based anime recommendations (sidebar on anime page).
 * Tabs use ChipScrollBar; cards use container queries for 2–4 columns.
 */
const props = defineProps({
    relatedAnime: { type: Array, default: () => [] },
    tags: { type: Array, default: () => [] },
    currentRefId: { type: [String, Number], default: '' },
})

const emit = defineEmits(['tooltip-enter', 'tooltip-leave'])

const client = useSupabaseClient()
const selectedTab = ref(null)
const listItems = ref([])
const listLoading = ref(false)
const listCache = ref({})
const chipScroll = ref(null)

const tabs = computed(() => {
    const items = []
    if (props.relatedAnime?.length) items.push({ id: 'related', label: '相關動漫' })
    if (props.tags?.length) {
        items.push({ id: 'all-tags', label: '為你推薦' })
        for (const tag of props.tags) items.push({ id: `tag:${tag}`, label: tag })
    }
    return items
})

const showSection = computed(() => props.relatedAnime?.length || props.tags?.length)

async function fetchByTags(tagList) {
    const tags = tagList.map(String).map((t) => t.trim()).filter(Boolean)
    if (!tags.length) return []

    let query = client
        .from('anime_meta')
        .select('source_id, title, thumbnail, premiere_date, views, score')
        .overlaps('tags', tags)
        .not('video_id', 'is', null)
        .order('views', { ascending: false })
        .limit(20)

    if (props.currentRefId) query = query.neq('source_id', props.currentRefId)

    const { data, error } = await query
    if (error) throw error

    return (data || []).map((row) => {
        const premiere = row.premiere_date ? String(row.premiere_date) : ''
        const scoreNum = Number(row.score)
        return {
            refId: String(row.source_id),
            title: row.title,
            image: row.thumbnail,
            year: premiere ? premiere.slice(0, 4) : null,
            views: row.views ?? null,
            score: Number.isFinite(scoreNum) && scoreNum > 0 ? scoreNum : null,
        }
    })
}

async function loadTab(tabId) {
    selectedTab.value = tabId

    if (tabId === 'related') {
        listItems.value = props.relatedAnime
        return
    }
    if (listCache.value[tabId]) {
        listItems.value = listCache.value[tabId]
        return
    }

    listLoading.value = true
    try {
        const tagList = tabId === 'all-tags' ? props.tags : [tabId.slice(4)]
        const items = await fetchByTags(tagList)
        listCache.value[tabId] = items
        listItems.value = items
    } catch {
        listItems.value = []
    } finally {
        listLoading.value = false
    }
}

function resetAndLoad() {
    listCache.value = {}
    const valid = new Set(tabs.value.map((t) => t.id))
    if (!selectedTab.value || !valid.has(selectedTab.value)) {
        selectedTab.value = tabs.value[0]?.id ?? null
    }
    if (selectedTab.value) loadTab(selectedTab.value)
}

watch(() => [props.relatedAnime, props.tags], resetAndLoad, { deep: true })
watch(tabs, () => nextTick(() => chipScroll.value?.rebind()))

onMounted(resetAndLoad)
</script>

<template>
    <section v-if="showSection" aria-label="Related anime">
        <ChipScrollBar ref="chipScroll" large gap-class="gap-3" class="mb-4">
            <button
                v-for="tab in tabs"
                :key="tab.id"
                type="button"
                class="chip-pill"
                :class="selectedTab === tab.id ? 'chip-pill--active' : 'chip-pill--idle'"
                @click="loadTab(tab.id)"
            >
                {{ tab.label }}
            </button>
        </ChipScrollBar>

        <div v-if="listLoading" class="flex justify-center py-8">
            <div class="w-8 h-8 border-2 border-black/10 dark:border-white/15 border-t-gray-900 dark:border-t-white rounded-full animate-spin" />
        </div>

        <div v-else-if="!listItems.length" class="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
            暫無相關作品
        </div>

        <div v-else class="related-grid-wrap">
            <div class="related-grid" role="list">
                <NuxtLink
                    v-for="item in listItems"
                    :key="item.refId || item.video_url"
                    :to="`/anime/${item.refId}`"
                    class="group overflow-hidden rounded-xl bg-black/[0.02] dark:bg-white/[0.02] ring-1 ring-black/5 dark:ring-white/5 hover:ring-black/20 dark:hover:ring-white/20 shadow-sm hover:shadow-md hover:shadow-black/10 dark:hover:shadow-black/40 transition-all focus:outline-none"
                    role="listitem"
                    :aria-label="`View ${item.title}`"
                    @mouseenter="emit('tooltip-enter', item, $event)"
                    @mouseleave="emit('tooltip-leave')"
                >
                    <div class="relative aspect-[2/3] overflow-hidden bg-gray-200 dark:bg-white/5">
                        <NuxtImg
                            :src="item.image"
                            :alt="`${item.title} thumbnail`"
                            loading="lazy"
                            decoding="async"
                            class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                        <div class="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
                        <div class="absolute bottom-0 left-0 right-0 p-2.5 space-y-1.5">
                            <p class="text-[11px] font-medium text-gray-100 line-clamp-2 leading-snug">{{ item.title }}</p>
                            <div class="flex items-center justify-between gap-2 text-xs text-gray-200">
                                <span class="inline-flex items-center gap-1 leading-none">
                                    <span class="material-symbols-rounded text-[14px] leading-none text-yellow-400">star</span>
                                    <span v-if="item.score" class="leading-none tabular-nums">{{ item.score.toFixed(1) }}</span>
                                </span>
                                <span v-if="item.year" class="leading-none tabular-nums">{{ item.year }}</span>
                            </div>
                        </div>
                    </div>
                </NuxtLink>
            </div>
        </div>
    </section>
</template>

<style scoped>
/* 2–4 poster columns based on this section's width (sidebar vs theater) */
.related-grid-wrap {
    container-type: inline-size;
}
.related-grid {
    display: grid;
    gap: 0.75rem;
    grid-template-columns: repeat(2, minmax(0, 1fr));
}
@container (min-width: 360px) {
    .related-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@container (min-width: 520px) {
    .related-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}
</style>
