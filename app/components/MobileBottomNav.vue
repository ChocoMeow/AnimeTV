<script setup>
const { searchModalOpen, openSearchModal } = useMobileSearchState()
const { isMobile } = useMobile()
const { isIncognito } = useIncognitoMode()

const route = useRoute()
const user = useSupabaseUser()
const headerHiddenMobile = useState('app-mobile-header-hidden', () => false)
const showMobilePwaNav = useState('app-show-mobile-pwa-nav', () => false)

function isStandaloneDisplay() {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: minimal-ui)').matches || Boolean(window.navigator?.standalone)
}

function updateShowMobilePwaNav() {
    showMobilePwaNav.value = isMobile.value && isStandaloneDisplay()
}

let mqStandalone, mqMinimal

onMounted(() => {
    updateShowMobilePwaNav()
    mqStandalone = window.matchMedia('(display-mode: standalone)')
    mqMinimal = window.matchMedia('(display-mode: minimal-ui)')
    mqStandalone.addEventListener('change', updateShowMobilePwaNav)
    mqMinimal.addEventListener('change', updateShowMobilePwaNav)
    window.addEventListener('resize', updateShowMobilePwaNav)
})

onUnmounted(() => {
    mqStandalone?.removeEventListener('change', updateShowMobilePwaNav)
    mqMinimal?.removeEventListener('change', updateShowMobilePwaNav)
    window.removeEventListener('resize', updateShowMobilePwaNav)
})

// ─── Navigation items ────────────────────────────────────────────────────────

const NAV_ITEMS = computed(() => [
    { id: 'home', to: '/', label: '首頁', icon: 'home', match: (p) => p === '/' },
    { id: 'all', to: '/show-all-anime', label: '全部作品', icon: 'movie', match: (p) => p.startsWith('/show-all-anime') },
    { id: 'search', label: '搜尋', icon: 'search', isAction: true },
    { id: 'history', to: '/history', label: '觀看紀錄', icon: 'history', match: (p) => p.startsWith('/history') },
    { id: 'profile', to: '/mobile-profile', label: '帳戶', match: (p) => p.startsWith('/mobile-profile') },
])

// ─── Active state & pill position ────────────────────────────────────────────

const activeIndex = computed(() => {
    const p = route.path
    if (p === '/') return 0
    if (p.startsWith('/show-all-anime')) return 1
    if (p.startsWith('/history')) return 3
    if (p.startsWith('/mobile-profile')) return 4
    return -1
})

const pillStyle = computed(() => ({
    left: activeIndex.value < 0 ? '0%' : `${activeIndex.value * 20}%`,
}))

function isItemActive(item) {
    if (item.isAction) return searchModalOpen.value
    return item.match?.(route.path) ?? false
}

function onActionClick() {
    openSearchModal('search')
}

// ─── Derived classes ─────────────────────────────────────────────────────────

const userAvatar = computed(() => ({
    src: user.value?.user_metadata?.avatar_url || user.value?.user_metadata?.picture || '',
    name: user.value?.user_metadata?.name || 'User',
}))

const collapsed = computed(() => headerHiddenMobile.value)

const barClass = computed(() => [
    'pointer-events-auto flex h-[3.75rem] min-h-[3.75rem] w-full max-w-md items-stretch overflow-hidden rounded-full p-1',
    'border border-black/20 bg-[rgba(28,28,30,0.82)] dark:border-white/12 dark:bg-[rgba(22,22,24,0.88)]',
    'backdrop-blur-[20px] backdrop-saturate-[180%] shadow-[0_8px_32px_rgba(0,0,0,0.38)]',
    // Uniform scale keeps proportions consistent across devices (esp. iOS)
    'origin-bottom transition-transform duration-[700ms] ease-[cubic-bezier(0.4_0_0.2_1)]',
    collapsed.value ? 'scale-[0.82]' : 'scale-100',
])

function iconClass(active) {
    return ['material-symbols-rounded text-[28px] leading-none', active ? '' : 'outlined']
}

const ITEM_CLASS =
    'relative z-10 flex min-h-0 min-w-0 flex-1 items-center justify-center rounded-full active:opacity-90'

function itemColorClass(active) {
    return active ? 'text-white' : 'text-white/75 active:text-white/90'
}
</script>

<template>
    <nav
        v-if="showMobilePwaNav"
        v-show="!searchModalOpen"
        class="mobile-nav-safe-area md:hidden fixed inset-x-0 bottom-0 z-[45] flex justify-center pointer-events-none px-3 sm:px-4"
        aria-label="主要導覽"
    >
        <div :class="barClass">
            <div class="relative flex h-full min-h-0 w-full flex-1 items-stretch">
                <div
                    aria-hidden="true"
                    class="pointer-events-none absolute inset-y-0 z-0 w-[20%] rounded-full bg-zinc-500/55 transition-[left,opacity] duration-[500ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
                    :class="activeIndex < 0 ? 'opacity-0' : 'opacity-100'"
                    :style="pillStyle"
                />

                <!-- Nav items -->
                <template v-for="item in NAV_ITEMS" :key="item.id">
                    <!-- Link items -->
                    <NuxtLink
                        v-if="!item.isAction"
                        :to="item.to"
                        :class="[ITEM_CLASS, itemColorClass(isItemActive(item))]"
                        :aria-current="isItemActive(item) ? 'page' : undefined"
                        :aria-label="item.label"
                    >
                        <UserAvatar
                            v-if="item.id === 'profile'"
                            v-bind="userAvatar"
                            class="h-[30px] w-[30px] shrink-0 text-[11px]"
                            :img-class="isIncognito ? 'ring-2 ring-amber-500' : isItemActive(item) ? 'ring-2 ring-white' : 'ring-1 ring-white/30'"
                        />

                        <!-- Icon items -->
                        <span v-else :class="iconClass(isItemActive(item))" aria-hidden="true">
                            {{ item.icon }}
                        </span>
                    </NuxtLink>

                    <!-- Action button (search / ai) -->
                    <button v-else type="button" :class="[ITEM_CLASS, itemColorClass(isItemActive(item))]" :aria-label="item.label" :aria-pressed="isItemActive(item)" @click="onActionClick">
                        <span :class="iconClass(isItemActive(item))" aria-hidden="true">
                            {{ item.icon }}
                        </span>
                    </button>
                </template>
            </div>
        </div>
    </nav>
</template>

<style scoped>
.mobile-nav-safe-area {
    /* Small visual gap below the nav bar */
    --mobile-nav-bottom-gap: 8px;
    /* iOS 11.0-11.2 fallback */
    padding-bottom: calc((constant(safe-area-inset-bottom) / 2) + var(--mobile-nav-bottom-gap));
    /* Modern iOS/Android browsers */
    padding-bottom: calc((env(safe-area-inset-bottom, 0px) / 2) + var(--mobile-nav-bottom-gap));
}
</style>
