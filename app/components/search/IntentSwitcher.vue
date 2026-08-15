<script setup>
defineProps({
    ask: { type: Boolean, default: false },
    askLabel: { type: String, default: 'AI' },
})
defineEmits(['select'])

function tabClass(active) {
    return active
        ? 'text-white dark:text-black'
        : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'
}
</script>

<template>
    <div class="intent-switcher relative rounded-full bg-black/5 dark:bg-white/10" role="tablist" aria-label="輸入模式">
        <div
            class="intent-switcher-pill absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-full bg-gray-900 dark:bg-white"
            :class="{ 'is-ask': ask }"
            aria-hidden="true"
        />
        <div class="relative z-10 grid h-full grid-cols-2">
            <button
                type="button"
                role="tab"
                class="rounded-full text-xs font-medium transition-colors duration-300"
                :class="tabClass(!ask)"
                :aria-selected="!ask"
                @click="$emit('select', 'search')"
            >
                搜尋
            </button>
            <button
                type="button"
                role="tab"
                class="rounded-full text-xs font-medium transition-colors duration-300"
                :class="tabClass(ask)"
                :aria-selected="ask"
                @click="$emit('select', 'ask')"
            >
                {{ askLabel }}
            </button>
        </div>
    </div>
</template>

<style scoped>
.intent-switcher-pill {
    transition: transform 0.32s cubic-bezier(0.22, 1, 0.36, 1);
    will-change: transform;
}
.intent-switcher-pill.is-ask {
    transform: translateX(100%);
}
</style>
