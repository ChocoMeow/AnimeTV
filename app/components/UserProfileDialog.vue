<script setup>
const props = defineProps({
    modelValue: { type: Boolean, required: true },
    data: { type: Object, default: null }
})

const emit = defineEmits(['update:modelValue'])
const { isMobile } = useMobile()
const { userSettings } = useUserSettings()
const client = useSupabaseClient()

const friend = computed(() => props.data || {})
const userId = computed(() => friend.value.id || null)
const friendName = computed(() => friend.value.name || '好友')
const friendAvatar = computed(() => friend.value.avatar || null)
const initials = computed(() =>
    (friendName.value || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
)

const profile = ref(null)
const recentlyWatched = ref([])
const favorites = ref([])
const mutualFavorites = ref([])
const mutualWatched = ref([])
const stats = ref({ totalWatched: 0, totalFavorites: 0 })
const loading = ref(true)
const error = ref(null)
const bannerStyle = ref(null)
const activityStatus = ref({ label: '離線', dotClass: 'bg-gray-500' })
const watchingNow = ref(null) // { anime_ref_id, anime_title, anime_image, episode_number } when status is watching

// --- Banner color extraction ---
function extractDominantColors(img) {
    try {
        const canvas = Object.assign(document.createElement('canvas'), { width: 64, height: 64 })
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, 64, 64)
        const data = ctx.getImageData(0, 0, 64, 64).data
        const counts = {}
        for (let i = 0; i < data.length; i += 12) {
            const [r, g, b, a] = [data[i], data[i+1], data[i+2], data[i+3]]
            const br = (r + g + b) / 3
            if (a < 128 || br < 25 || br > 230) continue
            const k = `${r >> 5}-${g >> 5}-${b >> 5}`
            counts[k] = (counts[k] || 0) + 1
        }
        const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])
        if (!sorted.length) return null
        const toRgb = k => k.split('-').map(n => (Number(n) << 5) + 16)
        const p = toRgb(sorted[0][0])
        const s = sorted[1] ? toRgb(sorted[1][0]) : p.map(v => Math.min(255, v + 40))
        const hex = ([r, g, b]) => '#' + [r, g, b].map(x => Math.round(x).toString(16).padStart(2, '0')).join('')
        return { p: hex(p), s: hex(s) }
    } catch { return null }
}

function loadBannerFromAvatar(url) {
    if (!url || typeof window === 'undefined') return (bannerStyle.value = null)
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
        const colors = extractDominantColors(img)
        bannerStyle.value = colors
            ? { background: `linear-gradient(to right, ${colors.p}, ${colors.s}, ${colors.p})` }
            : null
    }
    img.onerror = () => (bannerStyle.value = null)
    img.src = url
}

// Re-run whenever avatar URL or profile (loaded state) changes
watch([friendAvatar, profile], ([url]) => loadBannerFromAvatar(url), { immediate: true })

// --- Data fetching ---
async function fetchMutuals(myId, theirData, table, keyField) {
    if (!myId || myId === userId.value || !theirData.length) return []
    const { data } = await client.from(table).select(keyField).eq('user_id', myId)
    if (!data) return []
    const mySet = new Set(data.map(r => r[keyField]))
    return theirData.filter(r => mySet.has(r[keyField]))
}

async function fetchProfile() {
    if (!userId.value) return
    loading.value = true
    error.value = null
    try {
        profile.value = { id: userId.value }

        const [{ data: history }, { data: favs }, { count }] = await Promise.all([
            client.from('watch_history_latest_updates')
                .select('anime_ref_id, anime_title, anime_image, episode_number, updated_at, progress_percentage')
                .eq('user_id', userId.value).order('updated_at', { ascending: false }).limit(12),
            client.from('favorites')
                .select('anime_ref_id, anime_title, anime_image, created_at')
                .eq('user_id', userId.value).order('created_at', { ascending: false }).limit(12),
            client.from('watch_history').select('*', { count: 'exact', head: true }).eq('user_id', userId.value)
        ])

        recentlyWatched.value = history || []
        favorites.value = favs || []
        stats.value = { totalWatched: count || 0, totalFavorites: favorites.value.length }

        const myId = userSettings.value.id
        ;[mutualFavorites.value, mutualWatched.value] = await Promise.all([
            fetchMutuals(myId, favorites.value, 'favorites', 'anime_ref_id'),
            fetchMutuals(myId, recentlyWatched.value, 'watch_history_latest_updates', 'anime_ref_id')
        ])

        // Status and watching data come from passed data (openFriendProfile / get_friends_with_status)
        const friendStatus = friend.value.status
        const statusMap = {
            watching: { label: '在線中', dotClass: 'bg-emerald-500' },
            online: { label: '在線中', dotClass: 'bg-emerald-500' },
            idle: { label: '閒置中', dotClass: 'bg-amber-400' },
            offline: { label: '離線', dotClass: 'bg-gray-500' },
            invisible: { label: '離線', dotClass: 'bg-gray-500' },
        }
        if (friendStatus && statusMap[friendStatus]) {
            activityStatus.value = statusMap[friendStatus]
        } else {
            const last = recentlyWatched.value[0]
            const diff = last ? (Date.now() - new Date(last.updated_at)) / 60000 : Infinity
            activityStatus.value = diff <= 10
                ? { label: '在線中', dotClass: 'bg-emerald-500' }
                : diff <= 60
                    ? { label: '剛剛有活動', dotClass: 'bg-amber-400' }
                    : { label: '離線', dotClass: 'bg-gray-500' }
        }

        // Watching now: from passed friend data (animeId, currentAnime, etc.) or fallback to latest watch
        if (friendStatus === 'watching') {
            const fromFriend = friend.value.animeId && friend.value.currentAnime
            watchingNow.value = fromFriend
                ? { anime_ref_id: friend.value.animeId, anime_title: friend.value.currentAnime, anime_image: friend.value.animeBackground, episode_number: friend.value.currentEpisode }
                : recentlyWatched.value[0]
                    ? { anime_ref_id: recentlyWatched.value[0].anime_ref_id, anime_title: recentlyWatched.value[0].anime_title, anime_image: recentlyWatched.value[0].anime_image, episode_number: recentlyWatched.value[0].episode_number }
                    : null
        } else {
            watchingNow.value = null
        }

    } catch (err) {
        console.error(err)
        error.value = '載入個人資料失敗'
    } finally {
        loading.value = false
    }
}

watch([() => props.data, () => props.modelValue], ([, open]) => {
    if ((open || props.modelValue) && userId.value) fetchProfile()
}, { immediate: true, deep: true })

const close = () => emit('update:modelValue', false)

function formatDate(dateString) {
    const days = Math.ceil(Math.abs(Date.now() - new Date(dateString)) / 86400000)
    if (days === 0) return '今天'
    if (days === 1) return '昨天'
    if (days < 7) return `${days} 天前`
    if (days < 30) return `${Math.floor(days / 7)} 週前`
    return `${Math.floor(days / 30)} 個月前`
}
</script>

<template>
    <!-- ===================== DESKTOP DIALOG ===================== -->
    <BaseDialog
        v-if="!isMobile"
        :model-value="modelValue"
        @update:model-value="emit('update:modelValue', $event)"
        max-width="max-w-4xl"
        :scrollable="true"
        :padding="false"
        :show-header="false"
    >
        <!-- Loading -->
        <div v-if="loading" class="relative flex flex-col items-center justify-center py-12 px-6">
            <button type="button" @click="close" class="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors">
                <span class="material-icons text-xl">close</span>
            </button>
            <div class="inline-block w-10 h-10 border-4 border-gray-600 border-t-transparent rounded-full animate-spin mb-4" />
            <p class="text-gray-600 dark:text-gray-400">載入資料中...</p>
        </div>

        <!-- Error -->
        <div v-else-if="error" class="relative flex flex-col items-center justify-center py-12 px-6 text-center">
            <button type="button" @click="close" class="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors">
                <span class="material-icons text-xl">close</span>
            </button>
            <div class="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
                <span class="material-icons text-4xl text-red-500">error_outline</span>
            </div>
            <p class="text-red-600 dark:text-red-400">{{ error }}</p>
        </div>

        <!-- Profile -->
        <div v-else-if="profile" class="bg-[#101318] dark:bg-[#05070b] rounded-2xl overflow-hidden shadow-xl border border-white/5">
            <!-- Banner + Avatar -->
            <div
                class="relative h-40"
                :class="!bannerStyle && 'bg-gradient-to-r from-indigo-500 via-purple-500 to-sky-500'"
                :style="bannerStyle || undefined"
            >
                <button type="button" @click="close" class="absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center rounded-lg bg-black/30 hover:bg-black/50 text-white transition-colors">
                    <span class="material-icons text-xl">close</span>
                </button>
                <div class="absolute inset-0 opacity-40 mix-blend-soft-light bg-[radial-gradient(circle_at_top,_#ffffff33,_transparent_55%)]" />
                <div class="absolute -bottom-12 left-6">
                    <div class="relative">
                        <div v-if="friendAvatar" class="w-24 h-24 rounded-2xl border-4 border-[#101318] bg-gray-900 overflow-hidden shadow-2xl shadow-black/60">
                            <img :src="friendAvatar" :alt="friendName" class="w-full h-full object-cover" />
                        </div>
                        <div v-else class="w-24 h-24 rounded-2xl border-4 border-[#101318] bg-gradient-to-br from-slate-600 via-slate-800 to-slate-950 flex items-center justify-center text-white text-3xl font-bold shadow-2xl shadow-black/60">
                            {{ initials }}
                        </div>
                        <div class="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-[#101318] flex items-center justify-center">
                            <div class="w-4 h-4 rounded-full border-2 border-[#101318]" :class="activityStatus.dotClass" />
                        </div>
                    </div>
                </div>
            </div>

            <!-- Body -->
            <div class="pt-16 px-6 pb-6 grid grid-cols-1 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-6 text-gray-100">
                <!-- Left col -->
                <div class="space-y-6">
                    <!-- Name + stats pills -->
                    <div class="border-b border-white/5 pb-4">
                        <h2 class="text-2xl font-semibold truncate">{{ friendName }}</h2>
                        <p class="text-xs text-gray-400 mt-1">動漫夥伴 · 一起追番吧</p>
                        <div class="mt-3 flex flex-wrap gap-2 text-xs">
                            <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10">
                                <span class="w-2 h-2 rounded-full" :class="activityStatus.dotClass" />
                                <span class="text-gray-200">{{ activityStatus.label }}</span>
                            </div>
                            <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10">
                                <span class="material-icons text-sm text-indigo-300">movie</span>
                                <span class="text-gray-200">{{ stats.totalWatched }} 個觀看紀錄</span>
                            </div>
                            <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10">
                                <span class="material-icons text-sm text-pink-300">bookmark</span>
                                <span class="text-gray-200">{{ stats.totalFavorites }} 個收藏</span>
                            </div>
                        </div>
                    </div>

                    <!-- Watching Now (when friend is watching) -->
                    <div v-if="watchingNow" class="space-y-3">
                        <h3 class="text-xs font-semibold tracking-wide text-gray-400 uppercase">正在觀看</h3>
                        <NuxtLink
                            :to="`/anime/${watchingNow.anime_ref_id}`"
                            class="group flex gap-4 overflow-hidden rounded-xl bg-white/[0.02] border border-white/5 hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all"
                            @click="close"
                        >
                            <div class="w-24 sm:w-32 flex-shrink-0 aspect-[2/3] overflow-hidden rounded-lg">
                                <img
                                    :src="watchingNow.anime_image"
                                    :alt="watchingNow.anime_title"
                                    class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                />
                            </div>
                            <div class="flex-1 min-w-0 py-2 flex flex-col justify-center">
                                <p class="text-sm font-semibold text-gray-100 truncate">{{ watchingNow.anime_title }}</p>
                                <p class="text-xs text-gray-400 mt-0.5">第 {{ watchingNow.episode_number }} 集</p>
                                <div class="mt-2 inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 text-[11px] w-fit">
                                    <span class="material-icons text-sm">play_circle</span>
                                    正在觀看
                                </div>
                            </div>
                            <span class="material-icons text-gray-500 group-hover:text-gray-300 self-center pr-3">chevron_right</span>
                        </NuxtLink>
                    </div>

                    <!-- Recently Watched -->
                    <div class="space-y-3">
                        <div class="flex items-center justify-between">
                            <h3 class="text-xs font-semibold tracking-wide text-gray-400 uppercase">最近活動</h3>
                            <span v-if="recentlyWatched.length" class="text-[11px] text-gray-500">最近看過的動漫</span>
                        </div>
                        <div v-if="recentlyWatched.length" class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-3 gap-3">
                            <NuxtLink
                                v-for="anime in recentlyWatched"
                                :key="anime.anime_ref_id"
                                :to="`/anime/${anime.anime_ref_id}`"
                                class="group overflow-hidden rounded-xl bg-white/[0.02] border border-white/5 hover:border-white/20 shadow-sm hover:shadow-md hover:shadow-black/40 transition-all"
                                @click="close"
                            >
                                <div class="relative aspect-[2/3] overflow-hidden">
                                    <img :src="anime.anime_image" :alt="anime.anime_title" class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                                    <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent opacity-80" />
                                    <div class="absolute bottom-0 left-0 right-0 p-2 space-y-1">
                                        <p class="text-[11px] font-medium text-gray-100 truncate">{{ anime.anime_title }}</p>
                                        <div class="flex items-center justify-between text-[10px] text-gray-300">
                                            <span>第 {{ anime.episode_number }} 集</span><span>{{ anime.progress_percentage }}%</span>
                                        </div>
                                        <div class="h-1 rounded-full bg-white/10 overflow-hidden">
                                            <div class="h-full rounded-full bg-white" :style="{ width: `${anime.progress_percentage}%` }" />
                                        </div>
                                    </div>
                                </div>
                            </NuxtLink>
                        </div>
                        <div v-else class="flex items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/[0.01] px-4 py-8 text-xs text-gray-500">
                            尚未有任何觀看活動
                        </div>
                    </div>

                    <!-- Favorites -->
                    <div class="space-y-3">
                        <div class="flex items-center justify-between">
                            <h3 class="text-xs font-semibold tracking-wide text-gray-400 uppercase">收藏的動漫</h3>
                            <span v-if="favorites.length" class="text-[11px] text-gray-500">好友收藏的作品</span>
                        </div>
                        <div v-if="favorites.length" class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-3 gap-3">
                            <NuxtLink
                                v-for="anime in favorites"
                                :key="anime.anime_ref_id"
                                :to="`/anime/${anime.anime_ref_id}`"
                                class="group overflow-hidden rounded-xl bg-white/[0.02] border border-white/5 hover:border-pink-400/60 hover:bg-pink-500/5 shadow-sm hover:shadow-md hover:shadow-black/40 transition-all"
                                @click="close"
                            >
                                <div class="relative aspect-[2/3] overflow-hidden">
                                    <img :src="anime.anime_image" :alt="anime.anime_title" class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                                    <div class="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
                                    <div class="absolute top-2 right-2 w-6 h-6 rounded-full bg-pink-500 flex items-center justify-center shadow-lg shadow-pink-500/60">
                                        <span class="material-icons text-xs text-white">bookmark</span>
                                    </div>
                                    <div class="absolute bottom-0 left-0 right-0 p-2">
                                        <p class="text-[11px] font-medium text-gray-100 truncate">{{ anime.anime_title }}</p>
                                        <p class="text-[10px] text-gray-300">收藏於 {{ formatDate(anime.created_at) }}</p>
                                    </div>
                                </div>
                            </NuxtLink>
                        </div>
                        <div v-else class="flex items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/[0.01] px-4 py-8 text-xs text-gray-500">
                            尚未收藏任何動漫
                        </div>
                    </div>
                </div>

                <!-- Right col -->
                <div class="space-y-4">
                    <div class="rounded-xl bg-white/[0.03] border border-white/5 p-4">
                        <h3 class="text-xs font-semibold tracking-wide text-gray-400 uppercase mb-2">個人簡介</h3>
                        <p class="text-xs text-gray-300 leading-relaxed">這位好友還沒有填寫自我介紹。<br />一起追番、分享收藏清單，或許能更了解彼此的動漫品味。</p>
                    </div>

                    <template v-for="{ title, desc, items } in [
                        { title: '共同收藏', desc: '你和這位好友都收藏過的動漫', items: mutualFavorites },
                        { title: '共同觀看紀錄', desc: '你和這位好友都看過的動漫（依好友最近觀看排序）', items: mutualWatched }
                    ]" :key="title">
                        <div v-if="items.length" class="rounded-xl bg-white/[0.03] border border-white/5 p-4 space-y-3">
                            <h3 class="text-xs font-semibold tracking-wide text-gray-400 uppercase">{{ title }}</h3>
                            <p class="text-[11px] text-gray-400">{{ desc }}</p>
                            <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-3 gap-2">
                                <NuxtLink
                                    v-for="item in items"
                                    :key="item.anime_ref_id"
                                    :to="`/anime/${item.anime_ref_id}`"
                                    class="group relative overflow-hidden rounded-lg border border-white/10 hover:border-white/30 hover:bg-white/10 transition-all"
                                    @click="close"
                                >
                                    <div class="aspect-[2/3] relative overflow-hidden">
                                        <img :src="item.anime_image" :alt="item.anime_title" class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                                        <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
                                        <div class="absolute bottom-1 left-1 right-1 text-[10px] text-gray-100 truncate">{{ item.anime_title }}</div>
                                    </div>
                                </NuxtLink>
                            </div>
                        </div>
                    </template>
                </div>
            </div>
        </div>
    </BaseDialog>

    <!-- ===================== MOBILE DRAWER ===================== -->
    <BaseBottomDrawer
        v-else
        :model-value="modelValue"
        @update:model-value="emit('update:modelValue', $event)"
        max-height="max-h-[92vh]"
    >
        <template #header>
            <div class="flex items-center gap-3">
                <div v-if="friendAvatar" class="w-12 h-12 rounded-2xl bg-gray-800 overflow-hidden flex-shrink-0">
                    <img :src="friendAvatar" :alt="friendName" class="w-full h-full object-cover" />
                </div>
                <div v-else class="w-12 h-12 rounded-2xl bg-gradient-to-br from-slate-600 via-slate-800 to-slate-950 flex items-center justify-center text-white text-lg font-semibold flex-shrink-0">
                    {{ initials }}
                </div>
                <div class="flex-1 min-w-0">
                    <h2 class="text-lg font-semibold text-gray-900 dark:text-white truncate">{{ friendName }}</h2>
                    <div class="flex items-center gap-1.5 mt-0.5 w-full">
                        <span class="w-2 h-2 rounded-full flex-shrink-0" :class="activityStatus.dotClass" />
                        <span class="text-[11px] text-gray-500 dark:text-gray-400">{{ activityStatus.label }}</span>
                        <div class="flex gap-1.5 flex-shrink-0 ml-auto">
                            <div class="flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-100 dark:bg-white/5 text-[11px] text-gray-500 dark:text-gray-300">
                                <span class="material-icons text-xs text-indigo-400">movie</span>
                                {{ stats.totalWatched }}
                            </div>
                            <div class="flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-100 dark:bg-white/5 text-[11px] text-gray-500 dark:text-gray-300">
                                <span class="material-icons text-xs text-pink-400">bookmark</span>
                                {{ stats.totalFavorites }}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </template>

        <!-- Loading -->
        <div v-if="loading" class="flex flex-col items-center justify-center py-16 gap-3">
            <div class="w-8 h-8 border-[3px] border-gray-600 border-t-transparent rounded-full animate-spin" />
            <p class="text-xs text-gray-500">載入中...</p>
        </div>

        <!-- Error -->
        <div v-else-if="error" class="flex flex-col items-center justify-center py-16 text-center gap-3">
            <span class="material-icons text-3xl text-red-400">error_outline</span>
            <p class="text-sm text-red-400">{{ error }}</p>
        </div>

        <!-- Profile content -->
        <div v-else-if="profile" class="space-y-6 pb-4">
            <!-- Watching Now (mobile) -->
            <div v-if="watchingNow" class="space-y-3">
                <h3 class="text-xs font-semibold tracking-wide text-gray-400 uppercase">正在觀看</h3>
                <NuxtLink
                    :to="`/anime/${watchingNow.anime_ref_id}`"
                    class="group flex gap-3 overflow-hidden rounded-xl bg-white/[0.02] border border-white/5 hover:border-emerald-500/50"
                    @click="close"
                >
                    <div class="w-20 flex-shrink-0 aspect-[2/3] overflow-hidden rounded-lg">
                        <img :src="watchingNow.anime_image" :alt="watchingNow.anime_title" class="w-full h-full object-cover" />
                    </div>
                    <div class="flex-1 min-w-0 py-2 flex flex-col justify-center">
                        <p class="text-sm font-semibold text-gray-100 truncate">{{ watchingNow.anime_title }}</p>
                        <p class="text-xs text-gray-400 mt-0.5">第 {{ watchingNow.episode_number }} 集</p>
                        <div class="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-400 text-[11px] w-fit">
                            <span class="material-icons text-xs">play_circle</span>
                            正在觀看
                        </div>
                    </div>
                    <span class="material-icons text-gray-500 self-center pr-2">chevron_right</span>
                </NuxtLink>
            </div>

            <!-- Recently Watched -->
            <div class="space-y-3">
                <div class="flex items-center justify-between">
                    <h3 class="text-xs font-semibold tracking-wide text-gray-400 uppercase">最近活動</h3>
                    <span v-if="recentlyWatched.length" class="text-[11px] text-gray-500">最近看過的動漫</span>
                </div>
                <div v-if="recentlyWatched.length" class="grid grid-cols-3 gap-2">
                    <NuxtLink
                        v-for="anime in recentlyWatched"
                        :key="anime.anime_ref_id"
                        :to="`/anime/${anime.anime_ref_id}`"
                        class="group overflow-hidden rounded-xl bg-white/[0.02] border border-white/5 hover:border-white/20 transition-all"
                        @click="close"
                    >
                        <div class="relative aspect-[2/3] overflow-hidden">
                            <img :src="anime.anime_image" :alt="anime.anime_title" class="w-full h-full object-cover" />
                            <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent opacity-80" />
                            <div class="absolute bottom-0 left-0 right-0 p-1.5 space-y-1">
                                <p class="text-[10px] font-medium text-gray-100 truncate">{{ anime.anime_title }}</p>
                                <div class="flex items-center justify-between text-[9px] text-gray-300">
                                    <span>第 {{ anime.episode_number }} 集</span><span>{{ anime.progress_percentage }}%</span>
                                </div>
                                <div class="h-0.5 rounded-full bg-white/10 overflow-hidden">
                                    <div class="h-full rounded-full bg-white" :style="{ width: `${anime.progress_percentage}%` }" />
                                </div>
                            </div>
                        </div>
                    </NuxtLink>
                </div>
                <div v-else class="flex items-center justify-center rounded-xl border border-dashed border-white/10 px-4 py-8 text-xs text-gray-500">
                    尚未有任何觀看活動
                </div>
            </div>

            <!-- Favorites -->
            <div class="space-y-3">
                <div class="flex items-center justify-between">
                    <h3 class="text-xs font-semibold tracking-wide text-gray-400 uppercase">收藏的動漫</h3>
                    <span v-if="favorites.length" class="text-[11px] text-gray-500">好友收藏的作品</span>
                </div>
                <div v-if="favorites.length" class="grid grid-cols-3 gap-2">
                    <NuxtLink
                        v-for="anime in favorites"
                        :key="anime.anime_ref_id"
                        :to="`/anime/${anime.anime_ref_id}`"
                        class="group overflow-hidden rounded-xl bg-white/[0.02] border border-white/5 hover:border-pink-400/60 transition-all"
                        @click="close"
                    >
                        <div class="relative aspect-[2/3] overflow-hidden">
                            <img :src="anime.anime_image" :alt="anime.anime_title" class="w-full h-full object-cover" />
                            <div class="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
                            <div class="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-pink-500 flex items-center justify-center shadow-lg shadow-pink-500/60">
                                <span class="material-icons text-[10px] text-white">bookmark</span>
                            </div>
                            <div class="absolute bottom-0 left-0 right-0 p-1.5">
                                <p class="text-[10px] font-medium text-gray-100 truncate">{{ anime.anime_title }}</p>
                                <p class="text-[9px] text-gray-300">收藏於 {{ formatDate(anime.created_at) }}</p>
                            </div>
                        </div>
                    </NuxtLink>
                </div>
                <div v-else class="flex items-center justify-center rounded-xl border border-dashed border-white/10 px-4 py-8 text-xs text-gray-500">
                    尚未收藏任何動漫
                </div>
            </div>

            <!-- Mutual sections (same card style as desktop right col) -->
            <template v-for="{ title, desc, items } in [
                { title: '共同收藏', desc: '你和這位好友都收藏過的動漫', items: mutualFavorites },
                { title: '共同觀看紀錄', desc: '你和這位好友都看過的動漫', items: mutualWatched }
            ]" :key="title">
                <div v-if="items.length" class="space-y-3">
                    <div>
                        <h3 class="text-xs font-semibold tracking-wide text-gray-400 uppercase">{{ title }}</h3>
                        <p class="text-[11px] text-gray-500 mt-0.5">{{ desc }}</p>
                    </div>
                    <div class="grid grid-cols-3 gap-2">
                        <NuxtLink
                            v-for="item in items"
                            :key="item.anime_ref_id"
                            :to="`/anime/${item.anime_ref_id}`"
                            class="group relative overflow-hidden rounded-xl border border-white/10 hover:border-white/30 hover:bg-white/5 transition-all"
                            @click="close"
                        >
                            <div class="aspect-[2/3] relative overflow-hidden">
                                <img :src="item.anime_image" :alt="item.anime_title" class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                                <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
                                <div class="absolute bottom-1 left-1 right-1 text-[10px] text-gray-100 truncate">{{ item.anime_title }}</div>
                            </div>
                        </NuxtLink>
                    </div>
                </div>
            </template>
        </div>
    </BaseBottomDrawer>
</template>