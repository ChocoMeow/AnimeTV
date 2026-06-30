import { serverSupabaseClient } from '#supabase/server'

function parseEp(ep) {
    const n = Number.parseInt(String(ep).replace(/\D/g, ''), 10)
    return Number.isFinite(n) ? n : 0
}

// ─── Timezone helpers ─────────────────────────────────────────────────────────
function dateKeyTz(date, tz) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(date)
}

function hourTz(date, tz) {
    const h = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', hour12: false }).format(date)
    return Number(h) % 24
}

const WEEKDAY_MAP = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
function weekdayTz(date, tz) {
    const w = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(date)
    return WEEKDAY_MAP[w] ?? 0
}

// ─── Pre-build Intl formatters once per request (avoids repeated construction) ─
function makeFormatters(tz) {
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: tz })
    const hour = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', hour12: false })
    const wday = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' })
    return {
        dateKey: (d) => date.format(d),
        hour: (d) => Number(hour.format(d)) % 24,
        weekday: (d) => WEEKDAY_MAP[wday.format(d)] ?? 0,
    }
}

// ─── Streak calculation ───────────────────────────────────────────────────────
function computeStreaks(dayKeys, todayKey) {
    const set = new Set(dayKeys)
    const sorted = [...set].sort()
    if (!sorted.length) return { longestStreakDays: 0, currentStreakDays: 0 }

    let best = 1,
        run = 1
    for (let i = 1; i < sorted.length; i++) {
        const prev = new Date(sorted[i - 1] + 'T12:00:00Z')
        const cur = new Date(sorted[i] + 'T12:00:00Z')
        if (Math.round((cur - prev) / 86400000) === 1) {
            run++
            if (run > best) best = run
        } else run = 1
    }

    let current = 0
    const anchor = new Date(todayKey + 'T12:00:00Z').getTime()
    for (let i = 0; i < 500; i++) {
        const k = new Date(anchor - i * 86400000).toISOString().slice(0, 10)
        if (!set.has(k)) break
        current++
    }

    return { longestStreakDays: best, currentStreakDays: current }
}

// ─── Build the 12-month label array + an O(1) index map ──────────────────────
function buildMonthlyMeta(nowY, nowM) {
    const labels = []
    const indexMap = new Map()
    for (let i = 11; i >= 0; i--) {
        let m = nowM - i,
            y = nowY
        if (m <= 0) {
            m += 12
            y--
        }
        const key = `${y}-${String(m).padStart(2, '0')}`
        indexMap.set(key, 11 - i)
        labels.push(key)
    }
    return { labels, indexMap }
}

export default defineEventHandler(async (event) => {
    const user = await authUser(event)
    const client = await serverSupabaseClient(event)
    const userId = user.id || user.sub

    const rawTz = getQuery(event).tz || 'UTC'
    let tz = 'UTC'
    try {
        Intl.DateTimeFormat(undefined, { timeZone: rawTz })
        tz = rawTz
    } catch {}

    // Build formatters once — avoids constructing Intl objects in the hot loop
    const fmt = makeFormatters(tz)

    try {
        // ── 1. Fetch watch_history ─────────────────────────────────────────────
        const { data: rows, error } = await client
            .from('watch_history')
            .select('anime_ref_id, anime_title, anime_image, episode_number, playback_time, progress_percentage, updated_at')
            .eq('user_id', userId)
            .order('updated_at', { ascending: true })

        if (error) throw error
        const list = rows || []

        // Collect unique ref IDs early so the meta query can fire immediately
        const refIds = []
        const seenRef = new Set()
        for (const r of list) {
            if (r.anime_ref_id && !seenRef.has(r.anime_ref_id)) {
                seenRef.add(r.anime_ref_id)
                refIds.push(r.anime_ref_id)
            }
        }

        // ── 2. Fetch anime_meta (SINGLE query for BOTH studios AND tags) ───────
        //    Run concurrently with the synchronous list-processing below via
        //    Promise — the JS loop and the DB round-trip overlap in time.
        const metaPromise = refIds.length ? client.from('anime_meta').select('source_id, production_company, tags').in('source_id', refIds) : Promise.resolve({ data: [] })

        // ── 3. Process watch_history rows (runs while meta query is in-flight) ─
        const byAnime = new Map()
        const watchDays = new Set()
        const hourTotals = new Int32Array(24)
        const weekdayTotals = new Int32Array(7)
        const weekdayLabels = ['週一', '週二', '週三', '週四', '週五', '週六', '週日']
        const daySeconds = new Map()
        const timeByRef = new Map()
        const tagSeconds = new Map() // filled after meta resolves

        let totalWatchSeconds = 0
        let progressSum = 0,
            progressN = 0

        // Pre-build monthly structure (O(1) lookups later)
        const now = new Date()
        const todayKey = fmt.dateKey(now)
        const [nowY, nowM] = todayKey.slice(0, 7).split('-').map(Number)
        const { labels: monthlyLabels, indexMap: monthlyIndex } = buildMonthlyMeta(nowY, nowM)
        const monthlyValues = new Array(12).fill(0)

        // Episode buckets
        const epLabels = ['1–6', '7–12', '13–24', '25–48', '49+']
        const epBuckets = [0, 0, 0, 0, 0]

        // Progress histogram
        const progressBuckets = [0, 0, 0, 0, 0]
        const progressLabels = ['0–19%', '20–39%', '40–59%', '60–79%', '80–100%']

        for (const r of list) {
            const id = r.anime_ref_id
            const pt = r.playback_time || 0
            const p = Number(r.progress_percentage) || 0
            const d = new Date(r.updated_at)
            const dk = fmt.dateKey(d)

            totalWatchSeconds += pt

            // byAnime
            if (!byAnime.has(id)) byAnime.set(id, { title: r.anime_title, image: r.anime_image, maxProgress: 0, hasDeepWatch: false })
            const entry = byAnime.get(id)
            if (p > entry.maxProgress) entry.maxProgress = p
            if (p >= 95) entry.hasDeepWatch = true

            // progress stats
            progressSum += p
            progressN++
            progressBuckets[Math.min(4, Math.floor(Math.min(100, Math.max(0, p)) / 20))]++

            // watch days / heatmap
            watchDays.add(dk)
            daySeconds.set(dk, (daySeconds.get(dk) || 0) + pt)

            // hour / weekday
            hourTotals[fmt.hour(d)] += pt
            weekdayTotals[(fmt.weekday(d) + 6) % 7] += pt

            // monthly — O(1) with Map
            const monthKey = dk.slice(0, 7)
            const mIdx = monthlyIndex.get(monthKey)
            if (mIdx !== undefined) monthlyValues[mIdx] += pt

            // timeByRef
            if (!timeByRef.has(id)) timeByRef.set(id, { seconds: 0, title: r.anime_title, image: r.anime_image })
            timeByRef.get(id).seconds += pt

            // episode buckets
            const n = parseEp(r.episode_number)
            epBuckets[n <= 6 ? 0 : n <= 12 ? 1 : n <= 24 ? 2 : n <= 48 ? 3 : 4] += pt
        }

        // ── 4. Await the single meta query and build studio + tag maps ─────────
        const { data: metaRows } = await metaPromise

        const studioSeconds = new Map()
        const tagsByRef = new Map()
        const companyByRef = new Map()

        for (const m of metaRows || []) {
            companyByRef.set(m.source_id, String(m.production_company || '').trim() || '未標示')
            tagsByRef.set(m.source_id, Array.isArray(m.tags) ? m.tags.map((t) => String(t).trim()).filter(Boolean) : [])
        }

        for (const r of list) {
            const pt = r.playback_time || 0
            const id = r.anime_ref_id

            // studios
            const company = companyByRef.get(id) || '未標示'
            studioSeconds.set(company, (studioSeconds.get(company) || 0) + pt)

            // tags — distribute time evenly across tags
            const tags = tagsByRef.get(id)
            if (tags?.length) {
                const share = pt / tags.length
                for (const tag of tags) tagSeconds.set(tag, (tagSeconds.get(tag) || 0) + share)
            }
        }

        // ── 5. Derive summary values ───────────────────────────────────────────
        let deepWatchedAnimeCount = 0
        for (const [, v] of byAnime) if (v.hasDeepWatch) deepWatchedAnimeCount++

        const { longestStreakDays, currentStreakDays } = computeStreaks([...watchDays], todayKey)

        let favoriteWeekdayLabel = null,
            peakHourLabel = null
        {
            let wi = 0,
                hi = 0
            for (let i = 1; i < 7; i++) if (weekdayTotals[i] > weekdayTotals[wi]) wi = i
            for (let i = 1; i < 24; i++) if (hourTotals[i] > hourTotals[hi]) hi = i
            if (weekdayTotals[wi] > 0) favoriteWeekdayLabel = weekdayLabels[wi]
            if (hourTotals[hi] > 0) peakHourLabel = `${String(hi).padStart(2, '0')}:00 前後`
        }

        // ── 6. Build sorted output arrays ──────────────────────────────────────
        const topAnimeByTime = [...timeByRef.entries()]
            .map(([anime_ref_id, v]) => ({ anime_ref_id, anime_title: v.title, anime_image: v.image, seconds: v.seconds }))
            .sort((a, b) => b.seconds - a.seconds)
            .slice(0, 8)

        const topStudios = [...studioSeconds.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([label, seconds]) => ({ label, seconds }))

        const topTagsByTime = [...tagSeconds.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([label, seconds]) => ({ label, seconds }))

        // 42-day heatmap
        const todayMs = new Date(todayKey + 'T12:00:00Z').getTime()
        const heatmapLabels = [],
            heatmapValues = []
        for (let i = 41; i >= 0; i--) {
            const k = new Date(todayMs - i * 86400000).toISOString().slice(0, 10)
            heatmapLabels.push(k.slice(5))
            heatmapValues.push(daySeconds.get(k) || 0)
        }
        const heatmapPeak = Math.max(...heatmapValues, 1)

        return {
            summary: {
                totalWatchSeconds,
                episodeRows: list.length,
                uniqueAnimeCount: byAnime.size,
                deepWatchedAnimeCount,
                averageProgressPercent: progressN ? Math.round(progressSum / progressN) : 0,
                longestStreakDays,
                currentStreakDays,
                favoriteWeekdayLabel,
                peakHourLabel,
                firstWatchAt: list.length ? list[0].updated_at : null,
                lastWatchAt: list.length ? list[list.length - 1].updated_at : null,
            },
            watchByHour: { labels: [...Array(24)].map((_, i) => `${String(i).padStart(2, '0')}:00`), values: Array.from(hourTotals) },
            watchByWeekday: { labels: weekdayLabels, values: Array.from(weekdayTotals) },
            topAnimeByTime,
            topStudios,
            progressHistogram: { labels: progressLabels, values: progressBuckets },
            monthlyWatch: { labels: monthlyLabels, values: monthlyValues },
            heatmap42: { labels: heatmapLabels, values: heatmapValues, peak: heatmapPeak, rows: 6, cols: 7 },
            episodeBuckets: { labels: epLabels, values: epBuckets },
            topTagsByTime,
        }
    } catch (err) {
        console.error('Profile analytics error:', err)
        throw createError({ statusCode: 500, statusMessage: 'Failed to load profile analytics' })
    }
})
