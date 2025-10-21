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

        const allEmpty = Object.values(res).every((value) => value === "" || (Array.isArray(value) && value.length === 0))
        if (allEmpty) {
            animeDetails.value = { error: true }
        } else {
            animeDetails.value = res
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
    <BaseDialog :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" title="動漫詳情" max-width="max-w-4xl" scrollable>
        <!-- Loading State -->
        <div v-if="loading" class="flex flex-col items-center justify-center py-12">
            <div class="inline-block w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-4"></div>
            <p class="text-gray-600 dark:text-gray-400">載入詳情中...</p>
        </div>

        <!-- Error State -->
        <div v-else-if="animeDetails?.error" class="text-center py-12">
            <span class="material-icons text-5xl text-red-500 dark:text-red-400 mb-4">error_outline</span>
            <p class="text-gray-600 dark:text-gray-400">無法載入動漫詳情</p>
        </div>

        <!-- Details Content -->
        <div v-else-if="animeDetails" class="space-y-6">
            <!-- Staff Section -->
            <div v-if="animeDetails.staff?.length" class="detail-section">
                <h4 class="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2 sticky top-0 bg-white dark:bg-gray-800 z-10 p-2">
                    <span class="material-icons text-indigo-600 dark:text-indigo-400">badge</span>
                    製作人員 (STAFF)
                </h4>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div v-for="staff in animeDetails.staff" :key="staff.id" class="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                        <img v-if="staff.image" :src="staff.image" :alt="staff.name" class="w-12 h-12 rounded-full object-cover" />
                        <div class="w-12 h-12 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center" v-else>
                            <span class="material-icons text-indigo-600 dark:text-indigo-400">person</span>
                        </div>
                        <div class="flex-1 min-w-0">
                            <p class="font-medium text-gray-900 dark:text-white truncate">{{ staff.name }}</p>
                            <p class="text-sm text-gray-500 dark:text-gray-400 truncate">{{ staff.role }}</p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Cast Section -->
            <div v-if="animeDetails.cast?.length" class="detail-section">
                <h4 class="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2 sticky top-0 bg-white dark:bg-gray-800 z-10 p-2">
                    <span class="material-icons text-purple-600 dark:text-purple-400">mic</span>
                    聲優陣容 (CAST)
                </h4>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div v-for="cast in animeDetails.cast" :key="cast.id" class="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                        <img v-if="cast.image" :src="cast.image" :alt="cast.name" class="w-12 h-12 rounded-full object-cover" />
                        <div class="w-12 h-12 rounded-full bg-purple-100 dark:bg-purple-900 flex items-center justify-center" v-else>
                            <span class="material-icons text-purple-600 dark:text-purple-400">person</span>
                        </div>
                        <div class="flex-1 min-w-0">
                            <p class="font-medium text-gray-900 dark:text-white truncate">{{ cast.name }}</p>
                            <p class="text-sm text-gray-500 dark:text-gray-400 truncate">{{ cast.character }}</p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Music Section -->
            <div v-if="animeDetails.music?.length" class="detail-section">
                <h4 class="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2 sticky top-0 bg-white dark:bg-gray-800 z-10 p-2">
                    <span class="material-icons text-pink-600 dark:text-pink-400">music_note</span>
                    音樂 (MUSIC)
                </h4>
                <div class="space-y-3">
                    <div v-for="music in animeDetails.music" :key="music.id" class="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                        <div class="flex items-start gap-3">
                            <span class="material-icons text-pink-600 dark:text-pink-400">audiotrack</span>
                            <div class="flex-1">
                                <p class="font-medium text-gray-900 dark:text-white">{{ music.name }}</p>
                                <p class="text-sm text-gray-500 dark:text-gray-400">{{ music.type }}</p>
                                <p class="text-sm text-gray-600 dark:text-gray-300 mt-1">{{ music.artist }}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Additional Details -->
            <div v-if="animeDetails.additionalInfo" class="detail-section">
                <h4 class="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2 sticky top-0 bg-white dark:bg-gray-800 z-10 p-2">
                    <span class="material-icons text-blue-600 dark:text-blue-400">info</span>
                    其他資訊
                </h4>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div v-for="(value, key) in animeDetails.additionalInfo" :key="key" class="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                        <p class="text-sm text-gray-500 dark:text-gray-400 mb-1">{{ key }}</p>
                        <p class="font-medium text-gray-900 dark:text-white">{{ value }}</p>
                    </div>
                </div>
            </div>
        </div>
    </BaseDialog>
</template>

<style scoped>
.detail-section {
    @apply pb-6 border-b border-gray-200 dark:border-gray-700 last:border-0;
}

.custom-scrollbar::-webkit-scrollbar {
    width: 6px;
}

.custom-scrollbar::-webkit-scrollbar-track {
    @apply bg-gray-100 dark:bg-gray-900 rounded-full;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
    @apply bg-gray-300 dark:bg-gray-600 rounded-full;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
    @apply bg-gray-400 dark:bg-gray-500;
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
