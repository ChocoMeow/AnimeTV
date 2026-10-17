<script setup>
const appConfig = useAppConfig()

// useFetch forwards cookies on SSR (needed for authUser on /api/anime)
const { data: home, pending: loading } = await useFetch('/api/anime', {
    key: 'home-anime',
    default: () => ({ byDay: {}, themes: {}, spotlight: [] }),
    transform: shapeHomeAnime,
})

const byDay = computed(() => home.value.byDay)
const themes = computed(() => home.value.themes)
const spotlight = computed(() => home.value.spotlight)

const todayCode = String(new Date().getDay() || 7) // Sun=7, Mon=1…Sat=6
const selectedDay = ref(todayCode)
const dailyFeed = ref(null)
let spyLock = 0
let daySpyFrame = 0

const weekRail = computed(() => {
    const days = [...'一二三四五六日'].map((label, i) => ({
        code: String(i + 1),
        label,
        zh: `週${label}`,
        items: byDay.value[String(i + 1)] || [],
    }))
    const start = Math.max(0, Number(todayCode) - 1)
    return days.slice(start).concat(days.slice(0, start))
})
const activeDayIndex = computed(() => Math.max(0, weekRail.value.findIndex((day) => day.code === selectedDay.value)))
const allByDay = computed(() => Object.values(byDay.value).flat())
const todayCount = computed(() => (byDay.value[todayCode] || []).length)
const featured = computed(() => spotlight.value[0] || null)
const sideSpotlight = computed(() => spotlight.value.slice(1))
const shufflePool = computed(() => (allByDay.value.length ? allByDay.value : spotlight.value))

const greeting = computed(() => {
    const h = new Date().getHours()
    if (h >= 5 && h < 11) return { text: '早安', sub: '為新的一天，挑一部元氣滿滿的動畫吧', icon: 'wb_twilight' }
    if (h >= 11 && h < 14) return { text: '午安', sub: '午休時間，來點輕鬆的動畫充充電', icon: 'wb_sunny' }
    if (h >= 14 && h < 18) return { text: '下午好', sub: '探索今天更新的新番，找到你的下一部愛番', icon: 'partly_cloudy_day' }
    if (h >= 18 && h < 23) return { text: '晚上好', sub: '結束忙碌的一天，放鬆看點動畫吧', icon: 'nights_stay' }
    return { text: '夜貓子模式', sub: '這麼晚還在追番嗎？記得早點休息喔', icon: 'dark_mode' }
})

const tiltRest = 'perspective(1200px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)'
const tiltStyle = ref({ transform: tiltRest })

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

function shapeHomeAnime(res) {
    const dayMap = res?.byDay || {}
    const byRef = Object.fromEntries(
        Object.values(dayMap).flat().filter((i) => i?.refId).map((i) => [String(i.refId), i]),
    )
    return {
        byDay: dayMap,
        themes: res?.themes || {},
        spotlight: (res?.spotlight || []).map((item) => {
            const d = byRef[String(item.refId)]
            return d ? { ...item, image: d.thumbnail ?? item.image, episode: d.episode ?? null } : item
        }),
    }
}

function goRandom() {
    const pool = shufflePool.value
    if (!pool.length) return
    const pick = pool[Math.floor(Math.random() * pool.length)]
    if (pick?.refId) navigateTo(`/anime/${pick.refId}`)
}

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

function syncDayFromScroll() {
    if (spyLock || !dailyFeed.value) return
    const line = 96
    const feed = dailyFeed.value.getBoundingClientRect()
    if (feed.bottom < line || feed.top > line) return
    for (const el of dailyFeed.value.querySelectorAll('[data-day]')) {
        const rect = el.getBoundingClientRect()
        if (rect.top <= line && rect.bottom > line && el.dataset.day) {
            selectedDay.value = el.dataset.day
            return
        }
    }
}

function onPageScroll() {
    cancelAnimationFrame(daySpyFrame)
    daySpyFrame = requestAnimationFrame(syncDayFromScroll)
}

function focusDay(code) {
    selectedDay.value = code
    const el = document.getElementById(`daily-day-${code}`)
    if (!el) return
    const lock = ++spyLock
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    const unlock = () => {
        if (lock === spyLock) spyLock = 0
    }
    window.addEventListener('scrollend', unlock, { once: true })
    window.setTimeout(unlock, 900)
}

useHead({ title: `每日新番 | ${appConfig.siteName}` })
onMounted(() => {
    window.addEventListener('scroll', onPageScroll, { passive: true })
    nextTick(syncDayFromScroll)
})
onUnmounted(() => {
    window.removeEventListener('scroll', onPageScroll)
    cancelAnimationFrame(daySpyFrame)
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
                            <AppImage
                                :src="featured.image"
                                alt=""
                                class="absolute inset-0"
                                img-class="object-cover object-top duration-700"
                                loading="eager"
                                fetchpriority="high"
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
                                    <AppImage
                                        :src="item.image"
                                        alt=""
                                        class="absolute inset-0"
                                        img-class="object-cover object-top"
                                    >
                                        <span v-if="item.episode" class="spot-ep">{{ item.episode }}</span>
                                    </AppImage>
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
                <div class="mb-4 sm:mb-6">
                    <h2 class="section-title">每日新番</h2>
                    <p class="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">
                        這週每天更新的動畫都在這裡。
                    </p>
                </div>

                <div class="daily-layout">
                    <nav class="day-rail" aria-label="星期">
                        <div class="day-rail-list">
                            <div
                                class="day-rail-pill"
                                :style="{ transform: `translateY(calc(${activeDayIndex} * (var(--day-step) + var(--day-gap))))` }"
                                aria-hidden="true"
                            />
                            <button
                                v-for="day in weekRail"
                                :key="day.code"
                                type="button"
                                class="day-rail-btn"
                                :class="{ 'is-active': selectedDay === day.code }"
                                :aria-pressed="selectedDay === day.code"
                                :aria-label="day.zh"
                                :disabled="loading"
                                @click="focusDay(day.code)"
                            >
                                <span>{{ day.label }}</span>
                            </button>
                        </div>
                    </nav>

                    <div v-if="loading" class="daily-feed daily-stack" aria-hidden="true">
                        <div v-for="n in 8" :key="n" class="daily-card-skel" />
                    </div>

                    <div v-else ref="dailyFeed" class="daily-feed flex flex-col">
                        <div
                            v-for="day in weekRail"
                            :id="`daily-day-${day.code}`"
                            :key="day.code"
                            class="scroll-mt-[5.5rem]"
                            :data-day="day.code"
                        >
                            <div v-if="!day.items.length" class="daily-empty">
                                <p>{{ day.zh }}暫無更新</p>
                            </div>
                            <div v-else class="daily-stack">
                                <NuxtLink
                                    v-for="item in day.items"
                                    :key="item.refId"
                                    class="daily-card group"
                                    :to="`/anime/${item.refId}`"
                                    @mouseenter="handleMouseEnter(item, $event)"
                                    @mouseleave="handleMouseLeave"
                                >
                                    <AppImage
                                        :src="item.thumbnail"
                                        alt=""
                                        class="absolute inset-0"
                                        img-class="h-full w-full object-cover object-top transition-transform duration-700 ease-out group-hover:scale-105"
                                    />
                                    <div class="daily-scrim" />
                                    <span v-if="item.episode" class="daily-badge">{{ item.episode }}</span>
                                    <div class="daily-copy">
                                        <p class="daily-title">{{ item.title }}</p>
                                    </div>
                                </NuxtLink>
                            </div>
                        </div>
                    </div>
                </div>
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
    @apply relative block overflow-hidden rounded-xl
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
    @apply rounded-xl bg-gray-200 dark:bg-white/5 animate-pulse;
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
    @apply flex w-[78%] max-w-[17.5rem] shrink-0 snap-start flex-col overflow-hidden rounded-xl
           bg-black/[0.02] dark:bg-white/5
           border border-black/5 dark:border-white/10;
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
    @apply aspect-[16/11] w-[78%] max-w-[17.5rem] shrink-0 snap-start rounded-xl bg-gray-200 dark:bg-white/5 animate-pulse;
}

.section-title {
    @apply text-xl font-bold text-gray-900 dark:text-white sm:text-2xl;
}

.daily-layout {
    @apply -ml-1 flex items-start gap-2 sm:gap-3;
}

.day-rail {
    @apply sticky top-20 flex w-max shrink-0 flex-col items-start;
}

.day-rail-list {
    --day-step: 2.75rem;
    --day-gap: 0.7rem;
    @apply relative flex w-[var(--day-step)] flex-col items-stretch gap-[var(--day-gap)];
}

.day-rail-pill {
    @apply pointer-events-none absolute inset-x-0 top-0 z-0 h-[var(--day-step)] rounded-full
           bg-gray-950 shadow-lg shadow-black/15
           dark:bg-white dark:shadow-white/10;
    transition: transform 0.32s cubic-bezier(0.22, 1, 0.36, 1);
}

.day-rail-btn {
    @apply relative z-10 flex h-[var(--day-step)] w-full items-center justify-center rounded-full text-base font-semibold leading-none text-gray-900
           transition-colors duration-300
           dark:text-white
           disabled:opacity-50;
}

.day-rail-btn span {
    display: block;
    line-height: 1;
    transform: translateY(-0.08em);
}

.day-rail-btn:not(.is-active):hover {
    @apply bg-black/10 dark:bg-white/15;
}

.day-rail-btn.is-active {
    @apply text-white dark:text-black;
}

.daily-feed {
    @apply min-w-0 flex-1;
}

.daily-feed > [data-day] + [data-day] {
    @apply mt-6 border-t border-black/10 pt-6 dark:border-white/10 sm:mt-8 sm:pt-8;
}

.daily-empty {
    @apply rounded-2xl border border-black/5 bg-black/[0.02] px-4 py-8 text-center text-sm text-gray-500
           dark:border-white/10 dark:bg-white/[0.03] dark:text-gray-400;
}

.daily-stack {
    @apply grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3 xl:grid-cols-4;
}

.daily-card {
    @apply relative block aspect-video overflow-hidden rounded-xl
           bg-gray-200 shadow-md shadow-black/10 ring-1 ring-black/5
           dark:bg-white/5 dark:shadow-black/40 dark:ring-white/10;
}

.daily-card-skel {
    @apply aspect-video rounded-xl bg-gray-200 animate-pulse dark:bg-white/5;
}

.daily-scrim {
    @apply absolute inset-0;
    background: linear-gradient(to top, rgba(0, 0, 0, 0.82) 0%, rgba(0, 0, 0, 0.18) 46%, rgba(0, 0, 0, 0.08) 100%);
}

.daily-badge {
    @apply absolute left-2 top-2 z-10 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-md
           sm:left-2.5 sm:top-2.5 sm:text-[11px];
}

.daily-copy {
    @apply absolute inset-x-0 bottom-0 z-10 p-2.5 sm:p-3;
}

.daily-title {
    @apply line-clamp-2 text-xs font-bold leading-tight tracking-tight text-white sm:text-sm;
    text-shadow: 0 2px 12px rgba(0, 0, 0, 0.5);
}

.feature-card:focus-visible,
.spot-card:focus-visible,
.daily-card:focus-visible,
.btn-shuffle:focus-visible,
.day-rail-btn:focus-visible {
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
        /* Keep 1px inset so card borders are not clipped by overflow:hidden. */
        padding: 1px;
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
        @apply shadow-lg shadow-black/10 border-black/10 dark:shadow-black/50 dark:border-white/20;
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
    .day-rail-pill,
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
