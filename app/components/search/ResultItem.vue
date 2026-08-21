<script setup>
const props = defineProps({
    result: { type: Object, required: true },
    query: { type: String, default: '' },
    active: { type: Boolean, default: false },
})

const emit = defineEmits(['select', 'hover'])

const titleHtml = computed(() => highlightMatch(props.result.title, props.query))
const descHtml = computed(() => (props.result.description ? highlightMatch(props.result.description, props.query) : ''))

function onEnter(e) {
    emit('hover', e.currentTarget)
}
</script>

<template>
    <li
        role="option"
        :aria-selected="active"
        :data-active="active ? 'true' : undefined"
        class="flex cursor-pointer items-start gap-3 rounded-xl px-4 py-3 transition-colors"
        :class="active ? 'bg-black/8 dark:bg-white/10' : 'hover:bg-black/5 dark:hover:bg-white/5'"
        @mouseenter="onEnter"
        @mousedown.prevent="emit('select')"
    >
        <div class="aspect-[2/3] w-14 shrink-0 overflow-hidden rounded-md bg-black/5 dark:bg-white/10 sm:w-16">
            <NuxtImg v-if="result.image" :src="result.image" :alt="result.title" class="h-full w-full object-cover" loading="lazy" />
            <div v-else class="flex h-full w-full items-center justify-center text-gray-400">
                <span class="material-symbols-rounded text-lg">image</span>
            </div>
        </div>
        <div class="min-w-0 flex-1">
            <h4 class="truncate text-sm font-medium text-gray-900 dark:text-gray-100" v-html="titleHtml" />
            <p v-if="descHtml" class="mt-0.5 line-clamp-3 text-xs text-gray-500 dark:text-gray-400" v-html="descHtml" />
            <div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                <AppTooltip v-if="result.year" text="首播時間">
                    <span>{{ result.year }}</span>
                </AppTooltip>
                <AppTooltip v-if="result.score" text="評分">
                    <span class="inline-flex items-center gap-0.5">
                        <span class="material-symbols-rounded text-[12px]">star</span>
                        {{ result.score }}
                    </span>
                </AppTooltip>
                <AppTooltip v-if="result.episodes" text="集數">
                    <span class="inline-flex items-center gap-0.5">
                        <span class="material-symbols-rounded text-[12px]">play_circle</span>
                        {{ result.episodes }}
                    </span>
                </AppTooltip>
                <AppTooltip v-if="result.views" text="觀看次數">
                    <span class="inline-flex items-center gap-0.5">
                        <span class="material-symbols-rounded text-[12px]">visibility</span>
                        {{ formatViews(result.views) }}
                    </span>
                </AppTooltip>
            </div>
        </div>
        <span
            class="hidden shrink-0 self-center rounded-full px-2 py-1 text-[11px] sm:inline"
            :class="active ? 'bg-black/5 text-gray-600 dark:bg-white/10 dark:text-gray-300' : 'invisible'"
            aria-hidden="true"
        >
            開啟
        </span>
    </li>
</template>

<style scoped>
:deep(.search-hl) {
    background-color: rgb(245 158 11 / 0.28);
    color: inherit;
    border-radius: 2px;
    padding: 0 1px;
}
</style>
