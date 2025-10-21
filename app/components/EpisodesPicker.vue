<script setup>
import { computed, ref, watch } from "vue"

const props = defineProps({
    episodes: { type: Object, required: true },
    watchProgress: { type: Object, default: () => ({}) },
    modelValue: { type: [String, Number], default: null },
})

const emit = defineEmits(["update:modelValue", "select"])

const pageSize = 12
const currentPage = ref(1)
const query = ref("")
const jumpInput = ref("")

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

function jumpTo() {
    const input = jumpInput.value.trim()
    if (!input) return

    // Try to find exact match first (case insensitive)
    let target = episodeList.value.find((ep) => String(ep).toLowerCase() === input.toLowerCase())

    // If no exact match and input is numeric, try numeric matching with clamping
    if (!target && isNumericEpisode(input)) {
        const n = Number(input)
        const numericEpisodes = episodeList.value.filter((ep) => isNumericEpisode(ep))
        if (numericEpisodes.length > 0) {
            const max = Math.max(...numericEpisodes)
            const min = Math.min(...numericEpisodes)
            const clamped = Math.min(Math.max(n, min), max)
            target = clamped
        }
    }

    if (target !== undefined) {
        selectEpisode(target)
        const idx = episodeList.value.findIndex((ep) => String(ep) === String(target))
        if (idx !== -1) {
            currentPage.value = Math.floor(idx / pageSize) + 1
        }
    }

    jumpInput.value = ""
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
    }
)
</script>

<template>
    <div class="space-y-4">
        <!-- Controls -->
        <div class="flex flex-wrap items-center gap-3">
            <!-- Search -->
            <div class="flex items-center gap-2">
                <label class="text-sm text-gray-600 dark:text-gray-400">搜尋:</label>
                <input v-model="query" type="text" class="input-field w-32" placeholder="集數或特別篇" />
            </div>

            <!-- Jump To -->
            <div class="flex items-center gap-2">
                <label class="text-sm text-gray-600 dark:text-gray-400">跳至:</label>
                <input v-model="jumpInput" type="text" class="input-field w-32" placeholder="集數或特別篇" @keyup.enter="jumpTo" />
                <button @click="jumpTo" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg transition-colors">確定</button>
            </div>

            <!-- Total Count -->
            <div class="ml-auto text-sm text-gray-600 dark:text-gray-400">
                共 <span class="font-semibold text-gray-900 dark:text-white">{{ episodeList.length }}</span> 集
            </div>
        </div>

        <!-- Range Selector -->
        <div v-if="totalPages > 1" class="border-t border-gray-200 dark:border-gray-700 pt-4">
            <div class="flex items-center gap-2 mb-3">
                <span class="text-sm font-medium text-gray-700 dark:text-gray-300">範圍:</span>
            </div>
            <div class="flex flex-wrap gap-2">
                <button v-for="(start, idx) in Array.from({ length: totalPages }, (_, i) => episodeList[i * pageSize])" :key="start" @click="applyRange(start)" :class="['px-4 py-2 text-sm rounded-lg border transition-colors', currentPage === idx + 1 ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-indigo-600 hover:text-indigo-600 dark:hover:border-indigo-400 dark:hover:text-indigo-400']">{{ getEpisodeLabel(start) }}–{{ getEpisodeLabel(episodeList[Math.min((idx + 1) * pageSize - 1, episodeList.length - 1)]) }}</button>
            </div>
        </div>

        <!-- Episodes Grid -->
        <div class="border-t border-gray-200 dark:border-gray-700 pt-4">
            <div v-if="paged.length === 0" class="text-center py-6 text-gray-500 dark:text-gray-400">找不到相關集數</div>

            <div v-else class="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 xl:grid-cols-15 gap-2">
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
                    <div class="relative z-10 flex flex-col items-center justify-center h-full overflow-hidden rounded-lg px-1">
                        <span class="text-sm font-medium truncate max-w-full" :class="{ 'text-xs': String(ep).length > 4 }">
                            {{ getEpisodeLabel(ep) }}
                        </span>

                        <!-- Progress Indicator -->
                        <div v-if="hasWatched(ep) && String(ep) !== String(modelValue)" class="text-[10px] opacity-75 flex items-center gap-0.5 mt-0.5">
                            <span class="material-icons text-[10px]">
                                {{ isCompleted(ep) ? "check_circle" : "play_circle" }}
                            </span>
                            <span>{{ getProgressPercentage(ep) }}%</span>
                        </div>
                    </div>

                    <!-- Progress Bar -->
                    <div v-if="hasWatched(ep) && String(ep) !== String(modelValue)" class="absolute bottom-0 left-0 h-1 z-0 transition-all rounded-bl-lg" :class="isCompleted(ep) ? 'bg-green-500' : 'bg-indigo-500'" :style="{ width: `${getProgressPercentage(ep)}%` }"></div>

                    <!-- Hover Tooltip -->
                    <div v-if="watchProgress[String(ep)]" class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-20 shadow-xl">
                        <div class="flex flex-col gap-1">
                            <div class="font-semibold">{{ getEpisodeTitle(ep) }}</div>
                            <div class="text-gray-300">
                                {{ formatTime(watchProgress[String(ep)].playback_time) }} /
                                {{ formatTime(watchProgress[String(ep)].video_duration) }}
                            </div>
                            <div :class="isCompleted(ep) ? 'text-green-400' : 'text-indigo-400'">{{ getProgressPercentage(ep) }}% 完成</div>
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
    @apply px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600
           text-gray-900 dark:text-gray-100 rounded-lg text-sm
           focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
           transition-shadow;
}

.episode-button {
    @apply aspect-square rounded-lg text-sm font-medium border-2 transition-all duration-300
           bg-white dark:bg-gray-800 
           border-gray-300 dark:border-gray-600
           text-gray-700 dark:text-gray-300
           hover:border-indigo-600 hover:text-indigo-600 
           dark:hover:border-indigo-400 dark:hover:text-indigo-400
           hover:shadow-md
           flex items-center justify-center
           cursor-pointer;
}

.episode-button.active {
    @apply bg-indigo-600 border-indigo-600 text-white
           shadow-lg scale-105;
}

.episode-button.watched {
    @apply border-indigo-300 dark:border-indigo-700
           bg-indigo-50 dark:bg-indigo-900/20;
}

.episode-button.completed {
    @apply border-green-300 dark:border-green-700
           bg-green-50 dark:bg-green-900/20
           text-green-700 dark:text-green-400;
}

.episode-button.special {
    @apply bg-gradient-to-br from-purple-500 to-pink-500 
           border-purple-400 dark:border-purple-600
           text-white font-semibold
           hover:from-purple-600 hover:to-pink-600
           hover:border-purple-500;
}

.episode-button.special.active {
    @apply from-purple-700 to-pink-700 
           border-purple-700
           shadow-xl shadow-purple-500/50;
}

.episode-button.special.watched:not(.active) {
    @apply from-purple-400 to-pink-400 
           border-purple-300 dark:border-purple-600
           opacity-80;
}

.episode-button.completed .material-icons {
    @apply text-green-600 dark:text-green-400;
}

.episode-button.watched:not(.completed):not(.special) .material-icons {
    @apply text-indigo-600 dark:text-indigo-400;
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

/* Extra large grid support */
@media (min-width: 1536px) {
    .xl\:grid-cols-15 {
        grid-template-columns: repeat(15, minmax(0, 1fr));
    }
}
</style>
