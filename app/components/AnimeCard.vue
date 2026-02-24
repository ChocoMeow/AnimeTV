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
        <div class="relative overflow-hidden rounded-t-xl aspect-[2/3] bg-gray-200 dark:bg-gray-700">
            <!-- Skeleton shown while image is loading (Tailwind, matches SkeletonAnimeCard) -->
            <div v-if="!imageLoaded" class="absolute inset-0 bg-gray-200 dark:bg-gray-700 animate-pulse" />

            <img
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
            />

            <!-- Gradient Overlay -->
            <div
                class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300"
            ></div>

            <!-- Year Badge -->
            <div class="absolute top-2 right-2 badge-year">
                {{ anime.year }}
            </div>

            <!-- Hover Play Button -->
            <div
                class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 transform scale-75 group-hover:scale-100"
            >
                <div class="w-14 h-14 rounded-full bg-white/90 dark:bg-gray-900/90 flex items-center justify-center shadow-xl">
                    <span class="material-icons text-3xl text-gray-900 dark:text-gray-100">play_arrow</span>
                </div>
            </div>
        </div>

        <!-- Info Container -->
        <div class="p-3 space-y-2">
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
                    <span class="material-icons text-sm">movie</span>
                    <span>{{ anime.episodes }}</span>
                </div>
                <div class="flex items-center gap-1 ml-auto">
                    <span class="material-icons text-sm">visibility</span>
                    <span>{{ formatViews(anime.views) }}</span>
                </div>
            </div>
        </div>
    </NuxtLink>
</template>

<style scoped>
/* Anime Card Item Styles */
.anime-card-item {
    @apply bg-gray-950/5 dark:bg-white/10 rounded-xl overflow-hidden 
           cursor-pointer transition-all duration-300
           hover:shadow-2xl hover:-translate-y-2
           border border-gray-100 dark:border-gray-700
           hover:border-black/10 dark:hover:border-white/10;
}

/* Year Badge */
.badge-year {
    @apply bg-black/70 dark:bg-white/80 text-white dark:text-black 
           text-xs font-bold px-3 py-1 rounded-full shadow-lg
           backdrop-blur-sm transform transition-transform duration-300;
}

.group:hover .badge-year {
    @apply scale-110;
}

.anime-card,
.anime-card-item {
    animation: fadeInUp 0.6s ease-out;
}

/* Animations */
@keyframes fadeInUp {
    from {
        opacity: 0;
        transform: translateY(20px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}
</style>
