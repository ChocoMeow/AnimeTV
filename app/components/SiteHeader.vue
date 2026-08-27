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
        class="sticky top-0 z-50 w-full bg-white dark:bg-gray-950 border-b border-black/10 dark:border-white/10 shadow-sm max-md:fixed max-md:inset-x-0 max-md:top-0 transition-transform duration-300 max-md:duration-300"
        :class="headerHiddenMobile && !searchModalOpen && !mobileMenuOpen ? 'max-md:-translate-y-full' : ''"
    >
        <div class="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
            <!-- Left: Logo -->
            <div class="flex items-center gap-2">
                <NuxtLink to="/" class="flex items-center group pr-2 gap-1">
                    <img src="/icons/icon.svg" :alt="appConfig.siteName" class="w-7 h-7 object-contain" width="28" height="28" fetchpriority="high" />
                    <span class="text-black dark:text-white font-semibold text-xl"> {{ appConfig.siteName }}</span>
                </NuxtLink>
            </div>

            <!-- Desktop search trigger -->
            <div class="hidden md:flex flex-1 justify-center max-w-xl px-4">
                <button
                    type="button"
                    class="group relative flex w-full items-center gap-2 rounded-full bg-black/5 px-4 py-2 text-left text-sm text-gray-500 outline-none transition-colors hover:bg-black/8 focus-visible:ring-2 focus-visible:ring-black/20 dark:bg-white/10 dark:text-gray-400 dark:hover:bg-white/15 dark:focus-visible:ring-white/20"
                    @click="openSearch"
                >
                    <span class="flex-1">搜尋動漫...</span>
                </button>
            </div>

            <!-- Right: Nav (desktop) -->
            <nav class="hidden md:flex items-center gap-3">
                <button
                    v-if="pwaNeedRefresh"
                    type="button"
                    class="text-sm px-3 py-1.5 rounded-full hover:bg-green-500/10 dark:hover:bg-green-400/15 text-green-600 dark:text-green-400 transition-colors inline-flex items-center gap-1.5"
                    title="有新版本，點擊更新"
                    aria-label="更新網站"
                    @click="applyPwaUpdate"
                >
                    <span class="material-symbols-rounded text-[18px] leading-none">download</span>
                    <span>新更新</span>
                </button>

                <NuxtLink to="/show-all-anime" class="text-sm px-3 py-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10"> 全部作品 </NuxtLink>

                <div class="relative">
                    <button
                        type="button"
                        class="flex items-center gap-2 p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                        @click="showUserMenu = !showUserMenu"
                        @mouseenter="cancelHideUserMenu"
                        @mouseleave="hideUserMenuDelayed"
                    >
                        <UserAvatar
                            v-bind="userAvatar"
                            class="w-8 h-8 text-xs"
                            :img-class="isIncognito ? 'border-2 border-amber-500/70 dark:border-amber-400/70' : 'border-2 border-black/10 dark:border-white/10'"
                        />
                    </button>

                    <transition name="dropdown">
                        <div
                            v-if="showUserMenu"
                            class="absolute right-0 top-full mt-2 w-64 bg-white dark:bg-gray-950 rounded-xl shadow-2xl ring-1 ring-black/5 dark:ring-white/10 z-50 overflow-hidden"
                            @mouseenter="cancelHideUserMenu"
                            @mouseleave="hideUserMenuDelayed"
                        >
                            <NuxtLink
                                to="/profile"
                                class="block px-4 py-3 border-b border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/5 hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gray-900 dark:focus-visible:ring-white"
                                @click="closeUserMenu"
                            >
                                <div class="flex items-center gap-3">
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
                                </div>
                            </NuxtLink>

                            <div class="py-2">
                                <template v-for="item in desktopDropdownItems" :key="item.to || item.label">
                                    <div v-if="item.dividerBefore" class="border-t border-black/10 dark:border-white/10 my-2" />
                                    <NuxtLink
                                        v-if="item.to"
                                        :to="item.to"
                                        class="w-full px-4 py-2.5 text-left hover:bg-black/5 dark:hover:bg-white/10 transition-colors flex items-center gap-3 text-gray-700 dark:text-gray-300"
                                        @click="closeUserMenu"
                                    >
                                        <span class="material-symbols-rounded text-gray-500 dark:text-gray-400">{{ item.icon }}</span>
                                        <span class="text-sm font-medium">{{ item.label }}</span>
                                    </NuxtLink>
                                    <button
                                        v-else-if="item.action"
                                        type="button"
                                        class="w-full px-4 py-2.5 text-left transition-colors flex items-center gap-3"
                                        :class="
                                            item.variant === 'danger'
                                                ? 'hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400'
                                                : 'hover:bg-black/5 dark:hover:bg-white/10 text-gray-700 dark:text-gray-300'
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
            <div class="md:hidden flex items-center gap-2">
                <button
                    v-if="pwaNeedRefresh"
                    type="button"
                    class="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 flex items-center justify-center"
                    title="有新版本，點擊更新"
                    aria-label="更新網站"
                    @click="applyPwaUpdate"
                >
                    <span class="material-symbols-rounded text-green-600 dark:text-green-400">download</span>
                </button>
                <button type="button" class="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 flex items-center justify-center" @click="openSearch">
                    <span class="material-symbols-rounded text-gray-700 dark:text-gray-200">search</span>
                </button>
                <button
                    v-if="!showMobilePwaNav"
                    type="button"
                    class="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 flex items-center justify-center"
                    @click="mobileMenuOpen = !mobileMenuOpen"
                >
                    <span class="material-symbols-rounded text-gray-700 dark:text-gray-200">{{ mobileMenuOpen ? 'close' : 'menu' }}</span>
                </button>
            </div>
        </div>

        <!-- Mobile nav -->
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

        <AnimeSearchModal v-model="searchModalOpen" />
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
