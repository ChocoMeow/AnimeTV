<script setup>
const props = defineProps({
    currentPage: {
        type: Number,
        required: true,
    },
    totalPage: {
        type: Number,
        required: true,
    },
})

const emit = defineEmits(["change"])

// Generate page numbers with dots
function getPageNumbers() {
    const delta = 2
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
                rangeWithDots.push("...")
            }
        }
        rangeWithDots.push(i)
        l = i
    }

    return rangeWithDots
}

function goToPage(page) {
    if (page !== "..." && page !== props.currentPage) {
        emit("change", page)
    }
}
</script>

<template>
    <div class="flex justify-center items-center">
        <div class="inline-flex items-center gap-2 bg-gray-950/5 dark:bg-white/10 rounded-xl shadow-lg p-2 border border-gray-200 dark:border-gray-700">
            <!-- First Page (Mobile Hidden) -->
            <button v-if="currentPage > 3" @click="emit('change', 1)" class="pagination-button hidden sm:flex" :disabled="currentPage === 1">
                <span class="material-icons text-sm">first_page</span>
            </button>

            <!-- Previous Page -->
            <button class="pagination-button pagination-nav" :class="{ 'pagination-disabled': currentPage === 1 }" :disabled="currentPage === 1" @click="emit('change', currentPage - 1)">
                <span class="material-icons text-sm">chevron_left</span>
                <span class="hidden sm:inline ml-1">上一頁</span>
            </button>

            <!-- Page Numbers -->
            <div class="flex items-center gap-1">
                <button
                    v-for="page in getPageNumbers()"
                    :key="page + '-btn'"
                    @click="goToPage(page)"
                    class="pagination-number"
                    :class="{
                        'pagination-active': page === currentPage,
                        'pagination-dots': page === '...',
                        'pagination-inactive': page !== currentPage && page !== '...',
                    }"
                    :disabled="page === '...'"
                >
                    {{ page }}
                </button>
            </div>

            <!-- Next Page -->
            <button class="pagination-button pagination-nav" :class="{ 'pagination-disabled': currentPage === totalPage }" :disabled="currentPage === totalPage" @click="emit('change', currentPage + 1)">
                <span class="hidden sm:inline mr-1">下一頁</span>
                <span class="material-icons text-sm">chevron_right</span>
            </button>

            <!-- Last Page (Mobile Hidden) -->
            <button v-if="currentPage < totalPage - 2" @click="emit('change', totalPage)" class="pagination-button hidden sm:flex" :disabled="currentPage === totalPage">
                <span class="material-icons text-sm">last_page</span>
            </button>
        </div>
    </div>

    <!-- Page Info (Mobile) -->
    <div class="flex justify-center mt-3 sm:hidden">
        <span class="text-sm text-gray-600 dark:text-gray-400">
            第 <span class="font-semibold text-gray-900 dark:text-gray-100">{{ currentPage }}</span> / {{ totalPage }} 頁
        </span>
    </div>
</template>

<style scoped>
/* Base Button Style */
.pagination-button {
    @apply min-w-[40px] h-10 px-3 rounded-lg font-medium text-sm
           flex items-center justify-center
           transition-all duration-300 transform;
}

/* Navigation Buttons (Prev/Next/First/Last) */
.pagination-nav {
    @apply bg-black/70 dark:bg-white text-white dark:text-black
           hover:bg-black/80 dark:hover:bg-gray-200
           hover:shadow-lg hover:-translate-y-0.5
           active:translate-y-0;
}

/* Page Number Buttons */
.pagination-number {
    @apply min-w-[40px] h-10 px-3 rounded-lg font-medium text-sm
           flex items-center justify-center
           transition-all duration-300 transform;
}

/* Active Page */
.pagination-active {
    @apply bg-black/70 dark:bg-white text-white dark:text-black
           shadow-lg shadow-black/30 dark:shadow-white/30
}

/* Inactive Pages */
.pagination-inactive {
    @apply bg-white dark:bg-white/10 text-gray-600 dark:text-gray-300 
           hover:bg-black/10 dark:hover:bg-white/20
           hover:text-black/70 dark:hover:text-white
           hover:shadow-md hover:-translate-y-0.5
           active:translate-y-0;
}

/* Dots */
.pagination-dots {
    @apply text-gray-400 dark:text-gray-600 cursor-default
           hover:bg-transparent hover:transform-none;
}

/* Disabled State */
.pagination-disabled {
    @apply opacity-40 cursor-not-allowed
           hover:shadow-none hover:transform-none;
}

/* Mobile Responsiveness */
@media (max-width: 640px) {
    .pagination-number {
        @apply min-w-[36px] h-9 px-2 text-xs;
    }

    .pagination-button {
        @apply min-w-[36px] h-9 px-2;
    }
}

/* Animation */
@keyframes pulse-subtle {
    0%,
    100% {
        opacity: 1;
    }
    50% {
        opacity: 0.8;
    }
}

.pagination-active {
    animation: pulse-subtle 2s ease-in-out infinite;
}
</style>
