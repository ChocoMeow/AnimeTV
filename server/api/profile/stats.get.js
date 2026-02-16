import { serverSupabaseClient } from '#supabase/server'

export default defineEventHandler(async (event) => {
    const user = await authUser(event)
    const client = await serverSupabaseClient(event)
    const query = getQuery(event)
    const period = (query.period || 'week').toLowerCase()
    const userId = user.id || user.sub

    const now = new Date()
    let rangeStart
    let bucketType // 'hour' | 'day' | 'month'
    let bucketCount
    let labelFormat

    switch (period) {
        case 'day':
            rangeStart = new Date(now)
            rangeStart.setHours(0, 0, 0, 0)
            bucketType = 'hour'
            bucketCount = 24
            labelFormat = (d) => `${String(d.getHours()).padStart(2, '0')}:00`
            break
        case 'week':
            rangeStart = new Date(now)
            rangeStart.setDate(rangeStart.getDate() - 6)
            rangeStart.setHours(0, 0, 0, 0)
            bucketType = 'day'
            bucketCount = 7
            labelFormat = (d) => `${d.getMonth() + 1}/${d.getDate()}`
            break
        case 'month':
            rangeStart = new Date(now)
            rangeStart.setDate(rangeStart.getDate() - 29)
            rangeStart.setHours(0, 0, 0, 0)
            bucketType = 'day'
            bucketCount = 30
            labelFormat = (d) => `${d.getMonth() + 1}/${d.getDate()}`
            break
        case 'year':
            rangeStart = new Date(now.getFullYear(), now.getMonth() - 11, 1, 0, 0, 0, 0)
            bucketType = 'month'
            bucketCount = 12
            labelFormat = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
            break
        default:
            rangeStart = new Date(now)
            rangeStart.setDate(rangeStart.getDate() - 6)
            rangeStart.setHours(0, 0, 0, 0)
            bucketType = 'day'
            bucketCount = 7
            labelFormat = (d) => `${d.getMonth() + 1}/${d.getDate()}`
    }

    const rangeStartIso = rangeStart.toISOString()
    const rangeEndIso = now.toISOString()

    try {
        const { data: historyRows, error: historyError } = await client
            .from('watch_history')
            .select('playback_time, updated_at, anime_ref_id')
            .eq('user_id', userId)
            .gte('updated_at', rangeStartIso)
            .lte('updated_at', rangeEndIso)

        if (historyError) throw historyError

        const timeSpentLabels = []
        const timeSpentValues = []
        const buckets = new Map()

        for (let i = 0; i < bucketCount; i++) {
            let key
            if (bucketType === 'hour') {
                const d = new Date(rangeStart)
                d.setHours(d.getHours() + i)
                key = d.toISOString().slice(0, 13)
                timeSpentLabels.push(labelFormat(d))
            } else if (bucketType === 'day') {
                const d = new Date(rangeStart)
                d.setDate(d.getDate() + i)
                key = d.toISOString().slice(0, 10)
                timeSpentLabels.push(labelFormat(d))
            } else {
                const d = new Date(rangeStart.getFullYear(), rangeStart.getMonth() + i, 1)
                key = d.toISOString().slice(0, 7)
                timeSpentLabels.push(labelFormat(d))
            }
            buckets.set(key, 0)
        }

        for (const row of historyRows || []) {
            const t = new Date(row.updated_at)
            let key
            if (bucketType === 'hour') {
                key = t.toISOString().slice(0, 13)
            } else if (bucketType === 'day') {
                key = t.toISOString().slice(0, 10)
            } else {
                key = t.toISOString().slice(0, 7)
            }
            if (buckets.has(key)) {
                buckets.set(key, buckets.get(key) + (row.playback_time || 0))
            }
        }

        for (let i = 0; i < bucketCount; i++) {
            const label = timeSpentLabels[i]
            let key
            if (bucketType === 'hour') {
                const d = new Date(rangeStart)
                d.setHours(d.getHours() + i)
                key = d.toISOString().slice(0, 13)
            } else if (bucketType === 'day') {
                const d = new Date(rangeStart)
                d.setDate(d.getDate() + i)
                key = d.toISOString().slice(0, 10)
            } else {
                const d = new Date(rangeStart.getFullYear(), rangeStart.getMonth() + i, 1)
                key = d.toISOString().slice(0, 7)
            }
            timeSpentValues.push(buckets.get(key) || 0)
        }

        const refIds = [...new Set((historyRows || []).map((r) => r.anime_ref_id).filter(Boolean))]
        let genreDistribution = []

        if (refIds.length > 0) {
            const { data: metaRows, error: metaError } = await client
                .from('anime_meta')
                .select('source_id, tags')
                .in('source_id', refIds)

            if (!metaError && metaRows?.length) {
                const tagCounts = new Map()
                for (const row of metaRows) {
                    const tags = row.tags
                    if (Array.isArray(tags)) {
                        for (const tag of tags) {
                            const t = String(tag).trim()
                            if (t) tagCounts.set(t, (tagCounts.get(t) || 0) + 1)
                        }
                    }
                }
                genreDistribution = [...tagCounts.entries()]
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5)
                    .map(([label, value]) => ({ label, value }))
            }
        }

        return {
            timeSpent: { labels: timeSpentLabels, values: timeSpentValues },
            genreDistribution,
            period,
        }
    } catch (err) {
        console.error('Profile stats error:', err)
        throw createError({ statusCode: 500, statusMessage: 'Failed to load profile stats' })
    }
})
