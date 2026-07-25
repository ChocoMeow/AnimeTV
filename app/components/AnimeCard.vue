<script setup>
const props = defineProps({
    anime: {
        type: Object,
        required: true,
    },
    showHoverTitleColor: {
        type: Boolean,
        default: false,
    },
    onMouseEnter: {
        type: Function,
        default: null,
    },
    onMouseLeave: {
        type: Function,
        default: null,
    },
})

const imageLoaded = ref(false)

function handleMouseEnter(event) {
    if (props.onMouseEnter) {
        props.onMouseEnter(props.anime, event)
    }
}

function handleMouseLeave() {
    if (props.onMouseLeave) {
        props.onMouseLeave()
    }
}
</script>

<template>
    <NuxtLink :to="`/anime/${anime.refId}`" class="anime-card-item group" @mouseenter="handleMouseEnter" @mouseleave="handleMouseLeave">
        <!-- Image Container -->
        <div class="relative overflow-hidden rounded-t-xl aspect-[2/3] bg-gray-200 dark:bg-white/5">
            <!-- Skeleton shown while image is loading (Tailwind, matches SkeletonAnimeCard) -->
            <div v-if="!imageLoaded" class="absolute inset-0 bg-gray-200 dark:bg-white/5 animate-pulse" />

            <NuxtImg
                :src="anime.image"
                :alt="anime.title"
                :class="[
                    'w-full h-full object-cover transform transition-all duration-500 group-hover:scale-110',
                    imageLoaded ? 'opacity-100' : 'opacity-0',
                ]"
                style="
                    transition:
                        opacity 0.4s ease,
                        transform 0.5s ease;
                "
                @load="imageLoaded = true"
                loading="lazy"
            />

            <!-- Subtle hover dim (keeps artwork clearly visible) -->
            <div class="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-300"></div>

            <!-- Year Badge -->
            <div v-if="anime.year" class="absolute top-2 right-2 badge-year">
                {{ anime.year }}
            </div>

            <!-- Progress bar (continue watching) -->
            <div v-if="anime.progress_percentage != null" class="absolute bottom-0 inset-x-0 h-1 bg-black/40">
                <div class="h-full bg-white" :style="{ width: `${Math.min(100, anime.progress_percentage)}%` }" />
            </div>

            <!-- Hover Play Button (corner, non-obstructive) -->
            <div
                class="absolute bottom-2 right-2 opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300"
            >
                <div class="w-9 h-9 rounded-full bg-white/95 dark:bg-gray-950/95 flex items-center justify-center shadow-lg ring-1 ring-black/5 dark:ring-white/10">
                    <span class="material-symbols-rounded text-lg text-gray-900 dark:text-gray-100">play_arrow</span>
                </div>
            </div>
        </div>

        <!-- Info Container -->
        <div class="p-3 space-y-1.5">
            <h3
                :class="[
                    'font-semibold text-sm text-gray-900 dark:text-gray-100 line-clamp-1 leading-snug transition-colors',
                    showHoverTitleColor && 'group-hover:text-gray-600 dark:group-hover:text-gray-300',
                ]"
            >
                {{ anime.title }}
            </h3>

            <div class="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                <div v-if="anime.episodes" class="flex items-center gap-1">
                    <span class="material-symbols-rounded text-sm">movie</span>
                    <span>{{ anime.episodes }}</span>
                </div>
                <div v-if="anime.views != null" class="flex items-center gap-1 ml-auto">
                    <span class="material-symbols-rounded text-sm">visibility</span>
                    <span>{{ formatViews(anime.views) }}</span>
                </div>
            </div>
        </div>
    </NuxtLink>
</template>

<style scoped>
/* Anime Card Item Styles */
.anime-card-item {
    @apply block bg-black/[0.02] dark:bg-white/5 rounded-xl overflow-hidden
           cursor-pointer transition-all duration-300
           ring-1 ring-black/5 dark:ring-white/10
           hover:ring-black/10 dark:hover:ring-white/20
           hover:shadow-xl hover:shadow-black/10 dark:hover:shadow-black/60
           hover:-translate-y-1.5;
    animation: fadeInUp 0.5s ease-out;
}

/* Year Badge */
.badge-year {
    @apply bg-black/70 text-white
           text-xs font-bold px-2.5 py-1 rounded-full shadow-lg
           backdrop-blur-sm border border-white/10
           transform transition-transform duration-300;
}

.group:hover .badge-year {
    @apply scale-110;
}

/* Animations */
@keyframes fadeInUp {
    from {
        opacity: 0;
        transform: translateY(16px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}
</style>
