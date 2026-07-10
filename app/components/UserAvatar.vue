<script setup>
defineOptions({ inheritAttrs: false })

const props = defineProps({
    src: { type: String, default: '' },
    name: { type: String, default: '' },
    imgClass: { type: String, default: '' },
    grayscale: { type: Boolean, default: false },
    rounded: { type: String, default: 'rounded-full' },
    maxInitials: { type: Number, default: 1 },
})

const failed = ref(false)
watch(() => props.src, () => { failed.value = false })

const showImg = computed(() => Boolean(props.src) && !failed.value)
const initial = computed(() => {
    const n = props.name?.trim() || ''
    return n ? n.slice(0, props.maxInitials).toUpperCase() : '?'
})
</script>

<template>
    <div
        v-bind="$attrs"
        class="relative flex shrink-0 overflow-hidden"
        :class="[rounded, imgClass, showImg ? 'bg-transparent' : 'bg-gray-200 dark:bg-white/10']"
    >
        <img
            v-if="showImg"
            :src="src"
            :alt="name"
            class="absolute inset-0 block size-full object-cover"
            :class="grayscale && 'grayscale'"
            loading="lazy"
            @error="failed = true"
        />
        <span v-else class="flex size-full items-center justify-center font-semibold leading-none text-gray-500 dark:text-gray-400">{{ initial }}</span>
    </div>
</template>
