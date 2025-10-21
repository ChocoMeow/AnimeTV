<script setup>
import { ref, computed, watch } from "vue"

const props = defineProps({
    modelValue: Boolean,
    shareUrl: String,
    animeTitle: String,
    hasEpisode: Boolean,
})

const emit = defineEmits(["update:modelValue"])

const includeTimestamp = ref(false)
const copied = ref(false)
const qrCodeLoaded = ref(false) // State for QR code loading

// A computed property for the URL to ensure reactivity
const finalUrl = computed(() => {
    if (!props.hasEpisode || !includeTimestamp.value) {
        return props.shareUrl.split("?")[0]
    }
    return props.shareUrl
})

// Watch for changes in the final URL and reset the QR code loaded state
watch(finalUrl, () => {
    qrCodeLoaded.value = false
})

async function copyUrl() {
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(finalUrl.value) // Use computed URL
            copied.value = true
            setTimeout(() => {
                copied.value = false
            }, 2000)
        } else {
            // Fallback for older browsers
            const textArea = document.createElement("textarea")
            textArea.value = finalUrl.value // Use computed URL
            textArea.style.position = "fixed"
            textArea.style.left = "-999999px"
            document.body.appendChild(textArea)
            textArea.select()
            try {
                document.execCommand("copy")
                copied.value = true
                setTimeout(() => {
                    copied.value = false
                }, 2000)
            } catch (err) {
                console.error("Copy failed:", err)
            }
            document.body.removeChild(textArea)
        }
    } catch (err) {
        console.error("Copy failed:", err)
    }
}

async function shareNative() {
    if (typeof navigator !== "undefined" && navigator.share) {
        try {
            await navigator.share({
                title: props.animeTitle,
                text: `Watch ${props.animeTitle}`,
                url: finalUrl.value, // Use computed URL
            })
        } catch (err) {
            console.error("Share failed:", err)
        }
    }
}
</script>

<template>
    <BaseDialog :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" title="分享動漫" max-width="max-w-md">
        <div class="space-y-6">
            <!-- QR Code Section -->
            <div class="flex justify-center p-6 bg-gray-50 dark:bg-gray-900 rounded-xl">
                <div class="bg-white p-4 rounded-lg shadow-md">
                    <div class="relative w-48 h-48">
                        <div v-if="!qrCodeLoaded" class="absolute inset-0 bg-gray-200 rounded-lg animate-pulse"></div>
                        <img :src="`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(finalUrl)}`" alt="QR Code" class="w-48 h-48 transition-opacity duration-300" :class="qrCodeLoaded ? 'opacity-100' : 'opacity-0'" @load="qrCodeLoaded = true" />
                    </div>
                </div>
            </div>

            <!-- Timestamp Toggle -->
            <div v-if="hasEpisode" class="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900 rounded-xl">
                <div class="flex items-center gap-3">
                    <span class="material-icons text-indigo-600 dark:text-indigo-400">schedule</span>
                    <div>
                        <p class="font-medium text-gray-900 dark:text-white">包含播放進度</p>
                        <p class="text-sm text-gray-500 dark:text-gray-400">分享當前集數和時間點</p>
                    </div>
                </div>
                <label class="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" v-model="includeTimestamp" class="sr-only peer" />
                    <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 dark:peer-focus:ring-indigo-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-indigo-600"></div>
                </label>
            </div>

            <!-- Share URL Input -->
            <div class="space-y-2">
                <label class="text-sm font-medium text-gray-700 dark:text-gray-300">分享連結</label>
                <div class="flex gap-2 items-center">
                    <input type="text" :value="finalUrl" readonly class="flex-1 px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
                    <button @click="copyUrl" :class="['copy-btn px-4 py-3 rounded-lg transition-all flex items-center gap-2', copied ? 'bg-emerald-500 hover:bg-emerald-600 scale-105' : 'bg-indigo-600 hover:bg-indigo-700']" aria-pressed="false" type="button">
                        <span class="icon-wrap w-5 h-5 relative">
                            <span class="material-icons icon-copy absolute inset-0 w-5 h-5" aria-hidden="true">content_copy</span>
                            <span class="material-icons icon-check absolute inset-0 w-5 h-5" aria-hidden="true">check</span>
                        </span>
                    </button>
                </div>
            </div>

            <!-- Native Share Button -->
            <div class="flex flex-col sm:flex-row gap-3">
                <button @click="shareNative" class="flex-1 px-4 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-lg transition-all flex items-center justify-center gap-2 font-medium">
                    <span class="material-icons">share</span>
                    <span>分享</span>
                </button>
            </div>
        </div>
    </BaseDialog>
</template>

<style scoped>
.dialog-enter-active,
.dialog-leave-active {
    transition: all 0.3s ease-out;
}

.dialog-enter-active > div,
.dialog-leave-active > div {
    transition: all 0.3s ease-out;
}

.dialog-enter-from {
    opacity: 0;
}

.dialog-enter-from > div {
    transform: scale(0.95) translateY(20px);
}

.dialog-leave-to {
    opacity: 0;
}

.dialog-leave-to > div {
    transform: scale(0.95) translateY(20px);
}

.copy-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 3.5rem;
    will-change: transform;
}

/* icon wrapper */
.icon-wrap {
    display: inline-block;
    width: 1.25rem;
    height: 1.25rem;
    position: relative;
}

/* base icon styles (material-icons are text glyphs) */
.icon-wrap .material-icons {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 1.25rem;
    line-height: 1;
    transition: transform 180ms cubic-bezier(0.2, 0.9, 0.3, 1), opacity 180ms ease;
    transform-origin: center;
    opacity: 1;
    color: white; /* Icons should be white on colored buttons */
    pointer-events: none;
    position: absolute;
    inset: 0;
    text-align: center;
}

/* initial states: show copy, hide check */
.icon-check {
    transform: scale(0.6) rotate(15deg);
    opacity: 0;
}

/* When copied: enlarge button slightly and show check icon */
.copy-btn.scale-105 {
    transform: scale(1.05);
    box-shadow: 0 6px 18px rgba(99, 102, 241, 0.18);
    transition: transform 180ms cubic-bezier(0.2, 0.9, 0.3, 1), box-shadow 180ms linear;
}

/* When copied: show check, hide copy */
.copy-btn.scale-105 .icon-check {
    transform: scale(1) rotate(0deg);
    opacity: 1;
}

.copy-btn.scale-105 .icon-copy {
    transform: scale(0.6) rotate(-15deg);
    opacity: 0;
}

/* text label transition */
.copy-btn .text-sm {
    transition: transform 150ms ease, opacity 150ms ease;
}

/* keep button accessible on small screens */
@media (max-width: 420px) {
    .copy-btn {
        padding-left: 0.75rem;
        padding-right: 0.75rem;
    }
}
</style>
