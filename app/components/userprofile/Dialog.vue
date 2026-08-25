<script setup>
const STATUS_MAP = {
    watching: { label: '在線中', dotClass: 'bg-emerald-500' },
    online: { label: '在線中', dotClass: 'bg-emerald-500' },
    idle: { label: '閒置中', dotClass: 'bg-amber-400' },
    offline: { label: '離線', dotClass: 'bg-gray-500' },
    invisible: { label: '離線', dotClass: 'bg-gray-500' },
}

const props = defineProps({
    modelValue: { type: Boolean, required: true },
    data: { type: Object, default: null },
})
const emit = defineEmits(['update:modelValue'])

const { isMobile } = useMobile()
const client = useSupabaseClient()
const { userSettings } = useUserSettings()

const friend = computed(() => props.data || {})
const userId = computed(() => friend.value.id || null)
const friendName = computed(() => friend.value.name || '好友')
const friendAvatar = computed(() => friend.value.avatar || '')

const loading = ref(true)
const error = ref(null)
const recentlyWatched = ref([])
const favorites = ref([])
const mutualFriends = ref([])
const stats = ref({ totalWatched: 0, totalFavorites: 0 })
const activityStatus = ref({ label: '離線', dotClass: 'bg-gray-500' })
const watchingNow = ref(null)
const bannerStyle = ref(null)

const tabsRef = ref(null)
const close = () => emit('update:modelValue', false)

function extractDominantColors(img) {
    try {
        const canvas = Object.assign(document.createElement('canvas'), { width: 64, height: 64 })
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, 64, 64)
        const data = ctx.getImageData(0, 0, 64, 64).data

        const counts = {}
        for (let i = 0; i < data.length; i += 12) {
            const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]]
            const brightness = (r + g + b) / 3
            if (a < 128 || brightness < 25 || brightness > 230) continue
            const bucket = `${r >> 5}-${g >> 5}-${b >> 5}`
            counts[bucket] = (counts[bucket] || 0) + 1
        }

        const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])
        if (!sorted.length) return null

        const toRgb = (bucket) => bucket.split('-').map((n) => (Number(n) << 5) + 16)
        const toHex = ([r, g, b]) => '#' + [r, g, b].map((x) => Math.round(x).toString(16).padStart(2, '0')).join('')

        const primary = toRgb(sorted[0][0])
        const secondary = sorted[1] ? toRgb(sorted[1][0]) : primary.map((v) => Math.min(255, v + 40))

        return { primary: toHex(primary), secondary: toHex(secondary) }
    } catch {
        return null
    }
}

function loadBannerFromAvatar(url) {
    if (!url || typeof window === 'undefined') {
        bannerStyle.value = null
        return
    }
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
        const colors = extractDominantColors(img)
        bannerStyle.value = colors
            ? { background: `linear-gradient(to right, ${colors.primary}, ${colors.secondary}, ${colors.primary})` }
            : null
    }
    img.onerror = () => { bannerStyle.value = null }
    img.src = url
}

function inferActivityStatus(lastActivityAt) {
    const minutesAgo = lastActivityAt ? (Date.now() - new Date(lastActivityAt)) / 60000 : Infinity
    if (minutesAgo <= 10) return { label: '在線中', dotClass: 'bg-emerald-500' }
    if (minutesAgo <= 60) return { label: '剛剛有活動', dotClass: 'bg-amber-400' }
    return { label: '離線', dotClass: 'bg-gray-500' }
}

async function fetchMutualIds(myId, theirRows, table, keyField) {
    if (!myId || myId === userId.value || !theirRows.length) return new Set()
    const { data } = await client.from(table).select(keyField).eq('user_id', myId)
    if (!data?.length) return new Set()
    const mine = new Set(data.map((row) => row[keyField]))
    return new Set(theirRows.filter((row) => mine.has(row[keyField])).map((row) => row[keyField]))
}

function resolveWatchingNow() {
    if (friend.value.status !== 'watching') return null

    if (friend.value.animeId && friend.value.currentAnime) {
        return {
            anime_ref_id: friend.value.animeId,
            anime_title: friend.value.currentAnime,
            anime_image: friend.value.animeBackground,
            episode_number: friend.value.currentEpisode,
        }
    }

    const [latest] = recentlyWatched.value
    return latest
        ? {
              anime_ref_id: latest.anime_ref_id,
              anime_title: latest.anime_title,
              anime_image: latest.anime_image,
              episode_number: latest.episode_number,
          }
        : null
}

async function load() {
    if (!userId.value) return
    loading.value = true
    error.value = null

    try {
        const [{ data: history }, { data: favs }, { count }, mutualRes] = await Promise.all([
            client
                .from('watch_history_latest_updates')
                .select('anime_ref_id, anime_title, anime_image, episode_number, updated_at, progress_percentage')
                .eq('user_id', userId.value)
                .order('updated_at', { ascending: false })
                .limit(24),
            client
                .from('favorites')
                .select('anime_ref_id, anime_title, anime_image, created_at')
                .eq('user_id', userId.value)
                .order('created_at', { ascending: false })
                .limit(24),
            client.from('watch_history').select('*', { count: 'exact', head: true }).eq('user_id', userId.value),
            client.rpc('get_mutual_friends', { p_friend_id: userId.value }).then((res) => {
                if (res.error) {
                    console.warn('get_mutual_friends:', res.error.message)
                    return { data: [] }
                }
                return res
            }),
        ])

        const historyRows = history || []
        const favRows = favs || []
        const myId = userSettings.value.id

        const [mutualWatchIds, mutualFavIds] = await Promise.all([
            fetchMutualIds(myId, historyRows, 'watch_history_latest_updates', 'anime_ref_id'),
            fetchMutualIds(myId, favRows, 'favorites', 'anime_ref_id'),
        ])

        recentlyWatched.value = historyRows.map((row) => ({ ...row, isMutual: mutualWatchIds.has(row.anime_ref_id) }))
        favorites.value = favRows.map((row) => ({ ...row, isMutual: mutualFavIds.has(row.anime_ref_id) }))
        mutualFriends.value = (mutualRes.data || []).map((row) => ({
            id: row.friend_user_id,
            name: row.friend_name,
            avatar: row.friend_avatar,
        }))

        stats.value = {
            totalWatched: count || 0,
            totalFavorites: favorites.value.length,
            mutualWatch: mutualWatchIds.size,
            mutualFav: mutualFavIds.size,
            mutualFriends: mutualFriends.value.length,
        }

        activityStatus.value = STATUS_MAP[friend.value.status] ?? inferActivityStatus(recentlyWatched.value[0]?.updated_at)
        watchingNow.value = resolveWatchingNow()
    } catch (err) {
        console.error(err)
        error.value = '載入個人資料失敗'
    } finally {
        loading.value = false
    }
}

watch(friendAvatar, loadBannerFromAvatar, { immediate: true })

watch(
    [() => friend.value.id, () => props.modelValue],
    async ([id, open]) => {
        if (!open || !id) return
        await load()
        tabsRef.value?.reset()
    },
    { immediate: true },
)
</script>

<template>
    <!-- Desktop -->
    <LazyBaseDialog
        v-if="!isMobile"
        :model-value="modelValue"
        max-width="max-w-4xl"
        :scrollable="true"
        :padding="false"
        :show-header="false"
        @update:model-value="emit('update:modelValue', $event)"
    >
        <div v-if="loading" class="relative bg-white dark:bg-gray-950 rounded-2xl overflow-hidden">
            <button type="button" class="absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors" @click="close">
                <span class="material-symbols-rounded text-xl">close</span>
            </button>
            <SkeletonUserProfile />
        </div>

        <div v-else-if="error" class="relative flex flex-col items-center justify-center py-12 px-6 text-center">
            <button type="button" class="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors" @click="close">
                <span class="material-symbols-rounded text-xl">close</span>
            </button>
            <div class="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
                <span class="material-symbols-rounded text-4xl text-red-500">error_outline</span>
            </div>
            <p class="text-red-600 dark:text-red-400">{{ error }}</p>
        </div>

        <div v-else class="bg-white dark:bg-gray-950 rounded-2xl overflow-hidden shadow-xl ring-1 ring-black/10 dark:ring-white/10">
            <div class="relative h-40" :class="!bannerStyle && 'bg-gradient-to-r from-slate-300 via-slate-400 to-slate-500 dark:from-slate-700 dark:via-slate-600 dark:to-slate-800'" :style="bannerStyle || undefined">
                <button type="button" class="absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center rounded-lg bg-black/30 hover:bg-black/50 text-white transition-colors" @click="close">
                    <span class="material-symbols-rounded text-xl">close</span>
                </button>
                <div class="absolute inset-0 opacity-40 mix-blend-soft-light bg-[radial-gradient(circle_at_top,_#ffffff33,_transparent_55%)]" />
                <div class="absolute -bottom-12 left-6">
                    <div class="relative">
                        <UserAvatar :src="friendAvatar" :name="friendName" :max-initials="2" rounded="rounded-2xl" class="w-24 h-24 text-3xl shadow-2xl shadow-black/20 dark:shadow-black/60" img-class="border-4 border-white dark:border-gray-950" />
                        <div class="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-white dark:bg-gray-950 flex items-center justify-center">
                            <div class="w-4 h-4 rounded-full border-2 border-white dark:border-gray-950" :class="activityStatus.dotClass" />
                        </div>
                    </div>
                </div>
            </div>

            <div class="pt-16 px-6 pb-6 space-y-5 text-gray-900 dark:text-gray-100">
                <div class="border-b border-black/5 dark:border-white/5 pb-4 flex flex-wrap items-end justify-between gap-3">
                    <div class="min-w-0">
                        <h2 class="text-2xl font-semibold truncate">{{ friendName }}</h2>
                        <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">動漫夥伴 · 一起追番吧</p>
                    </div>
                    <div class="flex flex-wrap justify-end gap-2 text-xs">
                        <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/5 dark:bg-white/5 ring-1 ring-black/10 dark:ring-white/10">
                            <span class="w-2 h-2 rounded-full" :class="activityStatus.dotClass" />
                            <span class="text-gray-700 dark:text-gray-200">{{ activityStatus.label }}</span>
                        </div>
                        <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/5 dark:bg-white/5 ring-1 ring-black/10 dark:ring-white/10">
                            <span class="material-symbols-rounded text-sm text-gray-500 dark:text-gray-400">movie</span>
                            <span class="text-gray-700 dark:text-gray-200">{{ stats.totalWatched }} 個觀看紀錄</span>
                        </div>
                        <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/5 dark:bg-white/5 ring-1 ring-black/10 dark:ring-white/10">
                            <span class="material-symbols-rounded text-sm text-rose-500">bookmark</span>
                            <span class="text-gray-700 dark:text-gray-200">{{ stats.totalFavorites }} 個收藏</span>
                        </div>
                    </div>
                </div>

                <div v-if="watchingNow" class="space-y-2">
                    <h3 class="text-xs font-semibold tracking-wide text-gray-500 dark:text-gray-400 uppercase">正在觀看</h3>
                    <NuxtLink :to="`/anime/${watchingNow.anime_ref_id}`" class="group relative flex items-center overflow-hidden rounded-xl h-16 ring-1 ring-black/5 dark:ring-white/5 hover:ring-emerald-500/40 transition-all" @click="close">
                        <div class="absolute inset-0 pointer-events-none" aria-hidden="true">
                            <NuxtImg :src="watchingNow.anime_image" alt="" class="w-full h-full object-cover scale-110 blur-md" loading="lazy" />
                            <div class="absolute inset-0 bg-gradient-to-r from-black/80 via-black/65 to-black/45" />
                        </div>
                        <div class="relative z-10 flex flex-1 items-center gap-3 min-w-0 px-4">
                            <span class="material-symbols-rounded text-emerald-400 text-xl shrink-0">play_circle</span>
                            <div class="flex-1 min-w-0">
                                <p class="text-sm font-semibold text-white truncate">{{ watchingNow.anime_title }}</p>
                                <p class="text-xs text-white/65 mt-0.5">第 {{ watchingNow.episode_number }} 集 · 正在觀看</p>
                            </div>
                            <span class="material-symbols-rounded text-white/50 group-hover:text-white/90 transition-colors shrink-0 pr-1">chevron_right</span>
                        </div>
                    </NuxtLink>
                </div>

                <UserprofileTabs ref="tabsRef" :mobile="false" :recently-watched="recentlyWatched" :favorites="favorites" :mutual-friends="mutualFriends" @select="close" />
            </div>
        </div>
    </LazyBaseDialog>

    <!-- Mobile -->
    <BaseBottomDrawer v-else :model-value="modelValue" max-height="max-h-[92vh]" @update:model-value="emit('update:modelValue', $event)">
        <template #header>
            <div class="flex items-center gap-3">
                <UserAvatar :src="friendAvatar" :name="friendName" :max-initials="2" rounded="rounded-2xl" class="w-12 h-12 shrink-0 text-lg" />
                <div class="flex-1 min-w-0">
                    <h2 class="text-lg font-semibold text-gray-900 dark:text-white truncate">{{ friendName }}</h2>
                    <div class="flex items-center gap-1.5 mt-0.5 w-full">
                        <span class="w-2 h-2 rounded-full flex-shrink-0" :class="activityStatus.dotClass" />
                        <span class="text-[11px] text-gray-500 dark:text-gray-400">{{ activityStatus.label }}</span>
                        <div class="flex gap-1.5 flex-shrink-0 ml-auto">
                            <div class="flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-100 dark:bg-white/5 text-[11px] text-gray-500 dark:text-gray-300">
                                <span class="material-symbols-rounded text-xs text-gray-400">movie</span>
                                {{ stats.totalWatched }}
                            </div>
                            <div class="flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-100 dark:bg-white/5 text-[11px] text-gray-500 dark:text-gray-300">
                                <span class="material-symbols-rounded text-xs text-rose-400">bookmark</span>
                                {{ stats.totalFavorites }}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </template>

        <SkeletonUserProfile v-if="loading" compact />

        <div v-else-if="error" class="flex flex-col items-center justify-center py-16 text-center gap-3">
            <span class="material-symbols-rounded text-3xl text-red-500 dark:text-red-400">error_outline</span>
            <p class="text-sm text-red-600 dark:text-red-400">{{ error }}</p>
        </div>

        <div v-else class="pb-4 space-y-4">
            <div v-if="watchingNow" class="space-y-2">
                <h3 class="text-xs font-semibold tracking-wide text-gray-500 dark:text-gray-400 uppercase">正在觀看</h3>
                <NuxtLink :to="`/anime/${watchingNow.anime_ref_id}`" class="group relative flex items-center overflow-hidden rounded-xl h-14 ring-1 ring-black/5 dark:ring-white/10 hover:ring-emerald-500/40 transition-all" @click="close">
                    <div class="absolute inset-0 pointer-events-none" aria-hidden="true">
                        <NuxtImg :src="watchingNow.anime_image" alt="" class="w-full h-full object-cover scale-110 blur-md" loading="lazy" />
                        <div class="absolute inset-0 bg-gradient-to-r from-black/80 via-black/65 to-black/45" />
                    </div>
                    <div class="relative z-10 flex flex-1 items-center gap-2.5 min-w-0 px-3">
                        <span class="material-symbols-rounded text-emerald-400 text-lg shrink-0">play_circle</span>
                        <div class="flex-1 min-w-0">
                            <p class="text-sm font-semibold text-white truncate">{{ watchingNow.anime_title }}</p>
                            <p class="text-[11px] text-white/65 mt-0.5">第 {{ watchingNow.episode_number }} 集 · 正在觀看</p>
                        </div>
                        <span class="material-symbols-rounded text-white/50 group-hover:text-white/90 transition-colors shrink-0 text-xl">chevron_right</span>
                    </div>
                </NuxtLink>
            </div>

            <div class="sticky top-0 z-[1] -mx-4 px-4 bg-white/90 dark:bg-gray-950/90 backdrop-blur-sm pt-1">
                <UserprofileTabs ref="tabsRef" :mobile="true" :recently-watched="recentlyWatched" :favorites="favorites" :mutual-friends="mutualFriends" @select="close" />
            </div>
        </div>
    </BaseBottomDrawer>
</template>
