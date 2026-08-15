<script setup>
defineProps({
    progress: { type: Number, required: true },
    buffered: { type: Number, required: true },
    duration: { type: Number, required: true },
    isDraggingProgress: { type: Boolean, default: false },
    isHoveringProgress: { type: Boolean, default: false },
    hoverPreviewTime: { type: Number, default: 0 },
    hoverPreviewPosition: { type: Number, default: 0 },
    thumbPreviewW: { type: Number, default: 280 },
    activeThumbnail: { type: Object, default: null },
    activeThumbnailSrc: { type: String, default: null },
    thumbnailPreviewHeight: { type: Number, default: 158 },
    thumbnailImageStyle: { type: Object, default: () => ({}) },
    isPlaying: { type: Boolean, default: false },
    isMuted: { type: Boolean, default: false },
    volume: { type: Number, default: 1 },
    showVolumeSlider: { type: Boolean, default: false },
    positionLabel: { type: String, required: true },
    showRemainingTime: { type: Boolean, default: false },
    tooltipLabels: { type: Object, default: () => ({}) },
    isFullscreen: { type: Boolean, default: false },
    theaterMode: { type: Boolean, default: false },
    showSettings: { type: Boolean, default: false },
    settingsPage: { type: String, default: 'main' },
    autoplayEnabled: { type: Boolean, default: true },
    playbackRate: { type: Number, default: 1 },
    playbackSpeeds: { type: Array, default: () => [] },
    qualityLabel: { type: String, default: '自動' },
    qualityLevels: { type: Array, default: () => [] },
    selectedQuality: { type: Number, default: -1 },
    hasCaptions: { type: Boolean, default: false },
    captionLabel: { type: String, default: '關閉' },
    captionTracks: { type: Array, default: () => [] },
    selectedCaptionLang: { type: String, default: '' },
})

const emit = defineEmits([
    'progress-pointerdown',
    'progress-pointermove',
    'progress-pointerup',
    'progress-pointercancel',
    'progress-pointerenter',
    'progress-pointerleave',
    'toggle-play',
    'skip-op',
    'toggle-mute',
    'volume-change',
    'volume-enter',
    'volume-leave',
    'toggle-time-display',
    'toggle-captions',
    'toggle-settings',
    'toggle-theater',
    'toggle-fullscreen',
    'update:settingsPage',
    'toggle-autoplay',
    'open-settings-page',
    'set-speed',
    'set-quality',
    'set-caption',
])

const progressBarRef = ref(null)
const settingsRef = ref(null)

const pillClass = 'h-10 inline-flex items-center gap-0.5 px-1 rounded-full bg-black/55 backdrop-blur-md'
const btnClass = 'w-12 h-8 inline-flex items-center justify-center rounded-full text-white border-0 cursor-pointer outline-none hover:bg-white/15 transition-colors'

defineExpose({
    progressBar: progressBarRef,
    settingsEl: settingsRef,
})
</script>

<template>
    <div
        class="player-controls absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/75 via-black/40 to-transparent z-[9] pb-3 sm:pb-4 pointer-events-auto"
        @click.stop
    >
        <PlayerProgressBar
            ref="progressBarRef"
            :progress="progress"
            :buffered="buffered"
            :duration="duration"
            :is-dragging="isDraggingProgress"
            :is-hovering="isHoveringProgress"
            :hover-preview-time="hoverPreviewTime"
            :hover-preview-position="hoverPreviewPosition"
            :thumb-preview-w="thumbPreviewW"
            :active-thumbnail="activeThumbnail"
            :active-thumbnail-src="activeThumbnailSrc"
            :thumbnail-preview-height="thumbnailPreviewHeight"
            :thumbnail-image-style="thumbnailImageStyle"
            @pointerdown="emit('progress-pointerdown', $event)"
            @pointermove="emit('progress-pointermove', $event)"
            @pointerup="emit('progress-pointerup', $event)"
            @pointercancel="emit('progress-pointercancel', $event)"
            @pointerenter="emit('progress-pointerenter')"
            @pointerleave="emit('progress-pointerleave')"
        />

            <div class="flex items-center justify-between px-3 sm:px-4 gap-2 mt-1">
            <div class="flex items-center gap-1.5 sm:gap-2 min-w-0">
                <div :class="[pillClass, 'hidden sm:flex']">
                    <button type="button" :class="btnClass" :title="tooltipLabels.playPause" @click="emit('toggle-play')">
                        <span class="material-symbols-rounded text-[1.35rem]">{{ isPlaying ? 'pause' : 'play_arrow' }}</span>
                    </button>
                    <button type="button" :class="btnClass" :title="tooltipLabels.skipOP" @click="emit('skip-op')">
                        <span class="material-symbols-rounded text-[1.35rem]">fast_forward</span>
                    </button>
                </div>

                <div
                    class="player-volume-group relative hidden sm:flex"
                    :class="[pillClass, { 'is-expanded': showVolumeSlider }]"
                    @mouseenter="emit('volume-enter')"
                    @mouseleave="emit('volume-leave')"
                >
                    <span class="player-volume-hover" aria-hidden="true" />
                    <button
                        type="button"
                        :class="[btnClass, 'player-volume-btn relative z-[1] hover:!bg-transparent']"
                        :title="tooltipLabels.mute"
                        @click="emit('toggle-mute')"
                    >
                        <span class="material-symbols-rounded text-[1.35rem]">
                            {{ isMuted || volume === 0 ? 'volume_off' : volume < 0.5 ? 'volume_down' : 'volume_up' }}
                        </span>
                    </button>
                    <div
                        class="player-volume-slider relative z-[1] hidden h-8 w-0 items-center self-center overflow-hidden opacity-0 sm:flex"
                        :class="{ '!w-[5.9rem] !opacity-100 !overflow-visible': showVolumeSlider }"
                    >
                        <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            class="player-volume-range"
                            :value="isMuted ? 0 : volume"
                            :style="{ '--volume-pct': `${(isMuted ? 0 : volume) * 100}%` }"
                            @input="emit('volume-change', $event)"
                            @mousedown.stop
                        />
                    </div>
                </div>

                <div :class="pillClass">
                    <button
                        type="button"
                        :class="[btnClass, 'w-auto px-2.5 text-[0.7rem] sm:text-xs font-medium tabular-nums whitespace-nowrap', { 'text-white/60': isDraggingProgress }]"
                        :title="showRemainingTime ? '顯示已播放時間' : '顯示剩餘時間'"
                        @click="emit('toggle-time-display')"
                    >
                        {{ positionLabel }}
                    </button>
                </div>
            </div>

            <div ref="settingsRef" class="relative flex items-center shrink-0">
                <div :class="pillClass">
                    <button
                        v-if="hasCaptions"
                        type="button"
                        :class="btnClass"
                        :title="selectedCaptionLang ? '關閉字幕' : '開啟字幕'"
                        @click="emit('toggle-captions')"
                    >
                        <span
                            class="material-symbols-rounded text-[1.35rem]"
                            :class="{ outlined: !selectedCaptionLang }"
                        >closed_caption</span>
                    </button>
                    <button
                        type="button"
                        title="設定"
                        :class="[btnClass, { 'bg-white/15': showSettings }]"
                        @click="emit('toggle-settings')"
                    >
                        <span class="material-symbols-rounded text-[1.35rem]">settings</span>
                    </button>
                    <button
                        type="button"
                        :class="[btnClass, '!hidden sm:!inline-flex']"
                        :title="tooltipLabels.theaterMode"
                        @click="emit('toggle-theater')"
                    >
                        <span
                            class="material-symbols-rounded text-[1.35rem]"
                            :class="{ outlined: !theaterMode }"
                        >developer_mode_tv</span>
                    </button>
                    <button
                        type="button"
                        :class="btnClass"
                        :title="tooltipLabels.fullscreen"
                        @click="emit('toggle-fullscreen')"
                    >
                        <span class="material-symbols-rounded text-[1.35rem]">
                            {{ isFullscreen ? 'fullscreen_exit' : 'fullscreen' }}
                        </span>
                    </button>
                </div>

                <PlayerSettingsMenu
                    v-if="showSettings"
                    :page="settingsPage"
                    :autoplay-enabled="autoplayEnabled"
                    :theater-mode="theaterMode"
                    :playback-rate="playbackRate"
                    :playback-speeds="playbackSpeeds"
                    :quality-label="qualityLabel"
                    :quality-levels="qualityLevels"
                    :selected-quality="selectedQuality"
                    :has-captions="hasCaptions"
                    :caption-label="captionLabel"
                    :caption-tracks="captionTracks"
                    :selected-caption-lang="selectedCaptionLang"
                    @update:page="emit('update:settingsPage', $event)"
                    @toggle-autoplay="emit('toggle-autoplay')"
                    @toggle-theater="emit('toggle-theater')"
                    @open-page="emit('open-settings-page', $event)"
                    @set-speed="emit('set-speed', $event)"
                    @set-quality="emit('set-quality', $event)"
                    @set-caption="emit('set-caption', $event)"
                />
            </div>
        </div>
    </div>
</template>

<style>
/* Namespaced (unscoped) so slider pseudo-elements always apply after the split. */
.player-controls .player-volume-hover {
    position: absolute;
    left: 0.25rem;
    top: 50%;
    z-index: 0;
    width: 2rem;
    height: 2rem;
    border-radius: 9999px;
    pointer-events: none;
    transform: translateY(-50%);
    transition: width 0.28s cubic-bezier(0.22, 1, 0.36, 1), background-color 0.2s ease;
}
.player-controls .player-volume-group:hover .player-volume-hover,
.player-controls .player-volume-group.is-expanded .player-volume-hover {
    background: rgba(255, 255, 255, 0.15);
}
.player-controls .player-volume-group.is-expanded .player-volume-hover {
    width: calc(100% - 0.5rem);
}
.player-controls .player-volume-slider {
    transition: width 0.28s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.2s ease;
}
.player-controls .player-volume-range {
    -webkit-appearance: none;
    appearance: none;
    display: block;
    width: 5rem;
    height: 100%;
    margin: 0;
    padding: 0 0.2rem;
    background: transparent;
    outline: none;
    cursor: pointer;
}
.player-controls .player-volume-range::-webkit-slider-runnable-track {
    height: 4px;
    border-radius: 9999px;
    background: linear-gradient(to right, #fff var(--volume-pct, 0%), rgba(255, 255, 255, 0.3) var(--volume-pct, 0%));
}
.player-controls .player-volume-range::-moz-range-track {
    height: 4px;
    border-radius: 9999px;
    background: rgba(255, 255, 255, 0.3);
}
.player-controls .player-volume-range::-moz-range-progress {
    height: 4px;
    border-radius: 9999px;
    background: #fff;
}
.player-controls .player-volume-range::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 12px;
    height: 12px;
    margin-top: -4px;
    border-radius: 9999px;
    background: #fff;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.25);
    cursor: pointer;
}
.player-controls .player-volume-range::-moz-range-thumb {
    width: 12px;
    height: 12px;
    border: none;
    border-radius: 9999px;
    background: #fff;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.25);
    cursor: pointer;
}
</style>
