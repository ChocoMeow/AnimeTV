<script setup>
const props = defineProps({
    currentPage: { type: Number, required: true },
    totalPage: { type: Number, required: true },
})

const emit = defineEmits(['change'])

const viewportWidth = ref(375)
const isDesktop = computed(() => viewportWidth.value >= 640)

function getPageNumbers(delta = 2) {
    const range = []
    const rangeWithDots = []
    let l

    for (let i = 1; i <= props.totalPage; i++) {
        if (i === 1 || i === props.totalPage || (i >= props.currentPage - delta && i <= props.currentPage + delta)) {
            range.push(i)
        }
    }

    for (let i of range) {
        if (l) {
            if (i - l === 2) {
                rangeWithDots.push(l + 1)
            } else if (i - l !== 1) {
                rangeWithDots.push('...')
            }
        }
        rangeWithDots.push(i)
        l = i
    }

    return rangeWithDots
}

function getPageWindow(delta) {
    const start = Math.max(1, props.currentPage - delta)
    const end = Math.min(props.totalPage, props.currentPage + delta)
    return Array.from({ length: end - start + 1 }, (_, i) => start + i)
}

const mobilePages = computed(() => {
    const w = viewportWidth.value
    const edgesVisible = props.currentPage > 1 && props.currentPage < props.totalPage
    let delta = 0
    if (!(w < 400 && edgesVisible)) {
        if (w >= 520) delta = 2
        else if (w >= 380) delta = 1
    }
    return getPageWindow(delta)
})

const desktopPages = computed(() => getPageNumbers())

const showFirstPage = computed(() =>
    isDesktop.value ? props.currentPage > 3 : props.currentPage > 1,
)

const showLastPage = computed(() =>
    isDesktop.value ? props.currentPage < props.totalPage - 2 : props.currentPage < props.totalPage,
)

function goToPage(page) {
    if (page !== '...' && page !== props.currentPage) {
        emit('change', page)
    }
}

function syncViewportWidth() {
    viewportWidth.value = window.innerWidth
}

onMounted(() => {
    syncViewportWidth()
    window.addEventListener('resize', syncViewportWidth, { passive: true })
})

onUnmounted(() => {
    window.removeEventListener('resize', syncViewportWidth)
})
</script>

<template>
    <div class="flex justify-center items-center px-2">
        <div class="inline-flex max-w-full items-center gap-1 rounded-full bg-black/[0.02] p-2 ring-1 ring-black/5 dark:bg-white/5 dark:ring-white/10 sm:gap-1.5 sm:p-1.5">
            <button
                v-if="showFirstPage"
                type="button"
                class="pagination-button pagination-edge"
                @click="goToPage(1)"
            >
                <span class="pagination-icon material-symbols-rounded">first_page</span>
            </button>

            <button
                type="button"
                class="pagination-button pagination-nav gap-1"
                :class="{ 'pagination-disabled': currentPage === 1 }"
                :disabled="currentPage === 1"
                @click="goToPage(currentPage - 1)"
            >
                <span class="pagination-icon material-symbols-rounded">chevron_left</span>
                <span class="hidden sm:inline leading-none">上一頁</span>
            </button>

            <div class="flex items-center gap-1 sm:hidden">
                <button
                    v-for="page in mobilePages"
                    :key="`m-${page}`"
                    type="button"
                    class="pagination-number"
                    :class="page === currentPage ? 'pagination-active' : 'pagination-inactive'"
                    @click="goToPage(page)"
                >
                    {{ page }}
                </button>
            </div>

            <div class="hidden items-center gap-1 sm:flex">
                <button
                    v-for="page in desktopPages"
                    :key="`${page}-btn`"
                    type="button"
                    class="pagination-number"
                    :class="{
                        'pagination-active': page === currentPage,
                        'pagination-dots': page === '...',
                        'pagination-inactive': page !== currentPage && page !== '...',
                    }"
                    :disabled="page === '...'"
                    @click="goToPage(page)"
                >
                    {{ page }}
                </button>
            </div>

            <button
                type="button"
                class="pagination-button pagination-nav gap-1"
                :class="{ 'pagination-disabled': currentPage === totalPage }"
                :disabled="currentPage === totalPage"
                @click="goToPage(currentPage + 1)"
            >
                <span class="hidden sm:inline leading-none">下一頁</span>
                <span class="pagination-icon material-symbols-rounded">chevron_right</span>
            </button>

            <button
                v-if="showLastPage"
                type="button"
                class="pagination-button pagination-edge"
                @click="goToPage(totalPage)"
            >
                <span class="pagination-icon material-symbols-rounded">last_page</span>
            </button>
        </div>
    </div>
</template>

<style scoped>
.pagination-button,
.pagination-number {
    @apply inline-flex h-9 min-w-9 shrink-0 items-center justify-center rounded-full px-3 text-sm font-medium leading-none transition-colors sm:h-10 sm:min-w-10;
}

.pagination-icon {
    @apply inline-flex size-5 shrink-0 items-center justify-center text-[20px] leading-none;
}

.pagination-nav {
    @apply bg-black/5 text-gray-700 ring-1 ring-black/5 hover:bg-black/10 dark:bg-white/10 dark:text-gray-200 dark:ring-white/10 dark:hover:bg-white/20;
}

.pagination-edge {
    @apply text-gray-600 hover:bg-black/5 dark:text-gray-400 dark:hover:bg-white/10;
}

.pagination-active {
    @apply bg-gray-900 font-semibold text-white dark:bg-white dark:text-gray-900;
}

.pagination-inactive {
    @apply tabular-nums text-gray-600 hover:bg-black/5 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-gray-100;
}

.pagination-dots {
    @apply min-w-8 cursor-default px-1 text-gray-400 hover:bg-transparent dark:text-gray-600;
}

.pagination-disabled {
    @apply cursor-not-allowed opacity-40 hover:bg-black/5 dark:hover:bg-white/10;
}

@media (max-width: 639px) {
    .pagination-button,
    .pagination-number {
        @apply h-11 min-w-11;
    }

    .pagination-icon {
        @apply size-6 text-[22px];
    }
}
</style>
