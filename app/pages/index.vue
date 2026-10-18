<script setup>
const appConfig = useAppConfig()
const { data: home, pending: loading } = await useFetch("/api/anime", {
    key: "home-anime",
    default: () => ({ byDay: {}, themes: {}, spotlight: [] }),
    transform: shapeHomeAnime,
})

const byDay = computed(() => home.value.byDay)
const themes = computed(() => home.value.themes)
const spotlight = computed(() => home.value.spotlight)
const featured = computed(() => spotlight.value[0] ?? null)
const sideSpotlight = computed(() => spotlight.value.slice(1))
const todayCode = new Date().getDay() || 7 // Sunday = 7; Monday = 1.

const dailyFeed = ref(null)
const dayPill = ref(null)
const featurePhoto = ref(null)
const pillFrom = ref(0)
const pillTo = ref(0)

let isFocusingDay = false
let focusCode = ""
let pillFrame = 0
let pillFollow = 0
let pillShown = 0
let pillTarget = 0
let pillLast = 0
let tiltFrame = 0

const weekRail = computed(() => {
    const days = [..."一二三四五六日"].map((label, index) => ({
        code: String(index + 1),
        label,
        zh: `週${label}`,
        items: byDay.value[String(index + 1)] ?? [],
    }))
    const start = todayCode - 1

    return [...days.slice(start), ...days.slice(0, start)]
})

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

function shapeHomeAnime(response = {}) {
    const byDay = response?.byDay ?? {}
    const animeByRef = new Map(
        Object.values(byDay)
            .flat()
            .filter((item) => item?.refId)
            .map((item) => [String(item.refId), item]),
    )

    return {
        byDay,
        themes: response?.themes ?? {},
        spotlight: (response?.spotlight ?? []).map((item) => {
            const match = animeByRef.get(String(item.refId))
            return match ? { ...item, image: match.thumbnail ?? item.image, episode: match.episode ?? null } : item
        }),
    }
}

const padIndex = (index) => String(index).padStart(2, "0")
const prefersReducedMotion = () => import.meta.client && window.matchMedia("(prefers-reduced-motion: reduce)").matches

function handleTiltMove(event) {
    const photo = featurePhoto.value
    if (!photo) return

    const rect = event.currentTarget.getBoundingClientRect()
    const x = (event.clientX - rect.left) / rect.width - 0.5
    const y = (event.clientY - rect.top) / rect.height - 0.5

    cancelAnimationFrame(tiltFrame)
    tiltFrame = requestAnimationFrame(() => {
        photo.style.transform = `rotateX(${(-y * 7).toFixed(2)}deg) rotateY(${(x * 9).toFixed(2)}deg)`
    })
}

function resetTilt() {
    cancelAnimationFrame(tiltFrame)
    featurePhoto.value?.style.removeProperty("transform")
}

function smooth(value) {
    const t = Math.min(1, Math.max(0, value))
    return t * t * (3 - 2 * t)
}

function placePill(index, animate) {
    const max = Math.max(0, weekRail.value.length - 1)
    const clamped = Math.min(max, Math.max(0, index))
    const current = Math.floor(clamped)
    const progress = clamped - current
    const settle = smooth(Math.max(0, progress * 2 - 1))
    const stretch = progress < 0.5 ? smooth(progress * 2) : 1 - settle
    const pill = dayPill.value

    if (pill) {
        const easing = "0.32s cubic-bezier(0.22, 1, 0.36, 1)"
        pill.style.transition = animate && !prefersReducedMotion() ? `transform ${easing}, height ${easing}` : "none"
        pill.style.transform = `translateY(calc(${current + settle} * (var(--day-step) + var(--day-gap))))`
        pill.style.height = `calc(var(--day-step) + ${stretch} * (var(--day-step) + var(--day-gap)))`
    }

    // Switch the active text color only after the pill moves behind it.
    const reach = 0.4
    const from = settle <= reach ? current : Math.min(max, current + 1)
    const to = settle + stretch >= 1 - reach ? Math.min(max, current + 1) : current

    if (from !== pillFrom.value || to !== pillTo.value) {
        pillFrom.value = from
        pillTo.value = to
    }
}

function dayIsActive(code) {
    const index = weekRail.value.findIndex((day) => day.code === code)
    return index >= pillFrom.value && index <= pillTo.value
}

function scrollIndex() {
    const days = dailyFeed.value?.querySelectorAll("[data-day]")
    if (!days?.length) return null

    const line = 96
    for (let index = 0; index < days.length; index++) {
        const rect = days[index].getBoundingClientRect()
        if (line <= rect.top) return index
        if (line < rect.bottom) {
            return index + Math.min(1, (line - rect.top) / (rect.height || 1))
        }
    }

    return days.length - 1
}

function followPill(now) {
    if (isFocusingDay) return stopFollow()

    const delta = pillLast ? Math.min(32, now - pillLast) : 16
    pillLast = now
    const amount = prefersReducedMotion() ? 1 : 1 - Math.exp(-delta / 110)
    pillShown += (pillTarget - pillShown) * amount

    if (Math.abs(pillTarget - pillShown) < 0.0008) {
        pillShown = pillTarget
        stopFollow()
    } else {
        pillFollow = requestAnimationFrame(followPill)
    }

    placePill(pillShown, false)
}

function stopFollow() {
    cancelAnimationFrame(pillFollow)
    pillFollow = 0
    pillLast = 0
}

function trackPill() {
    if (isFocusingDay) return

    const index = scrollIndex()
    if (index === null) return

    pillTarget = index
    if (!pillFollow) pillFollow = requestAnimationFrame(followPill)
}

function dayAtAnchor(code) {
    const top = document.getElementById(`daily-day-${code}`)?.getBoundingClientRect().top
    return top != null && Math.abs(top - 88) < 16
}

function finishFocus() {
    if (!isFocusingDay) return

    isFocusingDay = false
    window.removeEventListener("scrollend", onFocusScrollEnd)
    trackPill()
}

function onFocusScrollEnd() {
    if (dayAtAnchor(focusCode)) finishFocus()
}

function onPageScroll() {
    if (isFocusingDay) {
        if (dayAtAnchor(focusCode)) finishFocus()
        return
    }
    if (pillFrame) return

    pillFrame = requestAnimationFrame(() => {
        pillFrame = 0
        trackPill()
    })
}

function focusDay(code) {
    const index = Math.max(
        0,
        weekRail.value.findIndex((day) => day.code === code),
    )
    focusCode = code
    isFocusingDay = true

    cancelAnimationFrame(pillFrame)
    pillFrame = 0
    stopFollow()
    pillShown = pillTarget = index
    placePill(index, true)

    const day = document.getElementById(`daily-day-${code}`)
    if (!day) return finishFocus()

    window.removeEventListener("scrollend", onFocusScrollEnd)
    window.addEventListener("scrollend", onFocusScrollEnd)
    day.scrollIntoView({ behavior: "smooth", block: "start" })
}

useHead({ title: `每日新番 | ${appConfig.siteName}` })

watch(dailyFeed, (feed) => {
    if (feed) nextTick(trackPill)
})

onMounted(() => {
    window.addEventListener("scroll", onPageScroll, { passive: true })
})

onUnmounted(() => {
    window.removeEventListener("scroll", onPageScroll)
    window.removeEventListener("scrollend", onFocusScrollEnd)
    cancelAnimationFrame(pillFrame)
    cancelAnimationFrame(pillFollow)
    cancelAnimationFrame(tiltFrame)
    cleanup()
})
</script>

<template>
    <div class="mx-auto max-w-7xl space-y-8 px-3 pb-8 pt-5 sm:space-y-14 sm:px-4 sm:pb-10 sm:pt-8 md:px-6">
        <!-- Discovery -->
        <section v-if="loading || featured" aria-label="焦點推薦">
            <div class="discover-layout" :class="{ 'rise-in': !loading }">
                <div v-if="loading" class="feature-skel" aria-hidden="true" />
                <NuxtLink v-else :to="`/anime/${featured.refId}`" class="feature-card" @mousemove="handleTiltMove" @mouseleave="resetTilt">
                    <div class="feature-stage">
                        <div ref="featurePhoto" class="feature-photo">
                            <AppImage :src="featured.image" alt="" class="absolute inset-0" img-class="object-cover object-top" loading="eager" fetchpriority="high" />
                        </div>
                        <div class="feature-scrim" />
                        <div class="feature-sheen" aria-hidden="true" />
                        <div class="feature-top">
                            <span class="feature-kicker">
                                <span class="kicker-dot" aria-hidden="true" />
                                焦點新番
                            </span>
                            <span v-if="featured.episode" class="feature-ep">{{ featured.episode }}</span>
                        </div>
                        <div class="feature-copy">
                            <h2 class="feature-title">{{ featured.title }}</h2>
                            <span class="feature-cta">
                                <span class="play-orb" aria-hidden="true">
                                    <span class="material-symbols-rounded text-[18px]">play_arrow</span>
                                </span>
                                立即觀看
                            </span>
                        </div>
                    </div>
                </NuxtLink>
                <div v-if="loading || sideSpotlight.length" class="spot-panel" :aria-hidden="loading || undefined">
                    <div class="spot-rail-wrap">
                        <div class="spot-rail" :class="{ 'spot-rail-fill': sideSpotlight.length >= 3 }">
                            <template v-if="loading">
                                <div v-for="n in 3" :key="n" class="spot-skel" />
                            </template>
                            <template v-else>
                                <NuxtLink
                                    v-for="(item, index) in sideSpotlight"
                                    :key="item.refId"
                                    :to="`/anime/${item.refId}`"
                                    class="spot-card"
                                    @mouseenter="handleMouseEnter(item, $event)"
                                    @mouseleave="handleMouseLeave"
                                >
                                    <div class="spot-media">
                                        <AppImage :src="item.image" alt="" class="absolute inset-0" img-class="spot-img object-cover object-top" />
                                        <span v-if="item.episode" class="spot-ep">{{ item.episode }}</span>
                                    </div>
                                    <div class="spot-copy">
                                        <span class="spot-index" aria-hidden="true">{{ padIndex(index + 1) }}</span>
                                        <p class="spot-title">{{ item.title }}</p>
                                        <span class="spot-go">
                                            觀看
                                            <span class="material-symbols-rounded text-base" aria-hidden="true">arrow_forward</span>
                                        </span>
                                    </div>
                                </NuxtLink>
                            </template>
                        </div>
                        <div v-if="!loading" class="spot-fade" aria-hidden="true" />
                    </div>
                </div>
            </div>
        </section>
        <!-- Daily Schedule Section -->
        <section id="daily-schedule" class="scroll-mt-20">
            <div class="mb-4 sm:mb-6">
                <h2 class="section-title">每日新番</h2>
                <p class="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">這週每天更新的動畫都在這裡。</p>
            </div>
            <div class="daily-layout">
                <nav class="day-rail" aria-label="星期">
                    <div class="day-rail-list">
                        <div ref="dayPill" class="day-rail-pill" aria-hidden="true" />
                        <button
                            v-for="day in weekRail"
                            :key="day.code"
                            type="button"
                            class="day-rail-btn"
                            :class="{ 'is-active': dayIsActive(day.code) }"
                            :aria-pressed="dayIsActive(day.code)"
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
                    <div v-for="day in weekRail" :id="`daily-day-${day.code}`" :key="day.code" class="scroll-mt-[5.5rem]" :data-day="day.code">
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
                                    img-class="h-full w-full object-cover object-top"
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
            <template v-if="loading">
                <div v-for="n in 2" :key="`theme-skel-${n}`">
                    <div class="mb-4 h-7 w-40 animate-pulse rounded-lg bg-gray-200 dark:bg-white/5 sm:mb-6 sm:h-8 sm:w-48" />
                    <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                        <SkeletonAnimeCard v-for="m in 12" :key="m" />
                    </div>
                </div>
            </template>
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
.discover-layout {
    @apply flex flex-col gap-5 sm:gap-6;
}

.feature-card,
.feature-skel {
    @apply min-h-[18rem] aspect-[3/4] sm:min-h-[22rem] sm:aspect-[16/9];
}

.feature-card {
    @apply relative block overflow-hidden rounded-[1.4rem] bg-gray-200
    shadow-[0_28px_60px_-32px_rgba(0,0,0,0.65)]
    ring-1 ring-black/10
    dark:bg-white/5 dark:ring-white/10
    sm:rounded-[1.75rem];
}

.feature-stage {
    @apply absolute inset-0;
    perspective: 900px;
}

.feature-photo {
    @apply absolute;
    inset: -14%;
    transform-origin: center;
    transition: transform 0.45s cubic-bezier(0.22, 1, 0.36, 1);
}

:deep(.spot-img) {
    transition: transform 0.8s cubic-bezier(0.22, 1, 0.36, 1);
}

.feature-scrim {
    @apply absolute inset-0;
    background: linear-gradient(to top, rgba(0, 0, 0, 0.88) 0%, rgba(0, 0, 0, 0.42) 38%, rgba(0, 0, 0, 0.08) 62%, rgba(0, 0, 0, 0.28) 100%);
}

.feature-sheen {
    @apply pointer-events-none absolute inset-0;
    background: linear-gradient(115deg, rgba(255, 255, 255, 0.16) 0%, transparent 32%);
}

.feature-top {
    @apply absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-3 p-3.5 sm:p-5;
}

.feature-kicker,
.feature-ep {
    @apply inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold text-white
    ring-1 ring-white/20 sm:text-xs;
}

.feature-kicker {
    @apply bg-white/15;
}

.feature-ep {
    @apply bg-black/45;
}

.kicker-dot {
    @apply h-1.5 w-1.5 rounded-full bg-white;
    box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.7);
    animation: kicker-pulse 2.2s ease-out infinite;
}

.feature-copy {
    @apply absolute inset-x-0 bottom-0 z-10 flex flex-col p-4 sm:p-6 lg:p-8;
}

.feature-title {
    @apply mb-4 line-clamp-2 text-[1.65rem] font-extrabold leading-[1.12] tracking-tight text-white sm:mb-5 sm:text-4xl lg:text-[2.6rem];
    text-shadow: 0 8px 28px rgba(0, 0, 0, 0.45);
}

.feature-cta {
    @apply inline-flex w-fit items-center gap-2.5 self-start rounded-full bg-white py-1.5 pl-1.5 pr-4
    text-sm font-semibold text-black shadow-lg shadow-black/30
    transition-transform duration-200;
}

.play-orb {
    @apply flex h-8 w-8 items-center justify-center rounded-full bg-black text-white;
}

.feature-skel {
    @apply rounded-[1.4rem] bg-gray-200 animate-pulse dark:bg-white/5 sm:rounded-[1.75rem];
}

.spot-panel {
    @apply min-w-0;
}

.spot-rail-wrap {
    @apply relative min-w-0 -mx-3 sm:-mx-4 md:-mx-6 lg:mx-0;
}

.spot-rail {
    display: flex;
    gap: 0.75rem;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    scroll-padding-inline: 0.75rem;
    padding: 0.125rem 0.75rem 0.5rem;
    scrollbar-width: none;
    overscroll-behavior-x: contain;
}

.spot-rail::-webkit-scrollbar {
    display: none;
}

.spot-fade {
    @apply pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-white to-transparent dark:from-gray-950 lg:hidden;
}

.spot-card {
    @apply relative flex w-[78%] max-w-[20rem] shrink-0 snap-start flex-col overflow-hidden rounded-[1.15rem]
    bg-gray-950 shadow-md shadow-black/10 ring-1 ring-black/10
    dark:ring-white/10;
}

.spot-media {
    @apply relative aspect-[16/10] overflow-hidden bg-gray-200 dark:bg-white/5;
}

.spot-ep {
    @apply absolute left-2.5 top-2.5 z-10 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold text-white;
}

.spot-copy {
    @apply absolute inset-x-0 bottom-0 z-10 flex flex-col justify-end px-3 pb-3 pt-10;
    background: linear-gradient(to top, rgba(0, 0, 0, 0.88) 0%, rgba(0, 0, 0, 0.28) 62%, transparent 100%);
}

.spot-index {
    @apply mb-1 text-[10px] font-semibold tracking-[0.22em] text-white/70;
}

.spot-title {
    @apply line-clamp-2 text-sm font-bold leading-snug tracking-tight text-white;
}

.spot-go {
    @apply mt-1.5 inline-flex items-center gap-0.5 text-[11px] font-semibold text-white/80;
}

.spot-skel {
    @apply aspect-[16/10] w-[78%] max-w-[20rem] shrink-0 snap-start rounded-[1.15rem] bg-gray-200 animate-pulse dark:bg-white/5;
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
}

.day-rail-btn {
    @apply relative z-10 flex h-[var(--day-step)] w-full items-center justify-center rounded-full text-base font-semibold leading-none text-gray-900
    transition-colors duration-300
    dark:text-white
    disabled:opacity-50;
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
    @apply absolute left-2 top-2 z-10 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-semibold text-white
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

@keyframes kicker-pulse {
    70% {
        box-shadow: 0 0 0 6px rgba(255, 255, 255, 0);
    }
    100% {
        box-shadow: 0 0 0 0 rgba(255, 255, 255, 0);
    }
}

@media (min-width: 640px) {
    .spot-rail {
        gap: 0.9rem;
        scroll-padding-inline: 1rem;
        padding-inline: 1rem;
    }
    .spot-card,
    .spot-skel {
        width: 42%;
        max-width: 22rem;
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
        grid-template-columns: minmax(0, 1.7fr) minmax(18.5rem, 0.9fr);
        align-items: stretch;
        gap: 1.15rem;
    }
    .feature-card,
    .feature-skel {
        aspect-ratio: auto;
        height: 100%;
        min-height: clamp(26rem, 34vw, 34rem);
    }
    .feature-card:only-child {
        grid-column: 1 / -1;
    }
    .spot-panel {
        @apply flex min-h-0 flex-col rounded-[1.75rem] bg-black/[0.03] p-3 ring-1 ring-black/[0.06]
      dark:bg-white/[0.035] dark:ring-white/10;
    }
    .spot-rail-wrap {
        position: relative;
        flex: 1 1 auto;
        min-height: 0;
    }
    .spot-rail-wrap .spot-rail {
        position: absolute;
        inset: 0;
        flex-direction: column;
        gap: 0.55rem;
        overflow: hidden;
        scroll-snap-type: none;
        padding: 0;
    }
    .spot-card,
    .spot-skel {
        width: 100%;
        max-width: none;
        min-height: 0;
        border-radius: 1.15rem;
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
        background: transparent;
        box-shadow: none;
    }
    .spot-media {
        flex: 0 0 46%;
        width: 46%;
        height: 100%;
        align-self: stretch;
        aspect-ratio: auto;
        border-radius: 0.95rem;
    }
    .spot-copy {
        position: relative;
        inset: auto;
        flex: 1 1 auto;
        justify-content: center;
        gap: 0.15rem;
        min-width: 0;
        overflow: hidden;
        background: none;
        padding: 0.4rem 0.85rem 0.4rem 0.95rem;
    }
    .spot-index {
        @apply text-[11px] text-gray-400 dark:text-gray-500;
    }
    .spot-title {
        @apply text-[0.95rem] text-gray-950 dark:text-white;
    }
    .spot-go {
        @apply mt-1 text-xs text-gray-500 dark:text-gray-400;
    }
}

@media (hover: hover) and (pointer: fine) {
    .feature-kicker,
    .feature-ep,
    .spot-ep,
    .daily-badge {
        -webkit-backdrop-filter: blur(12px);
        backdrop-filter: blur(12px);
    }
    .feature-card:hover .feature-photo {
        transition: none;
    }
    .feature-card:hover .feature-cta {
        transform: translateY(-1px);
    }
    .spot-card:hover :deep(.spot-img) {
        transform: scale(1.06);
    }
    .spot-card:hover .spot-go {
        color: #fff;
    }
}

@media (hover: hover) and (pointer: fine) and (min-width: 1024px) {
    .spot-card {
        transition: background-color 0.25s ease;
    }
    .spot-card:hover {
        @apply bg-black/[0.04] dark:bg-white/[0.05];
    }
    .spot-card:hover .spot-go {
        @apply text-gray-950 dark:text-white;
    }
}

@media (prefers-reduced-motion: reduce) {
    .rise-in,
    .day-rail-pill,
    .feature-photo,
    .feature-cta,
    .kicker-dot,
    :deep(.spot-img) {
        animation: none;
        transition: none;
    }
}
</style>
