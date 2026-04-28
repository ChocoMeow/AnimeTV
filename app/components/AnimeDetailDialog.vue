<script setup>
const props = defineProps({
    modelValue: Boolean,
    animeId: String,
})

const emit = defineEmits(["update:modelValue"])

const animeDetails = ref(null)
const loading = ref(false)

async function fetchDetails() {
    if (animeDetails.value || !props.animeId) return

    loading.value = true
    try {
        const res = await $fetch(`/api/anime/${props.animeId}/details`)
        const wikiContentHtml = typeof res?.wikiContentHtml === "string" ? res.wikiContentHtml.trim() : ""
        if (!wikiContentHtml) {
            animeDetails.value = { error: true }
        } else {
            animeDetails.value = { wikiContentHtml }
        }
    } catch (err) {
        console.error("Failed to fetch anime details:", err)
        animeDetails.value = { error: true }
    } finally {
        loading.value = false
    }
}

watch(
    () => props.modelValue,
    (isOpen) => {
        if (isOpen) {
            fetchDetails()
        }
    }
)
</script>

<template>
    <LazyBaseDialog :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" title="動漫詳情" max-width="max-w-4xl" scrollable>
        <!-- Loading State -->
        <div v-if="loading" class="flex flex-col items-center justify-center py-12">
            <div class="inline-block w-12 h-12 border-4 border-gray-300 dark:border-gray-600 border-t-gray-900 dark:border-t-gray-100 rounded-full animate-spin mb-4"></div>
            <p class="text-gray-600 dark:text-gray-400">載入詳情中...</p>
        </div>

        <!-- Error State -->
        <div v-else-if="animeDetails?.error" class="text-center py-12">
            <span class="material-icons text-5xl text-red-500 dark:text-red-400 mb-4">error_outline</span>
            <p class="text-gray-600 dark:text-gray-400">無法載入動漫詳情</p>
        </div>

        <!-- Details Content -->
        <div v-else-if="animeDetails?.wikiContentHtml" class="wiki-content text-gray-800 dark:text-gray-200" v-html="animeDetails.wikiContentHtml" />
        <div v-else class="text-center py-12">
            <span class="material-icons text-5xl text-red-500 dark:text-red-400 mb-4">error_outline</span>
            <p class="text-gray-600 dark:text-gray-400">無可用的動漫詳情內容</p>
        </div>
    </LazyBaseDialog>
</template>

<style scoped>
.wiki-content :deep(a) {
    @apply text-blue-600 dark:text-blue-400 underline break-words;
}

.wiki-content :deep(ul),
.wiki-content :deep(ol) {
    @apply pl-5 my-3 space-y-1;
}

.wiki-content :deep(ul) {
    @apply list-disc;
}

.wiki-content :deep(ol) {
    @apply list-decimal;
}

.wiki-content :deep(li) {
    @apply leading-relaxed;
}

.wiki-content :deep(p),
.wiki-content :deep(div) {
    @apply leading-relaxed my-2;
}

.dialog-enter-active,
.dialog-leave-active {
    transition: all 0.3s ease-out;
}

.dialog-enter-active > div,
.dialog-leave-active > div {
    transition: all 0.3s ease-out;
}

.dialog-enter-from {
    opacity: 0;
}

.dialog-enter-from > div {
    transform: scale(0.95) translateY(20px);
}

.dialog-leave-to {
    opacity: 0;
}

.dialog-leave-to > div {
    transform: scale(0.95) translateY(20px);
}
</style>
