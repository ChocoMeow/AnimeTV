<script setup>
const props = defineProps({
    showContinuePrompt: { type: Boolean, default: false },
    lastWatchedData: { type: Object, default: null },
    episodes: { type: Object, default: null },
    watchProgress: { type: Object, default: () => ({}) },
    animeImage: { type: String, default: "" },
    modelValue: { type: [String, Number], default: null },
})

const emit = defineEmits(["update:modelValue", "continue-last"])

function onEpisodeSelect(n) {
    emit("update:modelValue", n)
}

function formatTime(seconds) {
    const sec = Math.max(0, Math.floor(Number(seconds) || 0))
    const hours = Math.floor(sec / 3600)
    const minutes = Math.floor((sec % 3600) / 60)
    const secs = sec % 60
    if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
    return `${minutes}:${String(secs).padStart(2, "0")}`
}
</script>

<template>
    <div class="space-y-6">
        <transition name="slide-down">
            <section v-if="showContinuePrompt && lastWatchedData" aria-label="Continue watching">
                <div class="bg-gray-950/5 dark:bg-white/10 rounded-xl shadow-lg overflow-hidden">
                    <div class="p-4 space-y-3">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 bg-black/70 dark:bg-white/10 rounded-lg flex items-center justify-center flex-shrink-0">
                                <span class="material-icons text-xl text-white">play_circle</span>
                            </div>
                            <div class="flex-1 min-w-0">
                                <h3 class="text-sm font-bold text-gray-900 dark:text-white mb-0.5">繼續觀看</h3>
                                <p class="text-xs text-gray-600 dark:text-white/80 truncate">第 {{ lastWatchedData.episode_number }} 集</p>
                            </div>
                        </div>
                        <div class="space-y-1.5">
                            <div class="flex items-center justify-between text-xs text-gray-600 dark:text-white/70">
                                <span>{{ formatTime(lastWatchedData.playback_time) }} / {{ formatTime(lastWatchedData.video_duration) }}</span>
                                <span>{{ lastWatchedData.progress_percentage }}%</span>
                            </div>
                            <div class="h-1.5 bg-gray-200 dark:bg-white/10 rounded-full overflow-hidden">
                                <div class="h-full bg-black/70 dark:bg-white rounded-full transition-all"
                                    :style="{ width: `${lastWatchedData.progress_percentage}%` }" />
                            </div>
                        </div>
                        <button
                            class="w-full px-4 py-2.5 bg-black/70 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 rounded-lg transition-all font-medium flex items-center justify-center gap-2 text-sm"
                            @click="$emit('continue-last')">
                            <span class="material-icons text-lg">play_arrow</span>
                            繼續播放
                        </button>
                    </div>
                </div>
            </section>
        </transition>

        <section aria-label="Episode selector">
            <div class="flex items-center justify-between mb-4">
                <h2 class="text-xl font-bold text-gray-900 dark:text-white">選擇集數</h2>
                <span v-if="episodes" class="text-sm text-gray-600 dark:text-gray-400">
                    共 <span class="font-semibold text-gray-900 dark:text-white">{{ Object.keys(episodes).length }}</span> 集
                </span>
            </div>
            <EpisodesPicker v-if="episodes"
                :episodes="episodes"
                :watch-progress="watchProgress"
                :compact="true"
                :anime-image="animeImage"
                :model-value="modelValue"
                @update:model-value="onEpisodeSelect"
                @select="onEpisodeSelect" />
            <div v-else class="text-center py-8 text-gray-500 dark:text-gray-400">
                <span class="material-icons text-4xl mb-2 opacity-50">video_library</span>
                <p>暫無可用集數</p>
            </div>
        </section>
    </div>
</template>
