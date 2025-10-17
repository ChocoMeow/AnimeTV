<script setup>
import { computed, ref, watch } from "vue"

const props = defineProps({
    episodes: { type: Object, required: true },
    watchProgress: { type: Object, default: () => ({}) },
    modelValue: { type: [String, Number], default: null },
})
const emit = defineEmits(["update:modelValue", "select"])

const pageSize = 50
const currentPage = ref(1)
const query = ref("")
const jumpInput = ref("")

const episodeNumbers = computed(() =>
    Object.keys(props.episodes)
        .map((n) => Number(n))
        .filter((n) => !Number.isNaN(n))
        .sort((a, b) => a - b)
)

const totalPages = computed(() => Math.max(1, Math.ceil(episodeNumbers.value.length / pageSize)))
const filtered = computed(() => {
    if (!query.value) return episodeNumbers.value
    const q = Number(query.value)
    if (Number.isNaN(q)) return episodeNumbers.value
    return episodeNumbers.value.filter((n) => n === q)
})

const pageStart = computed(() => (currentPage.value - 1) * pageSize)
const paged = computed(() => filtered.value.slice(pageStart.value, pageStart.value + pageSize))

function selectEpisode(n) {
    emit("update:modelValue", String(n))
    emit("select", String(n))
}

function applyRange(rangeStart) {
    currentPage.value = Math.floor((rangeStart - 1) / pageSize) + 1
}

function jumpTo() {
    const n = Number(jumpInput.value)
    if (Number.isNaN(n)) return
    const max = episodeNumbers.value[episodeNumbers.value.length - 1]
    const min = episodeNumbers.value[0]
    const clamped = Math.min(Math.max(n, min), max)
    selectEpisode(clamped)
    currentPage.value = Math.floor((clamped - 1) / pageSize) + 1
    jumpInput.value = ""
}

function getProgressPercentage(epNum) {
    return props.watchProgress[epNum]?.progress_percentage || 0
}

function hasWatched(epNum) {
    return !!props.watchProgress[epNum]
}

function isCompleted(epNum) {
    return getProgressPercentage(epNum) >= 90
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
}

watch(
    () => props.modelValue,
    (val) => {
        if (!val) return
        const n = Number(val)
        currentPage.value = Math.floor((n - 1) / pageSize) + 1
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
                <input v-model="query" type="number" min="1" class="input-field w-24" placeholder="集數" />
            </div>

            <!-- Jump To -->
            <div class="flex items-center gap-2">
                <label class="text-sm text-gray-600 dark:text-gray-400">跳至:</label>
                <input v-model="jumpInput" type="number" min="1" class="input-field w-24" placeholder="集數" @keyup.enter="jumpTo" />
                <button @click="jumpTo" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg transition-colors">確定</button>
            </div>

            <!-- Total Count -->
            <div class="ml-auto text-sm text-gray-600 dark:text-gray-400">
                共 <span class="font-semibold text-gray-900 dark:text-white">{{ episodeNumbers.length }}</span> 集
            </div>
        </div>

        <!-- Range Selector -->
        <div v-if="totalPages > 1" class="border-t border-gray-200 dark:border-gray-700 pt-4">
            <div class="flex items-center gap-2 mb-3">
                <span class="text-sm font-medium text-gray-700 dark:text-gray-300">範圍:</span>
            </div>
            <div class="flex flex-wrap gap-2">
                <button v-for="start in Array.from({ length: totalPages }, (_, i) => i * pageSize + 1)" :key="start" @click="applyRange(start)" :class="['px-4 py-2 text-sm rounded-lg border transition-colors', currentPage === Math.floor((start - 1) / pageSize) + 1 ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-indigo-600 hover:text-indigo-600 dark:hover:border-indigo-400 dark:hover:text-indigo-400']">{{ start }}–{{ Math.min(start + pageSize - 1, episodeNumbers[episodeNumbers.length - 1]) }}</button>
            </div>
        </div>

        <!-- Episodes Grid -->
        <div class="border-t border-gray-200 dark:border-gray-700 pt-4">
            <div v-if="paged.length === 0" class="text-center py-12 text-gray-500 dark:text-gray-400">找不到相關集數</div>

            <div v-else class="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 xl:grid-cols-15 gap-2">
                <button
                    v-for="n in paged"
                    :key="n"
                    @click="selectEpisode(n)"
                    class="episode-button relative overflow-hidden group"
                    :class="{
                        active: String(n) === String(modelValue),
                        watched: hasWatched(n) && String(n) !== String(modelValue),
                        completed: isCompleted(n) && String(n) !== String(modelValue),
                        disabled: !props.episodes[String(n)],
                    }"
                    :disabled="!props.episodes[String(n)]"
                    :title="!props.episodes[String(n)] ? '此集不可播放' : `第 ${n} 集`"
                >
                    <!-- Episode Number -->
                    <div class="relative z-10 flex flex-col items-center justify-center h-full">
                        <span class="text-sm font-medium">{{ n }}</span>

                        <!-- Progress Indicator -->
                        <div v-if="hasWatched(n) && String(n) !== String(modelValue)" class="text-[10px] opacity-75 flex items-center gap-0.5 mt-0.5">
                            <span class="material-icons text-[10px]">
                                {{ isCompleted(n) ? "check_circle" : "play_circle" }}
                            </span>
                            <span>{{ getProgressPercentage(n) }}%</span>
                        </div>
                    </div>

                    <!-- Progress Bar -->
                    <div v-if="hasWatched(n) && String(n) !== String(modelValue)" class="absolute bottom-0 left-0 h-1 z-0 transition-all" :class="isCompleted(n) ? 'bg-green-500' : 'bg-indigo-500'" :style="{ width: `${getProgressPercentage(n)}%` }"></div>

                    <!-- Hover Tooltip -->
                    <div v-if="watchProgress[n]" class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-20 shadow-xl">
                        <div class="flex flex-col gap-1">
                            <div class="font-semibold">第 {{ n }} 集</div>
                            <div class="text-gray-300">
                                {{ formatTime(watchProgress[n].playback_time) }} /
                                {{ formatTime(watchProgress[n].video_duration) }}
                            </div>
                            <div :class="isCompleted(n) ? 'text-green-400' : 'text-indigo-400'">{{ getProgressPercentage(n) }}% 完成</div>
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

.episode-button.completed .material-icons {
    @apply text-green-600 dark:text-green-400;
}

.episode-button.watched:not(.completed) .material-icons {
    @apply text-indigo-600 dark:text-indigo-400;
}

.episode-button.disabled {
    @apply opacity-40 cursor-not-allowed 
           hover:border-gray-300 hover:text-gray-700 
           dark:hover:border-gray-600 dark:hover:text-gray-300
           hover:shadow-none;
}

/* Extra large grid support */
@media (min-width: 1536px) {
    .xl\:grid-cols-15 {
        grid-template-columns: repeat(15, minmax(0, 1fr));
    }
}
</style>
