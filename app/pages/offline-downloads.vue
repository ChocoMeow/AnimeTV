<script setup>
const appConfig = useAppConfig()

const { listDownloadedAnime, removeEpisode, clearAnimeDownloads } = useOfflineAnimeDownloads()
const { showToast } = useToast()
const { activeTasks, recentTasks, pauseTask, resumeTask, cancelDownloadTask } = useOfflineDownloadQueue()

const loading = ref(true)
const items = ref([])
const showDeleteConfirm = ref(false)
const showDownloadProgress = ref(false)
const animeToDelete = ref(null)
const totalDownloadedBytes = computed(() => items.value.reduce((sum, i) => sum + (i.totalBytes || 0), 0))
const hasDownloadTasks = computed(() => activeTasks.value.length > 0 || recentTasks.value.length > 0)

/** 0–100: mean progress across active downloads for the header ring */
const activeDownloadProgressPercent = computed(() => {
    const list = activeTasks.value
    if (!list.length) return 0
    const sum = list.reduce((s, t) => s + (Number(t.progress) || 0), 0)
    return Math.min(100, Math.max(0, sum / list.length))
})

const PROGRESS_RING_R = 8
const PROGRESS_RING_C = 2 * Math.PI * PROGRESS_RING_R
const progressRingDashoffset = computed(() => PROGRESS_RING_C * (1 - activeDownloadProgressPercent.value / 100))
const totalDownloadedEpisodes = computed(() => items.value.reduce((sum, i) => sum + (i.episodeCount || 0), 0))
const totalAnimeCount = computed(() => items.value.length)

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

async function refreshList() {
    loading.value = true
    try {
        items.value = await listDownloadedAnime()
    } finally {
        loading.value = false
    }
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

async function clearOneAnime(refId, title) {
    animeToDelete.value = { refId, title }
    showDeleteConfirm.value = true
}

function pauseDownload(task) {
    pauseTask(task.id)
    showToast(`已暫停第 ${task.episodeKey} 集`, 'info')
}

function resumeDownload(task) {
    resumeTask(task.id)
    showToast(`繼續下載第 ${task.episodeKey} 集`, 'info')
}

function cancelTask(task) {
    cancelDownloadTask(task.id)
    showToast(`已取消第 ${task.episodeKey} 集下載`, 'info')
}

async function confirmClearAnime() {
    if (!animeToDelete.value) return
    try {
        await clearAnimeDownloads(animeToDelete.value.refId)
        showToast('已清除離線資料', 'success')
        showDeleteConfirm.value = false
        animeToDelete.value = null
        await refreshList()
    } catch (err) {
        console.error(err)
        showToast('清除失敗', 'error')
    }
}

onMounted(refreshList)
useHead({ title: `下載管理 | ${appConfig.siteName}` })
</script>

<template>
    <div class="max-w-7xl mx-auto px-4 py-6">
        <!-- Header -->
        <div class="mb-6">
            <div class="flex items-center justify-between gap-4 flex-wrap mb-6">
                <div>
                    <h1 class="text-3xl font-bold text-gray-900 dark:text-gray-100">下載管理</h1>
                    <p class="text-gray-600 dark:text-gray-400 mt-1">管理你的離線下載</p>
                </div>
                <div class="flex items-center gap-3">
                    <div
                        class="px-4 py-2 bg-gray-950/5 dark:bg-white/10 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center gap-2"
                    >
                        <span class="material-icons text-gray-600 dark:text-gray-400 text-lg">storage</span>
                        <span class="text-sm font-medium text-gray-900 dark:text-gray-100">{{ formatBytes(totalDownloadedBytes) }}</span>
                    </div>
                    <button
                        type="button"
                        class="px-4 py-2 bg-gray-950/5 dark:bg-white/10 hover:bg-gray-100 dark:hover:bg-white/20 rounded-lg border border-gray-200 dark:border-gray-700 transition-colors font-medium flex items-center gap-2"
                        :class="{ 'text-blue-600 dark:text-blue-400': hasDownloadTasks, 'text-gray-700 dark:text-gray-300': !hasDownloadTasks }"
                        @click="showDownloadProgress = true"
                    >
                        <svg
                            v-if="activeTasks.length"
                            class="h-5 w-5 shrink-0 -rotate-90 text-current"
                            viewBox="0 0 20 20"
                            aria-hidden="true"
                        >
                            <circle
                                cx="10"
                                cy="10"
                                :r="PROGRESS_RING_R"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2.5"
                                class="opacity-25"
                            />
                            <circle
                                cx="10"
                                cy="10"
                                :r="PROGRESS_RING_R"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2.5"
                                stroke-linecap="round"
                                :stroke-dasharray="PROGRESS_RING_C"
                                :stroke-dashoffset="progressRingDashoffset"
                            />
                        </svg>
                        <span v-else class="material-icons text-lg shrink-0" aria-hidden="true">downloading</span>
                        下載進度
                    </button>
                    <button
                        type="button"
                        class="px-4 py-2 bg-gray-900 dark:bg-gray-100 hover:bg-gray-800 dark:hover:bg-gray-200 text-white dark:text-gray-900 rounded-lg transition-colors font-medium flex items-center gap-2"
                        @click="refreshList"
                    >
                        <span class="material-icons text-lg">refresh</span>
                        重新整理
                    </button>
                </div>
            </div>
        </div>

        <!-- Loading State -->
        <div v-if="loading" class="flex items-center justify-center py-20">
            <div class="animate-spin rounded-full h-12 w-12 border-4 border-gray-600 border-t-transparent"></div>
        </div>

        <div v-else class="space-y-6">
            <!-- Empty State -->
            <div v-if="!items.length" class="text-center py-20">
                <span class="material-icons text-gray-400 text-6xl mb-4">download_for_offline</span>
                <h3 class="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">目前沒有已下載的動漫</h3>
                <p class="text-gray-500 dark:text-gray-400 mb-6">前往動漫頁面下載集數以便離線觀看</p>
                <NuxtLink
                    to="/show-all-anime"
                    class="px-6 py-3 bg-gray-900 dark:bg-gray-100 hover:bg-gray-800 dark:hover:bg-gray-200 text-white dark:text-gray-900 rounded-lg transition-colors"
                >
                    探索動漫
                </NuxtLink>
            </div>

            <!-- Downloaded Anime Grid -->
            <div v-else class="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div
                    v-for="anime in items"
                    :key="anime.refId"
                    class="relative bg-gray-950/5 dark:bg-white/10 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-lg transition-all"
                >
                    <div class="p-4 flex gap-4">
                        <NuxtImg
                            v-if="anime.image"
                            :src="anime.image"
                            alt="Anime cover"
                            class="w-20 aspect-[2/3] rounded-lg object-cover bg-gray-200 dark:bg-gray-700 flex-shrink-0"
                        />
                        <div class="flex-1 min-w-0 flex flex-col justify-between pr-24">
                            <div>
                                <h3 class="font-semibold text-gray-900 dark:text-white line-clamp-2 mb-1 mr-2">
                                    {{ anime.animeTitle }}
                                </h3>
                                <div class="space-y-1 text-sm text-gray-600 dark:text-gray-400">
                                    <p class="flex items-center gap-2">
                                        <span class="material-icons text-xs">movie</span>
                                        {{ anime.episodeCount }} 集已下載
                                    </p>
                                    <p class="flex items-center gap-2">
                                        <span class="material-icons text-xs">storage</span>
                                        {{ formatBytes(anime.totalBytes) }}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="absolute top-4 right-4 flex items-center gap-2">
                        <NuxtLink
                            :to="`/anime/${anime.refId}`"
                            class="flex items-center justify-center w-10 h-10 rounded-md bg-gray-900 dark:bg-gray-100 hover:bg-gray-800 dark:hover:bg-gray-200 text-white dark:text-gray-900 transition-colors"
                            title="前往播放"
                        >
                            <span class="material-icons text-lg">open_in_new</span>
                        </NuxtLink>
                        <button
                            type="button"
                            class="flex items-center justify-center w-10 h-10 rounded-md bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                            title="清除全部"
                            @click="clearOneAnime(anime.refId, anime.animeTitle)"
                        >
                            <span class="material-icons text-lg">delete</span>
                        </button>
                    </div>

                    <div class="px-4 pb-4">
                        <div class="flex flex-wrap gap-2">
                            <NuxtLink
                                v-for="ep in anime.episodes"
                                :key="`${anime.refId}-${ep}`"
                                :to="`/anime/${anime.refId}?e=${ep}`"
                                class="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-white dark:bg-white/10 border border-gray-200 dark:border-gray-700 text-sm hover:bg-gray-100 dark:hover:bg-white/20 transition-colors"
                            >
                                <span class="text-gray-900 dark:text-gray-100">第 {{ ep }} 集</span>
                                <button
                                    type="button"
                                    class="text-gray-500 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                                    @click.prevent="removeOneEpisode(anime.refId, ep)"
                                >
                                    <span class="material-icons text-base">close</span>
                                </button>
                            </NuxtLink>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Delete Confirmation Modal -->
    <BaseModal :show="showDeleteConfirm" title="確認清除" icon="warning" icon-color="text-red-500" @close="showDeleteConfirm = false">
        <p class="text-gray-600 dark:text-gray-400">確定要清除「{{ animeToDelete?.title }}」所有離線集數嗎？此操作無法復原。</p>

        <template #actions>
            <button
                @click="showDeleteConfirm = false"
                class="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            >
                取消
            </button>
            <button @click="confirmClearAnime" class="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors">確認清除</button>
        </template>
    </BaseModal>

    <!-- Download Progress Dialog -->
    <BaseDialog v-model="showDownloadProgress" title="下載進度" max-width="max-w-2xl" scrollable>
        <div v-if="!activeTasks.length && !recentTasks.length" class="text-sm text-gray-500 dark:text-gray-400 py-8 text-center">
            <span class="material-icons text-4xl mb-2 text-gray-300 dark:text-gray-600">download_done</span>
            <p>目前沒有下載任務</p>
        </div>

        <div v-else class="space-y-4 pt-4">
            <!-- Active Tasks -->
            <div
                v-for="task in activeTasks"
                :key="task.id"
                class="rounded-lg p-4 border transition-colors"
                :class="
                    task.status === 'paused'
                        ? 'bg-amber-50/80 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/50'
                        : 'bg-gray-50 dark:bg-white/5 border-transparent'
                "
            >
                <div class="flex items-start justify-between gap-3">
                    <p
                        class="text-base sm:text-lg font-semibold text-gray-900 dark:text-white leading-snug truncate min-w-0 pr-2 tracking-tight"
                    >
                        {{ task.animeTitle }} - 第 {{ task.episodeKey }} 集
                    </p>
                    <div class="flex items-center gap-2 shrink-0 pt-0.5">
                        <template v-if="task.status === 'paused'">
                            <button
                                type="button"
                                class="group inline-flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 shadow-sm transition-all hover:bg-emerald-100 hover:border-emerald-300 active:scale-[0.97] dark:border-emerald-800/60 dark:bg-emerald-950/50 dark:text-emerald-300 dark:hover:bg-emerald-900/40 dark:hover:border-emerald-600/70"
                                title="繼續下載"
                                @click="resumeDownload(task)"
                            >
                                <span class="material-icons text-[20px] leading-none transition-transform group-hover:scale-105">play_arrow</span>
                            </button>
                            <button
                                type="button"
                                class="group inline-flex h-9 w-9 items-center justify-center rounded-xl border border-red-200 bg-white text-red-600 shadow-sm transition-all hover:bg-red-50 hover:border-red-300 active:scale-[0.97] dark:border-red-900/50 dark:bg-white/5 dark:text-red-400 dark:hover:bg-red-950/40 dark:hover:border-red-800/60"
                                title="取消下載"
                                @click="cancelTask(task)"
                            >
                                <span class="material-icons text-[18px] leading-none">close</span>
                            </button>
                        </template>
                        <template v-else>
                            <button
                                type="button"
                                class="group inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gray-300 bg-white text-gray-700 shadow-sm transition-all hover:bg-gray-50 hover:border-gray-400 active:scale-[0.97] dark:border-gray-600 dark:bg-white/10 dark:text-gray-200 dark:hover:bg-white/15 dark:hover:border-gray-500"
                                title="暫停下載"
                                @click="pauseDownload(task)"
                            >
                                <span class="material-icons text-[20px] leading-none">pause</span>
                            </button>
                            <button
                                type="button"
                                class="group inline-flex h-9 w-9 items-center justify-center rounded-xl border border-red-200 bg-white text-red-600 shadow-sm transition-all hover:bg-red-50 hover:border-red-300 active:scale-[0.97] dark:border-red-900/50 dark:bg-white/5 dark:text-red-400 dark:hover:bg-red-950/40 dark:hover:border-red-800/60"
                                title="取消下載"
                                @click="cancelTask(task)"
                            >
                                <span class="material-icons text-[18px] leading-none">close</span>
                            </button>
                        </template>
                    </div>
                </div>
                <p class="text-sm text-gray-500 dark:text-gray-400 mt-1.5 mb-2.5">
                    {{ task.label || (task.status === 'paused' ? '已暫停' : '下載中...') }}
                </p>
                <div class="flex items-center gap-3">
                    <div class="flex-1 min-w-0 h-2 bg-gray-200 dark:bg-white/10 rounded-full overflow-hidden">
                        <div
                            class="h-full transition-all"
                            :class="task.status === 'paused' ? 'bg-amber-500' : 'bg-blue-500'"
                            :style="{ width: `${Math.floor(task.progress || 0)}%` }"
                        />
                    </div>
                    <span
                        class="text-sm font-semibold tabular-nums shrink-0 min-w-[2.75rem] text-right"
                        :class="task.status === 'paused' ? 'text-amber-700 dark:text-amber-300' : 'text-blue-600 dark:text-blue-400'"
                    >
                        {{ Math.floor(task.progress || 0) }}%
                    </span>
                </div>
            </div>

            <!-- Recent Tasks -->
            <div v-if="recentTasks.length" class="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
                <p class="text-xs font-medium text-gray-500 dark:text-gray-400 mb-3">已完成/失敗</p>
                <div class="space-y-2">
                    <div
                        v-for="task in recentTasks"
                        :key="task.id"
                        class="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 dark:hover:bg-white/5"
                    >
                        <p class="text-sm text-gray-900 dark:text-white">{{ task.animeTitle }} - 第 {{ task.episodeKey }} 集</p>
                        <p
                            class="text-xs inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full"
                            :class="
                                task.status === 'error'
                                    ? 'text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-300'
                                    : 'text-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-300'
                            "
                        >
                            <span class="material-icons text-sm">{{ task.status === 'error' ? 'error' : 'check_circle' }}</span>
                            {{ task.status === 'error' ? task.error || '下載失敗' : '下載完成' }}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    </BaseDialog>
</template>
