<script setup>
const props = defineProps({
    open: { type: Boolean, default: true },
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
    'close',
])

const { isMobile } = useMobile()
const { style: captionStyle, patch, resetStyle, CAPTION_SIZES, CAPTION_COLORS } = useCaptionStyle()

const rowClass =
    'w-full flex items-center px-3.5 py-3.5 sm:py-2.5 text-base sm:text-sm text-left text-gray-900 dark:text-white hover:bg-black/5 dark:hover:bg-white/10 transition-colors'
const menuItemClass = `${rowClass} justify-between gap-3`
const backClass = `${rowClass} gap-1`
const mutedClass = 'text-xs text-gray-500 dark:text-white/55'
const selectedClass = 'bg-black/5 dark:bg-white/10 font-medium'
const switchTrackClass = 'relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200 ease-in-out'
const switchThumbClass =
    'absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white dark:bg-gray-950 shadow transition-transform duration-200 ease-in-out'

/** Main-page boolean rows (captions / speed / quality stay as nav links below). */
const mainSwitches = computed(() => [
    { label: '自動播放下一集', on: props.autoplayEnabled, event: 'toggle-autoplay' },
    { label: '播放時自動全螢幕', on: props.autoFullscreenEnabled, event: 'toggle-auto-fullscreen' },
])

// Keep drawer mounted on mobile so modelValue false→true plays the enter animation
const shell = computed(() => (isMobile.value ? resolveComponent('BaseBottomDrawer') : 'div'))
const shellProps = computed(() =>
    isMobile.value
        ? { modelValue: props.open, title: '設定', maxHeight: 'max-h-[70vh]' }
        : {
            class:
                'absolute bottom-full right-0 mb-2 bg-black/80 backdrop-blur-xl rounded-2xl shadow-2xl py-1.5 z-[10] min-w-[14rem] w-[16.5rem] max-h-[min(70vh,26rem)] overflow-x-hidden overflow-y-auto origin-bottom-right dark',
        },
)

function trackClass(on) {
    return [switchTrackClass, on ? 'bg-gray-900 dark:bg-white' : 'bg-black/10 dark:bg-white/15']
}
function thumbClass(on) {
    return [switchThumbClass, on ? 'translate-x-4' : 'translate-x-0']
}
</script>

<template>
    <component
        :is="shell"
        v-if="isMobile || open"
        v-bind="shellProps"
        @click.stop
        @update:model-value="(v) => !v && emit('close')"
    >
        <div :class="isMobile ? '-mx-4 -my-4' : undefined">
            <transition name="settings-page" mode="out-in">
                <div :key="page">
                    <template v-if="page === 'main'">
                        <button
                            v-for="item in mainSwitches"
                            :key="item.event"
                            type="button"
                            role="switch"
                            :aria-checked="item.on"
                            :class="menuItemClass"
                            @click="emit(item.event)"
                        >
                            <span>{{ item.label }}</span>
                            <span :class="trackClass(item.on)" aria-hidden="true">
                                <span :class="thumbClass(item.on)" />
                            </span>
                        </button>
                        <button
                            v-if="hasCaptions"
                            type="button"
                            :class="menuItemClass"
                            @click.stop="emit('open-page', 'captions')"
                        >
                            <span>字幕</span>
                            <span class="inline-flex items-center gap-0.5 leading-none" :class="mutedClass">
                                {{ captionLabel }}
                                <span class="material-symbols-rounded text-base leading-none">chevron_right</span>
                            </span>
                        </button>
                        <button
                            type="button"
                            role="switch"
                            :aria-checked="theaterMode"
                            :class="[menuItemClass, 'sm:hidden']"
                            @click="emit('toggle-theater')"
                        >
                            <span>劇院模式</span>
                            <span :class="trackClass(theaterMode)" aria-hidden="true">
                                <span :class="thumbClass(theaterMode)" />
                            </span>
                        </button>
                        <button type="button" :class="menuItemClass" @click.stop="emit('open-page', 'speed')">
                            <span>播放速度</span>
                            <span class="inline-flex items-center gap-0.5 leading-none" :class="mutedClass">
                                {{ playbackRate }}x
                                <span class="material-symbols-rounded text-base leading-none">chevron_right</span>
                            </span>
                        </button>
                        <button type="button" :class="menuItemClass" @click.stop="emit('open-page', 'quality')">
                            <span>畫質</span>
                            <span class="inline-flex items-center gap-0.5 leading-none" :class="mutedClass">
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
                            :class="[menuItemClass, playbackRate === speed ? selectedClass : '']"
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
                            :class="[menuItemClass, selectedQuality === -1 ? selectedClass : '']"
                            @click="emit('set-quality', -1)"
                        >
                            <span>自動</span>
                            <span v-if="selectedQuality === -1" class="material-symbols-rounded text-base">check</span>
                        </button>
                        <button
                            v-for="level in qualityLevels"
                            :key="level.index"
                            type="button"
                            :class="[menuItemClass, selectedQuality === level.index ? selectedClass : '']"
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
                            :class="[menuItemClass, !selectedCaptionLang ? selectedClass : '']"
                            @click="emit('set-caption', null)"
                        >
                            <span>關閉</span>
                            <span v-if="!selectedCaptionLang" class="material-symbols-rounded text-base">check</span>
                        </button>
                        <button
                            v-for="cap in captionTracks"
                            :key="cap.srclang"
                            type="button"
                            :class="[menuItemClass, selectedCaptionLang === cap.srclang ? selectedClass : '']"
                            @click="emit('set-caption', cap.srclang)"
                        >
                            <span>{{ cap.label }}</span>
                            <span
                                v-if="selectedCaptionLang === cap.srclang"
                                class="material-symbols-rounded text-base"
                            >check</span>
                        </button>

                        <div class="mx-3.5 my-1.5 border-t border-black/10 dark:border-white/10" />

                        <button
                            type="button"
                            :class="menuItemClass"
                            @click.stop="emit('open-page', 'caption-style')"
                        >
                            <span>樣式</span>
                            <span class="material-symbols-rounded text-base leading-none" :class="mutedClass">chevron_right</span>
                        </button>
                    </template>

                    <template v-else-if="page === 'caption-style'">
                        <button type="button" :class="backClass" @click="emit('update:page', 'captions')">
                            <span class="material-symbols-rounded text-lg">chevron_left</span>
                            <span>樣式</span>
                        </button>

                        <div class="px-3.5 py-2">
                            <p class="mb-1.5" :class="mutedClass">文字大小</p>
                            <div class="flex gap-1">
                                <button
                                    v-for="s in CAPTION_SIZES"
                                    :key="s.id"
                                    type="button"
                                    class="flex-1 rounded-lg py-1.5 text-xs transition-colors"
                                    :class="captionStyle.size === s.id
                                        ? 'bg-black/10 dark:bg-white/20 font-medium text-gray-900 dark:text-white'
                                        : 'bg-black/5 dark:bg-white/5 text-gray-700 dark:text-white hover:bg-black/10 dark:hover:bg-white/10'"
                                    @click="patch({ size: s.id })"
                                >
                                    {{ s.label }}
                                </button>
                            </div>
                        </div>

                        <button
                            type="button"
                            role="switch"
                            :aria-checked="captionStyle.background"
                            :class="menuItemClass"
                            @click="patch({ background: !captionStyle.background })"
                        >
                            <span>背景</span>
                            <span :class="trackClass(captionStyle.background)" aria-hidden="true">
                                <span :class="thumbClass(captionStyle.background)" />
                            </span>
                        </button>

                        <div class="px-3.5 py-2 space-y-3">
                            <div>
                                <p class="mb-1.5" :class="mutedClass">文字顏色</p>
                                <div class="flex flex-wrap gap-2">
                                    <button
                                        v-for="c in CAPTION_COLORS"
                                        :key="c.id"
                                        type="button"
                                        class="w-8 h-8 rounded-full border-2 transition-transform"
                                        :class="captionStyle.color === c.id
                                            ? 'border-gray-900 dark:border-white scale-110'
                                            : 'border-black/20 dark:border-white/20'"
                                        :style="{ backgroundColor: c.id }"
                                        :title="c.label"
                                        @click="patch({ color: c.id })"
                                    />
                                </div>
                            </div>

                            <div>
                                <div class="flex items-center justify-between mb-1.5">
                                    <p :class="mutedClass">不透明度</p>
                                    <span class="tabular-nums" :class="mutedClass">{{ Math.round(captionStyle.opacity * 100) }}%</span>
                                </div>
                                <input
                                    type="range"
                                    min="0.3"
                                    max="1"
                                    step="0.05"
                                    class="w-full accent-gray-900 dark:accent-white"
                                    :value="captionStyle.opacity"
                                    @input="patch({ opacity: Number($event.target.value) })"
                                />
                            </div>

                            <button
                                type="button"
                                class="w-full rounded-lg py-2 text-sm text-gray-600 dark:text-white/80 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                                @click="resetStyle"
                            >
                                重設樣式
                            </button>
                        </div>
                    </template>
                </div>
            </transition>
        </div>
    </component>
</template>

<style scoped>
.settings-page-enter-active, .settings-page-leave-active { transition: all 0.18s ease; }
.settings-page-enter-from { opacity: 0; transform: translateX(0.6rem); }
.settings-page-leave-to { opacity: 0; transform: translateX(-0.6rem); }
</style>
