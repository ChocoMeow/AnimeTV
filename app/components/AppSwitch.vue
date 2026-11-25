<script setup>
/** Toggle. `size="sm"` for dense menus; `onTone="amber"` for warning; `passive` for visual-only (parent owns click). */
const model = defineModel({ type: Boolean, default: false })

defineProps({
    disabled: { type: Boolean, default: false },
    passive: { type: Boolean, default: false },
    size: {
        type: String,
        default: 'md',
        validator: (v) => v === 'md' || v === 'sm',
    },
    onTone: {
        type: String,
        default: 'solid',
        validator: (v) => v === 'solid' || v === 'amber',
    },
    label: { type: String, default: undefined },
})
</script>

<template>
    <component
        :is="passive ? 'span' : 'button'"
        class="control-switch"
        :class="[
            size === 'sm' && 'control-switch--sm',
            model && (onTone === 'amber' ? 'is-on-amber' : 'is-on'),
            passive && 'pointer-events-none',
        ]"
        :type="passive ? undefined : 'button'"
        :role="passive ? undefined : 'switch'"
        :aria-checked="passive ? undefined : model"
        :aria-label="passive ? undefined : label"
        :aria-hidden="passive || undefined"
        :disabled="passive ? undefined : disabled"
        @click="!passive && (model = !model)"
    >
        <span class="control-switch-thumb" aria-hidden="true" />
    </component>
</template>
