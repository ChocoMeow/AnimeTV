import { serverSupabaseClient } from '#supabase/server'

function parseEp(ep) {
    const n = Number.parseInt(String(ep).replace(/\D/g, ''), 10)
    return Number.isFinite(n) ? n : 0
}

// ─── Timezone helpers ─────────────────────────────────────────────────────────
// Use separate single-field formatters to avoid Intl bugs when mixing fields.

// Returns "YYYY-MM-DD" — en-CA locale reliably gives ISO date format.
function dateKeyTz(date, tz) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(date)
}

// Returns the local hour 0–23.
function hourTz(date, tz) {
    const h = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', hour12: false }).format(date)
    return Number(h) % 24 // some engines return "24" for midnight
}

// Returns 0=Sun … 6=Sat in the given timezone.
const WEEKDAY_MAP = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
function weekdayTz(date, tz) {
    const w = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(date)
    return WEEKDAY_MAP[w] ?? 0
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
            best = Math.max(best, run)
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

export default defineEventHandler(async (event) => {
    const user = await authUser(event)
    const client = await serverSupabaseClient(event)
    const userId = user.id || user.sub

    // Validate client timezone; fall back to UTC.
    const rawTz = getQuery(event).tz || 'UTC'
    let tz = 'UTC'
    try {
        Intl.DateTimeFormat(undefined, { timeZone: rawTz })
        tz = rawTz
    } catch {}

    try {
        const { data: rows, error } = await client
            .from('watch_history')
            .select('anime_ref_id, anime_title, anime_image, episode_number, playback_time, progress_percentage, updated_at')
            .eq('user_id', userId)
            .order('updated_at', { ascending: true })

        if (error) throw error

        const list = rows || []
        const totalWatchSeconds = list.reduce((s, r) => s + (r.playback_time || 0), 0)
        const episodeRows = list.length

        const byAnime = new Map()
        const watchDays = new Set()
        const hourTotals = Array(24).fill(0)
        const weekdayTotals = Array(7).fill(0)
        const weekdayLabels = ['週一', '週二', '週三', '週四', '週五', '週六', '週日']
        const recordMonths = [] // cache "YYYY-MM" per row for monthly bucketing

        let progressSum = 0,
            progressN = 0

        for (const r of list) {
            const id = r.anime_ref_id
            if (!byAnime.has(id)) byAnime.set(id, { title: r.anime_title, image: r.anime_image, maxProgress: 0, hasDeepWatch: false })
            const entry = byAnime.get(id)
            const p = Number(r.progress_percentage) || 0
            entry.maxProgress = Math.max(entry.maxProgress, p)
            if (p >= 95) entry.hasDeepWatch = true
            progressSum += p
            progressN++

            const d = new Date(r.updated_at)
            const dk = dateKeyTz(d, tz) // "YYYY-MM-DD" in client tz
            watchDays.add(dk)
            recordMonths.push(dk.slice(0, 7)) // "YYYY-MM"

            hourTotals[hourTz(d, tz)] += r.playback_time || 0
            weekdayTotals[(weekdayTz(d, tz) + 6) % 7] += r.playback_time || 0 // Mon-first
        }

        let deepWatchedAnimeCount = 0
        for (const [, v] of byAnime) if (v.hasDeepWatch) deepWatchedAnimeCount++

        const todayKey = dateKeyTz(new Date(), tz)
        const { longestStreakDays, currentStreakDays } = computeStreaks([...watchDays], todayKey)

        let favoriteWeekdayLabel = null,
            peakHourLabel = null
        {
            const wi = weekdayTotals.indexOf(Math.max(...weekdayTotals))
            if (weekdayTotals[wi] > 0) favoriteWeekdayLabel = weekdayLabels[wi]
            const hi = hourTotals.indexOf(Math.max(...hourTotals))
            if (hourTotals[hi] > 0) peakHourLabel = `${String(hi).padStart(2, '0')}:00 前後`
        }

        // Top anime by time
        const timeByRef = new Map()
        for (const r of list) {
            if (!timeByRef.has(r.anime_ref_id)) timeByRef.set(r.anime_ref_id, { seconds: 0, title: r.anime_title, image: r.anime_image })
            timeByRef.get(r.anime_ref_id).seconds += r.playback_time || 0
        }
        const topAnimeByTime = [...timeByRef.entries()]
            .map(([anime_ref_id, v]) => ({ anime_ref_id, anime_title: v.title, anime_image: v.image, seconds: v.seconds }))
            .sort((a, b) => b.seconds - a.seconds)
            .slice(0, 8)

        // Studios
        const refIds = [...byAnime.keys()].filter(Boolean)
        const studioSeconds = new Map()
        if (refIds.length) {
            const { data: metaRows } = await client.from('anime_meta').select('source_id, production_company').in('source_id', refIds)
            const companyByRef = new Map()
            for (const m of metaRows || []) companyByRef.set(m.source_id, String(m.production_company || '').trim() || '未標示')
            for (const r of list) {
                const c = companyByRef.get(r.anime_ref_id) || '未標示'
                studioSeconds.set(c, (studioSeconds.get(c) || 0) + (r.playback_time || 0))
            }
        }
        const topStudios = [...studioSeconds.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([label, seconds]) => ({ label, seconds }))

        // Progress histogram
        const progressBuckets = [0, 0, 0, 0, 0]
        const progressLabels = ['0–19%', '20–39%', '40–59%', '60–79%', '80–100%']
        for (const r of list) {
            const p = Math.min(100, Math.max(0, Number(r.progress_percentage) || 0))
            progressBuckets[Math.min(4, Math.floor(p / 20))]++
        }

        // Monthly watch time — bucket by "YYYY-MM" in client tz, last 12 months
        const now = new Date()
        const [nowY, nowM] = dateKeyTz(now, tz).slice(0, 7).split('-').map(Number)
        const monthlyLabels = []
        for (let i = 11; i >= 0; i--) {
            let m = nowM - i,
                y = nowY
            if (m <= 0) {
                m += 12
                y--
            }
            monthlyLabels.push(`${y}-${String(m).padStart(2, '0')}`)
        }
        const monthlyValues = new Array(12).fill(0)
        for (let idx = 0; idx < list.length; idx++) {
            const pos = monthlyLabels.indexOf(recordMonths[idx])
            if (pos !== -1) monthlyValues[pos] += list[idx].playback_time || 0
        }

        // 42-day heatmap in client local time
        const daySeconds = new Map()
        for (const r of list) {
            const k = dateKeyTz(new Date(r.updated_at), tz)
            daySeconds.set(k, (daySeconds.get(k) || 0) + (r.playback_time || 0))
        }
        const todayMs = new Date(todayKey + 'T12:00:00Z').getTime()
        const heatmapLabels = [],
            heatmapValues = []
        for (let i = 41; i >= 0; i--) {
            const k = new Date(todayMs - i * 86400000).toISOString().slice(0, 10)
            // re-key through tz to be consistent (heatmap anchor is already in client tz)
            heatmapLabels.push(k.slice(5))
            heatmapValues.push(daySeconds.get(k) || 0)
        }
        const heatmapPeak = Math.max(...heatmapValues, 1)

        // Episode bucket
        const epLabels = ['1–6', '7–12', '13–24', '25–48', '49+']
        const epBuckets = [0, 0, 0, 0, 0]
        for (const r of list) {
            const n = parseEp(r.episode_number)
            epBuckets[n <= 6 ? 0 : n <= 12 ? 1 : n <= 24 ? 2 : n <= 48 ? 3 : 4] += r.playback_time || 0
        }

        // Top tags
        const tagSeconds = new Map()
        if (refIds.length) {
            const { data: tagMeta } = await client.from('anime_meta').select('source_id, tags').in('source_id', refIds)
            const tagsByRef = new Map()
            for (const m of tagMeta || []) tagsByRef.set(m.source_id, Array.isArray(m.tags) ? m.tags.map((t) => String(t).trim()).filter(Boolean) : [])
            for (const r of list) {
                const tags = tagsByRef.get(r.anime_ref_id) || []
                if (!tags.length) continue
                for (const tag of tags) tagSeconds.set(tag, (tagSeconds.get(tag) || 0) + (r.playback_time || 0) / tags.length)
            }
        }
        const topTagsByTime = [...tagSeconds.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([label, seconds]) => ({ label, seconds }))

        return {
            summary: {
                totalWatchSeconds,
                episodeRows,
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
            watchByHour: { labels: [...Array(24)].map((_, i) => `${String(i).padStart(2, '0')}:00`), values: hourTotals },
            watchByWeekday: { labels: weekdayLabels, values: weekdayTotals },
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
