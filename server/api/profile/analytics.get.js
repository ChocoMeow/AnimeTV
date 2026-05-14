import { serverSupabaseClient } from '#supabase/server'

function parseEp(ep) {
    const n = Number.parseInt(String(ep).replace(/\D/g, ''), 10)
    return Number.isFinite(n) ? n : 0
}

function dateKeyLocal(d) {
    const y = d.getFullYear()
    const mo = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${mo}-${day}`
}

function computeStreaks(dayKeys) {
    const set = new Set(dayKeys)
    const sorted = [...set].sort()
    if (!sorted.length) return { longestStreakDays: 0, currentStreakDays: 0 }

    let best = 1
    let run = 1
    for (let i = 1; i < sorted.length; i++) {
        const prev = new Date(sorted[i - 1] + 'T12:00:00')
        const cur = new Date(sorted[i] + 'T12:00:00')
        const diffDays = Math.round((cur.getTime() - prev.getTime()) / 86400000)
        if (diffDays === 1) {
            run += 1
            best = Math.max(best, run)
        } else {
            run = 1
        }
    }

    let current = 0
    for (let i = 0; i < 500; i++) {
        const d = new Date()
        d.setHours(0, 0, 0, 0)
        d.setDate(d.getDate() - i)
        const k = dateKeyLocal(d)
        if (!set.has(k)) break
        current += 1
    }

    return { longestStreakDays: best, currentStreakDays: current }
}

export default defineEventHandler(async (event) => {
    const user = await authUser(event)
    const client = await serverSupabaseClient(event)
    const userId = user.id || user.sub

    try {
        const { data: rows, error } = await client
            .from('watch_history')
            .select('anime_ref_id, anime_title, anime_image, episode_number, playback_time, progress_percentage, updated_at')
            .eq('user_id', userId)
            .order('updated_at', { ascending: true })

        if (error) throw error

        const list = rows || []
        const totalWatchSeconds = list.reduce((sum, r) => sum + (r.playback_time || 0), 0)
        const episodeRows = list.length

        const byAnime = new Map()
        const watchDays = new Set()
        const hourTotals = Array(24).fill(0)
        const weekdayTotals = Array(7).fill(0)
        const weekdayLabels = ['週一', '週二', '週三', '週四', '週五', '週六', '週日']

        let progressSum = 0
        let progressN = 0

        for (const r of list) {
            const id = r.anime_ref_id
            if (!byAnime.has(id)) {
                byAnime.set(id, {
                    title: r.anime_title,
                    image: r.anime_image,
                    maxProgress: 0,
                    hasDeepWatch: false,
                })
            }
            const entry = byAnime.get(id)
            const p = Number(r.progress_percentage) || 0
            entry.maxProgress = Math.max(entry.maxProgress, p)
            if (p >= 95) entry.hasDeepWatch = true

            progressSum += p
            progressN += 1

            const d = new Date(r.updated_at)
            watchDays.add(dateKeyLocal(d))
            hourTotals[d.getHours()] += r.playback_time || 0
            const wd = (d.getDay() + 6) % 7
            weekdayTotals[wd] += r.playback_time || 0
        }

        let deepWatchedAnimeCount = 0
        for (const [, v] of byAnime) {
            if (v.hasDeepWatch) deepWatchedAnimeCount += 1
        }

        const { longestStreakDays, currentStreakDays } = computeStreaks([...watchDays])

        let favoriteWeekdayLabel = null
        let peakHourLabel = null
        {
            let maxW = -1
            let wi = 0
            for (let i = 0; i < 7; i++) {
                if (weekdayTotals[i] > maxW) {
                    maxW = weekdayTotals[i]
                    wi = i
                }
            }
            if (maxW > 0) favoriteWeekdayLabel = weekdayLabels[wi]
            let maxH = -1
            let hi = 0
            for (let i = 0; i < 24; i++) {
                if (hourTotals[i] > maxH) {
                    maxH = hourTotals[i]
                    hi = i
                }
            }
            if (maxH > 0) peakHourLabel = `${String(hi).padStart(2, '0')}:00 前後`
        }

        const timeByRef = new Map()
        for (const r of list) {
            const id = r.anime_ref_id
            if (!timeByRef.has(id)) {
                timeByRef.set(id, { seconds: 0, title: r.anime_title, image: r.anime_image })
            }
            const e = timeByRef.get(id)
            e.seconds += r.playback_time || 0
        }

        const topAnimeByTime = [...timeByRef.entries()]
            .map(([anime_ref_id, v]) => ({
                anime_ref_id,
                anime_title: v.title,
                anime_image: v.image,
                seconds: v.seconds,
            }))
            .sort((a, b) => b.seconds - a.seconds)
            .slice(0, 8)

        const refIds = [...byAnime.keys()].filter(Boolean)
        const studioSeconds = new Map()
        if (refIds.length) {
            const { data: metaRows } = await client.from('anime_meta').select('source_id, production_company').in('source_id', refIds)
            const companyByRef = new Map()
            for (const m of metaRows || []) {
                const c = (m.production_company && String(m.production_company).trim()) || ''
                companyByRef.set(m.source_id, c || '未標示')
            }
            for (const r of list) {
                const company = companyByRef.get(r.anime_ref_id) || '未標示'
                studioSeconds.set(company, (studioSeconds.get(company) || 0) + (r.playback_time || 0))
            }
        }

        const topStudios = [...studioSeconds.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([label, seconds]) => ({ label, seconds }))

        const firstWatchAt = list.length ? list[0].updated_at : null
        const lastWatchAt = list.length ? list[list.length - 1].updated_at : null

        // Progress % histogram (5 buckets of 20%)
        const progressBuckets = [0, 0, 0, 0, 0]
        const progressLabels = ['0–19%', '20–39%', '40–59%', '60–79%', '80–100%']
        for (const r of list) {
            const p = Math.min(100, Math.max(0, Number(r.progress_percentage) || 0))
            const idx = Math.min(4, Math.floor(p / 20))
            progressBuckets[idx] += 1
        }

        // Monthly watch time (last 12 months, local)
        const monthlyLabels = []
        const monthlyValues = []
        const nowDate = new Date()
        for (let i = 11; i >= 0; i--) {
            const d = new Date(nowDate.getFullYear(), nowDate.getMonth() - i, 1)
            const y = d.getFullYear()
            const m = d.getMonth()
            const start = new Date(y, m, 1, 0, 0, 0, 0)
            const end = new Date(y, m + 1, 0, 23, 59, 59, 999)
            monthlyLabels.push(`${y}-${String(m + 1).padStart(2, '0')}`)
            let sum = 0
            for (const r of list) {
                const t = new Date(r.updated_at)
                if (t >= start && t <= end) sum += r.playback_time || 0
            }
            monthlyValues.push(sum)
        }

        // Daily heatmap: last 42 days (6 rows × 7 cols), row-major Mon→Sun weeks
        const heatmapCols = 7
        const heatmapRows = 6
        const heatmapDays = heatmapCols * heatmapRows
        const daySeconds = new Map()
        for (const r of list) {
            const k = dateKeyLocal(new Date(r.updated_at))
            daySeconds.set(k, (daySeconds.get(k) || 0) + (r.playback_time || 0))
        }
        const heatmapLabels = []
        const heatmapValues = []
        const heatmapMax = { start: null, end: null }
        for (let i = heatmapDays - 1; i >= 0; i--) {
            const d = new Date()
            d.setHours(0, 0, 0, 0)
            d.setDate(d.getDate() - i)
            const k = dateKeyLocal(d)
            heatmapLabels.push(k.slice(5))
            heatmapValues.push(daySeconds.get(k) || 0)
            if (!heatmapMax.start) heatmapMax.start = k
            heatmapMax.end = k
        }
        const heatmapPeak = heatmapValues.length ? Math.max(...heatmapValues, 1) : 1

        const epLabels = ['1–6', '7–12', '13–24', '25–48', '49+']
        const epBuckets = [0, 0, 0, 0, 0]
        for (const r of list) {
            const n = parseEp(r.episode_number)
            let b = 4
            if (n <= 6) b = 0
            else if (n <= 12) b = 1
            else if (n <= 24) b = 2
            else if (n <= 48) b = 3
            epBuckets[b] += r.playback_time || 0
        }

        // Lifetime top tags by watch time
        const tagSeconds = new Map()
        if (refIds.length) {
            const { data: tagMeta } = await client.from('anime_meta').select('source_id, tags').in('source_id', refIds)
            const tagsByRef = new Map()
            for (const m of tagMeta || []) {
                const arr = Array.isArray(m.tags) ? m.tags.map((t) => String(t).trim()).filter(Boolean) : []
                tagsByRef.set(m.source_id, arr)
            }
            for (const r of list) {
                const tags = tagsByRef.get(r.anime_ref_id) || []
                const sec = r.playback_time || 0
                if (!tags.length) continue
                for (const tag of tags) {
                    tagSeconds.set(tag, (tagSeconds.get(tag) || 0) + sec / tags.length)
                }
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
                firstWatchAt,
                lastWatchAt,
            },
            watchByHour: {
                labels: [...Array(24)].map((_, i) => `${String(i).padStart(2, '0')}:00`),
                values: hourTotals,
            },
            watchByWeekday: { labels: weekdayLabels, values: weekdayTotals },
            topAnimeByTime,
            topStudios,
            progressHistogram: { labels: progressLabels, values: progressBuckets },
            monthlyWatch: { labels: monthlyLabels, values: monthlyValues },
            heatmap42: {
                labels: heatmapLabels,
                values: heatmapValues,
                peak: heatmapPeak,
                rows: heatmapRows,
                cols: heatmapCols,
                rangeStart: heatmapMax.start,
                rangeEnd: heatmapMax.end,
            },
            episodeBuckets: { labels: epLabels, values: epBuckets },
            topTagsByTime,
        }
    } catch (err) {
        console.error('Profile analytics error:', err)
        throw createError({ statusCode: 500, statusMessage: 'Failed to load profile analytics' })
    }
})
