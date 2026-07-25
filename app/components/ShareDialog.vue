<script setup>
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
    <LazyBaseDialog :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" title="分享動漫" max-width="max-w-md">
        <div class="space-y-6">
            <!-- QR Code Section -->
            <div class="flex justify-center p-6 bg-black/[0.02] dark:bg-white/5 rounded-xl ring-1 ring-black/5 dark:ring-white/10">
                <div class="bg-white p-4 rounded-lg shadow-md">
                    <div class="relative w-48 h-48">
                        <div v-if="!qrCodeLoaded" class="absolute inset-0 bg-gray-200 rounded-lg animate-pulse"></div>
                        <NuxtImg :src="`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(finalUrl)}`" alt="QR Code" class="w-48 h-48 transition-opacity duration-300" :class="qrCodeLoaded ? 'opacity-100' : 'opacity-0'" loading="eager" @load="qrCodeLoaded = true" />
                    </div>
                </div>
            </div>

            <!-- Timestamp Toggle -->
            <div v-if="hasEpisode" class="flex items-center justify-between p-4 bg-black/[0.02] dark:bg-white/5 rounded-xl ring-1 ring-black/5 dark:ring-white/10">
                <div class="flex items-center gap-3">
                    <span class="material-symbols-rounded text-gray-600 dark:text-gray-400">schedule</span>
                    <div>
                        <p class="font-medium text-gray-900 dark:text-white">包含播放進度</p>
                        <p class="text-sm text-gray-500 dark:text-gray-400">分享當前集數和時間點</p>
                    </div>
                </div>
                <label class="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" v-model="includeTimestamp" class="sr-only peer" />
                    <div class="w-11 h-6 bg-black/10 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-black/10 dark:peer-focus:ring-white/10 rounded-full peer dark:bg-white/15 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white dark:after:bg-gray-950 after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-white/20 peer-checked:bg-gray-900 dark:peer-checked:bg-white"></div>
                </label>
            </div>

            <!-- Share URL Input -->
            <div class="space-y-2">
                <label class="text-sm font-medium text-gray-700 dark:text-gray-300">分享連結</label>
                <div class="flex gap-2 items-center">
                    <input type="text" :value="finalUrl" readonly class="flex-1 px-4 py-3 bg-black/5 dark:bg-white/10 border border-transparent rounded-xl text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-black/20 dark:focus:ring-white/20 focus:border-transparent" />
                    <button @click="copyUrl" :class="['copy-btn px-4 py-3 rounded-full transition-all flex items-center gap-2', copied ? 'bg-emerald-500 hover:bg-emerald-600 scale-105 text-white' : 'bg-gray-900 dark:bg-white hover:opacity-90 text-white dark:text-black']" aria-pressed="false" type="button">
                        <span class="icon-wrap w-5 h-5 relative">
                            <span class="material-symbols-rounded icon-copy absolute inset-0 w-5 h-5" aria-hidden="true">content_copy</span>
                            <span class="material-symbols-rounded icon-check absolute inset-0 w-5 h-5" aria-hidden="true">check</span>
                        </span>
                    </button>
                </div>
            </div>

            <!-- Native Share Button -->
            <div class="flex flex-col sm:flex-row gap-3">
                <button @click="shareNative" class="flex-1 px-4 py-3 bg-gray-900 dark:bg-white hover:opacity-90 text-white dark:text-black rounded-full transition-all flex items-center justify-center gap-2 font-semibold">
                    <span class="material-symbols-rounded">share</span>
                    <span>分享</span>
                </button>
            </div>
        </div>
    </LazyBaseDialog>
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

/* base icon styles (material-symbols-rounded are text glyphs) */
.icon-wrap .material-symbols-rounded {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 1.25rem;
    line-height: 1;
    transition: transform 180ms cubic-bezier(0.2, 0.9, 0.3, 1), opacity 180ms ease;
    transform-origin: center;
    opacity: 1;
    color: inherit; /* Icons inherit color from button */
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
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.18);
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
