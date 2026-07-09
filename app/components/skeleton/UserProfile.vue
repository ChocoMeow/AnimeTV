<script setup>
defineProps({
    compact: { type: Boolean, default: false },
})
</script>

<template>
    <div class="animate-pulse">
        <template v-if="!compact">
            <div class="relative h-40 bg-gray-200 dark:bg-white/10">
                <div class="absolute -bottom-12 left-6 w-24 h-24 rounded-2xl bg-gray-300 dark:bg-white/15 ring-4 ring-white dark:ring-gray-950" />
            </div>
            <div class="pt-16 px-6 pb-6 grid grid-cols-1 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-6">
                <div class="space-y-6">
                    <div class="space-y-3 border-b border-black/5 dark:border-white/5 pb-4">
                        <div class="h-8 w-48 max-w-full rounded-lg bg-gray-200 dark:bg-white/10" />
                        <div class="h-4 w-32 rounded bg-gray-200 dark:bg-white/10" />
                        <div class="flex flex-wrap gap-2">
                            <div v-for="n in 3" :key="n" class="h-7 w-24 rounded-full bg-gray-200 dark:bg-white/10" />
                        </div>
                    </div>
                    <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-3 gap-3">
                        <div v-for="n in 6" :key="n" class="aspect-[2/3] rounded-xl bg-gray-200 dark:bg-white/10" />
                    </div>
                </div>
                <div class="space-y-4">
                    <div class="h-24 rounded-xl bg-gray-200 dark:bg-white/10" />
                    <div class="h-32 rounded-xl bg-gray-200 dark:bg-white/10" />
                </div>
            </div>
        </template>
        <template v-else>
            <div class="grid grid-cols-3 gap-2">
                <div v-for="n in 6" :key="n" class="aspect-[2/3] rounded-xl bg-gray-200 dark:bg-white/10" />
            </div>
            <div class="grid grid-cols-3 gap-2">
                <div v-for="n in 6" :key="`fav-${n}`" class="aspect-[2/3] rounded-xl bg-gray-200 dark:bg-white/10" />
            </div>
        </template>
    </div>
</template>
