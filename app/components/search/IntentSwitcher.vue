<script setup>
defineProps({
    ask: { type: Boolean, default: false },
    askLabel: { type: String, default: 'AI' },
})
defineEmits(['select'])
</script>

<template>
    <div
        class="intent-switcher relative h-9 min-w-[7.25rem] rounded-full bg-white p-1 shadow-sm ring-1 ring-black/8 dark:bg-gray-950 dark:ring-white/10"
        role="tablist"
        aria-label="輸入模式"
    >
        <div
            class="intent-switcher-pill absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-full bg-black/6 dark:bg-white/10"
            :class="{ 'is-ask': ask }"
            aria-hidden="true"
        />
        <div class="relative z-10 grid h-full grid-cols-2 items-center">
            <button
                type="button"
                role="tab"
                class="flex h-full items-center justify-center whitespace-nowrap rounded-full px-2.5 text-xs transition-colors duration-300"
                :class="ask ? 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200' : 'font-medium text-gray-900 dark:text-gray-100'"
                :aria-selected="!ask"
                @click="$emit('select', 'search')"
            >
                搜尋
            </button>
            <button
                type="button"
                role="tab"
                class="flex h-full items-center justify-center whitespace-nowrap rounded-full px-2.5 text-xs transition-colors duration-300"
                :class="ask ? 'font-medium text-gray-900 dark:text-gray-100' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'"
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
