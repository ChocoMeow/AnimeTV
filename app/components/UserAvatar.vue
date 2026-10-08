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

const initial = computed(() => {
    const n = props.name?.trim() || ''
    return n ? n.slice(0, props.maxInitials).toUpperCase() : '?'
})
</script>

<template>
    <AppImage
        v-bind="$attrs"
        :src="src"
        :alt="name"
        :class="[rounded, imgClass]"
        :img-class="['object-cover', grayscale && 'grayscale']"
        :placeholder="false"
        :reveal="false"
        error-icon=""
    >
        <template #error>
            <span class="flex size-full items-center justify-center bg-gray-200 font-semibold leading-none text-gray-500 dark:bg-white/10 dark:text-gray-400">
                {{ initial }}
            </span>
        </template>
    </AppImage>
</template>
