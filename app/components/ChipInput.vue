<script setup>
const props = defineProps({
    modelValue: {
        type: Array,
        default: () => [],
    },
    placeholder: {
        type: String,
        default: '',
    },
    hint: {
        type: String,
        default: '',
    },
})

const emit = defineEmits(['update:modelValue'])

const inputValue = ref('')

function addChips() {
    const raw = inputValue.value.trim()
    if (!raw) return

    const current = Array.isArray(props.modelValue) ? [...props.modelValue] : []

    // Split on whitespace so user can paste multiple tokens
    const parts = raw
        .split(/\s+/)
        .map((p) => p.trim())
        .filter(Boolean)

    for (const part of parts) {
        if (!current.includes(part)) {
            current.push(part)
        }
    }

    emit('update:modelValue', current)
    inputValue.value = ''
}

function handleKeydown(event) {
    if (event.key === ' ' || event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault()
        addChips()
    }
}

function removeChip(value) {
    const current = Array.isArray(props.modelValue) ? [...props.modelValue] : []
    emit(
        'update:modelValue',
        current.filter((item) => item !== value)
    )
}
</script>

<template>
    <div class="space-y-2">
        <div
            class="w-full min-h-[80px] rounded-xl border border-gray-200 dark:border-white/10 bg-black/5 dark:bg-white/10 px-2 py-2 flex flex-wrap items-start gap-2"
        >
            <span
                v-for="chip in modelValue"
                :key="chip"
                class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-black/80 dark:bg-white text-white dark:text-black text-xs"
            >
                <span>{{ chip }}</span>
                <button type="button" class="material-icons text-[14px] leading-none" @click="removeChip(chip)">close</button>
            </span>
            <input
                v-model="inputValue"
                type="text"
                :placeholder="placeholder"
                class="flex-1 min-w-[80px] border-none outline-none bg-transparent text-xs text-gray-800 dark:text-gray-100 px-1 py-0.5"
                @keydown="handleKeydown"
            />
        </div>
        <p v-if="hint" class="text-[11px] text-gray-400 dark:text-gray-500">
            {{ hint }}
        </p>
    </div>
</template>
