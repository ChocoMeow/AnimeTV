<script setup>
const props = defineProps({
    modelValue: {
        type: Boolean,
        required: true,
    },
    episodeKeys: {
        type: Array,
        default: () => [],
    },
    episodes: {
        type: Object,
        default: () => ({}),
    },
    downloadedKeys: {
        type: Array,
        default: () => [],
    },
    isDownloading: {
        type: Boolean,
        default: false,
    },
    downloadProgress: {
        type: Number,
        default: 0,
    },
    downloadLabel: {
        type: String,
        default: "",
    },
})

const emit = defineEmits(["update:modelValue", "download", "download-all", "remove", "remove-all", "refresh"])

const selected = ref(new Set())

const downloadedSet = computed(() => new Set(props.downloadedKeys.map(String)))

/** Selected episodes that still need download (excludes 已下載 rows); drives primary button state */
const selectedPendingCount = computed(() => {
    let n = 0
    for (const k of selected.value) {
        if (!props.episodes[k]?.token) continue
        if (downloadedSet.value.has(String(k))) continue
        n++
    }
    return n
})

watch(
    () => props.modelValue,
    (open) => {
        if (open) {
            selected.value = new Set()
            emit("refresh")
        }
    }
)

/** After a batch finishes, parent refreshes downloadedKeys — drop those keys from selection so buttons stay correct */
watch(
    () => props.downloadedKeys,
    (keys) => {
        const ds = new Set(keys.map(String))
        const next = new Set()
        for (const k of selected.value) {
            if (!ds.has(String(k))) next.add(k)
        }
        if (next.size !== selected.value.size) selected.value = next
    },
    { deep: true }
)

function toggle(ep) {
    const next = new Set(selected.value)
    if (next.has(ep)) next.delete(ep)
    else next.add(ep)
    selected.value = next
}

function selectAll() {
    const downloadable = props.episodeKeys.filter(
        (k) => props.episodes[k]?.token && !downloadedSet.value.has(String(k))
    )
    selected.value = new Set(downloadable)
}

function clearSelection() {
    selected.value = new Set()
}

function close() {
    emit("update:modelValue", false)
}

function startDownload() {
    const keys = props.episodeKeys.filter(
        (k) =>
            selected.value.has(k) &&
            props.episodes[k]?.token &&
            !downloadedSet.value.has(String(k))
    )
    if (!keys.length) return
    emit("download", keys)
}

function downloadAllPending() {
    const keys = props.episodeKeys.filter(
        (k) => props.episodes[k]?.token && !downloadedSet.value.has(String(k))
    )
    if (!keys.length) return
    emit("download-all", keys)
}

function removeOne(ep) {
    emit("remove", ep)
}

function removeAll() {
    emit("remove-all")
}
</script>

<template>
    <BaseDialog
        :model-value="modelValue"
        title="離線下載"
        max-width="max-w-lg"
        scrollable
        @update:model-value="emit('update:modelValue', $event)"
    >
        <div class="space-y-3">
            <div class="flex items-center justify-between gap-2">
                <span class="text-sm font-medium text-gray-900 dark:text-white">
                    集數列表
                </span>
                <span class="text-xs text-gray-500 dark:text-gray-400">
                    已下載 {{ downloadedKeys.length }} / {{ episodeKeys.length }}
                </span>
            </div>

            <div class="flex flex-wrap gap-2 pb-1">
                <NuxtLink
                    to="/offline-downloads"
                    class="px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                >
                    管理頁
                </NuxtLink>
                <button
                    type="button"
                    class="px-3 py-1.5 text-xs rounded-lg bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/20 transition-colors"
                    :disabled="isDownloading"
                    @click="selectAll"
                >
                    全選
                </button>
                <button
                    type="button"
                    class="px-3 py-1.5 text-xs rounded-lg bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/20 transition-colors"
                    :disabled="isDownloading"
                    @click="clearSelection"
                >
                    清除選取
                </button>
                <button
                    type="button"
                    class="px-3 py-1.5 text-xs rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-medium disabled:opacity-50"
                    :disabled="isDownloading"
                    @click="downloadAllPending"
                >
                    全部下載
                </button>
                <button
                    v-if="downloadedKeys.length"
                    type="button"
                    class="px-3 py-1.5 text-xs rounded-lg text-red-600 dark:text-red-400 border border-red-200 dark:border-red-700/60 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    :disabled="isDownloading"
                    @click="removeAll"
                >
                    清除已下載
                </button>
            </div>

            <div class="max-h-64 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-200 dark:divide-gray-700">
                <label
                    v-for="ep in episodeKeys"
                    :key="ep"
                    class="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-950/5 dark:hover:bg-white/5 cursor-pointer"
                >
                    <input
                        type="checkbox"
                        class="rounded border-gray-300 dark:border-gray-600"
                        :checked="selected.has(ep)"
                        :disabled="isDownloading || !episodes[ep]?.token || downloadedSet.has(String(ep))"
                        @change="toggle(ep)"
                    />
                    <span class="flex-1 text-sm text-gray-900 dark:text-white">第 {{ ep }} 集</span>
                    <span v-if="downloadedSet.has(String(ep))" class="text-xs text-emerald-600 dark:text-emerald-400">已下載</span>
                    <span v-else-if="!episodes[ep]?.token" class="text-xs text-gray-400">無來源</span>
                    <button
                        v-if="downloadedSet.has(String(ep))"
                        type="button"
                        class="text-xs text-gray-500 hover:text-red-600 dark:hover:text-red-400"
                        :disabled="isDownloading"
                        @click.stop="removeOne(ep)"
                    >
                        刪除
                    </button>
                </label>
            </div>

            <div v-if="isDownloading" class="space-y-1.5">
                <div class="h-2 bg-gray-200 dark:bg-white/10 rounded-full overflow-hidden">
                    <div
                        class="h-full bg-gray-900 dark:bg-white transition-all duration-300"
                        :style="{ width: `${Math.min(100, Math.max(0, downloadProgress))}%` }"
                    />
                </div>
                <p class="text-xs text-gray-600 dark:text-gray-400">{{ downloadLabel }}</p>
            </div>

            <div class="flex justify-end gap-2 pt-2">
                <button
                    type="button"
                    class="px-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-white/10"
                    :disabled="isDownloading"
                    @click="close"
                >
                    關閉
                </button>
                <button
                    type="button"
                    class="px-4 py-2 text-sm rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    :disabled="isDownloading || selectedPendingCount === 0"
                    @click="startDownload"
                >
                    下載選取集數
                </button>
            </div>
        </div>
    </BaseDialog>
</template>
