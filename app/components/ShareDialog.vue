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

const qrCodeSrc = computed(() =>
    `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(finalUrl.value)}`,
)

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
                        <NuxtImg :src="qrCodeSrc" alt="QR Code" class="w-48 h-48 transition-opacity duration-300" :class="qrCodeLoaded ? 'opacity-100' : 'opacity-0'" loading="eager" @load="qrCodeLoaded = true" />
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
                <AppSwitch v-model="includeTimestamp" label="包含播放進度" />
            </div>

            <!-- Share URL Input -->
            <div class="space-y-2">
                <label class="text-sm font-medium text-gray-700 dark:text-gray-300">分享連結</label>
                <div class="flex gap-2 items-center min-w-0">
                    <input type="text" :value="finalUrl" readonly class="field min-w-0 flex-1 truncate" />
                    <button
                        type="button"
                        class="copy-btn btn-primary shrink-0 px-4"
                        :class="copied && 'scale-105 !bg-emerald-500 hover:!bg-emerald-600 !text-white'"
                        @click="copyUrl"
                    >
                        <span class="icon-wrap relative h-5 w-5">
                            <span class="material-symbols-rounded icon-copy absolute inset-0 h-5 w-5" aria-hidden="true">content_copy</span>
                            <span class="material-symbols-rounded icon-check absolute inset-0 h-5 w-5" aria-hidden="true">check</span>
                        </span>
                    </button>
                </div>
            </div>

            <!-- Native Share Button -->
            <div class="flex flex-col sm:flex-row gap-3">
                <button type="button" class="btn-primary flex-1 justify-center" @click="shareNative">
                    <span class="material-symbols-rounded">share</span>
                    分享
                </button>
            </div>
        </div>
    </LazyBaseDialog>
</template>

<style scoped>
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
