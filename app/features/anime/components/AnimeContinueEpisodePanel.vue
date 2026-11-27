<script setup>
const props = defineProps({
    showContinuePrompt: { type: Boolean, default: false },
    lastWatchedData: { type: Object, default: null },
    episodes: { type: Object, default: null },
    episodesLoading: { type: Boolean, default: false },
    watchProgress: { type: Object, default: () => ({}) },
    animeImage: { type: String, default: "" },
    offline: { type: Boolean, default: false },
    modelValue: { type: [String, Number], default: null },
})

const emit = defineEmits(["update:modelValue", "continue-last"])

function onEpisodeSelect(n) {
    emit("update:modelValue", n)
}
</script>

<template>
    <div class="space-y-6 min-w-0 max-w-full">
        <transition name="slide-down">
            <section v-if="showContinuePrompt && lastWatchedData" aria-label="Continue watching">
                <button
                    type="button"
                    class="group w-full text-left rounded-xl overflow-hidden bg-black/[0.02] dark:bg-white/5 ring-1 ring-black/5 dark:ring-white/10 hover:bg-black/[0.04] dark:hover:bg-white/[0.08] transition-colors focus:outline-none"
                    @click="$emit('continue-last')"
                >
                    <div class="px-3.5 py-3 sm:px-4 sm:py-3.5">
                        <div class="flex items-baseline justify-between gap-3">
                            <div class="min-w-0">
                                <p class="text-xs text-gray-500 dark:text-gray-400">繼續觀看</p>
                                <p class="mt-0.5 text-base font-semibold text-gray-900 dark:text-white truncate">
                                    第 {{ lastWatchedData.episode_number }} 集
                                </p>
                            </div>
                            <p class="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
                                {{ formatDuration(lastWatchedData.playback_time) }}
                                <span class="text-gray-400 dark:text-gray-500">/</span>
                                {{ formatDuration(lastWatchedData.video_duration) }}
                            </p>
                        </div>
                    </div>
                    <div class="h-1 bg-black/10 dark:bg-white/10">
                        <div
                            class="h-full bg-gray-900 dark:bg-white"
                            :style="{ width: `${lastWatchedData.progress_percentage}%` }"
                        />
                    </div>
                </button>
            </section>
        </transition>

        <section aria-label="Episode selector">
            <div class="flex items-center justify-between mb-4">
                <h2 class="text-xl font-bold text-gray-900 dark:text-white">選擇集數</h2>
                <span v-if="episodes && !episodesLoading" class="text-sm text-gray-600 dark:text-gray-400">
                    共 <span class="font-semibold text-gray-900 dark:text-white">{{ Object.keys(episodes).length }}</span> 集
                </span>
            </div>
            <EpisodesPicker v-if="episodes && !episodesLoading"
                :episodes="episodes"
                :watch-progress="watchProgress"
                :compact="true"
                :anime-image="animeImage"
                :offline="offline"
                :model-value="modelValue"
                @update:model-value="onEpisodeSelect"
                @select="onEpisodeSelect" />
            <div v-else-if="episodesLoading" class="flex flex-col items-center justify-center py-10 text-gray-500 dark:text-gray-400">
                <LoadingSpinner size="md" class="mb-3" />
                <p>載入集數中...</p>
            </div>
            <div v-else class="text-center py-8 text-gray-500 dark:text-gray-400">
                <span class="material-symbols-rounded text-4xl mb-2 opacity-50">video_library</span>
                <p>暫無可用集數</p>
            </div>
        </section>
    </div>
</template>
