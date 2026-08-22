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
            <div class="pt-16 px-6 pb-6 space-y-5">
                <div class="border-b border-black/5 dark:border-white/5 pb-4 flex flex-wrap items-end justify-between gap-3">
                    <div class="min-w-0 space-y-3">
                        <div class="h-8 w-48 max-w-full rounded-lg bg-gray-200 dark:bg-white/10" />
                        <div class="h-4 w-32 rounded bg-gray-200 dark:bg-white/10" />
                    </div>
                    <div class="flex flex-wrap justify-end gap-2">
                        <div class="h-7 w-20 rounded-full bg-gray-200 dark:bg-white/10" />
                        <div class="h-7 w-28 rounded-full bg-gray-200 dark:bg-white/10" />
                        <div class="h-7 w-24 rounded-full bg-gray-200 dark:bg-white/10" />
                    </div>
                </div>
                <div class="h-11 rounded-xl bg-gray-200 dark:bg-white/10" />
                <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    <div v-for="n in 10" :key="n" class="aspect-[2/3] rounded-xl bg-gray-200 dark:bg-white/10" />
                </div>
            </div>
        </template>
        <template v-else>
            <div class="space-y-4 pb-4">
                <div class="h-11 rounded-xl bg-gray-200 dark:bg-white/10" />
                <div class="grid grid-cols-3 gap-2">
                    <div v-for="n in 9" :key="n" class="aspect-[2/3] rounded-xl bg-gray-200 dark:bg-white/10" />
                </div>
            </div>
        </template>
    </div>
</template>
