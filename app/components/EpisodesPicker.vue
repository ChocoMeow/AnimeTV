<script setup>
const props = defineProps({
    episodes: { type: Object, required: true },
    watchProgress: { type: Object, default: () => ({}) },
    modelValue: { type: [String, Number], default: null },
    compact: { type: Boolean, default: false },
})

const emit = defineEmits(["update:modelValue", "select"])

const pageSize = 12
const currentPage = ref(1)
const query = ref("")

// Helper function to check if a string is a pure number
function isNumericEpisode(ep) {
    return /^\d+$/.test(String(ep))
}

// Separate and sort episodes - numeric first, then special
const episodeList = computed(() => {
    const keys = Object.keys(props.episodes)

    const numeric = []
    const special = []

    keys.forEach((key) => {
        if (isNumericEpisode(key)) {
            numeric.push(Number(key))
        } else {
            special.push(key)
        }
    })

    // Sort numeric episodes
    numeric.sort((a, b) => a - b)

    // Sort special episodes alphabetically
    special.sort()

    // Return numeric first, then special
    return [...numeric, ...special]
})

const totalPages = computed(() => Math.max(1, Math.ceil(episodeList.value.length / pageSize)))

const filtered = computed(() => {
    if (!query.value) return episodeList.value

    const q = query.value.toLowerCase().trim()

    return episodeList.value.filter((ep) => {
        const epStr = String(ep).toLowerCase()
        return epStr.includes(q)
    })
})

const pageStart = computed(() => (currentPage.value - 1) * pageSize)
const paged = computed(() => filtered.value.slice(pageStart.value, pageStart.value + pageSize))

function selectEpisode(ep) {
    emit("update:modelValue", String(ep))
    emit("select", String(ep))
}

function applyRange(rangeStart) {
    const idx = episodeList.value.findIndex((ep) => String(ep) === String(rangeStart))
    if (idx !== -1) {
        currentPage.value = Math.floor(idx / pageSize) + 1
    }
}


function getProgressPercentage(ep) {
    return props.watchProgress[String(ep)]?.progress_percentage || 0
}

function hasWatched(ep) {
    return !!props.watchProgress[String(ep)]
}

function isCompleted(ep) {
    return getProgressPercentage(ep) >= 90
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
}

// Get display label for episodes
function getEpisodeLabel(ep) {
    return isNumericEpisode(ep) ? String(ep) : ep
}

// Get title for tooltip
function getEpisodeTitle(ep) {
    if (!props.episodes[String(ep)]) return "此集不可播放"
    return isNumericEpisode(ep) ? `第 ${ep} 集` : ep
}

watch(
    () => props.modelValue,
    (val) => {
        if (val === null || val === undefined) return
        const idx = episodeList.value.findIndex((ep) => String(ep) === String(val))
        if (idx !== -1) {
            currentPage.value = Math.floor(idx / pageSize) + 1
        }
    },
    { immediate: true }
)
</script>

<template>
    <!-- Compact Grid Mode (for sidebar) -->
    <div v-if="compact" class="space-y-4" role="list" aria-label="Episode list">
        <!-- Search -->
        <div class="flex items-center gap-2">
            <input 
                v-model="query" 
                type="text" 
                class="input-field flex-1 text-sm" 
                placeholder="搜尋集數..." 
                aria-label="Search episodes"
            />
        </div>

        <!-- Range Selector -->
        <div v-if="totalPages > 1" class="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent">
            <button 
                v-for="(start, idx) in Array.from({ length: totalPages }, (_, i) => episodeList[i * pageSize])" 
                :key="start" 
                @click="applyRange(start)" 
                :class="['px-3 py-1.5 text-xs rounded-lg border transition-colors focus:outline-none flex-shrink-0', currentPage === idx + 1 ? 'bg-black/70 dark:bg-gray-100 text-white dark:text-gray-900 border-gray-900 dark:border-gray-100' : 'bg-white dark:bg-white/10 border-gray-200 dark:border-white/20 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/20']"
            >
                {{ getEpisodeLabel(start) }}–{{ getEpisodeLabel(episodeList[Math.min((idx + 1) * pageSize - 1, episodeList.length - 1)]) }}
            </button>
        </div>

        <!-- Episodes Grid -->
        <div>
            <div v-if="paged.length === 0" class="text-center py-6 text-gray-500 dark:text-gray-400 text-sm">找不到相關集數</div>

            <div v-else class="episode-grid-compact gap-2" role="list">
                <button
                    v-for="ep in paged"
                    :key="ep"
                    @click="selectEpisode(ep)"
                    class="episode-button relative group"
                    :class="{
                        active: String(ep) === String(modelValue),
                        watched: hasWatched(ep) && String(ep) !== String(modelValue),
                        completed: isCompleted(ep) && String(ep) !== String(modelValue),
                        disabled: !props.episodes[String(ep)],
                        special: !isNumericEpisode(ep),
                    }"
                    :disabled="!props.episodes[String(ep)]"
                    :title="getEpisodeTitle(ep)"
                    :aria-label="getEpisodeTitle(ep)"
                    :aria-current="String(ep) === String(modelValue) ? 'true' : undefined"
                    role="listitem"
                >
                    <!-- Episode Number/Label -->
                    <div class="relative z-0 flex flex-col items-center justify-center h-full overflow-hidden rounded-lg px-1">
                        <span class="text-sm sm:text-base font-medium truncate max-w-full">
                            {{ getEpisodeLabel(ep) }}
                        </span>
                    </div>

                    <!-- Progress Bar -->
                    <div v-if="hasWatched(ep) && String(ep) !== String(modelValue)" class="absolute bottom-0 left-0 h-0.5 z-0 transition-all rounded-bl-lg" :class="isCompleted(ep) ? 'bg-green-500' : 'bg-gray-600 dark:bg-gray-400'" :style="{ width: `${getProgressPercentage(ep)}%` }"></div>

                    <!-- Hover Tooltip -->
                    <div v-if="watchProgress[String(ep)]" class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-black/70 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-20 shadow-xl">
                        <div class="flex flex-col gap-1">
                            <div class="font-semibold">{{ getEpisodeTitle(ep) }}</div>
                            <div class="text-gray-300">
                                {{ formatTime(watchProgress[String(ep)].playback_time) }} /
                                {{ formatTime(watchProgress[String(ep)].video_duration) }}
                            </div>
                            <div :class="isCompleted(ep) ? 'text-green-400' : 'text-gray-400'">{{ getProgressPercentage(ep) }}% 完成</div>
                        </div>
                        <!-- Arrow -->
                        <div class="absolute top-full left-1/2 -translate-x-1/2 -mt-1 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                    </div>
                </button>
            </div>
        </div>
    </div>

    <!-- Full Grid Mode (default) -->
    <div v-else class="space-y-4">
        <!-- Controls -->
        <div class="flex flex-wrap items-center gap-3">
            <!-- Search -->
            <div class="flex items-center gap-2">
                <label class="text-sm text-gray-600 dark:text-gray-400">搜尋:</label>
                <input v-model="query" type="text" class="input-field w-32" placeholder="集數或特別篇" />
            </div>
        </div>

        <!-- Range Selector -->
        <div v-if="totalPages > 1" class="border-t border-gray-200 dark:border-gray-700 pt-4">
            <div class="flex items-center gap-2 mb-3">
                <span class="text-sm font-medium text-gray-700 dark:text-gray-300">範圍:</span>
            </div>
            <div class="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent">
                <button v-for="(start, idx) in Array.from({ length: totalPages }, (_, i) => episodeList[i * pageSize])" :key="start" @click="applyRange(start)" :class="['px-4 py-2 text-sm rounded-lg border transition-colors flex-shrink-0', currentPage === idx + 1 ? 'bg-black/70 dark:bg-white text-white dark:text-black' : 'bg-white dark:bg-white/10 border-2 border-black/10 dark:border-white/10 text-gray-700 dark:text-gray-300 hover:bg-black/10 dark:hover:bg-white/20']">{{ getEpisodeLabel(start) }}–{{ getEpisodeLabel(episodeList[Math.min((idx + 1) * pageSize - 1, episodeList.length - 1)]) }}</button>
            </div>
        </div>

        <!-- Episodes Grid -->
        <div class="border-t border-gray-200 dark:border-gray-700 pt-4">
            <div v-if="paged.length === 0" class="text-center py-6 text-gray-500 dark:text-gray-400">找不到相關集數</div>

            <div v-else class="episode-grid-full gap-2 z-0">
                <button
                    v-for="ep in paged"
                    :key="ep"
                    @click="selectEpisode(ep)"
                    class="episode-button relative group"
                    :class="{
                        active: String(ep) === String(modelValue),
                        watched: hasWatched(ep) && String(ep) !== String(modelValue),
                        completed: isCompleted(ep) && String(ep) !== String(modelValue),
                        disabled: !props.episodes[String(ep)],
                        special: !isNumericEpisode(ep),
                    }"
                    :disabled="!props.episodes[String(ep)]"
                    :title="getEpisodeTitle(ep)"
                >
                    <!-- Episode Number/Label -->
                    <div class="relative z-0 flex flex-col items-center justify-center h-full overflow-hidden rounded-lg px-1">
                        <span class="text-sm font-medium truncate max-w-full" :class="{ 'text-xs': String(ep).length > 4 }">
                            {{ getEpisodeLabel(ep) }}
                        </span>
                    </div>

                    <!-- Progress Bar -->
                    <div v-if="hasWatched(ep) && String(ep) !== String(modelValue)" class="absolute bottom-0 left-0 h-0.5 z-0 transition-all rounded-bl-lg" :class="isCompleted(ep) ? 'bg-green-500' : 'bg-gray-600 dark:bg-gray-400'" :style="{ width: `${getProgressPercentage(ep)}%` }"></div>

                    <!-- Hover Tooltip -->
                    <div v-if="watchProgress[String(ep)]" class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-black/70 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-20 shadow-xl">
                        <div class="flex flex-col gap-1">
                            <div class="font-semibold">{{ getEpisodeTitle(ep) }}</div>
                            <div class="text-gray-300">
                                {{ formatTime(watchProgress[String(ep)].playback_time) }} /
                                {{ formatTime(watchProgress[String(ep)].video_duration) }}
                            </div>
                            <div :class="isCompleted(ep) ? 'text-green-400' : 'text-gray-400'">{{ getProgressPercentage(ep) }}% 完成</div>
                        </div>
                        <!-- Arrow -->
                        <div class="absolute top-full left-1/2 -translate-x-1/2 -mt-1 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                    </div>
                </button>
            </div>
        </div>
    </div>
</template>

<style scoped>
.input-field {
    @apply px-3 py-2 bg-white dark:bg-gray-950/50 border border-gray-300 dark:border-gray-600
           text-gray-900 dark:text-gray-100 rounded-lg text-sm
           focus:outline-none focus:ring-2 focus:ring-white/10 focus:border-transparent
           transition-shadow;
}

.episode-button {
    @apply aspect-square rounded-lg text-sm font-medium border-2 transition-all duration-300
           bg-gray-950/5 dark:bg-white/10
           border-gray-300 dark:border-gray-700
           text-gray-700 dark:text-gray-300
           hover:bg-gray-950/10 dark:hover:bg-white/20
           hover:border-gray-400 dark:hover:border-gray-600
           hover:text-gray-900 dark:hover:text-gray-100
           hover:shadow-md
           flex items-center justify-center
           cursor-pointer
           min-w-0;
}

.episode-button.active {
    @apply bg-black/70 dark:bg-gray-100 border-gray-900 dark:border-gray-100 text-white dark:text-gray-900
           shadow-lg scale-105;
}

.episode-button.watched {
    @apply border-gray-300 dark:border-gray-700
           bg-gray-50 dark:bg-gray-900/20;
}

.episode-button.completed {
    @apply border-green-300 dark:border-green-700
           bg-green-50 dark:bg-green-900/20
           text-green-700 dark:text-green-400;
}

.episode-button.special {
    @apply bg-gradient-to-br from-gray-600 to-gray-800 
           border-gray-500 dark:border-gray-600
           text-white font-semibold
           hover:from-gray-700 hover:to-gray-900
           hover:border-gray-600;
}

.episode-button.special.active {
    @apply from-gray-800 to-gray-950 
           border-gray-800
           shadow-xl shadow-gray-500/50;
}

.episode-button.special.watched:not(.active) {
    @apply from-gray-500 to-gray-700 
           border-gray-400 dark:border-gray-600
           opacity-80;
}

.episode-button.completed .material-icons {
    @apply text-green-600 dark:text-green-400;
}

.episode-button.watched:not(.completed):not(.special) .material-icons {
    @apply text-gray-600 dark:text-gray-400;
}

.episode-button.special .material-icons {
    @apply text-white;
}

.episode-button.disabled {
    @apply opacity-40 cursor-not-allowed 
           hover:border-gray-300 hover:text-gray-700 
           dark:hover:border-gray-600 dark:hover:text-gray-300
           hover:shadow-none;
}

.episode-button.disabled.special {
    @apply from-gray-400 to-gray-500 
           border-gray-400
           hover:from-gray-400 hover:to-gray-500;
}

/* Responsive episode grids - auto-size based on container width */
.episode-grid-compact {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(2.5rem, 4rem));
    max-width: 100%;
}

.episode-grid-full {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(3rem, 5rem));
    max-width: 100%;
}

/* Adjust for larger screens to allow more buttons per row */
@media (min-width: 640px) {
    .episode-grid-compact {
        grid-template-columns: repeat(auto-fill, minmax(2.75rem, 1fr));
    }
    
    .episode-grid-full {
        grid-template-columns: repeat(auto-fill, minmax(3.25rem, 1fr));
    }
}

@media (min-width: 1024px) {
    .episode-grid-compact {
        grid-template-columns: repeat(auto-fill, minmax(3rem, 1fr));
    }
    
    .episode-grid-full {
        grid-template-columns: repeat(auto-fill, minmax(3.5rem, 1fr));
    }
}

</style>
