<script setup>
const { searchModalOpen, openSearchModal } = useMobileSearchState()
const { isMobile } = useMobile()
const { isAdmin, clearAdmin } = useAdmin()
const { isIncognito } = useIncognitoMode()
const { needRefresh: pwaNeedRefresh, applyUpdate: applyPwaUpdate } = usePwaUpdate()
const headerHiddenMobile = useState('app-mobile-header-hidden', () => false)
const showMobilePwaNav = useState('app-show-mobile-pwa-nav', () => false)
const appConfig = useAppConfig()
const route = useRoute()
const client = useSupabaseClient()
const user = useSupabaseUser()
const userAvatar = computed(() => ({
    src: user.value?.user_metadata?.avatar_url,
    name: user.value?.user_metadata?.name || 'User',
}))

const mobileMenuOpen = ref(false)
const showUserMenu = ref(false)

let hideUserMenuTimeout = null
let lastScrollY = 0

const menuItems = [
    { to: '/history', icon: 'history', label: '觀看紀錄' },
    { to: '/favorites', icon: 'bookmark_added', label: '我的收藏' },
    { to: '/friends', icon: 'group', label: '我的好友' },
    { to: '/offline-downloads', icon: 'download_for_offline', label: '下載管理' },
    { to: '/settings', icon: 'settings', label: '帳號設定' },
    { to: '/admin', icon: 'admin_panel_settings', label: '管理後台', adminOnly: true },
    { icon: 'logout', label: '登出', action: signOut, variant: 'danger', dividerBefore: true },
]

const mobileNavItems = computed(() => [{ to: '/show-all-anime', icon: 'movie', label: '全部作品' }, ...menuItems.filter((i) => !i.adminOnly || isAdmin.value)])
const desktopDropdownItems = computed(() => menuItems.filter((i) => !i.adminOnly || isAdmin.value))

function closeUserMenu() {
    showUserMenu.value = false
}

function hideUserMenuDelayed() {
    hideUserMenuTimeout = setTimeout(() => {
        showUserMenu.value = false
    }, 200)
}

function cancelHideUserMenu() {
    if (hideUserMenuTimeout) clearTimeout(hideUserMenuTimeout)
}

function openSearch() {
    openSearchModal('search')
}

async function signOut() {
    showUserMenu.value = false
    clearAdmin()
    await client.auth.signOut()
    navigateTo('/login')
}

function onScroll() {
    if (!isMobile.value || searchModalOpen.value || mobileMenuOpen.value) {
        headerHiddenMobile.value = false
        lastScrollY = window.scrollY
        return
    }
    const y = window.scrollY
    const delta = y - lastScrollY
    const viewportHeight = window.visualViewport?.height || window.innerHeight
    const docHeight = document.documentElement.scrollHeight
    const nearBottom = y + viewportHeight >= docHeight - 2

    if (Math.abs(delta) < 4) return

    if (y <= 12 || nearBottom) {
        headerHiddenMobile.value = false
        lastScrollY = y
        return
    }

    headerHiddenMobile.value = delta > 0
    lastScrollY = y
}

onMounted(() => {
    window.addEventListener('scroll', onScroll, { passive: true })
})

onUnmounted(() => {
    window.removeEventListener('scroll', onScroll)
    if (hideUserMenuTimeout) clearTimeout(hideUserMenuTimeout)
})

watch(isMobile, (newValue) => {
    if (!newValue) {
        mobileMenuOpen.value = false
        headerHiddenMobile.value = false
    }
})

watch([searchModalOpen, mobileMenuOpen], ([s, m]) => {
    if (s || m) headerHiddenMobile.value = false
})

watch(showMobilePwaNav, (show) => {
    if (show) mobileMenuOpen.value = false
})

watch(
    () => route.path,
    () => {
        mobileMenuOpen.value = false
        showUserMenu.value = false
        headerHiddenMobile.value = false
    },
)
</script>

<template>
    <header
        class="relative sticky top-0 z-50 w-full border-b border-black/10 bg-white shadow-sm transition-[background-color,border-color,box-shadow,transform] duration-300 dark:border-white/10 dark:bg-gray-950 max-md:fixed max-md:inset-x-0 max-md:top-0"
        :class="[
            headerHiddenMobile && !searchModalOpen && !mobileMenuOpen ? 'max-md:-translate-y-full' : '',
            searchModalOpen ? 'md:border-b-0 md:bg-transparent md:shadow-none' : '',
        ]"
    >
        <div class="relative mx-auto max-w-7xl px-4">
            <div data-search-header class="relative z-30 flex items-center justify-between gap-3 overflow-visible py-3 md:grid md:w-full md:grid-cols-[auto_minmax(0,1fr)_auto] md:justify-normal">
                <!-- Left: Logo -->
                <div class="flex shrink-0 items-center gap-2">
                    <NuxtLink to="/" class="group flex items-center gap-1 pr-2">
                        <img src="/icons/icon.svg" :alt="appConfig.siteName" class="h-7 w-7 object-contain" width="28" height="28" fetchpriority="high" />
                        <span class="text-xl font-semibold text-black dark:text-white"> {{ appConfig.siteName }}</span>
                    </NuxtLink>
                </div>

                <!-- Desktop search: trigger when closed, input teleports here when open -->
                <div id="desktop-search-anchor" class="hidden min-w-0 md:flex md:w-full md:justify-center">
                    <div v-if="!searchModalOpen" class="w-full max-w-xl">
                        <button
                            type="button"
                            class="group relative flex w-full items-center gap-2 rounded-full bg-black/5 px-4 py-2 text-left text-sm text-gray-500 outline-none transition-colors hover:bg-black/8 focus-visible:ring-2 focus-visible:ring-black/20 dark:bg-white/10 dark:text-gray-400 dark:hover:bg-white/15 dark:focus-visible:ring-white/20"
                            @click="openSearch"
                        >
                            <span class="material-symbols-rounded text-[18px] leading-none text-gray-400">search</span>
                            <span class="flex-1">搜尋動漫...</span>
                        </button>
                    </div>
                </div>

                <!-- Right: Nav (desktop) -->
                <nav class="hidden shrink-0 items-center gap-3 md:flex">
                    <button
                        v-if="pwaNeedRefresh"
                        type="button"
                        class="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-green-600 transition-colors hover:bg-green-500/10 dark:text-green-400 dark:hover:bg-green-400/15"
                        title="有新版本，點擊更新"
                        aria-label="更新網站"
                        @click="applyPwaUpdate"
                    >
                        <span class="material-symbols-rounded text-[18px] leading-none">download</span>
                        <span>新更新</span>
                    </button>

                    <NuxtLink to="/show-all-anime" class="rounded-full px-3 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/10">全部作品</NuxtLink>

                    <div class="relative">
                        <button
                            type="button"
                            class="flex items-center gap-2 rounded-full p-1 transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                            @click="showUserMenu = !showUserMenu"
                            @mouseenter="cancelHideUserMenu"
                            @mouseleave="hideUserMenuDelayed"
                        >
                            <UserAvatar
                                v-bind="userAvatar"
                                class="h-8 w-8 text-xs"
                                :img-class="isIncognito ? 'border-2 border-amber-500/70 dark:border-amber-400/70' : 'border-2 border-black/10 dark:border-white/10'"
                            />
                        </button>

                        <transition name="dropdown">
                            <div
                                v-if="showUserMenu"
                                class="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-black/5 dark:bg-gray-950 dark:ring-white/10"
                                @mouseenter="cancelHideUserMenu"
                                @mouseleave="hideUserMenuDelayed"
                            >
                                <NuxtLink
                                    to="/profile"
                                    class="block cursor-pointer border-b border-black/10 bg-black/[0.02] px-4 py-3 outline-none transition-colors hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gray-900 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10 dark:focus-visible:ring-white"
                                    @click="closeUserMenu"
                                >
                                    <div class="flex items-center gap-3">
                                        <UserAvatar v-bind="userAvatar" class="h-12 w-12 text-lg" img-class="border-2 border-white dark:border-white/10" />
                                        <div class="min-w-0 flex-1">
                                            <p class="truncate font-semibold text-gray-900 dark:text-gray-100">
                                                {{ user?.user_metadata?.name || 'User' }}
                                            </p>
                                            <p class="truncate text-xs" :class="isIncognito ? 'text-amber-600 dark:text-amber-400' : 'text-gray-600 dark:text-gray-400'">
                                                {{ isIncognito ? '無痕模式進行中' : '查看觀看統計' }}
                                            </p>
                                        </div>
                                        <span class="material-symbols-rounded shrink-0 text-xl text-gray-400 dark:text-gray-500" aria-hidden="true">chevron_right</span>
                                    </div>
                                </NuxtLink>

                                <div class="py-2">
                                    <template v-for="item in desktopDropdownItems" :key="item.to || item.label">
                                        <div v-if="item.dividerBefore" class="my-2 border-t border-black/10 dark:border-white/10" />
                                        <NuxtLink
                                            v-if="item.to"
                                            :to="item.to"
                                            class="flex w-full items-center gap-3 px-4 py-2.5 text-left text-gray-700 transition-colors hover:bg-black/5 dark:text-gray-300 dark:hover:bg-white/10"
                                            @click="closeUserMenu"
                                        >
                                            <span class="material-symbols-rounded text-gray-500 dark:text-gray-400">{{ item.icon }}</span>
                                            <span class="text-sm font-medium">{{ item.label }}</span>
                                        </NuxtLink>
                                        <button
                                            v-else-if="item.action"
                                            type="button"
                                            class="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors"
                                            :class="
                                                item.variant === 'danger'
                                                    ? 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20'
                                                    : 'text-gray-700 hover:bg-black/5 dark:text-gray-300 dark:hover:bg-white/10'
                                            "
                                            @click="item.action()"
                                        >
                                            <span class="material-symbols-rounded">{{ item.icon }}</span>
                                            <span class="text-sm font-medium">{{ item.label }}</span>
                                        </button>
                                    </template>
                                </div>
                            </div>
                        </transition>
                    </div>
                </nav>

                <!-- Mobile buttons -->
                <div class="flex items-center gap-2 md:hidden">
                    <button
                        v-if="pwaNeedRefresh"
                        type="button"
                        class="flex items-center justify-center rounded-full p-2 hover:bg-black/5 dark:hover:bg-white/10"
                        title="有新版本，點擊更新"
                        aria-label="更新網站"
                        @click="applyPwaUpdate"
                    >
                        <span class="material-symbols-rounded text-green-600 dark:text-green-400">download</span>
                    </button>
                    <button type="button" class="flex items-center justify-center rounded-full p-2 hover:bg-black/5 dark:hover:bg-white/10" @click="openSearch">
                        <span class="material-symbols-rounded text-gray-700 dark:text-gray-200">search</span>
                    </button>
                    <button
                        v-if="!showMobilePwaNav"
                        type="button"
                        class="flex items-center justify-center rounded-full p-2 hover:bg-black/5 dark:hover:bg-white/10"
                        @click="mobileMenuOpen = !mobileMenuOpen"
                    >
                        <span class="material-symbols-rounded text-gray-700 dark:text-gray-200">{{ mobileMenuOpen ? 'close' : 'menu' }}</span>
                    </button>
                </div>
            </div>

            <SearchModal v-model="searchModalOpen" />
        </div>
        <transition name="menu-collapse">
            <div v-if="mobileMenuOpen && !showMobilePwaNav" class="md:hidden grid">
                <div class="overflow-hidden min-h-0">
                    <div class="px-4 pb-3 space-y-3">
                        <NuxtLink
                            to="/profile"
                            class="flex items-center gap-3 px-3 py-3 bg-black/[0.02] dark:bg-white/5 rounded-xl hover:bg-black/5 dark:hover:bg-white/10 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-gray-900 dark:focus-visible:ring-white"
                            @click="mobileMenuOpen = false"
                        >
                            <UserAvatar v-bind="userAvatar" class="w-12 h-12 text-lg" img-class="border-2 border-white dark:border-white/10" />
                            <div class="flex-1 min-w-0">
                                <p class="font-semibold text-gray-900 dark:text-gray-100 truncate">
                                    {{ user?.user_metadata?.name || 'User' }}
                                </p>
                                <p class="text-xs truncate" :class="isIncognito ? 'text-amber-600 dark:text-amber-400' : 'text-gray-600 dark:text-gray-400'">
                                    {{ isIncognito ? '無痕模式進行中' : '查看觀看統計' }}
                                </p>
                            </div>
                            <span class="material-symbols-rounded text-gray-400 dark:text-gray-500 text-xl shrink-0" aria-hidden="true">chevron_right</span>
                        </NuxtLink>

                        <nav class="flex flex-col gap-1">
                            <template v-for="item in mobileNavItems" :key="item.to || item.label">
                                <div v-if="item.dividerBefore" class="border-t border-black/10 dark:border-white/10 my-2" />
                                <NuxtLink v-if="item.to" :to="item.to" class="text-sm px-3 py-2.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 flex items-center gap-3">
                                    <span class="material-symbols-rounded text-gray-500 dark:text-gray-400 text-xl">{{ item.icon }}</span>
                                    <span>{{ item.label }}</span>
                                </NuxtLink>
                                <button
                                    v-else-if="item.action"
                                    type="button"
                                    class="text-sm px-3 py-2.5 rounded-lg flex items-center gap-3 text-left"
                                    :class="
                                        item.variant === 'danger'
                                            ? 'hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400'
                                            : 'hover:bg-black/5 dark:hover:bg-white/10 text-gray-700 dark:text-gray-300'
                                    "
                                    @click="item.action()"
                                >
                                    <span class="material-symbols-rounded text-xl">{{ item.icon }}</span>
                                    <span>{{ item.label }}</span>
                                </button>
                            </template>
                        </nav>
                    </div>
                </div>
            </div>
        </transition>
    </header>
</template>

<style scoped>
.menu-collapse-enter-active,
.menu-collapse-leave-active {
    transition:
        grid-template-rows 0.28s ease,
        opacity 0.22s ease;
}
.menu-collapse-enter-from,
.menu-collapse-leave-to {
    grid-template-rows: 0fr;
    opacity: 0;
}
.menu-collapse-enter-to,
.menu-collapse-leave-from {
    grid-template-rows: 1fr;
    opacity: 1;
}

.dropdown-enter-active,
.dropdown-leave-active {
    transition: all 0.2s ease;
}
.dropdown-enter-from,
.dropdown-leave-to {
    opacity: 0;
    transform: translateY(-10px);
}
</style>
