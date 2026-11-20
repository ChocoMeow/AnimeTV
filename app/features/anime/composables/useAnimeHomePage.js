/**
 * Anime home page: discovery spotlight, daily schedule rail, themes, tooltip.
 * Must stay sync — any `await` here drops Vue/Nuxt instance for later composables.
 */
export function useAnimeHomePage() {
    const appConfig = useAppConfig()

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
    useHead({ title: `每日新番 | ${appConfig.siteName}` })

    const { data: home, pending: loading } = useFetch("/api/anime", {
        key: "home-anime",
        lazy: import.meta.client,
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

    function skipDailySection() {
        document.getElementById("home-themes")?.scrollIntoView({ behavior: "smooth", block: "start" })
    }

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

    return {
        loading,
        themes,
        featured,
        sideSpotlight,
        weekRail,
        dailyFeed,
        dayPill,
        featurePhoto,
        padIndex,
        handleTiltMove,
        resetTilt,
        dayIsActive,
        focusDay,
        skipDailySection,
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
    }
}
