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

const featured = computed(() => spotlight.value[0] || null)
const sideSpotlight = computed(() => spotlight.value.slice(1))

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

// Desktop-only tilt. The resting value is reapplied on leave so the card settles flat.
const tiltRest = 'perspective(1200px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)'
const tiltStyle = ref({ transform: tiltRest })
function handleTiltMove(e) {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width - 0.5
    const y = (e.clientY - rect.top) / rect.height - 0.5
    tiltStyle.value = {
        transform: `perspective(1200px) rotateX(${(-y * 4).toFixed(2)}deg) rotateY(${(x * 5).toFixed(2)}deg) scale3d(1.012, 1.012, 1.012)`,
    }
}
function resetTilt() {
    tiltStyle.value = { transform: tiltRest }
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
            <!-- Discovery -->
            <section v-if="loading || featured" aria-label="焦點推薦">
                <div class="discover-head">
                    <span class="greeting-icon" aria-hidden="true">
                        <span class="material-symbols-rounded text-xl sm:text-2xl">{{ greeting.icon }}</span>
                    </span>
                    <div class="min-w-0 flex-1">
                        <h1 class="greeting-title">{{ greeting.text }}</h1>
                        <p class="greeting-sub">
                            <template v-if="!loading && todayCount">
                                今天有 <strong class="text-gray-900 dark:text-white">{{ todayCount }}</strong> 部更新
                                <span class="hidden sm:inline"> · {{ greeting.sub }}</span>
                            </template>
                            <template v-else>{{ greeting.sub }}</template>
                        </p>
                    </div>
                    <button
                        v-if="shufflePool.length"
                        type="button"
                        class="btn-shuffle"
                        aria-label="隨機播放一部動畫"
                        @click="goRandom"
                    >
                        <span class="material-symbols-rounded text-xl sm:text-lg" aria-hidden="true">shuffle</span>
                        <span class="hidden sm:inline">隨機一部</span>
                    </button>
                </div>

                <div v-if="loading" class="discover-layout" aria-hidden="true">
                    <div class="feature-skel" />
                    <div class="spot-rail-wrap">
                        <div class="spot-rail">
                            <div v-for="n in 4" :key="n" class="spot-skel" />
                        </div>
                    </div>
                </div>

                <div v-else-if="featured" class="discover-layout rise-in">
                    <NuxtLink
                        :to="`/anime/${featured.refId}`"
                        class="feature-card"
                        @mousemove="handleTiltMove"
                        @mouseleave="resetTilt"
                    >
                        <div class="feature-stage" :style="tiltStyle">
                            <NuxtImg
                                :src="featured.image"
                                alt=""
                                loading="eager"
                                fetchpriority="high"
                                class="feature-img"
                            />
                            <div class="feature-scrim" />
                            <div class="feature-copy">
                                <div class="feature-kicker-row">
                                    <span class="feature-kicker">
                                        <span class="material-symbols-rounded text-sm" aria-hidden="true">bolt</span>
                                        焦點新番
                                    </span>
                                    <span v-if="featured.episode" class="feature-ep">{{ featured.episode }}</span>
                                </div>
                                <h2 class="feature-title">{{ featured.title }}</h2>
                                <span class="feature-cta">
                                    <span class="material-symbols-rounded text-base" aria-hidden="true">play_arrow</span>
                                    立即觀看
                                </span>
                            </div>
                        </div>
                    </NuxtLink>

                    <div v-if="sideSpotlight.length" class="spot-rail-wrap">
                        <div class="spot-rail" :class="{ 'spot-rail-fill': sideSpotlight.length >= 3 }">
                            <NuxtLink
                                v-for="item in sideSpotlight"
                                :key="item.refId"
                                :to="`/anime/${item.refId}`"
                                class="spot-card"
                                @mouseenter="handleMouseEnter(item, $event)"
                                @mouseleave="handleMouseLeave"
                            >
                                <div class="spot-media">
                                    <NuxtImg :src="item.image" alt="" loading="lazy" class="spot-img" />
                                    <span v-if="item.episode" class="spot-ep">{{ item.episode }}</span>
                                </div>
                                <div class="spot-copy">
                                    <p class="spot-title">{{ item.title }}</p>
                                    <span class="spot-go">
                                        <span class="material-symbols-rounded text-base" aria-hidden="true">play_arrow</span>
                                        觀看
                                    </span>
                                </div>
                            </NuxtLink>
                        </div>
                        <div class="spot-fade" aria-hidden="true" />
                    </div>
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

                <div class="flex flex-wrap gap-2 mb-5 sm:mb-6">
                    <button
                        v-for="d in Object.keys(weekdayLabel)"
                        :key="d"
                        type="button"
                        :class="['day-tab', selectedDay === d ? 'day-tab-active' : 'day-tab-inactive']"
                        :disabled="loading"
                        @click="selectedDay = d"
                    >
                        {{ weekdayLabel[d] }}
                    </button>
                </div>

                <div v-if="loading" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
                    <SkeletonDailyItem v-for="n in 12" :key="n" />
                </div>

                <template v-else>
                    <Transition name="schedule-day" mode="out-in">
                    <div v-if="!displayedItems.length" :key="`empty-${selectedDay}`" class="empty-state py-12 text-gray-500 dark:text-gray-400">
                        <span class="material-symbols-rounded text-4xl mb-2 opacity-40">event_busy</span>
                        <p>今日暫無更新節目</p>
                    </div>

                    <div v-else :key="`day-${selectedDay}`" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
                        <NuxtLink
                            v-for="(item, index) in displayedItems"
                            :key="item.refId"
                            class="daily-item group"
                            :style="{ '--card-i': index }"
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
                                <div v-if="item.episode" class="absolute bottom-1.5 left-1.5 episode-badge">
                                    {{ item.episode }}
                                </div>
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
                    </Transition>
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
.discover-head {
    @apply flex items-center gap-3 mb-4 sm:gap-3.5 sm:mb-5;
}

.greeting-icon {
    @apply flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center
           bg-gray-900 dark:bg-white text-white dark:text-black;
}

.greeting-title {
    @apply min-w-0 text-lg sm:text-2xl font-extrabold tracking-tight text-gray-900 dark:text-white leading-tight;
}

.greeting-sub {
    @apply text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed;
}

.btn-shuffle {
    @apply inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full
           font-semibold text-xs sm:text-sm
           bg-black/5 dark:bg-white/10 text-gray-800 dark:text-gray-100
           ring-1 ring-black/10 dark:ring-white/10
           transition-colors duration-200
           hover:bg-black/10 dark:hover:bg-white/15
           active:scale-95
           sm:h-auto sm:w-auto sm:gap-1.5 sm:px-4 sm:py-2;
}

.btn-shuffle .material-symbols-rounded {
    transition: transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.btn-shuffle:hover .material-symbols-rounded {
    transform: rotate(180deg);
}

.discover-layout {
    @apply flex flex-col gap-3 sm:gap-4;
}

.feature-card,
.feature-skel {
    @apply min-h-[14.5rem] aspect-[16/10] sm:min-h-[17rem] sm:aspect-[2/1];
}

.feature-card {
    @apply relative block overflow-hidden rounded-2xl sm:rounded-3xl
           bg-gray-200 dark:bg-white/5
           ring-1 ring-black/10 dark:ring-white/10 shadow-lg;
}

.feature-stage {
    @apply absolute inset-0;
    transition: transform 0.18s ease-out;
}

.feature-img {
    @apply absolute inset-0 h-full w-full object-cover object-top transition-transform duration-700 ease-out;
}

.feature-scrim {
    @apply absolute inset-0;
    background: linear-gradient(to top, rgba(0, 0, 0, 0.9) 0%, rgba(0, 0, 0, 0.38) 46%, rgba(0, 0, 0, 0.05) 74%);
}

.feature-copy {
    @apply absolute inset-x-0 bottom-0 z-10 flex flex-col p-4 sm:p-6 lg:p-7;
}

.feature-kicker-row {
    @apply flex flex-wrap items-center gap-2 mb-2 sm:mb-3;
}

.feature-kicker,
.feature-ep {
    @apply inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] sm:text-xs font-semibold text-white
           backdrop-blur-md ring-1 ring-white/20;
}

.feature-kicker {
    @apply bg-white/15;
}

.feature-ep {
    @apply bg-black/40;
}

.feature-title {
    @apply text-xl sm:text-3xl lg:text-[2rem] font-extrabold tracking-tight text-white leading-[1.2] line-clamp-2 mb-3 sm:mb-4;
    text-shadow: 0 2px 18px rgba(0, 0, 0, 0.45);
}

.feature-cta {
    @apply inline-flex items-center gap-1 self-start w-fit px-4 py-2 sm:px-5 sm:py-2.5 rounded-full
           text-xs sm:text-sm font-semibold bg-white text-black shadow-lg
           transition-transform duration-200;
}

.feature-skel {
    @apply rounded-2xl sm:rounded-3xl bg-gray-200 dark:bg-white/5 animate-pulse;
}

.spot-rail-wrap {
    @apply relative min-w-0 -mx-3 sm:-mx-4 md:-mx-6;
}

.spot-rail {
    display: flex;
    gap: 0.75rem;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    scroll-padding-inline: 0.75rem;
    padding: 0.125rem 0.75rem 0.4rem;
    scrollbar-width: none;
    overscroll-behavior-x: contain;
}

.spot-rail::-webkit-scrollbar {
    display: none;
}

.spot-fade {
    @apply pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-white to-transparent dark:from-gray-950 lg:hidden;
}

.spot-card {
    @apply flex w-[78%] max-w-[17.5rem] shrink-0 snap-start flex-col overflow-hidden rounded-2xl
           bg-black/[0.02] dark:bg-white/5
           ring-1 ring-black/5 dark:ring-white/10;
}

.spot-media {
    @apply relative aspect-video overflow-hidden bg-gray-200 dark:bg-white/5;
}

.spot-img {
    @apply absolute inset-0 h-full w-full object-cover object-top transition-transform duration-500;
}

.spot-ep {
    @apply absolute left-2 top-2 rounded-md bg-black/65 px-1.5 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm;
}

.spot-copy {
    @apply min-w-0 px-3 py-2.5;
}

.spot-title {
    @apply line-clamp-2 text-sm font-semibold leading-snug text-gray-900 dark:text-gray-100;
}

.spot-go {
    @apply hidden;
}

.spot-skel {
    @apply aspect-[16/11] w-[78%] max-w-[17.5rem] shrink-0 snap-start rounded-2xl bg-gray-200 dark:bg-white/5 animate-pulse;
}

.section-title {
    @apply text-xl font-bold text-gray-900 dark:text-white sm:text-2xl;
}

.day-tab {
    @apply px-3 sm:px-5 py-2 sm:py-2.5 rounded-full text-xs sm:text-sm font-medium transition-all duration-300;
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
           -translate-y-0.5;
}

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

.schedule-day-enter-active,
.schedule-day-leave-active {
    transition: opacity 0.35s ease, transform 0.35s ease;
}

.schedule-day-enter-from {
    opacity: 0;
    transform: translateY(10px);
}

.schedule-day-leave-to {
    opacity: 0;
    transform: translateY(-8px);
}

.daily-item {
    animation: schedule-card-in 0.42s cubic-bezier(0.22, 1, 0.36, 1) backwards;
    animation-delay: calc(var(--card-i, 0) * 45ms);
}

@keyframes schedule-card-in {
    from {
        opacity: 0;
        transform: translateY(12px) scale(0.96);
    }
    to {
        opacity: 1;
        transform: translateY(0) scale(1);
    }
}

.feature-card:focus-visible,
.spot-card:focus-visible,
.daily-item:focus-visible,
.btn-shuffle:focus-visible,
.day-tab:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: 3px;
}

.rise-in {
    animation: rise-in 0.35s ease;
}

@keyframes rise-in {
    from {
        opacity: 0;
        transform: translateY(8px);
    }
    to {
        opacity: 1;
        transform: none;
    }
}

@media (min-width: 640px) {
    .spot-rail {
        gap: 1rem;
        scroll-padding-inline: 1rem;
        padding-inline: 1rem;
    }

    .spot-card,
    .spot-skel {
        width: 46%;
        max-width: 21rem;
    }
}

@media (min-width: 768px) {
    .spot-rail {
        scroll-padding-inline: 1.5rem;
        padding-inline: 1.5rem;
    }
}

@media (min-width: 1024px) {
    .discover-layout {
        display: grid;
        grid-template-columns: minmax(0, 1.65fr) minmax(17rem, 1fr);
        align-items: stretch;
        gap: 1rem;
    }

    .feature-card,
    .feature-skel {
        aspect-ratio: auto;
        min-height: clamp(22rem, 26vw, 26rem);
    }

    /* The rail is pulled out of flow so it matches the feature height without stretching the row. */
    .spot-rail-wrap {
        margin-inline: 0;
        min-height: 0;
    }

    .spot-rail {
        position: absolute;
        inset: 0;
        flex-direction: column;
        gap: 0.7rem;
        overflow: hidden;
        scroll-snap-type: none;
        padding: 0;
    }

    .spot-card,
    .spot-skel {
        width: 100%;
        max-width: none;
        min-height: 0;
    }

    .spot-rail-fill .spot-card,
    .spot-skel {
        flex: 1 1 0;
    }

    .spot-skel {
        aspect-ratio: auto;
    }

    .spot-card {
        flex-direction: row;
        align-items: stretch;
    }

    .spot-media {
        flex: 0 0 42%;
        width: 42%;
        height: 100%;
        aspect-ratio: auto;
    }

    .spot-copy {
        @apply flex min-h-0 flex-col justify-center gap-1 overflow-hidden px-3.5 py-2;
    }

    .spot-go {
        @apply inline-flex items-center gap-0.5 text-xs font-semibold text-gray-500 dark:text-gray-400;
    }
}

@media (hover: hover) and (pointer: fine) {
    .feature-card:hover .feature-img {
        transform: scale(1.06);
    }

    .feature-card:hover .feature-cta {
        transform: scale(1.04);
    }

    .spot-card {
        @apply transition-shadow duration-300;
    }

    .spot-card:hover {
        @apply shadow-lg shadow-black/10 ring-black/10 dark:shadow-black/50 dark:ring-white/20;
    }

    .spot-card:hover .spot-img {
        transform: scale(1.06);
    }

    .spot-card:hover .spot-go {
        @apply text-gray-900 dark:text-white;
    }
}

@media (prefers-reduced-motion: reduce) {
    .rise-in,
    .schedule-day-enter-active,
    .schedule-day-leave-active,
    .daily-item,
    .feature-stage,
    .feature-img,
    .feature-cta,
    .spot-img,
    .btn-shuffle .material-symbols-rounded {
        animation: none;
        transition: none;
    }
}
</style>
