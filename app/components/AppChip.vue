<script setup>
/**
 * Shared pill chip for filters, tabs, and header actions.
 * Use `to` for NuxtLink navigation. Default variant is toggle (pair with `active`).
 */
const VARIANT_TONES = {
    toggle: null, // resolved from `active`
    solid: 'solid',
    ghost: 'idle',
    accent: 'accent',
    danger: 'danger',
    'danger-ghost': 'danger-ghost',
    'danger-outline': 'danger-outline',
}

const props = defineProps({
    active: { type: Boolean, default: false },
    variant: {
        type: String,
        default: 'toggle',
        validator: (v) => v in VARIANT_TONES,
    },
    icon: { type: String, default: null },
    /** Native tag or component. Ignored when `to` is set. */
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
    return VARIANT_TONES[props.variant]
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
        <span v-if="icon" class="material-symbols-rounded text-lg shrink-0" aria-hidden="true">{{ icon }}</span>
        <slot />
    </component>
</template>

<style scoped>
.app-chip {
    @apply inline-flex shrink-0 items-center justify-center gap-2 px-4 py-2 rounded-full text-sm font-medium
           transition-all duration-200 border-0 whitespace-nowrap;
}

.app-chip--sm {
    @apply px-3 py-1.5 text-xs;
}

.app-chip--idle {
    @apply bg-black/5 dark:bg-white/10 text-gray-700 dark:text-gray-300
           hover:bg-black/10 dark:hover:bg-white/20;
}

.app-chip--solid {
    @apply bg-gray-900 dark:bg-white text-white dark:text-black shadow-md hover:opacity-90;
}

.app-chip--accent {
    @apply bg-black/5 dark:bg-white/10 text-blue-600 dark:text-blue-400
           hover:bg-black/10 dark:hover:bg-white/20;
}

.app-chip--danger {
    @apply bg-red-500 text-white hover:bg-red-600 shadow-none;
}

.app-chip--danger-ghost {
    @apply bg-black/5 dark:bg-white/10 text-red-600 dark:text-red-400
           hover:bg-red-500/10;
}

.app-chip--danger-outline {
    @apply bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20 shadow-none;
}

.app-chip--static {
    @apply pointer-events-none hover:bg-black/5 dark:hover:bg-white/10;
}

.app-chip--disabled {
    @apply opacity-50 cursor-not-allowed pointer-events-none;
}
</style>
