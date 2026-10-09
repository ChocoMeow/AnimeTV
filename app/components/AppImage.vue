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
    /** Fade-in + blur ghost on load. Off for logos/splash where the animation fights the UI. */
    reveal: { type: Boolean, default: true },
})

const NuxtImg = resolveComponent('NuxtImg')
const attrs = useAttrs()
const img = useTemplateRef('img')
const loaded = ref(!props.reveal)
const failed = ref(false)
const ghost = ref(false) // blurred copy that fades out on reveal

watch(() => props.src, () => {
    loaded.value = !props.reveal
    failed.value = ghost.value = false
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
    ghost.value = true
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
            class="absolute inset-0 animate-pulse bg-gray-200 dark:bg-white/5"
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

        <!-- Blur lives on its own layer with a constant filter (Safari-safe) -->
        <img
            v-if="reveal && ghost"
            :src="src"
            alt=""
            aria-hidden="true"
            referrerpolicy="no-referrer"
            class="app-img-ghost absolute inset-0 h-full w-full blur-xl"
            :class="imgClass"
            @animationend="ghost = false"
        >

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
    backface-visibility: hidden;
}
.app-img.is-loaded {
    animation: app-img-in 0.8s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}
.app-img-ghost {
    transform: scale(1.1);
    pointer-events: none;
    backface-visibility: hidden;
    animation: app-img-out 0.8s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}

@keyframes app-img-in {
    from { opacity: 0; transform: scale(1.05); }
    to { opacity: 1; transform: none; }
}
@keyframes app-img-out {
    to { opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
    .app-img.is-loaded { animation: none; opacity: 1; }
    .app-img-ghost { display: none; }
}
</style>