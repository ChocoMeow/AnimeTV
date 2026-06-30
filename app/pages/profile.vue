<script setup>
const appConfig = useAppConfig()
const user = useSupabaseUser()

const loading = ref(true)
const analytics = ref(null)
const statsPeriod = ref('month')
const periodOptions = [
    { value: 'week', label: '週' },
    { value: 'month', label: '月' },
    { value: 'year', label: '年' },
]
const chartData = ref({
    timeSpent: { labels: [], values: [] },
    genreDistribution: [],
    topAnimeByTime: [],
    topStudios: [],
    period: 'month',
})
const chartLoading = ref(false)

const displayName = computed(() => user.value?.user_metadata?.name || user.value?.user_metadata?.full_name || '使用者')
const email = computed(() => user.value?.email || '')
const avatarUrl = computed(() => user.value?.user_metadata?.avatar_url || user.value?.user_metadata?.picture || null)
const initials = computed(() => (displayName.value || '?').trim().slice(0, 2).toUpperCase())

const monthlyCumulative = computed(() => {
    const vals = analytics.value?.monthlyWatch?.values
    if (!vals?.length) return []
    let sum = 0
    return vals.map((v) => { sum += v; return sum })
})

const monthlyCumulativeMax = computed(() => {
    const arr = monthlyCumulative.value
    return arr.length ? Math.max(...arr, 1) : 1
})

const tagBarMax = computed(() => {
    const t = analytics.value?.topTagsByTime
    return t?.length ? Math.max(...t.map((x) => x.seconds), 1) : 1
})

const periodStudioMax = computed(() => {
    const t = chartData.value?.topStudios
    return t?.length ? Math.max(...t.map((x) => x.seconds), 1) : 1
})

function formatDuration(seconds) {
    if (!seconds || seconds < 60) return `${seconds || 0} 秒`
    const m = Math.floor(seconds / 60)
    const h = Math.floor(m / 60)
    const mins = m % 60
    if (h > 0) return `${h} 小時 ${mins} 分鐘`
    return `${mins} 分鐘`
}

function barHeight(values, val, pxMax) {
    const max = Math.max(1, ...values.map((x) => x || 0))
    return Math.max(4, ((val || 0) / max) * pxMax)
}

function heatmapIntensity(val, peak) {
    const p = peak > 0 ? (val || 0) / peak : 0
    const a = 0.08 + p * 0.92
    return `rgba(99, 102, 241, ${a})`
}

function heatmapTitle(index) {
    const h = analytics.value?.heatmap42
    if (!h?.labels?.[index]) return ''
    const v = h.values[index] || 0
    return `${h.labels[index]}：${formatDuration(v)}`
}

async function fetchAnalytics() {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    const data = await $fetch('/api/profile/analytics', { query: { tz } })
    analytics.value = data
}

async function fetchChartData() {
    chartLoading.value = true
    try {
        const data = await $fetch('/api/profile/stats', { query: { period: statsPeriod.value } })
        chartData.value = {
            timeSpent: data.timeSpent || { labels: [], values: [] },
            genreDistribution: data.genreDistribution || [],
            topAnimeByTime: data.topAnimeByTime || [],
            topStudios: data.topStudios || [],
            period: data.period || statsPeriod.value,
        }
    } catch (err) {
        console.error('Failed to fetch chart data:', err)
        chartData.value = { timeSpent: { labels: [], values: [] }, genreDistribution: [], topAnimeByTime: [], topStudios: [], period: statsPeriod.value }
    } finally {
        chartLoading.value = false
    }
}

onMounted(async () => {
    loading.value = true
    try {
        await Promise.all([fetchAnalytics(), fetchChartData()])
    } catch (e) {
        console.error(e)
    } finally {
        loading.value = false
    }
})

watch(statsPeriod, () => { fetchChartData() })

useHead({ title: `個人資料 | ${appConfig.siteName}` })
</script>

<template>
    <div class="max-w-7xl mx-auto px-4 py-6">

        <!-- Page header -->
        <div class="mb-6">
            <h1 class="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">個人資料</h1>
            <p class="text-gray-600 dark:text-gray-400">觀看統計、習慣與趨勢</p>
        </div>

        <!-- Loading -->
        <div v-if="loading" class="flex items-center justify-center py-20">
            <div class="animate-spin rounded-full h-12 w-12 border-4 border-gray-600 border-t-transparent"></div>
        </div>

        <div v-else-if="analytics" class="space-y-6">

            <!-- ── 1. ACCOUNT STRIP ── -->
            <div class="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between p-5 rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-950/5 dark:bg-white/10">
                <div class="flex flex-col sm:flex-row gap-4 items-start sm:items-center min-w-0 flex-1">
                    <div class="shrink-0">
                        <NuxtImg
                            v-if="avatarUrl"
                            :src="avatarUrl"
                            :alt="displayName"
                            class="w-16 h-16 rounded-xl object-cover border border-gray-200 dark:border-gray-600"
                            loading="lazy"
                        />
                        <div v-else class="w-16 h-16 rounded-xl bg-indigo-600 flex items-center justify-center text-white text-lg font-bold border border-indigo-500/50">
                            {{ initials }}
                        </div>
                    </div>
                    <div class="min-w-0 flex-1">
                        <p class="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">{{ displayName }}</p>
                        <p v-if="email" class="text-sm text-gray-600 dark:text-gray-400 truncate">{{ email }}</p>
                        <div v-if="analytics.summary.firstWatchAt" class="flex flex-wrap gap-x-4 mt-1">
                            <span class="text-xs text-gray-500 dark:text-gray-500">
                                最早紀錄 {{ new Date(analytics.summary.firstWatchAt).toLocaleDateString() }}
                            </span>
                            <span v-if="analytics.summary.lastWatchAt" class="text-xs text-gray-500 dark:text-gray-500">
                                最近紀錄 {{ new Date(analytics.summary.lastWatchAt).toLocaleDateString() }}
                            </span>
                        </div>
                    </div>
                </div>
                <NuxtLink
                    to="/settings"
                    class="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 hover:opacity-90 shrink-0 w-full sm:w-auto justify-center"
                >
                    <span class="material-symbols-rounded text-lg">settings</span>
                    帳號設定
                </NuxtLink>
            </div>

            <!-- ── 2. KEY STATS ── -->
            <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
                <div class="col-span-2 sm:col-span-1 lg:col-span-2 bg-gray-950/5 dark:bg-white/10 rounded-xl border border-gray-200 dark:border-gray-700 p-4 sm:p-5">
                    <p class="text-xs text-gray-500 dark:text-gray-400 mb-1">累積觀看時間</p>
                    <p class="text-lg sm:text-xl font-semibold text-gray-900 dark:text-gray-100">{{ formatDuration(analytics.summary.totalWatchSeconds) }}</p>
                </div>
                <div class="bg-gray-950/5 dark:bg-white/10 rounded-xl border border-gray-200 dark:border-gray-700 p-4 sm:p-5">
                    <p class="text-xs text-gray-500 dark:text-gray-400 mb-1">觀看集數</p>
                    <p class="text-lg sm:text-xl font-semibold text-gray-900 dark:text-gray-100">{{ analytics.summary.episodeRows.toLocaleString() }}</p>
                </div>
                <div class="bg-gray-950/5 dark:bg-white/10 rounded-xl border border-gray-200 dark:border-gray-700 p-4 sm:p-5">
                    <p class="text-xs text-gray-500 dark:text-gray-400 mb-1">觀看作品數</p>
                    <p class="text-lg sm:text-xl font-semibold text-gray-900 dark:text-gray-100">{{ analytics.summary.uniqueAnimeCount }}</p>
                </div>
                <div class="bg-gray-950/5 dark:bg-white/10 rounded-xl border border-gray-200 dark:border-gray-700 p-4 sm:p-5">
                    <p class="text-xs text-gray-500 dark:text-gray-400 mb-1">集均完成度</p>
                    <p class="text-lg sm:text-xl font-semibold text-gray-900 dark:text-gray-100">{{ analytics.summary.averageProgressPercent }}%</p>
                </div>
                <div class="bg-gray-950/5 dark:bg-white/10 rounded-xl border border-gray-200 dark:border-gray-700 p-4 sm:p-5">
                    <p class="text-xs text-gray-500 dark:text-gray-400 mb-1">最長 / 目前連續</p>
                    <p class="text-lg sm:text-xl font-semibold text-gray-900 dark:text-gray-100">
                        {{ analytics.summary.longestStreakDays }}
                        <span class="text-sm font-normal text-gray-500 dark:text-gray-400"> / {{ analytics.summary.currentStreakDays }} 天</span>
                    </p>
                </div>
            </div>

            <!-- ── 3. ACTIVITY OVER TIME ── -->
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">

                <!-- Monthly watch time -->
                <div class="lg:col-span-2 bg-gray-950/5 dark:bg-white/10 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
                    <div class="flex items-center gap-3 mb-1">
                        <span class="material-symbols-rounded text-gray-600 dark:text-gray-400">bar_chart</span>
                        <h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100">近 12 個月</h2>
                    </div>
                    <p class="text-sm text-gray-500 dark:text-gray-400 mb-5">每月累積觀看時間</p>
                    <div v-if="analytics.monthlyWatch.values.some(v => v > 0)">
                        <div class="flex items-end gap-1 sm:gap-1.5 h-40">
                            <div
                                v-for="(val, i) in analytics.monthlyWatch.values"
                                :key="i"
                                class="flex-1 min-w-0 flex flex-col items-center justify-end gap-1"
                            >
                                <div
                                    class="w-full rounded-t bg-sky-500/70 dark:bg-sky-400/80 hover:bg-sky-500 dark:hover:bg-sky-300 min-h-[4px] transition-colors cursor-pointer"
                                    :style="{ height: barHeight(analytics.monthlyWatch.values, val, 140) + 'px' }"
                                    :title="analytics.monthlyWatch.labels[i] + ': ' + formatDuration(val)"
                                />
                                <span class="text-[9px] sm:text-[10px] text-gray-500 dark:text-gray-400 truncate w-full text-center">{{ analytics.monthlyWatch.labels[i].slice(5) }}月</span>
                            </div>
                        </div>
                        <div class="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                            <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">累積觀看時間</p>
                            <div class="flex items-end gap-1 sm:gap-1.5 h-24 opacity-90">
                                <div
                                    v-for="(val, i) in monthlyCumulative"
                                    :key="'c-' + i"
                                    class="flex-1 min-w-0 flex flex-col items-center justify-end"
                                >
                                    <div
                                        class="w-full rounded-t bg-indigo-400/50 dark:bg-indigo-300/40 hover:bg-indigo-500/70 dark:hover:bg-indigo-300/70 min-h-[3px] transition-colors cursor-pointer"
                                        :style="{ height: Math.max(3, (val / monthlyCumulativeMax) * 80) + 'px' }"
                                        :title="'累積至 ' + analytics.monthlyWatch.labels[i] + ': ' + formatDuration(val)"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                    <p v-else class="text-sm text-gray-500 dark:text-gray-400">尚無資料</p>
                </div>

                <!-- Compact 42-day heatmap -->
                <div class="bg-gray-950/5 dark:bg-white/10 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
                    <div class="flex items-center gap-3 mb-1">
                        <span class="material-symbols-rounded text-gray-600 dark:text-gray-400">calendar_month</span>
                        <h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100">近 42 天</h2>
                    </div>
                    <p class="text-sm text-gray-500 dark:text-gray-400 mb-5">每日觀看時間熱圖</p>
                    <div class="grid gap-1 mb-1" style="grid-template-columns: repeat(7, minmax(0, 1fr))">
                        <span v-for="d in ['一','二','三','四','五','六','日']" :key="d" class="text-[9px] text-gray-500 dark:text-gray-400 text-center">{{ d }}</span>
                    </div>
                    <div class="grid gap-1" style="grid-template-columns: repeat(7, minmax(0, 1fr))">
                        <div
                            v-for="(val, i) in analytics.heatmap42.values"
                            :key="i"
                            class="aspect-square rounded-sm border border-gray-200/60 dark:border-gray-600/60 cursor-default hover:ring-2 hover:ring-indigo-400 dark:hover:ring-indigo-300 hover:ring-offset-1 transition-all"
                            :style="{ background: heatmapIntensity(val, analytics.heatmap42.peak) }"
                            :title="heatmapTitle(i)"
                        />
                    </div>
                    <div class="flex items-center gap-2 mt-4">
                        <span class="text-xs text-gray-500 dark:text-gray-400">少</span>
                        <div class="flex gap-0.5">
                            <div v-for="a in [0.08, 0.3, 0.55, 0.75, 1.0]" :key="a" class="w-3 h-3 rounded-sm" :style="{ background: `rgba(99,102,241,${a})` }" />
                        </div>
                        <span class="text-xs text-gray-500 dark:text-gray-400">多</span>
                    </div>
                </div>
            </div>

            <!-- ── 4. VIEWING HABITS ── -->
            <div class="bg-gray-950/5 dark:bg-white/10 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
                <div class="flex items-center justify-between mb-1 flex-wrap gap-3">
                    <div class="flex items-center gap-3">
                        <span class="material-symbols-rounded text-gray-600 dark:text-gray-400">schedule</span>
                        <h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100">累積觀看習慣</h2>
                    </div>
                    <div class="flex gap-4 text-sm text-gray-500 dark:text-gray-400">
                        <span v-if="analytics.summary.peakHourLabel">
                            最常時段 <strong class="text-gray-700 dark:text-gray-300 font-medium">{{ analytics.summary.peakHourLabel }}</strong>
                        </span>
                        <span v-if="analytics.summary.favoriteWeekdayLabel">
                            最常星期 <strong class="text-gray-700 dark:text-gray-300 font-medium">{{ analytics.summary.favoriteWeekdayLabel }}</strong>
                        </span>
                    </div>
                </div>
                <p class="text-sm text-gray-500 dark:text-gray-400 mb-6">依全部紀錄的觀看時間加總</p>
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div>
                        <h3 class="text-sm font-medium text-gray-600 dark:text-gray-400 mb-3">依時段（0–23時）</h3>
                        <div v-if="analytics.watchByHour.values.some(v => v > 0)" class="flex items-end gap-0.5 h-32">
                            <div
                                v-for="(val, i) in analytics.watchByHour.values"
                                :key="i"
                                class="flex-1 min-w-0 flex flex-col items-center justify-end"
                            >
                                <div
                                    class="w-full bg-gray-400/80 dark:bg-gray-500/80 hover:bg-gray-600 dark:hover:bg-gray-300 rounded-t min-h-[2px] transition-colors cursor-pointer"
                                    :style="{ height: Math.max(2, (val / Math.max(1, ...analytics.watchByHour.values)) * 100) + 'px' }"
                                    :title="`${i}:00 — ${formatDuration(val)}`"
                                />
                            </div>
                        </div>
                        <div v-if="analytics.watchByHour.values.some(v => v > 0)" class="flex justify-between mt-1">
                            <span class="text-[10px] text-gray-500 dark:text-gray-400">0時</span>
                            <span class="text-[10px] text-gray-500 dark:text-gray-400">12時</span>
                            <span class="text-[10px] text-gray-500 dark:text-gray-400">23時</span>
                        </div>
                        <p v-else class="text-sm text-gray-500 dark:text-gray-400 py-4">尚無資料</p>
                    </div>
                    <div>
                        <h3 class="text-sm font-medium text-gray-600 dark:text-gray-400 mb-3">依星期</h3>
                        <div v-if="analytics.watchByWeekday.values.some(v => v > 0)" class="flex items-end gap-1 sm:gap-2 h-32">
                            <div
                                v-for="(val, i) in analytics.watchByWeekday.values"
                                :key="i"
                                class="flex-1 flex flex-col items-center justify-end"
                            >
                                <div
                                    class="w-full bg-gray-500/80 dark:bg-gray-400/80 hover:bg-gray-700 dark:hover:bg-gray-200 rounded-t min-h-[4px] transition-colors cursor-pointer"
                                    :style="{ height: Math.max(4, (val / Math.max(1, ...analytics.watchByWeekday.values)) * 100) + 'px' }"
                                    :title="`${analytics.watchByWeekday.labels[i]}: ${formatDuration(val)}`"
                                />
                            </div>
                        </div>
                        <div v-if="analytics.watchByWeekday.values.some(v => v > 0)" class="flex gap-1 sm:gap-2 mt-1">
                            <span
                                v-for="(label, i) in analytics.watchByWeekday.labels"
                                :key="i"
                                class="flex-1 text-[10px] text-gray-500 dark:text-gray-400 text-center leading-tight"
                            >{{ label.replace('週', '') }}</span>
                        </div>
                        <p v-else class="text-sm text-gray-500 dark:text-gray-400 py-4">尚無資料</p>
                    </div>
                </div>
            </div>

            <!-- ── 5. ALL-TIME CONTENT DNA ── -->
            <div class="bg-gray-950/5 dark:bg-white/10 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-8">
                <div class="flex items-center gap-3">
                    <span class="material-symbols-rounded text-gray-600 dark:text-gray-400">favorite</span>
                    <h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100">全時期喜好</h2>
                </div>

                <!-- Top tags (bar chart) -->
                <div>
                    <h3 class="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">最多觀看標籤</h3>
                    <p class="text-xs text-gray-500 dark:text-gray-400 mb-3">依作品標籤分攤該集觀看時間（多標籤均分）</p>
                    <div v-if="analytics.topTagsByTime.length" class="space-y-2">
                        <div v-for="t in analytics.topTagsByTime" :key="t.label" class="flex items-center gap-3">
                            <span class="text-sm text-gray-700 dark:text-gray-300 w-24 sm:w-32 truncate" :title="t.label">{{ t.label }}</span>
                            <div class="flex-1 h-6 bg-gray-200 dark:bg-gray-700 rounded overflow-hidden">
                                <div class="h-full rounded bg-teal-500/70 dark:bg-teal-400/80 hover:bg-teal-500 dark:hover:bg-teal-300 transition-all cursor-pointer" :style="{ width: (t.seconds / tagBarMax) * 100 + '%' }" />
                            </div>
                            <span class="text-xs text-gray-500 w-20 text-right shrink-0">{{ formatDuration(t.seconds) }}</span>
                        </div>
                    </div>
                    <p v-else class="text-sm text-gray-500 dark:text-gray-400">尚無標籤資料</p>
                </div>

                <!-- Top anime + Top studios side by side -->
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2 border-t border-gray-200 dark:border-gray-700">
                    <!-- Top anime (lifetime) — with cover art -->
                    <div>
                        <h3 class="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">累積觀看時間最多</h3>
                        <p class="text-xs text-gray-500 dark:text-gray-400 mb-4">全部紀錄加總</p>
                        <ul v-if="analytics.topAnimeByTime.length" class="space-y-3">
                            <li v-for="(a, idx) in analytics.topAnimeByTime" :key="a.anime_ref_id" class="flex items-center gap-3">
                                <span class="text-xs font-bold text-gray-400 w-5">{{ idx + 1 }}</span>
                                <NuxtLink :to="`/anime/${a.anime_ref_id}`" class="flex items-center gap-3 min-w-0 flex-1 group">
                                    <div class="w-10 h-14 rounded overflow-hidden bg-gray-200 dark:bg-gray-700 flex-shrink-0">
                                        <NuxtImg v-if="a.anime_image" :src="a.anime_image" class="w-full h-full object-cover" alt="" />
                                    </div>
                                    <div class="min-w-0 flex-1">
                                        <p class="text-sm font-medium text-gray-900 dark:text-gray-100 truncate group-hover:underline">{{ a.anime_title }}</p>
                                        <p class="text-xs text-gray-500">{{ formatDuration(a.seconds) }}</p>
                                    </div>
                                </NuxtLink>
                            </li>
                        </ul>
                        <p v-else class="text-sm text-gray-500 dark:text-gray-400">尚無足夠紀錄</p>
                    </div>

                    <!-- Top studios (lifetime) — thin progress bars, visually distinct from period bar chart -->
                    <div>
                        <h3 class="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">製作公司（累積時間）</h3>
                        <p class="text-xs text-gray-500 dark:text-gray-400 mb-4">依觀看時間加總</p>
                        <ul v-if="analytics.topStudios.length" class="space-y-3">
                            <li v-for="s in analytics.topStudios" :key="s.label">
                                <div class="flex items-center justify-between gap-2 mb-1">
                                    <span class="text-sm text-gray-800 dark:text-gray-200 truncate">{{ s.label }}</span>
                                    <span class="text-xs text-gray-500 shrink-0">{{ formatDuration(s.seconds) }}</span>
                                </div>
                                <div class="h-1.5 bg-gray-200 dark:bg-gray-700 rounded overflow-hidden">
                                    <div
                                        class="h-full bg-amber-600/70 dark:bg-amber-400/80 hover:bg-amber-500 dark:hover:bg-amber-300 rounded transition-all cursor-pointer"
                                        :style="{ width: (s.seconds / analytics.topStudios[0].seconds) * 100 + '%' }"
                                    />
                                </div>
                            </li>
                        </ul>
                        <p v-else class="text-sm text-gray-500 dark:text-gray-400">尚無製作公司資料</p>
                    </div>
                </div>

                <!-- Deep watch callout -->
                <div class="pt-2 border-t border-gray-200 dark:border-gray-700">
                    <p class="text-xs text-gray-500 dark:text-gray-400 mb-1">至少一集看到結尾附近（≥95%）的作品</p>
                    <p class="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        {{ analytics.summary.deepWatchedAnimeCount }}
                        <span class="text-sm font-normal text-gray-500 dark:text-gray-400"> / {{ analytics.summary.uniqueAnimeCount }} 部</span>
                    </p>
                </div>
            </div>

            <!-- ── 6. PERIOD TRENDS ── -->
            <div class="bg-gray-950/5 dark:bg-white/10 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-1">
                    <div class="flex items-center gap-3">
                        <span class="material-symbols-rounded text-gray-600 dark:text-gray-400">insights</span>
                        <h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100">區間趨勢</h2>
                    </div>
                    <div class="flex flex-wrap gap-2">
                        <button
                            v-for="opt in periodOptions"
                            :key="opt.value"
                            type="button"
                            @click="statsPeriod = opt.value"
                            :class="[
                                'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                                statsPeriod === opt.value
                                    ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900'
                                    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-600',
                            ]"
                        >
                            {{ opt.label }}
                        </button>
                    </div>
                </div>
                <p class="text-sm text-gray-500 dark:text-gray-400 mb-6">選定時間範圍內的觀看分布</p>

                <div v-if="chartLoading" class="flex justify-center py-12">
                    <div class="animate-spin rounded-full h-10 w-10 border-2 border-gray-400 border-t-transparent"></div>
                </div>

                <div v-else class="space-y-8">
                    <!-- Time spent bars -->
                    <div>
                        <h3 class="text-sm font-medium text-gray-600 dark:text-gray-400 mb-3 flex items-center gap-2">
                            <span class="material-symbols-rounded text-lg">schedule</span>
                            區間內觀看時間
                        </h3>
                        <div v-if="chartData.timeSpent.values.some(v => v > 0)">
                            <div class="flex items-end gap-0.5 sm:gap-1 h-36" role="img" aria-label="Bar chart: watch time by period">
                                <div
                                    v-for="(val, i) in chartData.timeSpent.values"
                                    :key="i"
                                    class="flex-1 min-w-0 flex flex-col items-center justify-end gap-1"
                                >
                                    <div
                                        class="w-full bg-gray-400 dark:bg-gray-500 hover:bg-gray-600 dark:hover:bg-gray-300 rounded-t transition-all min-h-[4px] cursor-pointer"
                                        :style="{ height: Math.max(4, (Math.max(0, val) / Math.max(1, ...chartData.timeSpent.values)) * 120) + 'px' }"
                                        :title="chartData.timeSpent.labels[i] + ': ' + formatDuration(val)"
                                    />
                                    <span class="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 truncate w-full text-center">{{ chartData.timeSpent.labels[i] }}</span>
                                </div>
                            </div>
                            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">
                                期間合計 {{ formatDuration(chartData.timeSpent.values.reduce((a, b) => a + b, 0)) }}
                            </p>
                        </div>
                        <p v-else class="text-sm text-gray-500 dark:text-gray-400 py-4">此區間尚無觀看紀錄</p>
                    </div>

                    <!-- Genre + Top anime in period (2 col) -->
                    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <div>
                            <h3 class="text-sm font-medium text-gray-600 dark:text-gray-400 mb-3 flex items-center gap-2">
                                <span class="material-symbols-rounded text-lg">category</span>
                                區間內標籤（依觀看作品數）
                            </h3>
                            <div v-if="chartData.genreDistribution.length" class="space-y-2">
                                <div v-for="item in chartData.genreDistribution.slice(0, 8)" :key="item.label" class="flex items-center gap-3">
                                    <span class="text-sm text-gray-700 dark:text-gray-300 w-24 sm:w-28 truncate" :title="item.label">{{ item.label }}</span>
                                    <div class="flex-1 h-6 bg-gray-200 dark:bg-gray-700 rounded overflow-hidden">
                                        <div
                                            class="h-full bg-gray-600 dark:bg-gray-400 hover:bg-gray-800 dark:hover:bg-gray-200 rounded transition-all cursor-pointer"
                                            :style="{ width: (item.value / chartData.genreDistribution.reduce((s, g) => s + g.value, 0)) * 100 + '%' }"
                                        />
                                    </div>
                                    <span class="text-xs text-gray-500 dark:text-gray-400 w-12 text-right shrink-0">
                                        {{ Math.round((item.value / chartData.genreDistribution.reduce((s, g) => s + g.value, 0)) * 100) }}%
                                    </span>
                                </div>
                            </div>
                            <p v-else class="text-sm text-gray-500 dark:text-gray-400 py-4">此區間尚無標籤資料</p>
                        </div>

                        <div>
                            <h3 class="text-sm font-medium text-gray-600 dark:text-gray-400 mb-3 flex items-center gap-2">
                                <span class="material-symbols-rounded text-lg">trending_up</span>
                                區間內觀看時間最多
                            </h3>
                            <ul v-if="chartData.topAnimeByTime.length" class="space-y-3">
                                <li v-for="(a, idx) in chartData.topAnimeByTime.slice(0, 6)" :key="String(a.anime_ref_id) + idx" class="flex items-center gap-3">
                                    <span class="text-xs font-bold text-gray-400 w-5">{{ idx + 1 }}</span>
                                    <NuxtLink :to="`/anime/${a.anime_ref_id}`" class="flex items-center gap-3 min-w-0 flex-1 group">
                                        <div class="w-10 h-14 rounded overflow-hidden bg-gray-200 dark:bg-gray-700 flex-shrink-0">
                                            <NuxtImg v-if="a.anime_image" :src="a.anime_image" class="w-full h-full object-cover" alt="" />
                                        </div>
                                        <div class="min-w-0 flex-1">
                                            <p class="text-sm font-medium text-gray-900 dark:text-gray-100 truncate group-hover:underline">{{ a.anime_title }}</p>
                                            <p class="text-xs text-gray-500">{{ formatDuration(a.seconds) }}</p>
                                        </div>
                                    </NuxtLink>
                                </li>
                            </ul>
                            <p v-else class="text-sm text-gray-500 dark:text-gray-400 py-4">此區間尚無紀錄</p>
                        </div>
                    </div>

                    <!-- Studios in period — vertical bar chart, distinct from lifetime thin bars above -->
                    <div v-if="chartData.topStudios.length">
                        <h3 class="text-sm font-medium text-gray-600 dark:text-gray-400 mb-3 flex items-center gap-2">
                            <span class="material-symbols-rounded text-lg">apartment</span>
                            區間內製作公司（觀看時間）
                        </h3>
                        <div class="flex items-end gap-1 sm:gap-2 h-28">
                            <div
                                v-for="s in chartData.topStudios.slice(0, 8)"
                                :key="s.label"
                                class="flex-1 flex flex-col items-center justify-end gap-1"
                            >
                                <div
                                    class="w-full bg-amber-600/70 dark:bg-amber-400/80 hover:bg-amber-500 dark:hover:bg-amber-300 rounded-t min-h-[4px] transition-colors cursor-pointer"
                                    :style="{ height: (s.seconds / periodStudioMax) * 96 + 'px' }"
                                    :title="s.label + ': ' + formatDuration(s.seconds)"
                                />
                                <span class="text-[9px] text-gray-500 dark:text-gray-400 truncate w-full text-center" :title="s.label">{{ s.label.slice(0, 4) }}</span>
                            </div>
                        </div>
                        <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">懸停長條查看完整名稱</p>
                    </div>
                </div>
            </div>

            <!-- ── 7. DEEP ANALYSIS ── -->
            <div class="bg-gray-950/5 dark:bg-white/10 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
                <div class="flex items-center gap-3 mb-1">
                    <span class="material-symbols-rounded text-gray-600 dark:text-gray-400">analytics</span>
                    <h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100">觀看行為分析</h2>
                </div>
                <p class="text-sm text-gray-500 dark:text-gray-400 mb-6">你的完成度習慣與跨集數偏好</p>
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div>
                        <h3 class="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">完成度分布（集數）</h3>
                        <p class="text-xs text-gray-500 dark:text-gray-400 mb-3">每集播放進度落在哪個百分比區間</p>
                        <div v-if="analytics.progressHistogram.values.some(v => v > 0)" class="flex items-end gap-2 h-36">
                            <div
                                v-for="(val, i) in analytics.progressHistogram.values"
                                :key="i"
                                class="flex-1 flex flex-col items-center justify-end gap-1"
                            >
                                <div
                                    class="w-full rounded-t bg-violet-500/70 dark:bg-violet-400/80 hover:bg-violet-500 dark:hover:bg-violet-300 min-h-[4px] transition-colors cursor-pointer"
                                    :style="{ height: barHeight(analytics.progressHistogram.values, val, 120) + 'px' }"
                                    :title="analytics.progressHistogram.labels[i] + ': ' + val + ' 筆'"
                                />
                                <span class="text-[10px] text-gray-500 text-center leading-tight">{{ analytics.progressHistogram.labels[i] }}</span>
                            </div>
                        </div>
                        <p v-else class="text-sm text-gray-500 dark:text-gray-400">尚無資料</p>
                    </div>
                    <div>
                        <h3 class="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">集數區間觀看時間</h3>
                        <p class="text-xs text-gray-500 dark:text-gray-400 mb-3">你花最多時間在哪個集數範圍</p>
                        <div v-if="analytics.episodeBuckets.values.some(v => v > 0)" class="flex items-end gap-2 h-36">
                            <div
                                v-for="(val, i) in analytics.episodeBuckets.values"
                                :key="i"
                                class="flex-1 flex flex-col items-center justify-end gap-1"
                            >
                                <div
                                    class="w-full rounded-t bg-fuchsia-500/70 dark:bg-fuchsia-400/80 hover:bg-fuchsia-500 dark:hover:bg-fuchsia-300 min-h-[4px] transition-colors cursor-pointer"
                                    :style="{ height: barHeight(analytics.episodeBuckets.values, val, 120) + 'px' }"
                                    :title="analytics.episodeBuckets.labels[i] + ': ' + formatDuration(val)"
                                />
                                <span class="text-[10px] text-gray-500 text-center leading-tight">第{{ analytics.episodeBuckets.labels[i] }}集</span>
                            </div>
                        </div>
                        <p v-else class="text-sm text-gray-500 dark:text-gray-400">尚無資料</p>
                    </div>
                </div>
            </div>

        </div>
    </div>
</template>