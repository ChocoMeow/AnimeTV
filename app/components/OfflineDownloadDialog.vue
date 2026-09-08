<script setup>
const props = defineProps({
    modelValue: { type: Boolean, required: true },
    episodeKeys: { type: Array, default: () => [] },
    episodes: { type: Object, default: () => ({}) },
    downloadedKeys: { type: Array, default: () => [] },
    isDownloading: { type: Boolean, default: false },
    downloadProgress: { type: Number, default: 0 },
    downloadLabel: { type: String, default: "" },
})

const emit = defineEmits(["update:modelValue", "download", "download-all", "remove", "refresh"])

const selected = ref(new Set())
const downloaded = computed(() => new Set(props.downloadedKeys.map(String)))
const isReady = (ep) => !!props.episodes[ep]?.token && !downloaded.value.has(String(ep))
const pendingKeys = computed(() => props.episodeKeys.filter(isReady))
const selectedCount = computed(() => [...selected.value].filter(isReady).length)
const progress = computed(() => Math.min(100, Math.max(0, props.downloadProgress)))

watch(() => props.modelValue, (open) => {
    if (!open) return
    selected.value = new Set()
    emit("refresh")
})

watch(() => props.downloadedKeys, (keys) => {
    const done = new Set(keys.map(String))
    const next = new Set([...selected.value].filter((k) => !done.has(String(k))))
    if (next.size !== selected.value.size) selected.value = next
}, { deep: true })

function toggle(ep) {
    if (props.isDownloading || !isReady(ep)) return
    const next = new Set(selected.value)
    next.has(ep) ? next.delete(ep) : next.add(ep)
    selected.value = next
}

function emitPending(event, keys) {
    if (!keys.length) return
    emit(event, keys)
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
        <div class="space-y-6">
            <!-- Status / progress -->
            <div class="space-y-3 p-4 bg-black/[0.02] dark:bg-white/5 rounded-xl ring-1 ring-black/5 dark:ring-white/10">
                <div class="flex items-center justify-between gap-4">
                    <div class="flex items-center gap-3 min-w-0">
                        <span
                            class="material-symbols-rounded text-gray-600 dark:text-gray-400 shrink-0"
                            :class="{ 'animate-pulse': isDownloading }"
                        >{{ isDownloading ? 'downloading' : 'download_for_offline' }}</span>
                        <div class="min-w-0">
                            <p class="font-medium text-gray-900 dark:text-white truncate">
                                <template v-if="isDownloading">{{ downloadLabel || '下載中…' }}</template>
                                <template v-else>已下載 {{ downloadedKeys.length }} / {{ episodeKeys.length }} 集</template>
                            </p>
                            <p class="text-sm text-gray-500 dark:text-gray-400">
                                <template v-if="isDownloading">已下載 {{ downloadedKeys.length }} / {{ episodeKeys.length }} 集</template>
                                <template v-else>{{ pendingKeys.length ? `還有 ${pendingKeys.length} 集可下載` : '全部集數都已就緒' }}</template>
                            </p>
                        </div>
                    </div>
                    <span v-if="isDownloading" class="text-sm tabular-nums font-medium text-gray-600 dark:text-gray-400 shrink-0">
                        {{ Math.round(progress) }}%
                    </span>
                    <NuxtLink
                        v-else
                        to="/offline-downloads"
                        class="shrink-0 inline-flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
                    >
                        管理頁
                        <span class="material-symbols-rounded text-base">arrow_forward</span>
                    </NuxtLink>
                </div>
                <div v-if="isDownloading" class="h-2 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
                    <div class="h-full bg-gray-900 dark:bg-white rounded-full transition-all duration-300 ease-out" :style="{ width: `${progress}%` }" />
                </div>
            </div>

            <!-- Episodes -->
            <div class="space-y-3">
                <div class="flex items-center justify-between gap-3">
                    <p class="text-sm font-medium text-gray-700 dark:text-gray-300">選擇集數</p>
                    <div class="flex gap-1">
                        <button type="button" class="chip-btn" :disabled="isDownloading || !pendingKeys.length" @click="selected = new Set(pendingKeys)">全選</button>
                        <button type="button" class="chip-btn" :disabled="isDownloading || !selected.size" @click="selected = new Set()">清除</button>
                    </div>
                </div>

                <div v-if="episodeKeys.length" class="rounded-xl ring-1 ring-black/5 dark:ring-white/10 bg-black/[0.02] dark:bg-white/[0.03]">
                    <div class="max-h-80 overflow-y-auto rounded-xl divide-y divide-black/5 dark:divide-white/10">
                        <div
                            v-for="ep in episodeKeys"
                            :key="ep"
                            class="flex items-center gap-3 px-4 py-3.5 transition-colors"
                            :class="{
                                'hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer': isReady(ep) && !isDownloading,
                                'bg-black/[0.04] dark:bg-white/[0.06]': selected.has(ep),
                                'opacity-60': !episodes[ep]?.token && !downloaded.has(String(ep)),
                            }"
                            @click="toggle(ep)"
                        >
                            <span
                                class="material-symbols-rounded text-xl shrink-0 transition-colors"
                                :class="downloaded.has(String(ep))
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : selected.has(ep)
                                        ? 'text-gray-900 dark:text-white'
                                        : 'text-black/20 dark:text-white/20'"
                                aria-hidden="true"
                            >{{ selected.has(ep) || downloaded.has(String(ep)) ? "check_circle" : "radio_button_unchecked" }}</span>

                            <span class="flex-1 min-w-0 text-sm font-medium text-gray-900 dark:text-white">第 {{ ep }} 集</span>

                            <span v-if="!episodes[ep]?.token && !downloaded.has(String(ep))" class="text-xs text-gray-400 dark:text-gray-500">無來源</span>

                            <button
                                v-if="downloaded.has(String(ep))"
                                type="button"
                                class="shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
                                :disabled="isDownloading"
                                :aria-label="`刪除第 ${ep} 集`"
                                @click.stop="emit('remove', ep)"
                            >
                                <span class="material-symbols-rounded text-lg">delete</span>
                            </button>
                        </div>
                    </div>
                </div>

                <div v-else class="flex flex-col items-center justify-center gap-2 py-10 rounded-xl ring-1 ring-black/5 dark:ring-white/10 bg-black/[0.02] dark:bg-white/5">
                    <span class="material-symbols-rounded text-3xl text-gray-400 dark:text-gray-500">playlist_remove</span>
                    <p class="text-sm text-gray-500 dark:text-gray-400">目前沒有可下載的集數</p>
                </div>
            </div>

            <!-- Actions -->
            <div class="flex gap-2">
                <button
                    type="button"
                    class="flex-1 px-3 py-2 text-sm rounded-full bg-gray-900 dark:bg-white hover:opacity-90 text-white dark:text-black font-semibold transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                    :disabled="isDownloading || !selectedCount"
                    @click="emitPending('download', episodeKeys.filter((k) => selected.has(k) && isReady(k)))"
                >
                    <span class="material-symbols-rounded text-lg">download</span>
                    {{ selectedCount ? `下載選取 (${selectedCount})` : "下載選取" }}
                </button>
                <button
                    type="button"
                    class="flex-1 px-3 py-2 text-sm rounded-full bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15 text-gray-900 dark:text-white font-medium transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                    :disabled="isDownloading || !pendingKeys.length"
                    @click="emitPending('download-all', pendingKeys)"
                >
                    <span class="material-symbols-rounded text-lg">download_for_offline</span>
                    全部下載
                </button>
            </div>
        </div>
    </BaseDialog>
</template>

<style scoped>
.chip-btn {
    @apply px-3 py-1 text-xs font-medium rounded-full text-gray-600 dark:text-gray-400 bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 transition-colors disabled:opacity-40;
}
</style>
