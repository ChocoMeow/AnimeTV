<script setup>
defineOptions({ inheritAttrs: false })

const props = defineProps({
    src: { type: String, default: '' },
    alt: { type: String, default: '' },
    imgClass: { type: [String, Array], default: 'object-cover' },
    iconClass: { type: String, default: 'text-4xl' },
    errorIcon: { type: String, default: 'image' },
    loading: { type: String, default: 'lazy' },
    fetchpriority: { type: String, default: undefined },
    placeholder: { type: Boolean, default: true },
    /** Fade the image in once it has loaded. Off for logos/splash where the animation fights the UI. */
    reveal: { type: Boolean, default: true },
})

const NuxtImg = resolveComponent('NuxtImg')
const attrs = useAttrs()
const img = useTemplateRef('img')
const loaded = ref(!props.reveal)
const failed = ref(false)

watch(() => props.src, () => {
    loaded.value = !props.reveal
    failed.value = false
})

const showImg = computed(() => !!props.src && !failed.value)

// Plain <img> (browser fetches directly) for sources IPX mishandles (esp. iOS/PWA)
// and for Google avatars, which rate-limit (429) the shared server IP that IPX uses
const native = computed(() => /^(data:|blob:|\/(?!\/))|\.svg(\?|$)|googleusercontent\.com/i.test(props.src))

// Don't add `relative` if the caller already positioned the root
const positioned = computed(() => /\b(absolute|fixed|sticky|relative)\b/.test([attrs.class].flat().join(' ')))

function onLoad() {
    if (!props.reveal || loaded.value) return
    loaded.value = true
}

// Image may finish before hydration, so the load event is missed
onMounted(() => {
    const el = img.value?.$el ?? img.value
    if (el?.complete && el.naturalWidth) onLoad()
})
</script>

<template>
    <div
        v-bind="$attrs"
        class="overflow-hidden"
        :class="[
            positioned ? '' : 'relative',
            placeholder && !loaded && 'bg-gray-200 dark:bg-white/5',
        ]"
    >
        <div
            v-if="placeholder && showImg && !loaded"
            class="absolute inset-0 bg-gray-200 dark:bg-white/5"
        />

        <component
            :is="native ? 'img' : NuxtImg"
            v-if="showImg"
            ref="img"
            :src="src"
            :alt="alt"
            :loading="loading"
            :fetchpriority="fetchpriority"
            decoding="async"
            referrerpolicy="no-referrer"
            class="absolute inset-0 h-full w-full"
            :class="[imgClass, reveal ? 'app-img' : null, { 'is-loaded': reveal && loaded }]"
            @load="onLoad"
            @error="failed = true"
        />

        <div v-if="!showImg" class="absolute inset-0 flex items-center justify-center text-gray-400">
            <slot name="error">
                <span class="material-symbols-rounded" :class="iconClass">{{ errorIcon }}</span>
            </slot>
        </div>

        <slot />
    </div>
</template>

<style scoped>
.app-img {
    opacity: 0;
}
.app-img.is-loaded {
    animation: app-img-in 0.4s ease forwards;
}

@keyframes app-img-in {
    from { opacity: 0; }
    to { opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
    .app-img.is-loaded { animation: none; opacity: 1; }
}
</style>