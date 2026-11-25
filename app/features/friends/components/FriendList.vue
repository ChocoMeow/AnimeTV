<script setup>
const STORAGE_KEY = 'friendListOpen'
const SECTION_META = [
    { status: 'watching', title: '正在觀看', dotColorClass: 'bg-green-500', icon: 'play_circle', text: '在線', isWatching: true },
    { status: 'online', title: '在線中', dotColorClass: 'bg-green-500', icon: 'computer', text: '在線' },
    { status: 'idle', title: '閒置中', dotColorClass: 'bg-yellow-500', icon: 'schedule', text: '暫時離開' },
    { status: 'offline', title: '離線', dotColorClass: 'bg-gray-400', icon: null, text: null, isOffline: true },
]

const { userSettings } = useUserSettings()
const userId = computed(() => userSettings.value?.id || null)
const { friends } = useFriends(userId)

const friendSections = computed(() =>
    SECTION_META
        .map((meta) => ({ ...meta, friends: friends.value.filter((f) => f.status === meta.status) }))
        .filter((s) => s.friends.length),
)

const isOpen = ref(false)
const isLg = ref(false)
const toggleReady = ref(true)
const showProfileDialog = ref(false)
const selectedFriend = ref(null)
let lgMq

const showToggle = computed(() => !isOpen.value && toggleReady.value && friends.value.length > 0)

function syncBodyClass(open) {
    if (import.meta.client) document.body.classList.toggle('friend-list-open', !!open && isLg.value)
}

function openFriendProfile(friend) {
    selectedFriend.value = friend
    showProfileDialog.value = true
}

function onSidebarAfterLeave() {
    if (!isOpen.value) toggleReady.value = true
}

function onBreakpointChange() {
    const next = lgMq.matches
    if (next === isLg.value) return
    isLg.value = next
    if (!next && isOpen.value) {
        isOpen.value = false
        toggleReady.value = true
    }
    syncBodyClass(isOpen.value)
}

watch(isOpen, (open) => {
    if (!import.meta.client) return
    // Desktop waits for slide @after-leave; mobile drawer resets immediately
    if (open && isLg.value) toggleReady.value = false
    if (!open && !isLg.value) toggleReady.value = true
    syncBodyClass(open)
    if (isLg.value) localStorage.setItem(STORAGE_KEY, String(open))
})

onMounted(() => {
    if (!import.meta.client) return
    lgMq = window.matchMedia('(min-width: 1024px)')
    isLg.value = lgMq.matches
    lgMq.addEventListener('change', onBreakpointChange)
    if (isLg.value && localStorage.getItem(STORAGE_KEY) === 'true') isOpen.value = true
})

onBeforeUnmount(() => {
    if (!import.meta.client) return
    document.body.classList.remove('friend-list-open')
    lgMq?.removeEventListener('change', onBreakpointChange)
})
</script>

<template>
    <!-- Desktop sidebar -->
    <Transition name="slide-left" @after-leave="onSidebarAfterLeave">
        <div
            v-if="isOpen && isLg"
            class="fixed right-0 top-0 z-30 hidden h-screen items-center lg:flex"
        >
            <button
                type="button"
                class="shrink-0 rounded-l-lg bg-white p-2 ring-1 ring-black/10 transition-[box-shadow] hover:ring-black/20 dark:bg-gray-950 dark:ring-white/15 dark:hover:ring-white/25"
                title="關閉好友列表"
                @click="isOpen = false"
            >
                <span class="material-symbols-rounded text-lg text-gray-600 dark:text-gray-300">chevron_right</span>
            </button>
            <div class="flex h-full w-80 flex-col border-l border-black/10 bg-white pt-16 shadow-2xl dark:border-white/10 dark:bg-gray-950">
                <div class="flex-1 overflow-y-auto p-3 pt-6">
                    <FriendListPanel dense :sections="friendSections" @profile="openFriendProfile" />
                </div>
            </div>
        </div>
    </Transition>

    <!-- Mobile drawer -->
    <ClientOnly>
        <BaseBottomDrawer v-if="!isLg" v-model="isOpen" title="好友列表" max-height="max-h-[85vh]">
            <FriendListPanel :sections="friendSections" @profile="openFriendProfile" />
        </BaseBottomDrawer>
    </ClientOnly>

    <!-- Reopen toggle -->
    <ClientOnly>
        <div class="fixed right-4 top-1/2 z-30 -translate-y-1/2">
            <Transition :name="isLg ? 'fade-slide-x' : 'fade-slide-y'">
                <button
                    v-if="showToggle"
                    type="button"
                    class="flex rounded-full bg-white p-2.5 shadow-md ring-1 ring-black/10 hover:ring-black/20 dark:bg-gray-950 dark:ring-white/15 dark:hover:ring-white/25"
                    title="顯示好友列表"
                    @click="isOpen = true"
                >
                    <span class="material-symbols-rounded text-xl text-gray-600 dark:text-gray-300">group</span>
                </button>
            </Transition>
        </div>
    </ClientOnly>

    <UserprofileDialog
        v-if="selectedFriend"
        v-model="showProfileDialog"
        :data="selectedFriend"
        @select="!isLg && (isOpen = false)"
    />
</template>

<style scoped>
.slide-left-enter-active,
.slide-left-leave-active {
    transition: transform 400ms cubic-bezier(0.32, 0.72, 0, 1);
    will-change: transform;
    backface-visibility: hidden;
}

.slide-left-enter-from,
.slide-left-leave-to {
    transform: translate3d(100%, 0, 0);
}

.fade-slide-x-enter-active,
.fade-slide-x-leave-active,
.fade-slide-y-enter-active,
.fade-slide-y-leave-active {
    transition:
        opacity 200ms ease-out,
        transform 200ms cubic-bezier(0.32, 0.72, 0, 1);
}

.fade-slide-x-enter-active,
.fade-slide-y-enter-active {
    transition-delay: 120ms;
}

.fade-slide-x-enter-from,
.fade-slide-x-leave-to {
    opacity: 0;
    transform: translate3d(-1.5rem, 0, 0);
}

.fade-slide-y-enter-from,
.fade-slide-y-leave-to {
    opacity: 0;
    transform: translate3d(0, 1.5rem, 0);
}

@media (prefers-reduced-motion: reduce) {
    .slide-left-enter-active,
    .slide-left-leave-active,
    .fade-slide-x-enter-active,
    .fade-slide-x-leave-active,
    .fade-slide-y-enter-active,
    .fade-slide-y-leave-active {
        transition-duration: 1ms;
        transition-delay: 0ms;
    }
}
</style>
