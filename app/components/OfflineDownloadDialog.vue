<script setup>
import { BUNNY_MP4_HEIGHTS, bunnyQualityOptions } from '~~/shared/offline'
import { isTwxgctToken } from '~~/shared/videoSources'

const props = defineProps({
    modelValue: { type: Boolean, required: true },
    episodeKeys: { type: Array, default: () => [] },
    episodes: { type: Object, default: () => ({}) },
    downloadedKeys: { type: Array, default: () => [] },
    isDownloading: { type: Boolean, default: false },
    downloadProgress: { type: Number, default: 0 },
    downloadLabel: { type: String, default: '' },
})

const emit = defineEmits(['update:modelValue', 'download', 'download-all', 'remove', 'refresh'])

const selected = ref(new Set())
const qualityHeight = ref(BUNNY_MP4_HEIGHTS[1])
const qualityOptions = bunnyQualityOptions()
const downloaded = computed(() => new Set(props.downloadedKeys.map(String)))
const isReady = (ep) => !!props.episodes[ep]?.token && !downloaded.value.has(String(ep))
const pendingKeys = computed(() => props.episodeKeys.filter(isReady))
const selectedReady = computed(() => [...selected.value].filter(isReady))
const progress = computed(() => Math.min(100, Math.max(0, props.downloadProgress)))
const showQualityPicker = computed(() =>
    Object.values(props.episodes || {}).some((ep) => isTwxgctToken(ep?.token)),
)

watch(() => props.modelValue, (open) => {
    if (!open) return
    selected.value = new Set()
    emit('refresh')
})

watch(() => props.downloadedKeys, (keys) => {
    const done = new Set(keys.map(String))
    const next = new Set([...selected.value].filter((k) => !done.has(String(k))))
    if (next.size !== selected.value.size) selected.value = next
}, { deep: true })

function isDownloaded(ep) {
    return downloaded.value.has(String(ep))
}

function hasSource(ep) {
    return !!props.episodes[ep]?.token
}

function rowIcon(ep) {
    return isDownloaded(ep) || selected.value.has(ep) ? 'check_circle' : 'radio_button_unchecked'
}

function rowIconClass(ep) {
    if (isDownloaded(ep)) return 'text-emerald-600 dark:text-emerald-400'
    if (selected.value.has(ep)) return 'text-gray-900 dark:text-white'
    return 'text-black/20 dark:text-white/20'
}

function toggle(ep) {
    if (props.isDownloading || !isReady(ep)) return
    const next = new Set(selected.value)
    next.has(ep) ? next.delete(ep) : next.add(ep)
    selected.value = next
}

function emitPending(event, keys) {
    if (!keys.length) return
    emit(event, keys, showQualityPicker.value ? qualityHeight.value : null)
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
            <div class="status-panel">
                <div class="flex items-center justify-between gap-4">
                    <div class="flex items-center gap-3 min-w-0">
                        <span
                            class="material-symbols-rounded text-gray-600 dark:text-gray-400 shrink-0"
                            :class="{ 'animate-pulse': isDownloading }"
                        >{{ isDownloading ? 'downloading' : 'download_for_offline' }}</span>
                        <div class="min-w-0">
                            <p class="font-medium text-gray-900 dark:text-white truncate">
                                {{ isDownloading ? (downloadLabel || '下載中…') : `已下載 ${downloadedKeys.length} / ${episodeKeys.length} 集` }}
                            </p>
                            <p class="text-sm text-gray-500 dark:text-gray-400">
                                {{ isDownloading
                                    ? `已下載 ${downloadedKeys.length} / ${episodeKeys.length} 集`
                                    : (pendingKeys.length ? `還有 ${pendingKeys.length} 集可下載` : '全部集數都已就緒') }}
                            </p>
                        </div>
                    </div>
                    <span v-if="isDownloading" class="text-sm tabular-nums font-medium text-gray-600 dark:text-gray-400 shrink-0">
                        {{ Math.round(progress) }}%
                    </span>
                    <NuxtLink v-else to="/offline-downloads" class="link-quiet">
                        管理頁
                        <span class="material-symbols-rounded text-base">arrow_forward</span>
                    </NuxtLink>
                </div>
                <div v-if="isDownloading" class="h-2 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
                    <div class="h-full bg-gray-900 dark:bg-white rounded-full transition-all duration-300 ease-out" :style="{ width: `${progress}%` }" />
                </div>
            </div>

            <div v-if="showQualityPicker" class="space-y-2">
                <p class="text-sm font-medium text-gray-700 dark:text-gray-300">下載畫質</p>
                <div :class="{ 'pointer-events-none opacity-60': isDownloading }">
                    <Dropdown
                        boxed
                        :model-value="qualityHeight"
                        :options="qualityOptions"
                        placeholder="選擇畫質"
                        @update:model-value="qualityHeight = $event"
                    />
                </div>
            </div>

            <div class="space-y-3">
                <div class="flex items-center justify-between gap-3">
                    <p class="text-sm font-medium text-gray-700 dark:text-gray-300">選擇集數</p>
                    <div class="flex gap-1">
                        <button type="button" class="chip-btn" :disabled="isDownloading || !pendingKeys.length" @click="selected = new Set(pendingKeys)">全選</button>
                        <button type="button" class="chip-btn" :disabled="isDownloading || !selected.size" @click="selected = new Set()">清除</button>
                    </div>
                </div>

                <div v-if="episodeKeys.length" class="list-box">
                    <div class="max-h-80 overflow-y-auto divide-y divide-black/5 dark:divide-white/10">
                        <div
                            v-for="ep in episodeKeys"
                            :key="ep"
                            class="flex items-center gap-3 px-4 py-3.5 transition-colors"
                            :class="{
                                'hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer': isReady(ep) && !isDownloading,
                                'bg-black/[0.04] dark:bg-white/[0.06]': selected.has(ep),
                                'opacity-60': !hasSource(ep) && !isDownloaded(ep),
                            }"
                            @click="toggle(ep)"
                        >
                            <span class="material-symbols-rounded text-xl shrink-0 transition-colors" :class="rowIconClass(ep)" aria-hidden="true">{{ rowIcon(ep) }}</span>
                            <span class="flex-1 min-w-0 text-sm font-medium text-gray-900 dark:text-white">第 {{ ep }} 集</span>
                            <span v-if="!hasSource(ep) && !isDownloaded(ep)" class="text-xs text-gray-400 dark:text-gray-500">無來源</span>
                            <button
                                v-if="isDownloaded(ep)"
                                type="button"
                                class="icon-btn-danger disabled:opacity-40"
                                :disabled="isDownloading"
                                :aria-label="`刪除第 ${ep} 集`"
                                @click.stop="emit('remove', ep)"
                            >
                                <span class="material-symbols-rounded text-lg">delete</span>
                            </button>
                        </div>
                    </div>
                </div>

                <div v-else class="flex flex-col items-center justify-center gap-2 py-10 list-box bg-black/[0.02] dark:bg-white/5">
                    <span class="material-symbols-rounded text-3xl text-gray-400 dark:text-gray-500">playlist_remove</span>
                    <p class="text-sm text-gray-500 dark:text-gray-400">目前沒有可下載的集數</p>
                </div>
            </div>

            <div class="flex gap-2">
                <button
                    type="button"
                    class="pill-btn-solid disabled:opacity-50 disabled:cursor-not-allowed"
                    :disabled="isDownloading || !selectedReady.length"
                    @click="emitPending('download', selectedReady)"
                >
                    <span class="material-symbols-rounded text-lg">download</span>
                    {{ selectedReady.length ? `下載選取 (${selectedReady.length})` : '下載選取' }}
                </button>
                <button
                    type="button"
                    class="pill-btn disabled:opacity-50"
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
.status-panel {
    @apply space-y-3 p-4 bg-black/[0.02] dark:bg-white/5 rounded-xl border border-black/5 dark:border-white/10;
}
.list-box {
    @apply rounded-xl border border-black/5 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] overflow-hidden;
}
.link-quiet {
    @apply shrink-0 inline-flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors;
}
.chip-btn {
    @apply px-3 py-1 text-xs font-medium rounded-full text-gray-600 dark:text-gray-400 bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 transition-colors disabled:opacity-40;
}
.icon-btn-danger {
    @apply shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/10 transition-colors;
}
.pill-btn {
    @apply flex-1 px-3 py-2 text-sm rounded-full bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15 text-gray-900 dark:text-white font-medium transition-colors flex items-center justify-center gap-1.5;
}
.pill-btn-solid {
    @apply flex-1 px-3 py-2 text-sm rounded-full bg-gray-900 dark:bg-white hover:opacity-90 text-white dark:text-black font-semibold transition-all flex items-center justify-center gap-1.5;
}
</style>
