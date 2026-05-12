<script setup>
const route = useRoute()
const user = useSupabaseUser()
const { mobileSearchOpen } = useMobileSearchState()
const headerHiddenMobile = useState("animehub-mobile-header-hidden", () => false)
const showMobilePwaNav = useState("animehub-show-mobile-pwa-nav", () => false)
const { isMobile } = useMobile()

function standaloneDisplay() {
    if (typeof window === "undefined") return false
    return (
        window.matchMedia("(display-mode: standalone)").matches ||
        window.matchMedia("(display-mode: minimal-ui)").matches ||
        Boolean(window.navigator?.standalone)
    )
}

function updateShowMobilePwaNav() {
    if (!import.meta.client) return
    showMobilePwaNav.value = isMobile.value && standaloneDisplay()
}

let mqStandalone
let mqMinimal

onMounted(() => {
    updateShowMobilePwaNav()
    window.addEventListener("resize", updateShowMobilePwaNav)
    mqStandalone = window.matchMedia("(display-mode: standalone)")
    mqMinimal = window.matchMedia("(display-mode: minimal-ui)")
    mqStandalone.addEventListener("change", updateShowMobilePwaNav)
    mqMinimal.addEventListener("change", updateShowMobilePwaNav)
})

onUnmounted(() => {
    window.removeEventListener("resize", updateShowMobilePwaNav)
    mqStandalone?.removeEventListener("change", updateShowMobilePwaNav)
    mqMinimal?.removeEventListener("change", updateShowMobilePwaNav)
})

if (import.meta.client) updateShowMobilePwaNav()

const items = [
    { id: "home", to: "/", label: "首頁", icon: "home", match: (p) => p === "/" },
    {
        id: "all",
        to: "/show-all-anime",
        label: "全部作品",
        icon: "movie",
        match: (p) => p.startsWith("/show-all-anime"),
    },
    { id: "search", label: "搜尋", icon: "search", isAction: true },
    {
        id: "history",
        to: "/history",
        label: "觀看紀錄",
        icon: "history",
        match: (p) => p.startsWith("/history"),
    },
    {
        id: "profile",
        to: "/profile",
        label: "個人設定",
        match: (p) => p.startsWith("/profile"),
    },
]

const activeIndex = computed(() => {
    const p = route.path
    if (p === "/") return 0
    if (p.startsWith("/show-all-anime")) return 1
    if (p.startsWith("/history")) return 3
    if (p.startsWith("/profile")) return 4
    return -1
})

const pillStyle = computed(() => ({
    transform:
        activeIndex.value < 0 ? "translateX(0)" : `translateX(calc(${activeIndex.value} * 100%))`,
}))

function isItemActive(item) {
    if (item.isAction) return mobileSearchOpen.value
    return item.match?.(route.path) ?? false
}

function onSearchClick() {
    mobileSearchOpen.value = true
}

function symbolIconClass(active) {
    return active ? "material-symbols-rounded sym-fill" : "material-symbols-rounded"
}

const itemClass =
    "relative z-10 flex min-h-0 flex-1 items-center justify-center rounded-full transition-[padding,color] duration-300 ease-out"

const barClass = computed(() =>
    [
        "pointer-events-auto flex w-full items-stretch overflow-hidden rounded-full border border-black/20 bg-[rgba(28,28,30,0.82)] backdrop-blur-[20px] backdrop-saturate-[180%] dark:border-white/12 dark:bg-[rgba(22,22,24,0.88)] shadow-[0_8px_32px_rgba(0,0,0,0.38)] transition-[height,padding,max-width] duration-300 ease-out",
        headerHiddenMobile.value ? "h-[2.55rem] max-w-[17.5rem] p-0.5" : "h-[3.35rem] max-w-md p-1",
    ].join(" "),
)

const iconSizeClass = computed(() => (headerHiddenMobile.value ? "text-[22px]" : "text-[26px]"))

const profileInitial = computed(
    () => user.value?.user_metadata?.name?.[0]?.toUpperCase() || "U",
)

const avatarBoxClass = computed(() =>
    headerHiddenMobile.value ? "h-[22px] w-[22px]" : "h-[26px] w-[26px]",
)
</script>

<template>
    <nav
        v-if="showMobilePwaNav"
        v-show="!mobileSearchOpen"
        class="md:hidden fixed inset-x-0 bottom-0 z-[45] flex justify-center pointer-events-none px-3 sm:px-4 pt-2 transition-[padding-bottom] duration-300 ease-out"
        :class="
            headerHiddenMobile
                ? 'pb-[max(0.45rem,env(safe-area-inset-bottom,0px))]'
                : 'pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]'
        "
        aria-label="主要導覽"
    >
        <div :class="barClass">
            <div class="relative flex h-full min-h-0 w-full flex-1 items-stretch">
                <div
                    aria-hidden="true"
                    class="pointer-events-none absolute left-0 top-0 bottom-0 z-0 w-[20%] rounded-full bg-zinc-500/55 transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] will-change-transform"
                    :class="activeIndex < 0 ? 'opacity-0' : 'opacity-100'"
                    :style="pillStyle"
                />
                <template v-for="item in items" :key="item.id">
                    <NuxtLink
                        v-if="!item.isAction"
                        :to="item.to"
                        :class="[
                            itemClass,
                            isItemActive(item) ? 'text-white' : 'text-white/75 active:text-white/90',
                        ]"
                        :aria-current="isItemActive(item) ? 'page' : undefined"
                        :aria-label="item.label"
                    >
                        <template v-if="item.id === 'profile'">
                            <span
                                class="relative shrink-0 overflow-hidden rounded-full transition-[width,height,box-shadow] duration-300"
                                :class="[
                                    avatarBoxClass,
                                    isItemActive(item) ? 'ring-2 ring-white' : 'ring-1 ring-white/30',
                                ]"
                            >
                                <NuxtImg
                                    v-if="user?.user_metadata?.avatar_url"
                                    :src="user.user_metadata.avatar_url"
                                    :alt="user.user_metadata?.name || ''"
                                    class="h-full w-full object-cover"
                                    loading="lazy"
                                />
                                <div
                                    v-else
                                    class="flex h-full w-full items-center justify-center bg-indigo-600 font-semibold text-white"
                                    :class="headerHiddenMobile ? 'text-[10px]' : 'text-[11px]'"
                                >
                                    {{ profileInitial }}
                                </div>
                            </span>
                        </template>
                        <span
                            v-else
                            class="material-symbols-rounded leading-none transition-[font-size,font-variation-settings] duration-200"
                            :class="[iconSizeClass, symbolIconClass(isItemActive(item))]"
                            aria-hidden="true"
                        >
                            {{ item.icon }}
                        </span>
                    </NuxtLink>
                    <button
                        v-else
                        type="button"
                        :class="[
                            itemClass,
                            isItemActive(item) ? 'text-white' : 'text-white/75 active:text-white/90',
                        ]"
                        :aria-label="item.label"
                        :aria-pressed="isItemActive(item)"
                        @click="onSearchClick"
                    >
                        <span
                            class="material-symbols-rounded leading-none transition-[font-size,font-variation-settings] duration-200"
                            :class="[iconSizeClass, symbolIconClass(isItemActive(item))]"
                            aria-hidden="true"
                        >
                            {{ item.icon }}
                        </span>
                    </button>
                </template>
            </div>
        </div>
    </nav>
</template>

<style scoped>
.material-symbols-rounded.sym-fill {
    font-variation-settings: "FILL" 1, "wght" 500, "GRAD" 0, "opsz" 24;
}
</style>
