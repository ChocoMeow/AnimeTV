<script setup>
const appConfig = useAppConfig()
const loading = ref(true)
const byDay = ref({})
const themes = ref({})
const spotlight = ref([])
const fetchedAt = ref(null)

const today = new Date()
const jsDay = today.getDay()
const dayMap = { 0: '7', 1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6' }
const todayCode = dayMap[jsDay] || '1'
const selectedDay = ref(todayCode)
const displayedItems = computed(() => {
    if (selectedDay.value === '0') {
        return Object.values(byDay.value || {}).flat()
    }
    return byDay.value[selectedDay.value] || []
})

const weekdayLabel = {
    0: '全部',
    1: '週一',
    2: '週二',
    3: '週三',
    4: '週四',
    5: '週五',
    6: '週六',
    7: '週日',
}

const todayCount = computed(() => (byDay.value[todayCode] || []).length)

// Personalized, time-of-day greeting — small but human touch on arrival.
const greeting = computed(() => {
    const h = new Date().getHours()
    if (h >= 5 && h < 11) return { text: '早安', sub: '為新的一天，挑一部元氣滿滿的動畫吧', icon: 'wb_twilight' }
    if (h >= 11 && h < 14) return { text: '午安', sub: '午休時間，來點輕鬆的動畫充充電', icon: 'wb_sunny' }
    if (h >= 14 && h < 18) return { text: '下午好', sub: '探索今天更新的新番，找到你的下一部愛番', icon: 'partly_cloudy_day' }
    if (h >= 18 && h < 23) return { text: '晚上好', sub: '結束忙碌的一天，放鬆看點動畫吧', icon: 'nights_stay' }
    return { text: '夜貓子模式', sub: '這麼晚還在追番嗎？記得早點休息喔', icon: 'dark_mode' }
})

// "Surprise me" — picks from the whole week's lineup, not just today, for real variety.
const shufflePool = computed(() => {
    const all = Object.values(byDay.value || {}).flat()
    return all.length ? all : spotlight.value
})
function goRandom() {
    const pool = shufflePool.value
    if (!pool.length) return
    const pick = pool[Math.floor(Math.random() * pool.length)]
    if (pick?.refId) navigateTo(`/anime/${pick.refId}`)
}

// Subtle 3D tilt on the spotlight tile, following the cursor — a small tactile
// touch that makes the featured card feel alive without being distracting.
const tiltStyle = ref({ transform: 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)' })
function handleTiltMove(e) {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width - 0.5
    const y = (e.clientY - rect.top) / rect.height - 0.5
    tiltStyle.value = {
        transform: `perspective(1000px) rotateX(${(-y * 6).toFixed(2)}deg) rotateY(${(x * 8).toFixed(2)}deg) scale3d(1.015, 1.015, 1.015)`,
    }
}
function resetTilt() {
    tiltStyle.value = { transform: 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)' }
}

// Use shared tooltip composable
const {
    hoveredAnime,
    animeDetails,
    tooltipLoading,
    tooltipError,
    tooltipPosition,
    handleMouseEnter,
    handleMouseLeave,
    handleTooltipEnter,
    handleTooltipLeave,
    setFavoriteStatus,
    cleanup,
} = useAnimeTooltip()

async function fetchHomeAnime() {
    loading.value = true
    try {
        const res = await $fetch('/api/anime')
        byDay.value = res.byDay || {}
        themes.value = res.themes || {}
        const daily = Object.fromEntries(
            Object.values(byDay.value).flat().filter((i) => i?.refId).map((i) => [String(i.refId), i]),
        )
        spotlight.value = (res.spotlight || []).map((item) => {
            const d = daily[String(item.refId)]
            return d ? { ...item, image: d.thumbnail ?? item.image, episode: d.episode ?? null } : item
        })
        fetchedAt.value = res.fetchedAt || null
    } catch (err) {
        console.error('Failed to fetch /api/anime:', err)
        byDay.value = {}
        themes.value = {}
        spotlight.value = []
    } finally {
        loading.value = false
    }
}

useHead({ title: `每日新番 | ${appConfig.siteName}` })

onMounted(() => {
    fetchHomeAnime()
})

onUnmounted(() => {
    cleanup()
})
</script>

<template>
    <div>
        <div class="space-y-8 sm:space-y-14 max-w-7xl mx-auto px-3 sm:px-4 md:px-6 pt-5 sm:pt-8 pb-8 sm:pb-10">
            <!-- Discovery Bento -->
            <section v-if="loading || spotlight.length">
                <div class="flex flex-wrap items-center justify-between gap-3 mb-4 sm:mb-5">
                    <div class="flex items-center gap-3">
                        <span class="greeting-icon">
                            <span class="material-symbols-rounded text-xl sm:text-2xl">{{ greeting.icon }}</span>
                        </span>
                        <div>
                            <h1 class="greeting-title">{{ greeting.text }}</h1>
                            <p class="greeting-sub">
                                <span v-if="!loading && todayCount">今天有 <strong class="text-gray-900 dark:text-white">{{ todayCount }}</strong> 部動畫更新 · </span>{{ greeting.sub }}
                            </p>
                        </div>
                    </div>
                    <button v-if="shufflePool.length" type="button" class="btn-shuffle" @click="goRandom">
                        <span class="material-symbols-rounded text-lg">shuffle</span>
                        隨機一部
                    </button>
                </div>

                <!-- Spotlight: skeleton while loading, bento when data exists -->
                <div v-if="loading" class="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 auto-rows-[132px] sm:auto-rows-[260px]">
                    <div class="col-span-2 row-span-2 rounded-2xl sm:rounded-3xl bg-gray-200 dark:bg-white/5 animate-pulse" />
                    <div v-for="n in 4" :key="n" class="rounded-2xl bg-gray-200 dark:bg-white/5 animate-pulse" />
                </div>

                <!-- Bento grid -->
                <div v-else class="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 auto-rows-[132px] sm:auto-rows-[260px]">
                    <!-- Spotlight tile -->
                    <NuxtLink
                        :to="`/anime/${spotlight[0].refId}`"
                        class="bento-main group col-span-2 row-span-2"
                        :style="tiltStyle"
                        @mousemove="handleTiltMove"
                        @mouseleave="resetTilt"
                    >
                        <NuxtImg
                            :src="spotlight[0].image"
                            alt=""
                            loading="eager"
                            fetchpriority="high"
                            class="bento-main-img"
                        />
                        <div class="bento-main-scrim" />
                        <div class="relative z-10 h-full flex flex-col justify-end p-4 sm:p-6">
                            <span class="bento-badge">
                                <span class="material-symbols-rounded text-sm">bolt</span>
                                焦點新番
                            </span>
                            <h2 class="bento-main-title">{{ spotlight[0].title }}</h2>
                            <div v-if="spotlight[0].episode" class="bento-main-episode">
                                <span class="material-symbols-rounded text-base">play_circle</span>
                                {{ spotlight[0].episode }}
                            </div>
                            <span class="bento-main-cta">
                                <span class="material-symbols-rounded">play_arrow</span>
                                立即觀看
                            </span>
                        </div>
                    </NuxtLink>

                    <!-- Side tiles -->
                    <NuxtLink
                        v-for="item in spotlight.slice(1)"
                        :key="item.refId"
                        :to="`/anime/${item.refId}`"
                        class="bento-tile group"
                        @mouseenter="handleMouseEnter(item, $event)"
                        @mouseleave="handleMouseLeave"
                    >
                        <NuxtImg :src="item.image" alt="" loading="lazy" class="bento-tile-img" />
                        <div class="bento-tile-scrim" />
                        <div v-if="item.episode" class="bento-tile-episode">{{ item.episode }}</div>
                        <span class="bento-tile-title">{{ item.title }}</span>
                        <div class="bento-tile-play">
                            <span class="material-symbols-rounded text-base">play_arrow</span>
                        </div>
                    </NuxtLink>
                </div>
            </section>
            <!-- Daily Schedule Section -->
            <section id="daily-schedule" class="scroll-mt-20">
                <div class="flex items-end justify-between gap-4 mb-4 sm:mb-6">
                    <div>
                        <h2 class="section-title">每日新番</h2>
                        <p class="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">
                            <span class="hidden sm:inline">滑鼠懸停查看詳情 | </span>點擊日期標籤查看當日更新
                        </p>
                    </div>
                </div>

                <!-- Day Tabs — always visible, even while loading -->
                <div class="flex flex-wrap gap-2 mb-5 sm:mb-6">
                    <button
                        v-for="d in Object.keys(weekdayLabel)"
                        :key="d"
                        @click="selectedDay = d"
                        :class="['day-tab', selectedDay === d ? 'day-tab-active' : 'day-tab-inactive']"
                        :disabled="loading"
                    >
                        {{ weekdayLabel[d] }}
                    </button>
                </div>

                <!-- Skeleton grid while loading -->
                <div v-if="loading" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
                    <SkeletonDailyItem v-for="n in 12" :key="n" />
                </div>

                <template v-else>
                    <!-- Empty state -->
                    <div v-if="!displayedItems.length" class="empty-state">
                        <span class="material-symbols-rounded text-4xl mb-2 opacity-40">event_busy</span>
                        <p>今日暫無更新節目</p>
                    </div>

                    <!-- Day Content -->
                    <div v-else class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
                        <NuxtLink
                            v-for="item in displayedItems"
                            :key="item.refId"
                            class="daily-item group"
                            :to="`/anime/${item.refId}`"
                            @mouseenter="handleMouseEnter(item, $event)"
                            @mouseleave="handleMouseLeave"
                        >
                            <div class="relative overflow-hidden rounded-t-xl aspect-video bg-gray-200 dark:bg-white/5">
                                <NuxtImg
                                    :src="item.thumbnail"
                                    alt=""
                                    loading="lazy"
                                    class="w-full h-full object-cover transform transition-transform duration-500 group-hover:scale-110"
                                />
                                <div class="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-300" />

                                <!-- Episode badge -->
                                <div v-if="item.episode" class="absolute bottom-1.5 left-1.5 episode-badge">
                                    {{ item.episode }}
                                </div>

                                <!-- Play icon (corner, non-obstructive) -->
                                <div class="absolute bottom-1.5 right-1.5 opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300">
                                    <div class="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white/95 dark:bg-gray-950/95 flex items-center justify-center shadow-lg">
                                        <span class="material-symbols-rounded text-base sm:text-lg text-gray-900 dark:text-gray-100">play_arrow</span>
                                    </div>
                                </div>
                            </div>

                            <div class="p-2.5">
                                <div class="font-semibold text-xs sm:text-sm text-gray-900 dark:text-gray-100 line-clamp-1 leading-tight">
                                    {{ item.title }}
                                </div>
                            </div>
                        </NuxtLink>
                    </div>
                </template>
            </section>

            <!-- Theme Sections (full grids, no side-scrolling) -->
            <section v-if="loading || Object.keys(themes).length" class="space-y-10 sm:space-y-14">
                <!-- Skeleton theme grids while loading -->
                <div v-if="loading" v-for="n in 2" :key="`theme-skel-${n}`">
                    <div class="h-7 sm:h-8 w-40 sm:w-48 rounded-lg bg-gray-200 dark:bg-white/5 animate-pulse mb-4 sm:mb-6" />
                    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
                        <SkeletonAnimeCard v-for="m in 12" :key="m" />
                    </div>
                </div>

                <!-- Actual theme content -->
                <template v-else>
                    <div v-for="(items, title) in themes" :key="title">
                        <div v-if="items && items.length">
                            <h2 class="section-title mb-4 sm:mb-6">{{ title }}</h2>

                            <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
                                <LazyAnimeCard
                                    v-for="item in items"
                                    :key="item.refId || item.video_url"
                                    :anime="item"
                                    :on-mouse-enter="handleMouseEnter"
                                    :on-mouse-leave="handleMouseLeave"
                                />
                            </div>
                        </div>
                    </div>
                </template>
            </section>
        </div>
    </div>

    <!-- Anime Tooltip Component -->
    <LazyAnimeTooltip
        :hovered-anime="hoveredAnime"
        :anime-details="animeDetails"
        :tooltip-loading="tooltipLoading"
        :tooltip-error="tooltipError"
        :tooltip-position="tooltipPosition"
        :on-tooltip-enter="handleTooltipEnter"
        :on-tooltip-leave="handleTooltipLeave"
        :on-favorite-toggled="({ refId, isFavorite }) => setFavoriteStatus(refId, isFavorite)"
    />
</template>

<style scoped>
/* Greeting bar */
.greeting-icon {
    @apply flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center
           bg-gray-900 dark:bg-white text-white dark:text-black;
}

.greeting-title {
    @apply text-lg sm:text-2xl font-extrabold tracking-tight text-gray-900 dark:text-white leading-tight;
}

.greeting-sub {
    @apply text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5;
}

.btn-shuffle {
    @apply hidden sm:inline-flex items-center gap-1.5 px-4 py-2 sm:py-2.5 rounded-full font-semibold text-xs sm:text-sm
           bg-black/5 dark:bg-white/10 text-gray-800 dark:text-gray-100
           ring-1 ring-black/10 dark:ring-white/10
           transition-all duration-200 hover:bg-black/10 dark:hover:bg-white/15 hover:-translate-y-0.5 active:translate-y-0
           active:scale-95;
}

.btn-shuffle .material-symbols-rounded {
    transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.btn-shuffle:hover .material-symbols-rounded {
    transform: rotate(180deg);
}

/* Bento spotlight tile */
.bento-main {
    @apply relative block overflow-hidden rounded-2xl sm:rounded-3xl
           ring-1 ring-black/5 dark:ring-white/10 shadow-lg
           transition-shadow duration-300 will-change-transform
           hover:shadow-2xl hover:shadow-black/20 dark:hover:shadow-black/60;
    transition: transform 0.15s ease-out, box-shadow 0.3s ease;
    /* `clip-path` (in addition to overflow:hidden) keeps the rounded corners from
       flickering square while `transform` is actively changing on this same
       element (a known Chrome/Safari quirk with border-radius + overflow:hidden
       + live transforms) — this lets the whole card tilt as one rigid piece
       without ever losing its rounded clip. */
    clip-path: inset(0 round 1rem);
}

@media (min-width: 640px) {
    .bento-main {
        clip-path: inset(0 round 1.5rem);
    }
}

.bento-main-img {
    @apply absolute inset-0 w-full h-full object-cover object-top origin-top transition-transform duration-700 ease-out;
}

.bento-main:hover .bento-main-img {
    transform: scale(1.06);
}

.bento-main-scrim {
    @apply absolute inset-0;
    background: linear-gradient(to top, rgba(0, 0, 0, 0.85) 0%, rgba(0, 0, 0, 0.35) 45%, rgba(0, 0, 0, 0.05) 75%);
}

.bento-badge {
    @apply inline-flex items-center gap-1.5 self-start px-2.5 py-1 mb-2.5 sm:mb-3 rounded-full text-[11px] sm:text-xs font-semibold
           bg-white/15 text-white backdrop-blur-sm ring-1 ring-white/20 w-fit;
}

.bento-main-title {
    @apply text-lg sm:text-2xl md:text-3xl font-extrabold tracking-tight text-white mb-1.5 sm:mb-2 leading-tight line-clamp-2;
    text-shadow: 0 2px 20px rgba(0, 0, 0, 0.4);
}

.bento-main-episode {
    @apply flex items-center gap-1.5 text-xs sm:text-sm font-medium text-white/85 mb-3 sm:mb-4;
}

.bento-main-cta {
    @apply inline-flex items-center gap-1.5 self-start px-4 sm:px-5 py-2 sm:py-2.5 rounded-full font-semibold text-xs sm:text-sm
           bg-white text-black shadow-lg
           transition-transform duration-200 group-hover:scale-105 w-fit;
}

/* Bento side tiles */
.bento-tile {
    @apply relative block overflow-hidden rounded-2xl bg-black/[0.02] dark:bg-white/5
           ring-1 ring-black/5 dark:ring-white/10 shadow-sm
           transition-all duration-300
           hover:ring-black/10 dark:hover:ring-white/20 hover:shadow-lg hover:shadow-black/10 dark:hover:shadow-black/50;
}

.bento-tile-img {
    @apply absolute inset-0 w-full h-full object-cover object-top origin-top transition-transform duration-500;
}

.bento-tile:hover .bento-tile-img {
    transform: scale(1.08);
}

.bento-tile-scrim {
    @apply absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent opacity-90;
}

.bento-tile-episode {
    @apply absolute top-1.5 left-1.5 sm:top-2 sm:left-2 px-1.5 py-0.5 rounded-md text-[9px] sm:text-[10px] font-bold text-white bg-black/60 backdrop-blur-sm;
}

.bento-tile-title {
    @apply absolute bottom-1.5 left-1.5 right-1.5 sm:bottom-2 sm:left-2 sm:right-2 text-[11px] sm:text-xs font-semibold text-white line-clamp-2 leading-snug;
    text-shadow: 0 1px 8px rgba(0, 0, 0, 0.5);
}

.bento-tile-play {
    @apply absolute top-1.5 right-1.5 sm:top-2 sm:right-2 w-6 h-6 sm:w-7 sm:h-7 rounded-full
           bg-white/95 flex items-center justify-center shadow-lg text-gray-900
           opacity-0 scale-75 transition-all duration-300
           group-hover:opacity-100 group-hover:scale-100;
}

/* Section Titles */
.section-title {
    @apply text-xl sm:text-2xl font-bold text-gray-900 dark:text-white;
}

/* Day Tab Styles */
.day-tab {
    @apply px-3 sm:px-5 py-2 sm:py-2.5 rounded-full text-xs sm:text-sm font-medium transition-all duration-300 transform;
}

.day-tab-inactive {
    @apply bg-black/5 dark:bg-white/10 text-gray-600 dark:text-gray-300
           border border-black/10 dark:border-white/10
           hover:bg-black/10 dark:hover:bg-white/20
           hover:-translate-y-0.5;
}

.day-tab-active {
    @apply bg-gray-900 dark:bg-white text-white dark:text-black
           border border-transparent
           shadow-lg shadow-black/20 dark:shadow-white/10
           transform -translate-y-0.5;
}

/* Empty State */
.empty-state {
    @apply text-center py-12 text-gray-500 dark:text-gray-400
           rounded-2xl bg-black/[0.02] dark:bg-white/[0.03] border border-black/5 dark:border-white/5;
}

/* Daily Item Styles */
.daily-item {
    @apply block bg-black/[0.02] dark:bg-white/5 rounded-xl overflow-hidden
           cursor-pointer transition-all duration-300
           ring-1 ring-black/5 dark:ring-white/10
           hover:ring-black/10 dark:hover:ring-white/20
           hover:shadow-xl hover:shadow-black/10 dark:hover:shadow-black/60
           hover:-translate-y-1;
}

.episode-badge {
    @apply px-2 py-0.5 rounded-md text-[10px] sm:text-xs font-bold text-white bg-black/70 backdrop-blur-sm;
}
</style>
