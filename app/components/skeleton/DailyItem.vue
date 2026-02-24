<template>
    <!-- Matches .daily-item: bg-white dark:bg-black/5, border-gray-950/5 dark:border-white/10 -->
    <div
        class="rounded-xl overflow-hidden bg-white dark:bg-black/5 border border-gray-950/5 dark:border-white/10"
    >
        <div
            class="aspect-video rounded-t-lg bg-gray-200 dark:bg-gray-700 animate-pulse"
        />
        <div class="p-2 space-y-1.5">
            <div class="h-3.5 w-5/6 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" />
            <div class="h-3 w-1/3 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" />
        </div>
    </div>
</template>
