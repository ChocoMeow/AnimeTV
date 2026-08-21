<script setup>
defineProps({
    src: { type: String, default: '' },
    isLoading: { type: Boolean, default: false },
    isBuffering: { type: Boolean, default: false }, /** Mid-playback stall: keep spinner, but don't dim/block controls */
    isPlaying: { type: Boolean, default: false },
    showControls: { type: Boolean, default: false },
    isFullscreen: { type: Boolean, default: false },
    animeMeta: { type: Object, default: () => ({}) },
    hasNextEpisode: { type: Boolean, default: true },
    autoplayVisible: { type: Boolean, default: false },
    autoplaySecsLeft: { type: Number, default: 0 },
    autoplayCountdownSecs: { type: Number, default: 100 },
    nextEpisodeLabel: { type: String, default: '下一集' },
    notification: { type: Object, default: () => ({ show: false, message: '', icon: '' }) },
})

const emit = defineEmits(['toggle-play', 'next-episode', 'dismiss-autoplay'])
</script>

<template>
    <!-- Empty state -->
    <div v-if="!src && !isLoading" class="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
        <span class="material-symbols-rounded outlined text-4xl sm:text-6xl mb-4 opacity-50">play_circle</span>
        <p class="text-base sm:text-lg">無可用影片</p>
    </div>

    <!-- Loading / buffering -->
    <div
        v-if="isLoading"
        class="absolute inset-0 flex flex-col items-center justify-center z-10"
        :class="isBuffering ? 'pointer-events-none' : 'bg-black/50'"
    >
        <LoadingSpinner size="xl" variant="on-dark" class="mb-3" />
        <p v-if="!isBuffering" class="text-white/90 text-sm">載入影片中...</p>
    </div>

    <!-- Center play/pause -->
    <transition name="player-fade">
        <div
            v-show="!isLoading && showControls && src"
            class="absolute inset-0 flex items-center justify-center pointer-events-none z-[2]"
        >
            <button
                type="button"
                class="w-14 h-14 sm:w-[4.25rem] sm:h-[4.25rem] rounded-full bg-black/55 backdrop-blur-md text-white flex items-center justify-center cursor-pointer pointer-events-auto transition-colors duration-200 hover:bg-black/70 focus:outline-none"
                @click="emit('toggle-play')"
            >
                <span class="material-symbols-rounded text-3xl sm:text-[2.5rem]">
                    {{ isPlaying ? 'pause' : 'play_arrow' }}
                </span>
            </button>
        </div>
    </transition>

    <!-- Fullscreen title -->
    <transition name="player-fade">
        <div
            v-if="isFullscreen && showControls && src && animeMeta?.title"
            class="absolute top-0 left-0 z-[3] px-4 pt-4 pointer-events-none"
        >
            <p class="text-white font-semibold text-sm sm:text-base leading-tight [text-shadow:0_2px_10px_rgba(0,0,0,0.7)]">
                {{ animeMeta.title }}
            </p>
            <p
                v-if="animeMeta.episode"
                class="text-white/75 text-xs sm:text-sm mt-0.5 [text-shadow:0_2px_8px_rgba(0,0,0,0.7)]"
            >
                第 {{ animeMeta.episode }} 集
            </p>
        </div>
    </transition>

    <!-- Autoplay next -->
    <transition name="autoplay-btn">
        <div
            v-if="autoplayVisible && hasNextEpisode && src"
            class="absolute right-3 sm:right-5 z-[8] transition-all duration-300"
            :class="showControls ? 'bottom-[5.25rem] sm:bottom-[6.5rem]' : 'bottom-3 sm:bottom-4'"
        >
            <div class="relative flex items-stretch overflow-hidden rounded-full bg-black/55 backdrop-blur-md">
                <div
                    class="absolute inset-0 bg-white/15 origin-right"
                    :style="{
                        transform: `scaleX(${autoplaySecsLeft / autoplayCountdownSecs})`,
                        transition: 'transform 1s linear',
                    }"
                />
                <button
                    type="button"
                    class="relative z-[1] inline-flex h-10 items-center gap-1.5 px-3.5 text-sm font-medium text-white cursor-pointer leading-none focus:outline-none"
                    @click="emit('next-episode')"
                >
                    <span class="material-symbols-rounded text-xl leading-none flex-shrink-0">skip_next</span>
                    <span class="whitespace-nowrap leading-none">{{ nextEpisodeLabel }}</span>
                </button>
                <button
                    type="button"
                    class="relative z-[1] h-10 w-10 flex items-center justify-center text-white/60 hover:text-white transition-colors cursor-pointer focus:outline-none"
                    title="關閉"
                    aria-label="關閉自動播放"
                    @click="emit('dismiss-autoplay')"
                >
                    <span class="material-symbols-rounded text-lg">close</span>
                </button>
            </div>
        </div>
    </transition>

    <!-- Top gradient -->
    <transition name="player-fade">
        <div
            v-show="showControls && src"
            class="absolute top-0 left-0 right-0 h-14 sm:h-20 bg-gradient-to-b from-black/45 to-transparent z-[1] pointer-events-none"
        />
    </transition>

    <!-- Shortcut toast -->
    <transition name="fade-scale">
        <div
            v-if="notification.show"
            class="absolute top-14 left-1/2 -translate-x-1/2 z-[20] pointer-events-none sm:top-16"
        >
            <div class="bg-black/55 backdrop-blur-md text-white px-3 py-1.5 sm:px-4 rounded-full flex items-center justify-center gap-2 min-w-0 max-w-[min(90vw,20rem)]">
                <span class="material-symbols-rounded shrink-0 text-lg sm:text-xl">{{ notification.icon }}</span>
                <span class="text-xs sm:text-sm font-medium truncate">{{ notification.message }}</span>
            </div>
        </div>
    </transition>
</template>

<style scoped>
.player-fade-enter-active, .player-fade-leave-active { transition: opacity 0.3s ease; }
.player-fade-enter-from, .player-fade-leave-to { opacity: 0; }
.fade-scale-enter-active, .fade-scale-leave-active { transition: all 0.2s ease; }
.fade-scale-enter-from, .fade-scale-leave-to { opacity: 0; transform: translateX(-50%) translateY(-0.35rem) scale(0.92); }
.autoplay-btn-enter-active, .autoplay-btn-leave-active { transition: opacity 0.2s ease; }
.autoplay-btn-enter-from, .autoplay-btn-leave-to { opacity: 0; }
</style>
