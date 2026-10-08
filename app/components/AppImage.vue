<script setup>
defineOptions({ inheritAttrs: false })

const props = defineProps({
    src: { type: String, default: '' },
    alt: { type: String, default: '' },
    imgClass: { type: [String, Array], default: 'object-cover' },
    iconClass: { type: String, default: 'text-4xl' },
    errorIcon: { type: String, default: 'movie' },
    loading: { type: String, default: 'lazy' },
    fetchpriority: { type: String, default: undefined },
    decoding: { type: String, default: 'async' },
    imgStyle: { type: [String, Object], default: undefined },
    width: { type: [String, Number], default: undefined },
    height: { type: [String, Number], default: undefined },
    /** Pulse + muted backdrop while the file is still fetching. */
    placeholder: { type: Boolean, default: true },
    /** Blur/scale into sharpness once decoded. */
    reveal: { type: Boolean, default: true },
})

const attrs = useAttrs()
const imgRef = ref(null)
const loaded = ref(false)
const failed = ref(false)

watch(
    () => props.src,
    () => {
        loaded.value = false
        failed.value = false
    },
)

const showImg = computed(() => Boolean(props.src) && !failed.value)

const callerHasFilter = computed(() => {
    const style = props.imgStyle
    if (!style) return false
    if (typeof style === 'string') return /filter\s*:/.test(style)
    return Boolean(style.filter)
})

/** Caller already positioned the root (e.g. absolute inset-0) — don't add relative. */
const rootPositioned = computed(() => {
    const raw = attrs.class
    const cls = Array.isArray(raw) ? raw.flat().filter(Boolean).join(' ') : String(raw || '')
    return /\b(?:absolute|fixed|sticky|relative)\b/.test(cls)
})

function markLoaded() {
    loaded.value = true
}

function markFailed() {
    failed.value = true
}

function syncCachedImage(el) {
    const img = el?.$el?.tagName === 'IMG' ? el.$el : el
    if (img?.complete && img.naturalWidth) markLoaded()
}

watch(imgRef, (el) => {
    if (el) nextTick(() => syncCachedImage(el))
})
</script>

<template>
    <div
        v-bind="$attrs"
        class="overflow-hidden"
        :class="{
            relative: !rootPositioned,
            'bg-gray-200 dark:bg-white/5': placeholder,
        }"
    >
        <div
            v-if="placeholder && showImg && !loaded"
            class="absolute inset-0 animate-pulse bg-gray-200 dark:bg-white/5"
            aria-hidden="true"
        />

        <NuxtImg
            v-if="showImg"
            ref="imgRef"
            :src="src"
            :alt="alt"
            :width="width"
            :height="height"
            :loading="loading"
            :fetchpriority="fetchpriority"
            :decoding="decoding"
            :style="imgStyle"
            :class="[
                'app-img absolute inset-0 h-full w-full',
                imgClass,
                reveal && (loaded ? 'opacity-100' : 'opacity-80'),
                reveal && !callerHasFilter && (loaded ? 'blur-0' : 'blur-xl'),
                reveal && (loaded ? 'scale-100' : 'scale-105'),
            ]"
            @load="markLoaded"
            @error="markFailed"
        />

        <div
            v-if="!showImg"
            class="absolute inset-0 flex items-center justify-center text-gray-400"
        >
            <slot name="error">
                <span class="material-symbols-rounded" :class="iconClass">{{ errorIcon }}</span>
            </slot>
        </div>

        <slot />
    </div>
</template>

<style scoped>
.app-img {
    transition:
        opacity 0.7s cubic-bezier(0.22, 1, 0.36, 1),
        transform 0.7s cubic-bezier(0.22, 1, 0.36, 1),
        filter 0.7s cubic-bezier(0.22, 1, 0.36, 1);
}

@media (prefers-reduced-motion: reduce) {
    .app-img {
        transition: none;
        filter: none !important;
        transform: none;
    }
}
</style>
