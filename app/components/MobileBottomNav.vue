<script setup>
const { mobileSearchOpen } = useMobileSearchState()
const { isMobile } = useMobile()

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

const NAV_ITEMS = [
    { id: 'home', to: '/', label: '首頁', icon: 'home', match: (p) => p === '/' },
    { id: 'all', to: '/show-all-anime', label: '全部作品', icon: 'movie', match: (p) => p.startsWith('/show-all-anime') },
    { id: 'search', label: '搜尋', icon: 'search', isAction: true },
    { id: 'history', to: '/history', label: '觀看紀錄', icon: 'history', match: (p) => p.startsWith('/history') },
    { id: 'profile', to: '/profile', label: '個人資料', match: (p) => p.startsWith('/profile') },
]

// ─── Active state & pill position ────────────────────────────────────────────

const activeIndex = computed(() => {
    const p = route.path
    if (p === '/') return 0
    if (p.startsWith('/show-all-anime')) return 1
    if (p.startsWith('/history')) return 3
    if (p.startsWith('/profile')) return 4
    return -1
})

const pillStyle = computed(() => ({
    left: activeIndex.value < 0 ? '0%' : `${activeIndex.value * 20}%`,
}))

function isItemActive(item) {
    if (item.isAction) return mobileSearchOpen.value
    return item.match?.(route.path) ?? false
}

function onSearchClick() {
    mobileSearchOpen.value = true
}

// ─── Derived classes ─────────────────────────────────────────────────────────

const profileInitial = computed(() => user.value?.user_metadata?.name?.[0]?.toUpperCase() ?? 'U')

const collapsed = computed(() => headerHiddenMobile.value)

const barClass = computed(() => [
    // Layout & shape
    'pointer-events-auto flex w-full items-stretch overflow-hidden rounded-full',
    // Border & background
    'border border-black/20 bg-[rgba(28,28,30,0.82)]',
    'dark:border-white/12 dark:bg-[rgba(22,22,24,0.88)]',
    // Blur & shadow
    'backdrop-blur-[20px] backdrop-saturate-[180%] shadow-[0_8px_32px_rgba(0,0,0,0.38)]',
    // Animated size
    'transition-[height,min-height,padding,max-width] duration-[700ms] ease-[cubic-bezier(0.4_0_0.2_1)]',
    collapsed.value ? 'h-[2.55rem] min-h-[2.55rem] max-w-[17.5rem] p-0.5' : 'h-[3.75rem] min-h-[3.75rem] max-w-md p-1',
])

const iconSizeClass = computed(() => (collapsed.value ? 'text-[22px]' : 'text-[28px]'))
const avatarBoxClass = computed(() => (collapsed.value ? 'h-[22px] w-[22px]' : 'h-[30px] w-[30px]'))
const avatarTextClass = computed(() => (collapsed.value ? 'text-[10px]' : 'text-[11px]'))

/** Returns the full class list for a material-symbol icon */
function iconClass(active) {
    return ['material-symbols-rounded leading-none', 'transition-[font-size,font-variation-settings] duration-[550ms] ease-[cubic-bezier(0.4_0_0.2_1)]', iconSizeClass.value, active ? '' : 'outlined']
}

const ITEM_CLASS =
    'relative z-10 flex min-h-0 min-w-0 flex-1 items-center justify-center rounded-full' + ' transition-[padding,color] duration-[700ms] ease-[cubic-bezier(0.4_0_0.2_1)] active:opacity-90'

function itemColorClass(active) {
    return active ? 'text-white' : 'text-white/75 active:text-white/90'
}
</script>

<template>
    <nav
        v-if="showMobilePwaNav"
        v-show="!mobileSearchOpen"
        class="mobile-nav-safe-area md:hidden fixed inset-x-0 bottom-0 z-[45] flex justify-center pointer-events-none px-3 sm:px-4 pt-0 transition-[padding-bottom] duration-[700ms] ease-[cubic-bezier(0.4_0_0.2_1)]"
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
                        <!-- Profile avatar -->
                        <template v-if="item.id === 'profile'">
                            <span
                                class="relative shrink-0 overflow-hidden rounded-full transition-[width,height,box-shadow] duration-[700ms] ease-[cubic-bezier(0.4_0_0.2_1)]"
                                :class="[avatarBoxClass, isItemActive(item) ? 'ring-2 ring-white' : 'ring-1 ring-white/30']"
                            >
                                <NuxtImg
                                    v-if="user?.user_metadata?.avatar_url"
                                    :src="user.user_metadata.avatar_url"
                                    :alt="user.user_metadata?.name ?? ''"
                                    class="h-full w-full object-cover"
                                    loading="lazy"
                                />
                                <div
                                    v-else
                                    class="flex h-full w-full items-center justify-center bg-indigo-600 font-semibold text-white transition-[font-size] duration-[700ms] ease-[cubic-bezier(0.4_0_0.2_1)]"
                                    :class="avatarTextClass"
                                >
                                    {{ profileInitial }}
                                </div>
                            </span>
                        </template>

                        <!-- Icon items -->
                        <span v-else :class="iconClass(isItemActive(item))" aria-hidden="true">
                            {{ item.icon }}
                        </span>
                    </NuxtLink>

                    <!-- Action button (search) -->
                    <button v-else type="button" :class="[ITEM_CLASS, itemColorClass(isItemActive(item))]" :aria-label="item.label" :aria-pressed="isItemActive(item)" @click="onSearchClick">
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
