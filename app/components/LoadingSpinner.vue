<script setup>
defineOptions({ inheritAttrs: false })

/**
 * Unified loading spinner — size and border thickness scale together.
 * xs 16/2 · sm 20/2 · md 32/3 · lg 40/3 · xl 48/4 · 2xl 80/4
 */
const props = defineProps({
    size: {
        type: String,
        default: 'lg',
        validator: (v) => ['xs', 'sm', 'md', 'lg', 'xl', '2xl'].includes(v),
    },
    /** Light ring for dark backgrounds (e.g. video player). */
    variant: {
        type: String,
        default: 'default',
        validator: (v) => ['default', 'on-dark'].includes(v),
    },
    label: { type: String, default: '載入中' },
})

const SIZE_CLASS = {
    xs: 'size-4 border-2',
    sm: 'size-5 border-2',
    md: 'size-8 border-[3px]',
    lg: 'size-10 border-[3px]',
    xl: 'size-12 border-4',
    '2xl': 'size-20 border-4',
}

const ringClass = computed(() =>
    props.variant === 'on-dark'
        ? 'border-white/25 border-t-white'
        : 'border-black/10 dark:border-white/15 border-t-gray-900 dark:border-t-white',
)
</script>

<template>
    <!-- Outer shell: positioning/transform classes from attrs stay off the spinning ring. -->
    <div
        role="status"
        :aria-label="label"
        class="inline-block shrink-0 leading-none"
        v-bind="$attrs"
    >
        <div
            class="loading-spinner rounded-full animate-spin"
            :class="[SIZE_CLASS[size], ringClass]"
        />
    </div>
</template>
