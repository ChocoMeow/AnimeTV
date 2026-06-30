<script setup>
const appConfig = useAppConfig()
const user = useSupabaseUser()
const client = useSupabaseClient()
const { userSettings } = useUserSettings()
const { isAdmin, clearAdmin } = useAdmin()
const { isMobile } = useMobile()

const loading = ref(true)
const historyPreview = ref([])
const favoritesPreview = ref([])

const PREVIEW_LIMIT = 8

const displayName = computed(
    () => user.value?.user_metadata?.name || user.value?.user_metadata?.full_name || '使用者',
)
const email = computed(() => user.value?.email || '')
const avatarUrl = computed(
    () => user.value?.user_metadata?.avatar_url || user.value?.user_metadata?.picture || null,
)
const initials = computed(() => (displayName.value || '?').trim().slice(0, 2).toUpperCase())

const NAV_LINK_CLASS =
    'flex w-full items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-950/5 dark:bg-white/10 px-4 py-3.5 text-gray-900 dark:text-gray-100 transition-colors active:bg-black/5 dark:active:bg-white/10'

async function fetchPreviews() {
    if (!userSettings.value?.id) {
        historyPreview.value = []
        favoritesPreview.value = []
        return
    }

    const [historyRes, favoritesRes] = await Promise.all([
        client
            .from('watch_history_latest_updates')
            .select('*')
            .eq('user_id', userSettings.value.id)
            .order('updated_at', { ascending: false })
            .range(0, PREVIEW_LIMIT - 1),
        client
            .from('favorites')
            .select('id, anime_ref_id, anime_title, anime_image, created_at')
            .eq('user_id', userSettings.value.id)
            .order('created_at', { ascending: false })
            .range(0, PREVIEW_LIMIT - 1),
    ])

    if (historyRes.error) console.error('Failed to fetch history preview:', historyRes.error)
    if (favoritesRes.error) console.error('Failed to fetch favorites preview:', favoritesRes.error)

    historyPreview.value = historyRes.data || []
    favoritesPreview.value = favoritesRes.data || []
}

async function signOut() {
    clearAdmin()
    await client.auth.signOut()
    navigateTo('/login')
}

function redirectIfDesktop() {
    if (!isMobile.value) {
        navigateTo('/profile', { replace: true })
    }
}

onMounted(async () => {
    redirectIfDesktop()
    if (!isMobile.value) return

    loading.value = true
    try {
        await fetchPreviews()
    } finally {
        loading.value = false
    }
})

onActivated(async () => {
    if (!isMobile.value) return
    await fetchPreviews()
})

watch(isMobile, (mobile) => {
    if (!mobile) redirectIfDesktop()
})

useHead({ title: `帳戶 | ${appConfig.siteName}` })
</script>

<template>
    <div class="max-w-7xl mx-auto px-4 py-6 md:hidden">
        <div v-if="loading" class="flex items-center justify-center py-20">
            <div class="h-10 w-10 animate-spin rounded-full border-4 border-gray-600 border-t-transparent" />
        </div>

        <div v-else class="space-y-6">
            <!-- Account -->
            <section class="rounded-2xl border border-gray-200 bg-gray-950/5 p-4 dark:border-gray-700 dark:bg-white/10">
                <div class="flex items-center gap-4">
                    <NuxtImg
                        v-if="avatarUrl"
                        :src="avatarUrl"
                        :alt="displayName"
                        class="h-16 w-16 shrink-0 rounded-full object-cover ring-2 ring-white dark:ring-gray-700"
                        loading="lazy"
                    />
                    <div
                        v-else
                        class="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-lg font-bold text-white"
                    >
                        {{ initials }}
                    </div>
                    <div class="min-w-0 flex-1">
                        <p class="truncate text-lg font-semibold text-gray-900 dark:text-gray-100">{{ displayName }}</p>
                        <p v-if="email" class="truncate text-sm text-gray-500 dark:text-gray-400">{{ email }}</p>
                    </div>
                </div>

                <div class="mt-4 grid grid-cols-2 gap-2">
                    <NuxtLink
                        to="/profile"
                        class="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-3 py-2.5 text-sm font-medium text-white transition-opacity active:opacity-90 dark:bg-gray-100 dark:text-gray-900"
                    >
                        <span class="material-symbols-rounded text-lg">person</span>
                        個人資料
                    </NuxtLink>
                    <NuxtLink
                        to="/settings"
                        class="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-900 transition-colors active:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:active:bg-gray-700"
                    >
                        <span class="material-symbols-rounded text-lg">settings</span>
                        帳號設定
                    </NuxtLink>
                </div>
            </section>

            <!-- History -->
            <section>
                <div class="mb-3 flex items-center justify-between gap-3">
                    <h2 class="text-base font-semibold text-gray-900 dark:text-gray-100">觀看紀錄</h2>
                    <NuxtLink
                        to="/history"
                        class="shrink-0 text-sm font-medium text-indigo-600 dark:text-indigo-400 active:opacity-80"
                    >
                        查看全部
                    </NuxtLink>
                </div>

                <div
                    v-if="historyPreview.length"
                    class="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                >
                    <NuxtLink
                        v-for="item in historyPreview"
                        :key="item.id"
                        :to="`/anime/${item.anime_ref_id}?e=${item.episode_number}&t=${item.playback_time}`"
                        class="w-24 shrink-0"
                    >
                        <div class="relative aspect-[2/3] overflow-hidden rounded-lg bg-gray-200 dark:bg-gray-700">
                            <NuxtImg
                                v-if="item.anime_image"
                                :src="item.anime_image"
                                :alt="item.anime_title"
                                class="h-full w-full object-cover"
                                loading="lazy"
                            />
                            <div v-else class="flex h-full w-full items-center justify-center text-gray-400">
                                <span class="material-symbols-rounded text-3xl">movie</span>
                            </div>
                            <div
                                v-if="item.progress_percentage > 0"
                                class="absolute bottom-0 left-0 right-0 h-1 bg-gray-800/50"
                            >
                                <div
                                    class="h-full bg-gray-600 dark:bg-gray-400"
                                    :style="{ width: `${item.progress_percentage}%` }"
                                />
                            </div>
                        </div>
                        <p class="mt-1.5 line-clamp-2 text-xs text-gray-700 dark:text-gray-300">
                            {{ item.anime_title }}
                        </p>
                    </NuxtLink>
                </div>
                <p v-else class="rounded-xl border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                    還沒有觀看紀錄
                </p>
            </section>

            <!-- Favorites -->
            <section>
                <div class="mb-3 flex items-center justify-between gap-3">
                    <h2 class="text-base font-semibold text-gray-900 dark:text-gray-100">我的收藏</h2>
                    <NuxtLink
                        to="/favorites"
                        class="shrink-0 text-sm font-medium text-indigo-600 dark:text-indigo-400 active:opacity-80"
                    >
                        查看全部
                    </NuxtLink>
                </div>

                <div
                    v-if="favoritesPreview.length"
                    class="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                >
                    <NuxtLink
                        v-for="item in favoritesPreview"
                        :key="item.id"
                        :to="`/anime/${item.anime_ref_id}`"
                        class="w-24 shrink-0"
                    >
                        <div class="relative aspect-[2/3] overflow-hidden rounded-lg bg-gray-200 dark:bg-gray-700">
                            <NuxtImg
                                v-if="item.anime_image"
                                :src="item.anime_image"
                                :alt="item.anime_title"
                                class="h-full w-full object-cover"
                                loading="lazy"
                            />
                            <div v-else class="flex h-full w-full items-center justify-center text-gray-400">
                                <span class="material-symbols-rounded text-3xl">movie</span>
                            </div>
                        </div>
                        <p class="mt-1.5 line-clamp-2 text-xs text-gray-700 dark:text-gray-300">
                            {{ item.anime_title }}
                        </p>
                    </NuxtLink>
                </div>
                <p v-else class="rounded-xl border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                    還沒有收藏作品
                </p>
            </section>

            <!-- Navigation links -->
            <section class="space-y-2">
                <NuxtLink to="/friends" :class="NAV_LINK_CLASS">
                    <span class="material-symbols-rounded text-xl text-gray-500 dark:text-gray-400">group</span>
                    <span class="flex-1 text-sm font-medium">我的好友</span>
                    <span class="material-symbols-rounded text-xl text-gray-400">chevron_right</span>
                </NuxtLink>

                <NuxtLink to="/offline-downloads" :class="NAV_LINK_CLASS">
                    <span class="material-symbols-rounded text-xl text-gray-500 dark:text-gray-400">download_for_offline</span>
                    <span class="flex-1 text-sm font-medium">下載管理</span>
                    <span class="material-symbols-rounded text-xl text-gray-400">chevron_right</span>
                </NuxtLink>

                <NuxtLink v-if="isAdmin" to="/admin" :class="NAV_LINK_CLASS">
                    <span class="material-symbols-rounded text-xl text-gray-500">admin_panel_settings</span>
                    <span class="flex-1 text-sm font-medium">管理後台</span>
                    <span class="material-symbols-rounded text-xl text-gray-400">chevron_right</span>
                </NuxtLink>
            </section>

            <!-- Logout -->
            <button
                type="button"
                class="flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3.5 text-sm font-medium text-red-600 transition-colors active:bg-red-100 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-400 dark:active:bg-red-950/50"
                @click="signOut"
            >
                <span class="material-symbols-rounded text-lg">logout</span>
                登出
            </button>
        </div>
    </div>
</template>
