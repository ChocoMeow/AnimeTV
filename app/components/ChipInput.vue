<script setup>
const model = defineModel({ type: Array, default: () => [] })

defineProps({
    placeholder: { type: String, default: '' },
    hint: { type: String, default: '' },
})

const inputValue = ref('')

function addChips() {
    const raw = inputValue.value.trim()
    if (!raw) return

    const next = [...(model.value || [])]
    for (const part of raw.split(/[,\s]+/).map((p) => p.trim()).filter(Boolean)) {
        if (!next.includes(part)) next.push(part)
    }
    model.value = next
    inputValue.value = ''
}

function onKeydown(event) {
    if (event.key === ' ' || event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault()
        addChips()
    }
}

function onInput(event) {
    if (event.target.value.includes(',')) addChips()
}

function removeChip(value) {
    model.value = (model.value || []).filter((item) => item !== value)
}
</script>

<template>
    <div class="space-y-2">
        <div class="field-box flex min-h-20 flex-wrap items-start gap-2 px-3">
            <span
                v-for="chip in model"
                :key="chip"
                class="inline-flex items-center gap-1 rounded-full bg-black/80 px-2.5 py-1 text-xs text-white dark:bg-white dark:text-black"
            >
                {{ chip }}
                <button
                    type="button"
                    class="material-symbols-rounded text-[14px] leading-none"
                    @click="removeChip(chip)"
                >close</button>
            </span>
            <input
                v-model="inputValue"
                type="text"
                :placeholder="placeholder"
                class="min-w-20 flex-1 border-none bg-transparent px-1 py-0.5 text-xs text-gray-800 outline-none dark:text-gray-100"
                @keydown="onKeydown"
                @input="onInput"
            />
        </div>
        <p v-if="hint" class="text-[11px] text-gray-400 dark:text-gray-500">{{ hint }}</p>
    </div>
</template>
