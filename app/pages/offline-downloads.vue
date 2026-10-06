<script setup>
import { formatViews } from '~/utils/formatViews'

definePageMeta({ offlineAccess: true })

const appConfig = useAppConfig()
const { listDownloadedAnime, removeEpisode, clearAnimeDownloads } = useOfflineAnimeDownloads()
const { showToast } = useToast()
const { activeTasks, recentTasks, pauseTask, resumeTask, cancelDownloadTask } = useOfflineDownloadQueue()

const RING_R = 8
const RING_C = 2 * Math.PI * RING_R

const loading = ref(true)
const items = ref([])
const showDeleteConfirm = ref(false)
const showDownloadProgress = ref(false)
const animeToDelete = ref(null)
const managingRefId = ref(null)

const episodeAnime = computed(() => items.value.find((i) => i.refId === managingRefId.value) || null)
const showEpisodes = computed({
    get: () => !!managingRefId.value,
    set: (open) => { if (!open) managingRefId.value = null },
})
const totalDownloadedBytes = computed(() => items.value.reduce((sum, i) => sum + (i.totalBytes || 0), 0))
const hasDownloadTasks = computed(() => activeTasks.value.length > 0 || recentTasks.value.length > 0)
const activeDownloadPercent = computed(() => {
    const list = activeTasks.value
    if (!list.length) return 0
    const avg = list.reduce((s, t) => s + (Number(t.progress) || 0), 0) / list.length
    return Math.min(100, Math.max(0, avg))
})
const progressRingDashoffset = computed(() => RING_C * (1 - activeDownloadPercent.value / 100))

function animeHref(refId, episode) {
    return episode == null ? `/anime/${refId}` : `/anime/${refId}?e=${episode}`
}

function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB']
    let value = bytes
    let idx = 0
    while (value >= 1024 && idx < units.length - 1) {
        value /= 1024
        idx++
    }
    return `${value.toFixed(value >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`
}

function formatSavedAt(ts) {
    if (!ts) return ''
    const then = new Date(ts)
    if (Number.isNaN(then.getTime())) return ''
    const diff = Date.now() - then.getTime()
    if (diff < 60_000) return '剛剛更新'
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分鐘前更新`
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小時前更新`
    return `${then.getFullYear()}年${then.getMonth() + 1}月${then.getDate()}日更新`
}

function animeStats(anime) {
    return [
        { icon: 'download_for_offline', text: `${anime.episodeCount} 集 · ${formatBytes(anime.totalBytes)}` },
        anime.catalogEpisodes && { icon: 'video_library', text: `全 ${anime.catalogEpisodes} 集` },
        anime.views && { icon: 'visibility', text: formatViews(anime.views) },
        anime.rating && { icon: 'star', text: Number(anime.rating).toFixed(1), iconClass: 'text-yellow-400', textClass: 'text-gray-900 dark:text-white' },
        anime.isFavorite && { icon: 'favorite', text: '已收藏', class: 'text-gray-900 dark:text-white' },
    ].filter(Boolean)
}

function taskPercent(task) {
    return Math.floor(task.progress || 0)
}

function revokeItemImages(list) {
    for (const item of list || []) {
        if (item?.imageIsBlob && typeof item.image === 'string' && item.image.startsWith('blob:')) {
            URL.revokeObjectURL(item.image)
        }
    }
}

async function refreshList() {
    loading.value = true
    try {
        revokeItemImages(items.value)
        items.value = await listDownloadedAnime()
        if (managingRefId.value && !items.value.some((i) => i.refId === managingRefId.value)) {
            managingRefId.value = null
        }
    } finally {
        loading.value = false
    }
}

function notifyTask(fn, task, message) {
    fn(task.id)
    showToast(message, 'info')
}

function askClearAnime(anime) {
    animeToDelete.value = { refId: anime.refId, title: anime.animeTitle }
    showDeleteConfirm.value = true
}

async function removeOneEpisode(refId, ep) {
    try {
        await removeEpisode(refId, ep)
        showToast(`已刪除第 ${ep} 集`, 'success')
        await refreshList()
    } catch (err) {
        console.error(err)
        showToast('刪除失敗', 'error')
    }
}

async function confirmClearAnime() {
    if (!animeToDelete.value) return
    try {
        await clearAnimeDownloads(animeToDelete.value.refId)
        showToast('已清除離線資料', 'success')
        showDeleteConfirm.value = false
        animeToDelete.value = null
        managingRefId.value = null
        await refreshList()
    } catch (err) {
        console.error(err)
        showToast('清除失敗', 'error')
    }
}

onMounted(refreshList)
onUnmounted(() => revokeItemImages(items.value))
watch(() => activeTasks.value.length, (n, prev) => {
    if (typeof prev === 'number' && prev > 0 && n === 0) refreshList()
})
useHead({ title: `下載管理 | ${appConfig.siteName}` })
</script>

<template>
    <div class="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 py-6 sm:py-8">
        <div class="mb-6 sm:mb-8 flex items-start justify-between gap-4 flex-wrap">
            <div>
                <h1 class="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 dark:text-white">下載管理</h1>
                <p class="text-gray-600 dark:text-gray-400 mt-1">管理你的離線下載</p>
            </div>
            <div class="flex items-center gap-2 sm:gap-3 flex-wrap">
                <AppChip as="div" icon="storage">{{ formatBytes(totalDownloadedBytes) }}</AppChip>
                <AppChip v-if="hasDownloadTasks" variant="accent" @click="showDownloadProgress = true">
                    <svg
                        v-if="activeTasks.length"
                        class="size-5 shrink-0 -rotate-90 text-current"
                        viewBox="0 0 20 20"
                        aria-hidden="true"
                    >
                        <circle cx="10" cy="10" :r="RING_R" fill="none" stroke="currentColor" stroke-width="2.5" class="opacity-25" />
                        <circle
                            cx="10"
                            cy="10"
                            :r="RING_R"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2.5"
                            stroke-linecap="round"
                            :stroke-dasharray="RING_C"
                            :stroke-dashoffset="progressRingDashoffset"
                        />
                    </svg>
                    <span v-else class="material-symbols-rounded text-lg leading-none shrink-0" aria-hidden="true">downloading</span>
                    下載進度
                </AppChip>
                <AppChip variant="solid" icon="refresh" @click="refreshList">重新整理</AppChip>
            </div>
        </div>

        <div v-if="loading" class="flex items-center justify-center py-20">
            <LoadingSpinner size="xl" />
        </div>

        <div v-else-if="!items.length" class="empty-state">
            <span class="material-symbols-rounded text-gray-400 dark:text-gray-500 text-6xl mb-4 opacity-60">download_for_offline</span>
            <h3 class="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-2">目前沒有已下載的動漫</h3>
            <p class="text-gray-500 dark:text-gray-400 mb-6">前往動漫頁面下載集數以便離線觀看</p>
            <NuxtLink to="/show-all-anime" class="btn-primary">探索動漫</NuxtLink>
        </div>

        <div v-else class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
            <article v-for="anime in items" :key="anime.refId" class="list-card group relative">
                <button
                    type="button"
                    class="icon-btn absolute top-3 right-3 z-10 bg-white/80 dark:bg-gray-950/80"
                    title="管理集數"
                    :aria-label="`管理 ${anime.animeTitle} 已下載集數`"
                    @click.stop="managingRefId = anime.refId"
                >
                    <span class="material-symbols-rounded text-lg">video_library</span>
                </button>
                <NuxtLink :to="animeHref(anime.refId)" class="block cursor-pointer">
                    <div class="flex gap-4 p-4">
                        <div class="w-24 aspect-[2/3] shrink-0 self-start rounded-lg overflow-hidden bg-black/5 dark:bg-white/10">
                            <img
                                v-if="anime.image"
                                :src="anime.image"
                                :alt="anime.animeTitle"
                                class="w-full h-full object-cover"
                                loading="lazy"
                            >
                            <div v-else class="w-full h-full flex items-center justify-center text-gray-400 dark:text-gray-500">
                                <span class="material-symbols-rounded text-3xl">movie</span>
                            </div>
                        </div>
                        <div class="min-w-0 flex-1 flex flex-col pr-8">
                            <h2 class="font-semibold text-gray-900 dark:text-white line-clamp-2 leading-snug group-hover:opacity-80 transition-opacity">
                                {{ anime.animeTitle }}
                            </h2>
                            <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-600 dark:text-gray-400">
                                <span
                                    v-for="stat in animeStats(anime)"
                                    :key="stat.icon + stat.text"
                                    class="inline-flex items-center gap-1"
                                    :class="stat.class"
                                >
                                    <span class="material-symbols-rounded text-base" :class="stat.iconClass">{{ stat.icon }}</span>
                                    <span :class="stat.textClass">{{ stat.text }}</span>
                                </span>
                            </div>
                            <p v-if="anime.latestSavedAt" class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                {{ formatSavedAt(anime.latestSavedAt) }}
                            </p>
                            <p v-if="anime.description" class="mt-2 text-sm text-gray-600 dark:text-gray-400 line-clamp-2 leading-relaxed">
                                {{ anime.description }}
                            </p>
                            <div v-if="anime.tags.length" class="mt-2 flex flex-wrap gap-1.5">
                                <span
                                    v-for="tag in anime.tags.slice(0, 4)"
                                    :key="tag"
                                    class="px-2 py-0.5 rounded-full bg-black/5 dark:bg-white/10 text-xs font-medium text-gray-700 dark:text-gray-300"
                                >{{ tag }}</span>
                            </div>
                        </div>
                    </div>
                </NuxtLink>
            </article>
        </div>
    </div>

    <BaseModal :show="showDeleteConfirm" title="確認清除" icon="warning" icon-color="text-red-500" @close="showDeleteConfirm = false">
        <p class="text-gray-600 dark:text-gray-400">確定要清除「{{ animeToDelete?.title }}」所有離線集數嗎？此操作無法復原。</p>
        <template #actions>
            <button class="btn-modal-cancel" @click="showDeleteConfirm = false">取消</button>
            <button class="btn-modal-danger" @click="confirmClearAnime">確認清除</button>
        </template>
    </BaseModal>

    <BaseDialog v-model="showEpisodes" title="管理集數" max-width="max-w-lg" scrollable>
        <div v-if="episodeAnime" class="space-y-6">
            <div class="status-panel">
                <div class="flex items-center justify-between gap-4">
                    <div class="flex items-center gap-3 min-w-0">
                        <span class="material-symbols-rounded text-gray-600 dark:text-gray-400 shrink-0">download_done</span>
                        <div class="min-w-0">
                            <p class="font-medium text-gray-900 dark:text-white truncate">{{ episodeAnime.animeTitle }}</p>
                            <p class="text-sm text-gray-500 dark:text-gray-400">
                                已下載 {{ episodeAnime.episodeCount }} 集 · {{ formatBytes(episodeAnime.totalBytes) }}
                            </p>
                        </div>
                    </div>
                    <NuxtLink :to="animeHref(episodeAnime.refId)" class="link-quiet">
                        作品頁
                        <span class="material-symbols-rounded text-base">arrow_forward</span>
                    </NuxtLink>
                </div>
            </div>

            <div class="space-y-3">
                <p class="text-sm font-medium text-gray-700 dark:text-gray-300">已下載集數</p>
                <div class="list-box">
                    <div class="max-h-80 overflow-y-auto divide-y divide-black/5 dark:divide-white/10">
                        <div v-for="ep in episodeAnime.episodes" :key="ep" class="flex items-center gap-3 px-4 py-3.5">
                            <span class="material-symbols-rounded text-xl shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true">check_circle</span>
                            <NuxtLink :to="animeHref(episodeAnime.refId, ep)" class="flex-1 min-w-0 text-sm font-medium text-gray-900 dark:text-white hover:opacity-70 transition-opacity">
                                第 {{ ep }} 集
                            </NuxtLink>
                            <button
                                type="button"
                                class="icon-btn-danger"
                                :aria-label="`刪除第 ${ep} 集`"
                                @click="removeOneEpisode(episodeAnime.refId, ep)"
                            >
                                <span class="material-symbols-rounded text-lg">delete</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div class="flex gap-2">
                <button
                    type="button"
                    class="pill-btn"
                    @click="askClearAnime(episodeAnime)"
                >
                    <span class="material-symbols-rounded text-lg">delete</span>
                    清除全部
                </button>
                <NuxtLink :to="animeHref(episodeAnime.refId, episodeAnime.episodes[0])" class="pill-btn-solid">
                    <span class="material-symbols-rounded text-lg">play_arrow</span>
                    播放
                </NuxtLink>
            </div>
        </div>
    </BaseDialog>

    <BaseDialog v-model="showDownloadProgress" title="下載進度" max-width="max-w-lg" scrollable>
        <div v-if="!activeTasks.length && !recentTasks.length" class="flex flex-col items-center justify-center gap-2 py-12 text-sm text-gray-500 dark:text-gray-400">
            <span class="material-symbols-rounded text-4xl text-gray-300 dark:text-gray-600">download_done</span>
            <p>目前沒有下載任務</p>
        </div>

        <div v-else class="space-y-6">
            <div v-if="activeTasks.length" class="space-y-3">
                <p class="text-sm font-medium text-gray-700 dark:text-gray-300">進行中 ({{ activeTasks.length }})</p>
                <div class="list-box divide-y divide-black/5 dark:divide-white/10">
                    <div v-for="task in activeTasks" :key="task.id" class="p-4 space-y-3">
                        <div class="flex items-start justify-between gap-3">
                            <div class="min-w-0">
                                <p class="text-sm font-medium text-gray-900 dark:text-white truncate">{{ task.animeTitle }}</p>
                                <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                    第 {{ task.episodeKey }} 集 · {{ task.label || (task.status === 'paused' ? '已暫停' : '下載中…') }}
                                </p>
                            </div>
                            <div class="flex items-center gap-1 shrink-0">
                                <button
                                    type="button"
                                    class="icon-btn"
                                    :title="task.status === 'paused' ? '繼續下載' : '暫停下載'"
                                    @click="task.status === 'paused'
                                        ? notifyTask(resumeTask, task, `繼續下載第 ${task.episodeKey} 集`)
                                        : notifyTask(pauseTask, task, `已暫停第 ${task.episodeKey} 集`)"
                                >
                                    <span class="material-symbols-rounded text-xl">{{ task.status === 'paused' ? 'play_arrow' : 'pause' }}</span>
                                </button>
                                <button
                                    type="button"
                                    class="icon-btn-danger"
                                    title="取消下載"
                                    @click="notifyTask(cancelDownloadTask, task, `已取消第 ${task.episodeKey} 集下載`)"
                                >
                                    <span class="material-symbols-rounded text-xl">close</span>
                                </button>
                            </div>
                        </div>
                        <div class="flex items-center gap-3">
                            <div class="flex-1 min-w-0 h-1.5 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
                                <div
                                    class="h-full rounded-full transition-all duration-300 ease-out"
                                    :class="task.status === 'paused' ? 'bg-amber-500' : 'bg-gray-900 dark:bg-white'"
                                    :style="{ width: `${taskPercent(task)}%` }"
                                />
                            </div>
                            <span class="text-xs tabular-nums font-medium text-gray-500 dark:text-gray-400 shrink-0 w-8 text-right">
                                {{ taskPercent(task) }}%
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <div v-if="recentTasks.length" class="space-y-3">
                <p class="text-sm font-medium text-gray-700 dark:text-gray-300">最近</p>
                <div class="list-box divide-y divide-black/5 dark:divide-white/10">
                    <div v-for="task in recentTasks" :key="task.id" class="flex items-center justify-between gap-3 px-4 py-3">
                        <div class="min-w-0">
                            <p class="text-sm text-gray-900 dark:text-white truncate">{{ task.animeTitle }}</p>
                            <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">第 {{ task.episodeKey }} 集</p>
                        </div>
                        <span
                            class="inline-flex items-center gap-1 text-xs font-medium shrink-0"
                            :class="task.status === 'error' ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'"
                        >
                            <span class="material-symbols-rounded text-base">{{ task.status === 'error' ? 'error' : 'check_circle' }}</span>
                            {{ task.status === 'error' ? (task.error || '失敗') : '完成' }}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    </BaseDialog>
</template>

<style scoped>
.list-card {
    @apply relative bg-black/[0.02] dark:bg-white/5 rounded-xl overflow-hidden
           ring-1 ring-black/5 dark:ring-white/10
           hover:ring-black/10 dark:hover:ring-white/20
           hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-black/40
           transition-all duration-300;
}
.status-panel {
    @apply space-y-3 p-4 bg-black/[0.02] dark:bg-white/5 rounded-xl border border-black/5 dark:border-white/10;
}
.list-box {
    @apply rounded-xl border border-black/5 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] overflow-hidden;
}
.link-quiet {
    @apply shrink-0 inline-flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors;
}
.icon-btn {
    @apply w-8 h-8 inline-flex items-center justify-center rounded-full text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 transition-colors;
}
.icon-btn-danger {
    @apply w-8 h-8 inline-flex items-center justify-center rounded-full text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/10 transition-colors;
}
.pill-btn {
    @apply flex-1 px-3 py-2 text-sm rounded-full bg-black/5 dark:bg-white/10 hover:bg-red-500/10 text-gray-900 dark:text-white hover:text-red-600 dark:hover:text-red-400 font-medium transition-colors flex items-center justify-center gap-1.5;
}
.pill-btn-solid {
    @apply flex-1 px-3 py-2 text-sm rounded-full bg-gray-900 dark:bg-white hover:opacity-90 text-white dark:text-black font-semibold transition-all flex items-center justify-center gap-1.5;
}
</style>
