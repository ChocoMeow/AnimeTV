<script setup>
defineProps({
    page: { type: String, required: true },
    autoplayEnabled: { type: Boolean, default: true },
    autoFullscreenEnabled: { type: Boolean, default: false },
    theaterMode: { type: Boolean, default: false },
    playbackRate: { type: Number, default: 1 },
    playbackSpeeds: { type: Array, default: () => [0.5, 0.75, 1, 1.25, 1.5, 2, 3] },
    qualityLabel: { type: String, default: '自動' },
    qualityLevels: { type: Array, default: () => [] },
    selectedQuality: { type: Number, default: -1 },
    hasCaptions: { type: Boolean, default: false },
    captionLabel: { type: String, default: '關閉' },
    captionTracks: { type: Array, default: () => [] },
    selectedCaptionLang: { type: String, default: '' },
})

const emit = defineEmits([
    'update:page',
    'toggle-autoplay',
    'toggle-auto-fullscreen',
    'toggle-theater',
    'set-speed',
    'set-quality',
    'set-caption',
    'open-page',
])

const { style: captionStyle, patch, resetStyle, CAPTION_SIZES, CAPTION_COLORS } = useCaptionStyle()

const menuItemClass =
    'w-full flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm text-left text-white hover:bg-white/10 transition-colors'
const backClass =
    'w-full flex items-center gap-1 px-3.5 py-2.5 text-sm text-left text-white hover:bg-white/10 transition-colors'
</script>

<template>
    <div
        class="absolute bottom-full right-0 mb-2 bg-black/80 backdrop-blur-xl rounded-2xl shadow-2xl py-1.5 z-[10] min-w-[14rem] w-[16.5rem] max-h-[min(70vh,26rem)] overflow-x-hidden overflow-y-auto origin-bottom-right"
        @click.stop
    >
        <transition name="settings-page" mode="out-in">
            <div :key="page">
                <template v-if="page === 'main'">
                    <button type="button" :class="menuItemClass" @click="emit('toggle-autoplay')">
                        <span>自動播放下一集</span>
                        <span class="text-xs text-white/55">{{ autoplayEnabled ? '開啟' : '關閉' }}</span>
                    </button>
                    <button type="button" :class="menuItemClass" @click="emit('toggle-auto-fullscreen')">
                        <span>播放時自動全螢幕</span>
                        <span class="text-xs text-white/55">{{ autoFullscreenEnabled ? '開啟' : '關閉' }}</span>
                    </button>
                    <button
                        v-if="hasCaptions"
                        type="button"
                        :class="menuItemClass"
                        @click.stop="emit('open-page', 'captions')"
                    >
                        <span>字幕</span>
                        <span class="inline-flex items-center gap-0.5 text-xs text-white/55 leading-none">
                            {{ captionLabel }}
                            <span class="material-symbols-rounded text-base leading-none">chevron_right</span>
                        </span>
                    </button>
                    <button
                        type="button"
                        :class="[menuItemClass, 'sm:hidden']"
                        @click="emit('toggle-theater')"
                    >
                        <span>劇院模式</span>
                        <span class="text-xs text-white/55">{{ theaterMode ? '開啟' : '關閉' }}</span>
                    </button>
                    <button type="button" :class="menuItemClass" @click.stop="emit('open-page', 'speed')">
                        <span>播放速度</span>
                        <span class="inline-flex items-center gap-0.5 text-xs text-white/55 leading-none">
                            {{ playbackRate }}x
                            <span class="material-symbols-rounded text-base leading-none">chevron_right</span>
                        </span>
                    </button>
                    <button type="button" :class="menuItemClass" @click.stop="emit('open-page', 'quality')">
                        <span>畫質</span>
                        <span class="inline-flex items-center gap-0.5 text-xs text-white/55 leading-none">
                            {{ qualityLabel }}
                            <span class="material-symbols-rounded text-base leading-none">chevron_right</span>
                        </span>
                    </button>
                </template>

                <template v-else-if="page === 'speed'">
                    <button type="button" :class="backClass" @click="emit('update:page', 'main')">
                        <span class="material-symbols-rounded text-lg">chevron_left</span>
                        <span>播放速度</span>
                    </button>
                    <button
                        v-for="speed in playbackSpeeds"
                        :key="speed"
                        type="button"
                        :class="[menuItemClass, { 'bg-white/10 font-medium': playbackRate === speed }]"
                        @click="emit('set-speed', speed)"
                    >
                        <span>{{ speed }}x</span>
                        <span v-if="playbackRate === speed" class="material-symbols-rounded text-base">check</span>
                    </button>
                </template>

                <template v-else-if="page === 'quality'">
                    <button type="button" :class="backClass" @click="emit('update:page', 'main')">
                        <span class="material-symbols-rounded text-lg">chevron_left</span>
                        <span>畫質</span>
                    </button>
                    <button
                        type="button"
                        :class="[menuItemClass, { 'bg-white/10 font-medium': selectedQuality === -1 }]"
                        @click="emit('set-quality', -1)"
                    >
                        <span>自動</span>
                        <span v-if="selectedQuality === -1" class="material-symbols-rounded text-base">check</span>
                    </button>
                    <button
                        v-for="level in qualityLevels"
                        :key="level.index"
                        type="button"
                        :class="[menuItemClass, { 'bg-white/10 font-medium': selectedQuality === level.index }]"
                        @click="emit('set-quality', level.index)"
                    >
                        <span>{{ level.label }}</span>
                        <span v-if="selectedQuality === level.index" class="material-symbols-rounded text-base">check</span>
                    </button>
                </template>

                <template v-else-if="page === 'captions'">
                    <button type="button" :class="backClass" @click="emit('update:page', 'main')">
                        <span class="material-symbols-rounded text-lg">chevron_left</span>
                        <span>字幕</span>
                    </button>
                    <button
                        type="button"
                        :class="[menuItemClass, { 'bg-white/10 font-medium': !selectedCaptionLang }]"
                        @click="emit('set-caption', null)"
                    >
                        <span>關閉</span>
                        <span v-if="!selectedCaptionLang" class="material-symbols-rounded text-base">check</span>
                    </button>
                    <button
                        v-for="cap in captionTracks"
                        :key="cap.srclang"
                        type="button"
                        :class="[menuItemClass, { 'bg-white/10 font-medium': selectedCaptionLang === cap.srclang }]"
                        @click="emit('set-caption', cap.srclang)"
                    >
                        <span>{{ cap.label }}</span>
                        <span
                            v-if="selectedCaptionLang === cap.srclang"
                            class="material-symbols-rounded text-base"
                        >check</span>
                    </button>

                    <div class="mx-3.5 my-1.5 border-t border-white/10" />

                    <button
                        type="button"
                        :class="menuItemClass"
                        @click.stop="emit('open-page', 'caption-style')"
                    >
                        <span>樣式</span>
                        <span class="material-symbols-rounded text-base text-white/55 leading-none">chevron_right</span>
                    </button>
                </template>

                <template v-else-if="page === 'caption-style'">
                    <button type="button" :class="backClass" @click="emit('update:page', 'captions')">
                        <span class="material-symbols-rounded text-lg">chevron_left</span>
                        <span>樣式</span>
                    </button>

                    <div class="px-3.5 py-2">
                        <p class="text-xs text-white/55 mb-1.5">文字大小</p>
                        <div class="flex gap-1">
                            <button
                                v-for="s in CAPTION_SIZES"
                                :key="s.id"
                                type="button"
                                class="flex-1 rounded-lg py-1.5 text-xs text-white transition-colors"
                                :class="captionStyle.size === s.id ? 'bg-white/20 font-medium' : 'bg-white/5 hover:bg-white/10'"
                                @click="patch({ size: s.id })"
                            >
                                {{ s.label }}
                            </button>
                        </div>
                    </div>

                    <button
                        type="button"
                        :class="menuItemClass"
                        @click="patch({ background: !captionStyle.background })"
                    >
                        <span>背景</span>
                        <span class="text-xs text-white/55 leading-none">{{ captionStyle.background ? '開啟' : '關閉' }}</span>
                    </button>

                    <div class="px-3.5 py-2 space-y-3">
                        <div>
                            <p class="text-xs text-white/55 mb-1.5">文字顏色</p>
                            <div class="flex flex-wrap gap-2">
                                <button
                                    v-for="c in CAPTION_COLORS"
                                    :key="c.id"
                                    type="button"
                                    class="w-8 h-8 rounded-full border-2 transition-transform"
                                    :class="captionStyle.color === c.id ? 'border-white scale-110' : 'border-white/20'"
                                    :style="{ backgroundColor: c.id }"
                                    :title="c.label"
                                    @click="patch({ color: c.id })"
                                />
                            </div>
                        </div>

                        <div>
                            <div class="flex items-center justify-between mb-1.5">
                                <p class="text-xs text-white/55">不透明度</p>
                                <span class="text-xs text-white/55 tabular-nums">{{ Math.round(captionStyle.opacity * 100) }}%</span>
                            </div>
                            <input
                                type="range"
                                min="0.3"
                                max="1"
                                step="0.05"
                                class="w-full accent-white"
                                :value="captionStyle.opacity"
                                @input="patch({ opacity: Number($event.target.value) })"
                            />
                        </div>

                        <button
                            type="button"
                            class="w-full rounded-lg py-2 text-sm text-white/80 bg-white/5 hover:bg-white/10 transition-colors"
                            @click="resetStyle"
                        >
                            重設樣式
                        </button>
                    </div>
                </template>
            </div>
        </transition>
    </div>
</template>

<style scoped>
.settings-page-enter-active, .settings-page-leave-active { transition: all 0.18s ease; }
.settings-page-enter-from { opacity: 0; transform: translateX(0.6rem); }
.settings-page-leave-to { opacity: 0; transform: translateX(-0.6rem); }
</style>
