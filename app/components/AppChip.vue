<script setup>
/** Pill for filters, tabs, and actions. Use `to` for NuxtLink; default `toggle` pairs with `active`. */
const props = defineProps({
    active: { type: Boolean, default: false },
    variant: {
        type: String,
        default: 'toggle',
        validator: (v) =>
            ['toggle', 'solid', 'ghost', 'accent', 'danger', 'danger-ghost', 'danger-outline'].includes(v),
    },
    icon: { type: String, default: null },
    as: { type: [String, Object], default: 'button' },
    to: { type: [String, Object], default: null },
    type: { type: String, default: 'button' },
    disabled: { type: Boolean, default: false },
    size: {
        type: String,
        default: 'md',
        validator: (v) => v === 'md' || v === 'sm',
    },
})

const tone = computed(() => {
    if (props.variant === 'toggle') return props.active ? 'solid' : 'idle'
    return props.variant === 'ghost' ? 'idle' : props.variant
})

const tag = computed(() => (props.to ? resolveComponent('NuxtLink') : props.as))
const isNativeButton = computed(() => !props.to && props.as === 'button')
const isStatic = computed(() => !props.to && props.as === 'div')
</script>

<template>
    <component
        :is="tag"
        :to="to || undefined"
        :type="isNativeButton ? type : undefined"
        :disabled="isNativeButton ? disabled : undefined"
        class="app-chip"
        :class="[
            `app-chip--${tone}`,
            size === 'sm' && 'app-chip--sm',
            disabled && 'app-chip--disabled',
            isStatic && 'app-chip--static',
        ]"
    >
        <span
            v-if="icon"
            class="material-symbols-rounded shrink-0 text-lg leading-none"
            aria-hidden="true"
        >{{ icon }}</span>
        <span v-if="$slots.default" class="leading-none"><slot /></span>
    </component>
</template>

<style scoped>
.app-chip {
    @apply inline-flex h-10 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full
           border-0 px-4 text-sm font-medium leading-none shadow-none transition-colors duration-200
           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/20
           dark:focus-visible:ring-white/20;
}

.app-chip--sm {
    @apply h-8 px-3 text-xs;
}

.app-chip--idle {
    @apply bg-black/5 text-gray-700 hover:bg-black/10 dark:bg-white/10 dark:text-gray-300 dark:hover:bg-white/20;
}

.app-chip--solid {
    @apply bg-gray-900 text-white hover:opacity-90 dark:bg-white dark:text-black;
}

.app-chip--accent {
    @apply bg-black/5 text-blue-600 hover:bg-black/10 dark:bg-white/10 dark:text-blue-400 dark:hover:bg-white/20;
}

.app-chip--danger {
    @apply bg-red-500 text-white hover:bg-red-600;
}

.app-chip--danger-ghost {
    @apply bg-black/5 text-red-600 hover:bg-red-500/10 dark:bg-white/10 dark:text-red-400;
}

.app-chip--danger-outline {
    @apply bg-red-500/10 text-red-600 hover:bg-red-500/20 dark:text-red-400;
}

.app-chip--static {
    @apply pointer-events-none hover:bg-black/5 dark:hover:bg-white/10;
}

.app-chip--disabled {
    @apply pointer-events-none cursor-not-allowed opacity-50;
}
</style>
