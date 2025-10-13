<script setup>
import { ref, onMounted, watch } from "vue"
import { useRoute, useRouter } from "vue-router"

const route = useRoute()
const router = useRouter()

const anime = ref(null)
const selectedEpisode = ref(null)
const videoUrl = ref(null)
const error = ref(null)
const loading = ref(true)
const videoLoading = ref(false)
const isFavorite = ref(false)

function findFirstValidEpisode(episodesObj) {
    const keys = Object.keys(episodesObj || {})
        .filter((k) => episodesObj[k])
        .map((k) => Number(k))
        .filter((n) => !Number.isNaN(n))
        .sort((a, b) => a - b)
    return keys.length ? String(keys[0]) : null
}

function goToDetail(animeItem) {
    router.push(`/anime/${animeItem.refId}?type=ref`)
    fetchDetail()
}

function toggleFavorite() {
    isFavorite.value = !isFavorite.value
    // Save to localStorage or API
    if (typeof localStorage !== "undefined") {
        const favorites = JSON.parse(localStorage.getItem("favorites") || "[]")
        if (isFavorite.value) {
            favorites.push(anime.value.refId)
        } else {
            const index = favorites.indexOf(anime.value.refId)
            if (index > -1) favorites.splice(index, 1)
        }
        localStorage.setItem("favorites", JSON.stringify(favorites))
    }
}

function formatRating(score) {
    return score ? parseFloat(score).toFixed(1) : "N/A"
}

async function fetchDetail() {
    loading.value = true
    error.value = null
    videoUrl.value = null
    selectedEpisode.value = null

    try {
        const res = await $fetch(`/api/anime?${route.query.type}Id=${route.params.id}`)
        if (!res || Object.keys(res).length === 0) {
            error.value = "找不到此動漫的詳細資訊"
        } else {
            anime.value = res
            // Auto-select first episode
            // selectedEpisode.value = findFirstValidEpisode(anime.value.episodes)

            // Check if favorited
            if (typeof localStorage !== "undefined") {
                const favorites = JSON.parse(localStorage.getItem("favorites") || "[]")
                isFavorite.value = favorites.includes(anime.value.refId)
            }
        }
    } catch (err) {
        console.error("Failed to fetch anime detail:", err)
        error.value = "載入動漫詳情失敗，請稍後再試"
    } finally {
        loading.value = false
    }
}

watch(selectedEpisode, async (epNum) => {
    if (!epNum || !anime.value?.episodes) return
    const token = anime.value.episodes[String(epNum)]
    if (!token) {
        videoUrl.value = null
        return
    }

    videoLoading.value = true
    try {
        const res = await $fetch(`/api/episode/${token}`)
        if (res?.s?.length) {
            const raw = res.s[0].src
            const finalUrl = raw.startsWith("http") ? raw : `https:${raw}`
            videoUrl.value = `/api/proxy-video?url=${encodeURIComponent(finalUrl)}&cookie=${encodeURIComponent(res.videoCookie)}`
        } else {
            videoUrl.value = null
        }
    } catch (err) {
        console.error("Episode fetch failed:", err)
        videoUrl.value = null
    } finally {
        videoLoading.value = false
    }
})

onMounted(fetchDetail)
</script>

<template>
    <div class="min-h-screen bg-gradient-to-br from-gray-50 via-indigo-50/30 to-purple-50/20 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800">
        <!-- Loading State -->
        <div v-if="loading" class="flex items-center justify-center min-h-screen">
            <div class="text-center">
                <div class="inline-block w-16 h-16 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-4"></div>
                <p class="text-gray-600 dark:text-gray-400 text-lg">載入動漫詳情中...</p>
            </div>
        </div>

        <!-- Error State -->
        <div v-else-if="error" class="flex flex-col justify-center items-center min-h-screen text-center px-4">
            <div class="w-20 h-20 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-6">
                <span class="material-icons text-5xl text-red-500 dark:text-red-400">error_outline</span>
            </div>
            <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">載入失敗</h2>
            <p class="text-red-600 dark:text-red-400 mb-6 max-w-md">{{ error }}</p>
            <NuxtLink
                to="/"
                class="px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-0.5"
            >
                返回首頁
            </NuxtLink>
        </div>

        <!-- Empty State -->
        <div v-else-if="!anime" class="flex flex-col justify-center items-center min-h-screen">
            <span class="material-icons text-6xl text-gray-400 mb-4">movie_filter</span>
            <p class="text-gray-600 dark:text-gray-400">無可用的動漫資料</p>
        </div>

        <!-- Content -->
        <div v-else>
            <!-- Hero Section with Background -->
            <div class="relative overflow-hidden bg-gradient-to-br from-indigo-900 via-purple-900 to-gray-900 text-white">
                <!-- Background Image with Overlay -->
                <div class="absolute inset-0 opacity-20">
                    <img :src="anime.image" :alt="anime.title" class="w-full h-full object-cover blur-2xl scale-110" />
                </div>
                <div class="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/80 to-transparent"></div>

                <!-- Content -->
                <div class="relative max-w-7xl mx-auto px-4 py-12">
                    <div class="flex flex-col md:flex-row gap-8">
                        <!-- Poster -->
                        <div class="flex-shrink-0">
                            <div class="relative group">
                                <img
                                    :src="anime.image"
                                    :alt="anime.title"
                                    class="w-64 md:w-72 rounded-2xl shadow-2xl object-cover transform transition-transform duration-300 group-hover:scale-105"
                                />
                                <!-- <div class="absolute inset-0 rounded-2xl bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div> -->
                            </div>
                        </div>

                        <!-- Info -->
                        <div class="flex-1 space-y-6">
                            <!-- Title and Actions -->
                            <div>
                                <h1 class="text-4xl md:text-5xl font-bold mb-3 leading-tight">
                                    {{ anime.title }}
                                </h1>
                                <div class="flex flex-wrap items-center gap-3">
                                    <!-- Rating -->
                                    <div class="flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-sm rounded-lg border border-white/20">
                                        <span class="material-icons text-yellow-400">star</span>
                                        <span class="font-bold text-lg">{{ formatRating(anime.userRating?.score) }}</span>
                                        <span class="text-sm text-gray-300">({{ anime.userRating?.count || 0 }})</span>
                                    </div>

                                    <!-- Favorite Button -->
                                    <button
                                        @click="toggleFavorite"
                                        class="px-4 py-2 bg-white/10 backdrop-blur-sm rounded-lg border border-white/20 hover:bg-white/20 transition-all flex items-center gap-2"
                                    >
                                        <span class="material-icons" :class="isFavorite ? 'text-red-500' : 'text-white'">
                                            {{ isFavorite ? "favorite" : "favorite_border" }}
                                        </span>
                                        <span>{{ isFavorite ? "已收藏" : "收藏" }}</span>
                                    </button>
                                </div>
                            </div>

                            <!-- Description -->
                            <div class="prose prose-invert max-w-none">
                                <p class="text-gray-200 leading-relaxed text-lg">
                                    {{ anime.description || "暫無簡介" }}
                                </p>
                            </div>

                            <!-- Meta Info Grid -->
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                                <div class="info-card" v-if="anime.director">
                                    <span class="material-icons text-indigo-400">person</span>
                                    <div>
                                        <p class="text-gray-400 text-xs">導演監督</p>
                                        <p class="font-semibold">{{ anime.director }}</p>
                                    </div>
                                </div>

                                <div class="info-card" v-if="anime.productionCompany">
                                    <span class="material-icons text-purple-400">business</span>
                                    <div>
                                        <p class="text-gray-400 text-xs">代理廠商</p>
                                        <p class="font-semibold">{{ anime.productionCompany }}</p>
                                    </div>
                                </div>

                                <div class="info-card" v-if="anime.premiereDate">
                                    <span class="material-icons text-pink-400">event</span>
                                    <div>
                                        <p class="text-gray-400 text-xs">首播日期</p>
                                        <p class="font-semibold">{{ anime.premiereDate }}</p>
                                    </div>
                                </div>

                                <div class="info-card" v-if="anime.distributor">
                                    <span class="material-icons text-blue-400">local_shipping</span>
                                    <div>
                                        <p class="text-gray-400 text-xs">發行商</p>
                                        <p class="font-semibold">{{ anime.distributor }}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Main Content Area -->
            <div class="max-w-7xl mx-auto px-4 py-8 space-y-8">
                <!-- Episode Selector -->
                <section class="content-card">
                    <div class="flex items-center gap-3 mb-4">
                        <h2 class="text-2xl font-bold text-gray-900 dark:text-white">選擇集數</h2>
                    </div>

                    <EpisodesPicker v-if="anime?.episodes" :episodes="anime.episodes" v-model="selectedEpisode" @select="(n) => (selectedEpisode = n)" class="mb-4" />
                    <div v-else class="text-center py-8 text-gray-500 dark:text-gray-400 mb-4">
                        <span class="material-icons text-4xl mb-2 opacity-50">video_library</span>
                        <p>暫無可用集數</p>
                    </div>

                    <div class="aspect-video bg-black relative rounded-lg overflow-hidden">
                        <!-- Video Loading -->
                        <div v-if="videoLoading" class="absolute inset-0 flex items-center justify-center bg-black/80 z-10">
                            <div class="text-center">
                                <div class="inline-block w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-4"></div>
                                <p class="text-white">載入影片中...</p>
                            </div>
                        </div>

                        <!-- Video Player -->
                        <video v-if="videoUrl" :src="videoUrl" controls autoplay class="w-full h-full" @loadstart="videoLoading = true" @loadeddata="videoLoading = false"></video>

                        <!-- No Video Message -->
                        <div v-else-if="!selectedEpisode" class="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
                            <span class="material-icons text-6xl mb-4 opacity-50">play_circle_outline</span>
                            <p class="text-lg">請選擇集數開始播放</p>
                        </div>

                        <div v-else class="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
                            <span class="material-icons text-6xl mb-4 opacity-50">error_outline</span>
                            <p class="text-lg">影片暫時無法播放</p>
                        </div>
                    </div>
                </section>

                <!-- Related Anime -->
                <section v-if="anime.relatedAnime && anime.relatedAnime.length" class="content-card">
                    <div class="flex items-center gap-3 mb-6">
                        <h2 class="text-2xl font-bold text-gray-900 dark:text-white">相關動漫</h2>
                    </div>

                    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        <div v-for="rel in anime.relatedAnime" :key="rel.refId" class="related-card group" @click="goToDetail(rel)">
                            <div class="relative overflow-hidden rounded-t-xl aspect-[2/3] bg-gray-200 dark:bg-gray-700">
                                <img :src="rel.image" :alt="rel.title" class="w-full h-full object-cover transform transition-all duration-500 group-hover:scale-110" />
                                <div class="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>

                                <!-- Play Button Overlay -->
                                <div
                                    class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 transform scale-75 group-hover:scale-100"
                                >
                                    <div class="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shadow-xl">
                                        <span class="material-icons text-indigo-600 text-2xl">play_arrow</span>
                                    </div>
                                </div>
                            </div>

                            <div class="p-3">
                                <p
                                    class="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors"
                                >
                                    {{ rel.title }}
                                </p>
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    </div>
</template>

<style scoped>
/* Content Card */
.content-card {
    @apply bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 transition-all duration-300;
}

/* Info Card */
.info-card {
    @apply flex items-center gap-3 px-4 py-3 bg-white/10 backdrop-blur-sm rounded-lg border border-white/20;
}

/* Related Card */
.related-card {
    @apply bg-white dark:bg-gray-800 rounded-xl overflow-hidden cursor-pointer 
           transition-all duration-300 hover:shadow-2xl hover:-translate-y-2
           border border-gray-100 dark:border-gray-700
           hover:border-indigo-300 dark:hover:border-indigo-600;
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

.content-card,
.related-card {
    animation: fadeInUp 0.6s ease-out;
}

/* Scrollbar */
::-webkit-scrollbar {
    width: 8px;
    height: 8px;
}

::-webkit-scrollbar-track {
    @apply bg-gray-100 dark:bg-gray-800;
}

::-webkit-scrollbar-thumb {
    @apply bg-gray-300 dark:bg-gray-600 rounded-full;
}

::-webkit-scrollbar-thumb:hover {
    @apply bg-gray-400 dark:bg-gray-500;
}
</style>
