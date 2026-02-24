<template>
    <!-- Matches AnimeCard: bg-gray-950/5 dark:bg-white/10, border-gray-100 dark:border-gray-700 -->
    <div
        class="rounded-xl overflow-hidden bg-gray-950/5 dark:bg-white/10 border border-gray-100 dark:border-gray-700"
    >
        <div
            class="aspect-[2/3] rounded-t-xl bg-gray-200 dark:bg-gray-700 animate-pulse"
        />
        <div class="p-3 space-y-2">
            <div class="h-4 w-4/5 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" />
            <div class="flex items-center justify-between">
                <div class="h-3 w-1/4 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" />
                <div class="h-3 w-1/4 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" />
            </div>
        </div>
    </div>
</template>
