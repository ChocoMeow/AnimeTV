<script setup>
import { computed, ref, watch } from "vue"

const props = defineProps({
    episodes: { type: Object, required: true },
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
                <button v-for="n in paged" :key="n" @click="selectEpisode(n)" :class="['aspect-square rounded-lg text-sm font-medium border-2 transition-colors', String(n) === String(modelValue) ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-indigo-600 hover:text-indigo-600 dark:hover:border-indigo-400 dark:hover:text-indigo-400', !props.episodes[String(n)] && 'opacity-40 cursor-not-allowed hover:border-gray-300 hover:text-gray-700 dark:hover:border-gray-600 dark:hover:text-gray-300']" :disabled="!props.episodes[String(n)]" :title="!props.episodes[String(n)] ? '此集不可播放' : `第 ${n} 集`">
                    {{ n }}
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

/* Extra large grid support */
@media (min-width: 1536px) {
    .xl\:grid-cols-15 {
        grid-template-columns: repeat(15, minmax(0, 1fr));
    }
}
</style>
