<script setup>
defineProps({
    sections: { type: Array, required: true },
    /** Compact = desktop sidebar; roomy = mobile drawer */
    dense: { type: Boolean, default: false },
})

const emit = defineEmits(['profile'])
</script>

<template>
    <div :class="dense ? 'space-y-3' : 'space-y-4 pb-4'">
        <div v-for="section in sections" :key="section.status" :class="dense ? 'space-y-2' : 'space-y-3'">
            <h3
                :class="dense
                    ? 'mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400'
                    : 'text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400'"
            >
                {{ section.title }} — {{ section.friends.length }}
            </h3>

            <div v-for="friend in section.friends" :key="friend.id" class="friend-card">
                <!-- Watching -->
                <div
                    v-if="section.isWatching"
                    :class="[
                        'relative overflow-hidden ring-1 ring-black/10 dark:ring-white/10',
                        dense ? 'rounded-xl p-3 transition-shadow hover:shadow-md' : 'rounded-2xl p-4',
                    ]"
                >
                    <div
                        v-if="friend.animeBackground"
                        class="anime-bg absolute inset-0 bg-cover bg-center"
                        :style="{ backgroundImage: `url(${friend.animeBackground})` }"
                    />
                    <div class="relative z-10">
                        <div
                            class="mb-3 flex cursor-pointer items-start gap-3"
                            @click="emit('profile', friend)"
                        >
                            <div :class="['relative shrink-0', dense ? 'size-11' : 'size-14']">
                                <UserAvatar
                                    :src="friend.avatar"
                                    :name="friend.name"
                                    class="size-full"
                                    img-class="border-2 border-white shadow-lg dark:border-gray-200"
                                />
                                <span
                                    :class="[
                                        'absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-white dark:border-gray-950',
                                        dense ? 'size-3.5' : 'size-4',
                                        section.dotColorClass,
                                    ]"
                                    :title="friend.status"
                                />
                            </div>
                            <div class="min-w-0 flex-1">
                                <h4
                                    :class="[
                                        'mb-1 truncate text-gray-900 drop-shadow-lg dark:text-white',
                                        dense ? 'text-sm font-semibold hover:underline' : 'text-base font-bold',
                                    ]"
                                >
                                    {{ friend.name }}
                                </h4>
                                <div
                                    :class="[
                                        'mb-0.5 flex items-center gap-1.5 font-medium text-gray-800 drop-shadow-md dark:text-white',
                                        dense ? 'text-xs' : 'mb-1 text-sm',
                                    ]"
                                >
                                    <span class="material-symbols-rounded" :class="dense ? 'text-xs' : 'text-base'">play_circle</span>
                                    <span class="truncate">{{ friend.currentAnime }}</span>
                                </div>
                                <div :class="['text-gray-700 drop-shadow-md dark:text-white/90', dense ? 'text-xs' : 'text-sm']">
                                    第 {{ friend.currentEpisode }} 集
                                </div>
                            </div>
                        </div>
                        <NuxtLink
                            :to="`/anime/${friend.animeId}?e=${friend.currentEpisode}`"
                            :class="[
                                'flex w-full items-center justify-center gap-1.5 bg-gray-900 font-semibold text-white shadow-md transition-opacity hover:opacity-90 dark:bg-white dark:text-black',
                                dense ? 'rounded-full px-3 py-2 text-xs' : 'gap-2 rounded-xl px-4 py-3 text-sm',
                            ]"
                        >
                            前往
                        </NuxtLink>
                    </div>
                </div>

                <!-- Online / idle / offline -->
                <div
                    v-else
                    :class="[
                        'flex cursor-pointer items-center gap-3 ring-1 ring-black/5 dark:ring-white/10',
                        dense ? 'rounded-xl p-3 transition-colors' : 'rounded-2xl p-4',
                        section.isOffline
                            ? 'bg-black/[0.02] opacity-70 dark:bg-white/5'
                            : 'bg-black/[0.02] dark:bg-white/5',
                        dense && !section.isOffline && 'hover:bg-black/5 dark:hover:bg-white/10',
                        dense && section.isOffline && 'hover:opacity-90',
                    ]"
                    @click="emit('profile', friend)"
                >
                    <div :class="['relative shrink-0', dense ? 'size-10' : 'size-12']">
                        <UserAvatar
                            :src="friend.avatar"
                            :name="friend.name"
                            class="size-full"
                            img-class="border-2 border-black/10 dark:border-white/10"
                            :grayscale="section.isOffline"
                        />
                        <span
                            :class="[
                                'absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-white dark:border-gray-950',
                                dense ? 'size-3.5' : 'size-4',
                                section.dotColorClass,
                            ]"
                            :title="friend.status"
                        />
                    </div>
                    <div class="min-w-0 flex-1">
                        <h4
                            :class="[
                                'truncate text-gray-900 dark:text-white',
                                dense ? 'text-sm font-medium hover:underline' : 'text-base font-semibold',
                            ]"
                        >
                            {{ friend.name }}
                        </h4>
                        <p
                            v-if="section.isOffline"
                            :class="['text-gray-500 dark:text-gray-400', dense ? 'text-xs' : 'text-sm']"
                        >
                            上次上線 {{ formatRelative(friend.lastSeen) || '未知' }}
                        </p>
                        <p
                            v-else
                            :class="['flex items-center gap-1 text-gray-500 dark:text-gray-400', dense ? 'text-xs' : 'text-sm']"
                        >
                            <span
                                v-if="section.icon"
                                class="material-symbols-rounded"
                                :class="dense ? 'text-xs' : 'text-sm'"
                            >{{ section.icon }}</span>
                            {{ section.text }}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.anime-bg {
    opacity: 0;
    animation: anime-bg-in 0.5s ease-out forwards;
}

@keyframes anime-bg-in {
    to { opacity: 0.35; }
}

@media (prefers-reduced-motion: reduce) {
    .anime-bg {
        animation: none;
        opacity: 0.35;
    }
}

@media (max-width: 1023px) {
    .friend-card {
        -webkit-tap-highlight-color: transparent;
    }
}
</style>
