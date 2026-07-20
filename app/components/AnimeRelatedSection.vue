<script setup>
const props = defineProps({
    relatedAnime: { type: Array, default: () => [] },
    tags: { type: Array, default: () => [] },
    currentRefId: { type: [String, Number], default: "" },
})

const emit = defineEmits(["tooltip-enter", "tooltip-leave"])

const client = useSupabaseClient()
const selectedTab = ref(null)
const listItems = ref([])
const listLoading = ref(false)
const listCache = ref({})
const tagScroll = ref(null)
const canScrollLeft = ref(false)
const canScrollRight = ref(false)

const tabs = computed(() => {
    const items = []
    if (props.relatedAnime?.length) {
        items.push({ id: "related", label: "相關動漫" })
    }
    if (props.tags?.length) {
        items.push({ id: "all-tags", label: "為你推薦" })
        for (const tag of props.tags) {
            items.push({ id: `tag:${tag}`, label: tag })
        }
    }
    return items
})

const showSection = computed(() => props.relatedAnime?.length || props.tags?.length)

function updateScrollArrows() {
    const el = tagScroll.value
    if (!el) return
    canScrollLeft.value = el.scrollLeft > 0
    canScrollRight.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
}

function scrollTags(direction) {
    tagScroll.value?.scrollBy({ left: direction * 140, behavior: "smooth" })
}

async function fetchByTags(tagList) {
    const tags = tagList.map(String).map((t) => t.trim()).filter(Boolean)
    if (!tags.length) return []

    let query = client
        .from("anime_meta")
        .select("source_id, title, thumbnail, premiere_date, views")
        .overlaps("tags", tags)
        .not("video_id", "is", null)
        .order("views", { ascending: false })
        .limit(20)

    if (props.currentRefId) {
        query = query.neq("source_id", props.currentRefId)
    }

    const { data, error } = await query
    if (error) throw error

    return (data || []).map((row) => {
        const premiere = row.premiere_date ? String(row.premiere_date) : ""
        return {
            refId: String(row.source_id),
            title: row.title,
            image: row.thumbnail,
            year: premiere ? premiere.slice(0, 7).replace("-", "/") : null,
            episodes: null,
            views: row.views ?? null,
        }
    })
}

async function loadTab(tabId) {
    selectedTab.value = tabId

    if (tabId === "related") {
        listItems.value = props.relatedAnime
        return
    }

    if (listCache.value[tabId]) {
        listItems.value = listCache.value[tabId]
        return
    }

    listLoading.value = true
    try {
        const tagList = tabId === "all-tags" ? props.tags : [tabId.slice(4)]
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
    const validIds = new Set(tabs.value.map((t) => t.id))
    if (!selectedTab.value || !validIds.has(selectedTab.value)) {
        selectedTab.value = tabs.value[0]?.id ?? null
    }
    if (selectedTab.value) loadTab(selectedTab.value)
}

watch(() => [props.relatedAnime, props.tags], resetAndLoad, { deep: true })
watch(tabs, () => nextTick(updateScrollArrows))

onMounted(() => {
    resetAndLoad()
    nextTick(updateScrollArrows)
    tagScroll.value?.addEventListener("scroll", updateScrollArrows, { passive: true })
    if (tagScroll.value) {
        const observer = new ResizeObserver(updateScrollArrows)
        observer.observe(tagScroll.value)
        onUnmounted(() => observer.disconnect())
    }
})

onUnmounted(() => {
    tagScroll.value?.removeEventListener("scroll", updateScrollArrows)
})
</script>

<template>
    <section v-if="showSection" aria-label="Related anime">
        <div class="relative mb-4">
            <div
                ref="tagScroll"
                class="flex gap-2 overflow-x-auto scrollbar-none"
                @scroll="updateScrollArrows">
                <button
                    v-for="tab in tabs"
                    :key="tab.id"
                    type="button"
                    class="flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors"
                    :class="selectedTab === tab.id
                        ? 'bg-gray-900 dark:bg-white text-white dark:text-black'
                        : 'bg-black/5 dark:bg-white/10 text-gray-900 dark:text-white hover:bg-black/10 dark:hover:bg-white/20'"
                    @click="loadTab(tab.id)">
                    {{ tab.label }}
                </button>
            </div>

            <div
                class="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-white dark:from-gray-950 to-transparent transition-opacity duration-200"
                :class="canScrollLeft ? 'opacity-100' : 'opacity-0'" />
            <div
                class="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-white dark:from-gray-950 to-transparent transition-opacity duration-200"
                :class="canScrollRight ? 'opacity-100' : 'opacity-0'" />

            <button
                type="button"
                class="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-white/90 dark:bg-gray-950/90 ring-1 ring-black/5 dark:ring-white/10 shadow-sm transition-all duration-200 hover:bg-gray-100 dark:hover:bg-white/15 hover:shadow-md"
                :class="canScrollLeft ? 'opacity-100' : 'opacity-0 pointer-events-none'"
                aria-label="向左捲動"
                @click="scrollTags(-1)">
                <span class="material-symbols-rounded text-lg text-gray-900 dark:text-white">chevron_left</span>
            </button>

            <button
                type="button"
                class="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-white/90 dark:bg-gray-950/90 ring-1 ring-black/5 dark:ring-white/10 shadow-sm transition-all duration-200 hover:bg-gray-100 dark:hover:bg-white/15 hover:shadow-md"
                :class="canScrollRight ? 'opacity-100' : 'opacity-0 pointer-events-none'"
                aria-label="向右捲動"
                @click="scrollTags(1)">
                <span class="material-symbols-rounded text-lg text-gray-900 dark:text-white">chevron_right</span>
            </button>
        </div>

        <div v-if="listLoading" class="flex justify-center py-8">
            <div class="w-8 h-8 border-2 border-black/10 dark:border-white/15 border-t-gray-900 dark:border-t-white rounded-full animate-spin" />
        </div>

        <div v-else-if="!listItems.length" class="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
            暫無相關作品
        </div>

        <div v-else class="space-y-3" role="list">
            <NuxtLink
                v-for="item in listItems"
                :key="item.refId || item.video_url"
                :to="`/anime/${item.refId}`"
                class="flex gap-3 p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors group focus:outline-none"
                role="listitem"
                :aria-label="`View ${item.title}`"
                @mouseenter="emit('tooltip-enter', item, $event)"
                @mouseleave="emit('tooltip-leave')">
                <div class="flex-shrink-0 w-32 aspect-video rounded overflow-hidden bg-gray-200 dark:bg-white/5">
                    <NuxtImg
                        :src="item.image"
                        :alt="`${item.title} thumbnail`"
                        loading="lazy"
                        decoding="async"
                        class="w-full h-full object-cover transform transition-transform duration-300 group-hover:scale-110" />
                </div>
                <div class="flex-1 min-w-0 space-y-1">
                    <h3 class="font-semibold text-sm text-gray-900 dark:text-white line-clamp-1 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors">
                        {{ item.title }}
                    </h3>
                    <div class="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
                        <span v-if="item.year" class="flex items-center gap-1">
                            <span class="material-symbols-rounded text-xs">calendar_today</span> {{ item.year }}
                        </span>
                        <span v-if="item.episodes" class="flex items-center gap-1">
                            <span class="material-symbols-rounded text-xs">movie</span> {{ item.episodes }}
                        </span>
                        <span v-if="item.views" class="flex items-center gap-1">
                            <span class="material-symbols-rounded text-xs">visibility</span> {{ formatViews(item.views) }}
                        </span>
                    </div>
                </div>
            </NuxtLink>
        </div>
    </section>
</template>

<style scoped>
.scrollbar-none {
    -ms-overflow-style: none;
    scrollbar-width: none;
}
.scrollbar-none::-webkit-scrollbar {
    display: none;
}
</style>
