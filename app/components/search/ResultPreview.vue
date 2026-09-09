<script setup>
const props = defineProps({
    details: { type: Object, default: null },
    loading: { type: Boolean, default: false },
    error: { type: String, default: null },
    fallback: { type: Object, default: null },
})

const emit = defineEmits(['favorite-toggled'])

const { userSettings } = useUserSettings()
const client = useSupabaseClient()
const favoriteLoading = ref(false)
const relatedScrollRef = ref(null)

const display = computed(() => props.details || props.fallback || null)
const displayKey = computed(() => String(display.value?.refId || display.value?.title || 'empty'))
const scoreLabel = computed(() => props.details?.userRating?.score || display.value?.score || null)
const premiereLabel = computed(() => props.details?.premiereDate || display.value?.year || null)
const episodeLabel = computed(() => {
    const d = props.details
    if (!d) return props.fallback?.episodes ?? null
    return (d.episodeCount ?? Object.keys(d.episodes || {}).length) || props.fallback?.episodes || null
})
const relatedItems = computed(() =>
    (props.details?.relatedAnime || []).filter((a) => a?.refId && a?.image).slice(0, 8),
)
const showSkeleton = computed(() => props.loading && !props.details && !props.fallback)
const showError = computed(() => !!props.error && !props.details && !props.fallback)

function onRelatedWheel(e) {
    const el = relatedScrollRef.value
    if (!el || Math.abs(e.deltaY) < Math.abs(e.deltaX)) return

    const max = el.scrollWidth - el.clientWidth
    if (max <= 0) return
    if ((e.deltaY < 0 && el.scrollLeft <= 0) || (e.deltaY > 0 && el.scrollLeft >= max - 1)) return

    e.preventDefault()
    el.scrollLeft = Math.max(0, Math.min(max, el.scrollLeft + e.deltaY))
}

watch(
    relatedScrollRef,
    (el, _prev, onCleanup) => {
        if (!el) return
        el.addEventListener('wheel', onRelatedWheel, { passive: false })
        onCleanup(() => el.removeEventListener('wheel', onRelatedWheel))
    },
    { flush: 'post' },
)

async function toggleFavorite(event) {
    event.preventDefault()
    event.stopPropagation()
    if (!props.details?.refId || !userSettings.value?.id || favoriteLoading.value) return
    favoriteLoading.value = true
    const newValue = !props.details.isFavorite
    try {
        if (newValue) {
            await client.from('favorites').insert({
                user_id: userSettings.value.id,
                anime_ref_id: props.details.refId,
                anime_title: props.details.title,
                anime_image: props.details.image,
            })
        } else {
            await client.from('favorites').delete().match({
                user_id: userSettings.value.id,
                anime_ref_id: props.details.refId,
            })
        }
        emit('favorite-toggled', { refId: props.details.refId, isFavorite: newValue })
    } catch (err) {
        console.error('Failed to toggle favorite:', err)
    } finally {
        favoriteLoading.value = false
    }
}
</script>

<template>
    <aside
        class="relative isolate flex h-full min-h-0 w-[min(26rem,40%)] min-w-[20rem] shrink-0 flex-col overflow-hidden border-l border-black/10 bg-gray-100 dark:border-white/10 dark:bg-[#141414]"
    >
        <div
            v-if="display?.image"
            class="pointer-events-none absolute inset-0 z-0 overflow-hidden"
            aria-hidden="true"
        >
            <img
                :key="displayKey"
                :src="display.image"
                alt=""
                class="absolute inset-0 h-full w-full scale-[1.35] object-cover object-[center_20%] opacity-45 blur-3xl dark:opacity-35"
                loading="lazy"
                decoding="async"
            >
            <div class="absolute inset-0 bg-gradient-to-b from-gray-100/55 via-gray-100/80 to-gray-100 dark:from-[#141414]/50 dark:via-[#141414]/82 dark:to-[#141414]" />
        </div>

        <div class="relative z-10 flex min-h-0 flex-1 flex-col">
            <div v-if="showSkeleton" class="flex flex-1 flex-col gap-4 px-5 py-5" aria-busy="true">
                <div class="h-7 w-4/5 animate-pulse rounded-md bg-black/10 dark:bg-white/10" />
                <div class="flex gap-3">
                    <div class="h-4 w-14 animate-pulse rounded-full bg-black/5 dark:bg-white/10" />
                    <div class="h-4 w-16 animate-pulse rounded-full bg-black/5 dark:bg-white/10" />
                </div>
                <div class="mt-1 space-y-2">
                    <div class="h-3.5 w-full animate-pulse rounded bg-black/5 dark:bg-white/10" />
                    <div class="h-3.5 w-full animate-pulse rounded bg-black/5 dark:bg-white/10" />
                    <div class="h-3.5 w-3/4 animate-pulse rounded bg-black/5 dark:bg-white/10" />
                </div>
                <div class="mt-auto flex flex-wrap gap-1.5 pt-6">
                    <div class="h-6 w-12 animate-pulse rounded-full bg-black/5 dark:bg-white/10" />
                    <div class="h-6 w-14 animate-pulse rounded-full bg-black/5 dark:bg-white/10" />
                    <div class="h-6 w-12 animate-pulse rounded-full bg-black/5 dark:bg-white/10" />
                </div>
            </div>

            <div
                v-else-if="showError"
                class="flex flex-1 flex-col items-center justify-center gap-2 px-5 text-center"
            >
                <span class="inline-flex h-11 w-11 items-center justify-center rounded-full bg-red-500/10 text-red-600 dark:text-red-400">
                    <span class="material-symbols-rounded text-[24px]">error_outline</span>
                </span>
                <p class="text-sm font-medium text-gray-900 dark:text-gray-100">無法載入詳情</p>
                <p class="max-w-[14rem] text-xs leading-relaxed text-gray-500 dark:text-gray-400">{{ error }}</p>
            </div>

            <div
                v-else-if="display"
                :key="displayKey"
                class="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-5 [scrollbar-gutter:stable] [scrollbar-width:thin]"
            >
                <header class="flex items-start gap-3">
                    <h3 class="min-w-0 flex-1 text-base leading-snug font-semibold text-gray-900 dark:text-white sm:text-lg">
                        <span class="line-clamp-3">{{ display.title }}</span>
                    </h3>
                    <button
                        v-if="details?.refId"
                        type="button"
                        class="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/5 text-gray-700 transition-colors hover:bg-black/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2 disabled:opacity-50 dark:bg-white/10 dark:text-gray-300 dark:hover:bg-white/20 dark:focus-visible:ring-gray-500 dark:focus-visible:ring-offset-[#141414]"
                        :disabled="favoriteLoading || !userSettings?.id"
                        :title="details.isFavorite ? '已收藏' : '收藏'"
                        :aria-label="details.isFavorite ? '取消收藏' : '加入收藏'"
                        :aria-pressed="!!details.isFavorite"
                        @click="toggleFavorite"
                    >
                        <span
                            v-if="!favoriteLoading"
                            class="material-symbols-rounded text-xl"
                            :class="details.isFavorite ? 'text-red-500' : ''"
                        >
                            {{ details.isFavorite ? 'bookmark_added' : 'bookmark_add' }}
                        </span>
                        <LoadingSpinner v-else size="xs" />
                    </button>
                </header>

                <dl
                    v-if="scoreLabel || display.views != null || episodeLabel"
                    class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600 tabular-nums dark:text-gray-300 sm:text-sm"
                >
                    <div v-if="scoreLabel" class="inline-flex items-center gap-1.5">
                        <dt class="sr-only">評分</dt>
                        <dd class="inline-flex items-center gap-1">
                            <span class="material-symbols-rounded text-sm text-yellow-400">star</span>
                            <span class="font-bold text-gray-900 dark:text-white">{{ scoreLabel }}</span>
                            <span v-if="details?.userRating?.votes" class="text-xs text-gray-500 dark:text-gray-400">
                                ({{ formatViews(details.userRating.votes) }})
                            </span>
                        </dd>
                    </div>
                    <div v-if="display.views != null" class="inline-flex items-center gap-1.5">
                        <dt class="sr-only">觀看</dt>
                        <dd class="inline-flex items-center gap-1.5">
                            <span class="material-symbols-rounded text-sm">visibility</span>
                            {{ formatViews(display.views) }}
                        </dd>
                    </div>
                    <div v-if="episodeLabel" class="inline-flex items-center gap-1.5">
                        <dt class="sr-only">集數</dt>
                        <dd class="inline-flex items-center gap-1.5">
                            <span class="material-symbols-rounded text-sm">movie</span>
                            {{ episodeLabel }}
                        </dd>
                    </div>
                </dl>

                <p
                    v-if="display.description"
                    class="mt-4 text-xs leading-7 text-gray-700 dark:text-gray-300 sm:text-sm sm:leading-7"
                >
                    <span class="line-clamp-[12]">{{ display.description }}</span>
                </p>

                <div
                    v-if="premiereLabel || details?.director || details?.productionCompany"
                    class="mt-4 space-y-2 text-sm"
                >
                    <div v-if="premiereLabel" class="flex gap-2">
                        <span class="shrink-0 font-semibold whitespace-nowrap text-gray-900 dark:text-white">首播:</span>
                        <span class="truncate text-gray-600 dark:text-gray-300">{{ premiereLabel }}</span>
                    </div>
                    <div v-if="details?.director" class="flex gap-2">
                        <span class="shrink-0 font-semibold whitespace-nowrap text-gray-900 dark:text-white">導演:</span>
                        <span class="truncate text-gray-600 dark:text-gray-300">{{ details.director }}</span>
                    </div>
                    <div v-if="details?.productionCompany" class="flex gap-2">
                        <span class="shrink-0 font-semibold whitespace-nowrap text-gray-900 dark:text-white">製作:</span>
                        <span class="truncate text-gray-600 dark:text-gray-300">{{ details.productionCompany }}</span>
                    </div>
                </div>

                <div v-if="details?.tags?.length" class="mt-4 flex flex-wrap gap-2">
                    <NuxtLink
                        v-for="tag in details.tags.slice(0, 6)"
                        :key="tag"
                        :to="{ path: '/show-all-anime', query: { tags: tag } }"
                        class="inline-flex items-center gap-1 rounded-full bg-black/5 px-2.5 py-1 text-xs font-medium text-gray-900 ring-1 ring-black/5 transition-all hover:bg-black/10 hover:ring-black/10 dark:bg-white/10 dark:text-white dark:ring-white/10 dark:hover:bg-white/20 dark:hover:ring-white/20"
                        @click.stop
                    >
                        <span class="material-symbols-rounded text-xs">tag</span>
                        {{ tag }}
                    </NuxtLink>
                </div>

                <section v-if="relatedItems.length" class="mt-auto shrink-0 pt-5 pb-1">
                    <h4 class="mb-3 text-xs font-semibold tracking-wide text-gray-400 uppercase">相關動漫</h4>
                    <div ref="relatedScrollRef" class="related-scroll -mx-1 flex gap-4 overflow-x-auto px-1 py-1">
                        <NuxtLink
                            v-for="anime in relatedItems"
                            :key="anime.refId"
                            :to="`/anime/${anime.refId}`"
                            class="group w-32 shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-gray-900 dark:focus-visible:ring-white sm:w-36"
                            :title="anime.title"
                            @click.stop
                        >
                            <div class="aspect-[2/3] overflow-hidden rounded-lg bg-black/5 ring-1 ring-black/5 transition group-hover:ring-black/15 dark:bg-white/10 dark:ring-white/10 dark:group-hover:ring-white/25">
                                <NuxtImg
                                    :src="anime.image"
                                    :alt="anime.title"
                                    class="h-full w-full object-cover transition duration-200 group-hover:scale-[1.03]"
                                    loading="lazy"
                                />
                            </div>
                            <p class="mt-2 line-clamp-2 text-xs leading-snug text-gray-600 group-hover:text-gray-900 dark:text-gray-400 dark:group-hover:text-gray-200 sm:text-sm">
                                {{ anime.title }}
                            </p>
                        </NuxtLink>
                    </div>
                </section>

                <p v-if="loading && !details" class="mt-3 text-[11px] text-gray-400 dark:text-gray-500">
                    更新詳情中…
                </p>
            </div>

            <div v-else class="flex flex-1 flex-col items-center justify-center px-5 text-center">
                <p class="text-sm font-medium text-gray-900 dark:text-gray-100">選擇一部動漫</p>
                <p class="mt-1 max-w-[14rem] text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                    將游標移到左側結果，這裡會顯示簡介與製作資訊
                </p>
            </div>
        </div>
    </aside>
</template>

<style scoped>
.related-scroll {
    scrollbar-width: none;
    -ms-overflow-style: none;
}
.related-scroll::-webkit-scrollbar {
    display: none;
}
</style>
