<script setup>
/**
 * Episode grid with search + range chips.
 * `compact` = sidebar layout; otherwise full-width picker.
 */
const props = defineProps({
    episodes: { type: Object, required: true },
    watchProgress: { type: Object, default: () => ({}) },
    modelValue: { type: [String, Number], default: null },
    compact: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'select'])

const PAGE_SIZE = 12
const currentPage = ref(1)
const query = ref('')
const chipScroll = ref(null)

const isNumericEpisode = (ep) => /^\d+$/.test(String(ep))

/** Numeric episodes first (sorted), then special labels (A–Z). */
const episodeList = computed(() => {
    const numeric = []
    const special = []
    for (const key of Object.keys(props.episodes)) {
        if (isNumericEpisode(key)) numeric.push(Number(key))
        else special.push(key)
    }
    numeric.sort((a, b) => a - b)
    special.sort()
    return [...numeric, ...special]
})

const totalPages = computed(() => Math.max(1, Math.ceil(episodeList.value.length / PAGE_SIZE)))

const filtered = computed(() => {
    const q = query.value.toLowerCase().trim()
    if (!q) return episodeList.value
    return episodeList.value.filter((ep) => String(ep).toLowerCase().includes(q))
})

const paged = computed(() => {
    const start = (currentPage.value - 1) * PAGE_SIZE
    return filtered.value.slice(start, start + PAGE_SIZE)
})

/** First episode id of each page — used as range-chip labels. */
const rangeStarts = computed(() =>
    Array.from({ length: totalPages.value }, (_, i) => episodeList.value[i * PAGE_SIZE]),
)

function rangeEnd(idx) {
    return episodeList.value[Math.min((idx + 1) * PAGE_SIZE - 1, episodeList.value.length - 1)]
}

function getEpisodeLabel(ep) {
    return isNumericEpisode(ep) ? String(ep) : ep
}

function getEpisodeTitle(ep) {
    if (!props.episodes[String(ep)]) return '此集不可播放'
    return isNumericEpisode(ep) ? `第 ${ep} 集` : ep
}

function getProgress(ep) {
    return props.watchProgress[String(ep)]?.progress_percentage || 0
}

function hasWatched(ep) {
    return !!props.watchProgress[String(ep)]
}

function isCompleted(ep) {
    return getProgress(ep) >= 90
}

function selectEpisode(ep) {
    emit('update:modelValue', String(ep))
    emit('select', String(ep))
}

function applyRange(rangeStart) {
    const idx = episodeList.value.findIndex((ep) => String(ep) === String(rangeStart))
    if (idx !== -1) currentPage.value = Math.floor(idx / PAGE_SIZE) + 1
}

function episodeBtnClass(ep) {
    const selected = String(ep) === String(props.modelValue)
    return {
        active: selected,
        watched: hasWatched(ep) && !selected,
        completed: isCompleted(ep) && !selected,
        disabled: !props.episodes[String(ep)],
        special: !isNumericEpisode(ep),
    }
}

// Keep the current episode's page in view when selection changes
watch(
    () => props.modelValue,
    (val) => {
        if (val == null) return
        const idx = episodeList.value.findIndex((ep) => String(ep) === String(val))
        if (idx !== -1) currentPage.value = Math.floor(idx / PAGE_SIZE) + 1
    },
    { immediate: true },
)

// Rebind scroll arrows when range chips appear / layout switches
watch([totalPages, () => props.compact], () => chipScroll.value?.rebind())
</script>

<template>
    <div
        class="space-y-4"
        :class="compact ? 'min-w-0 w-full max-w-full' : ''"
        role="list"
        aria-label="Episode list"
    >
        <!-- Search -->
        <div class="flex items-center gap-2">
            <label v-if="!compact" class="text-sm text-gray-600 dark:text-gray-400">搜尋:</label>
            <input
                v-model="query"
                type="text"
                class="input-field text-sm"
                :class="compact ? 'flex-1' : 'w-32'"
                :placeholder="compact ? '搜尋集數...' : '集數或特別篇'"
                aria-label="Search episodes"
            />
        </div>

        <!-- Page range chips -->
        <div
            v-if="totalPages > 1"
            :class="compact ? '' : 'border-t border-black/10 dark:border-white/10 pt-4'"
        >
            <div v-if="!compact" class="flex items-center gap-2 mb-3">
                <span class="text-sm font-medium text-gray-700 dark:text-gray-300">範圍:</span>
            </div>
            <ChipScrollBar ref="chipScroll">
                <button
                    v-for="(start, idx) in rangeStarts"
                    :key="start"
                    type="button"
                    class="chip-pill"
                    :class="[
                        compact ? 'chip-pill--sm' : '',
                        currentPage === idx + 1 ? 'chip-pill--active' : 'chip-pill--idle',
                    ]"
                    @click="applyRange(start)"
                >
                    {{ getEpisodeLabel(start) }}–{{ getEpisodeLabel(rangeEnd(idx)) }}
                </button>
            </ChipScrollBar>
        </div>

        <!-- Episode buttons -->
        <div :class="compact ? 'min-w-0 w-full max-w-full overflow-visible' : 'border-t border-black/10 dark:border-white/10 pt-4'">
            <div
                v-if="!paged.length"
                class="text-center py-6 text-gray-500 dark:text-gray-400"
                :class="compact ? 'text-sm' : ''"
            >
                找不到相關集數
            </div>

            <div
                v-else
                class="gap-2"
                :class="compact ? 'episode-grid-compact' : 'episode-grid-full z-0'"
                role="list"
            >
                <button
                    v-for="ep in paged"
                    :key="ep"
                    type="button"
                    class="episode-button relative group"
                    :class="episodeBtnClass(ep)"
                    :disabled="!episodes[String(ep)]"
                    :title="getEpisodeTitle(ep)"
                    :aria-label="getEpisodeTitle(ep)"
                    :aria-current="String(ep) === String(modelValue) ? 'true' : undefined"
                    role="listitem"
                    @click="selectEpisode(ep)"
                >
                    <div class="relative z-0 flex flex-col items-center justify-center h-full overflow-hidden rounded-lg px-1">
                        <!-- Active: equalizer wave (3 bars), same idea as SearchMicButton -->
                        <span
                            v-if="String(ep) === String(modelValue)"
                            class="ep-wave"
                            aria-hidden="true"
                        ><i /><i /><i /></span>
                        <span
                            v-else
                            class="font-medium truncate max-w-full"
                            :class="compact ? 'text-sm sm:text-base' : ['text-sm', String(ep).length > 4 ? 'text-xs' : '']"
                        >
                            {{ getEpisodeLabel(ep) }}
                        </span>
                    </div>

                    <div
                        v-if="hasWatched(ep) && String(ep) !== String(modelValue)"
                        class="absolute bottom-0 left-0 h-0.5 z-0 transition-all rounded-bl-lg"
                        :class="isCompleted(ep) ? 'bg-green-500' : 'bg-gray-600 dark:bg-gray-400'"
                        :style="{ width: `${getProgress(ep)}%` }"
                    />

                    <div
                        v-if="watchProgress[String(ep)]"
                        class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-black text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-20 shadow-xl"
                    >
                        <div class="flex flex-col gap-1">
                            <div class="font-semibold">{{ getEpisodeTitle(ep) }}</div>
                            <div class="text-gray-300">
                                {{ formatTime(watchProgress[String(ep)].playback_time) }} /
                                {{ formatTime(watchProgress[String(ep)].video_duration) }}
                            </div>
                            <div :class="isCompleted(ep) ? 'text-green-400' : 'text-gray-400'">
                                {{ getProgress(ep) }}% 完成
                            </div>
                        </div>
                        <div class="absolute top-full left-1/2 -translate-x-1/2 -mt-1 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900" />
                    </div>
                </button>
            </div>
        </div>
    </div>
</template>

<style scoped>
.input-field {
    @apply px-3 py-2 bg-black/5 dark:bg-white/10 border border-transparent
           text-gray-900 dark:text-gray-100 rounded-xl
           focus:outline-none focus:ring-2 focus:ring-black/20 dark:focus:ring-white/20 focus:border-transparent
           transition-shadow;
}

.episode-button {
    @apply aspect-square rounded-lg text-sm font-medium border-2 transition-all duration-300
           bg-black/5 dark:bg-white/10 border-transparent
           text-gray-700 dark:text-gray-300
           hover:bg-black/10 dark:hover:bg-white/20
           hover:text-gray-900 dark:hover:text-gray-100 hover:shadow-md
           flex items-center justify-center cursor-pointer min-w-0 overflow-visible;
}
.episode-button:hover { @apply z-10; }
.episode-button.active {
    @apply bg-gray-900 dark:bg-white border-gray-900 dark:border-white text-white dark:text-black shadow-lg;
}
.episode-button.watched {
    @apply border-transparent bg-black/[0.03] dark:bg-white/5;
}
.episode-button.completed {
    @apply border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20
           text-green-700 dark:text-green-400;
}
.episode-button.disabled {
    @apply opacity-40 cursor-not-allowed hover:text-gray-700 dark:hover:text-gray-300 hover:shadow-none;
}

.episode-grid-compact {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(2.5rem, 1fr));
    max-width: 100%;
}
.episode-grid-full {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(3rem, 5rem));
    max-width: 100%;
}

@media (min-width: 640px) {
    .episode-grid-compact { grid-template-columns: repeat(auto-fill, minmax(2.75rem, 1fr)); }
    .episode-grid-full { grid-template-columns: repeat(auto-fill, minmax(3.25rem, 1fr)); }
}
@media (min-width: 1024px) {
    .episode-grid-compact { grid-template-columns: repeat(auto-fill, minmax(3rem, 1fr)); }
    .episode-grid-full { grid-template-columns: repeat(auto-fill, minmax(3.5rem, 1fr)); }
}

.ep-wave {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 2px;
    height: 0.85rem;
}
.ep-wave i {
    display: block;
    width: 2px;
    height: 100%;
    border-radius: 9999px;
    background: currentColor;
    animation: ep-wave 0.9s ease-in-out infinite;
}
.ep-wave i:nth-child(1) {
    animation-delay: 0s;
    height: 45%;
}
.ep-wave i:nth-child(2) {
    animation-delay: 0.15s;
    height: 100%;
}
.ep-wave i:nth-child(3) {
    animation-delay: 0.3s;
    height: 65%;
}
@keyframes ep-wave {
    0%,
    100% {
        transform: scaleY(0.45);
        opacity: 0.65;
    }
    50% {
        transform: scaleY(1);
        opacity: 1;
    }
}
</style>
