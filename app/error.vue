<script setup>
const props = defineProps({
    error: Object,
})

const appConfig = useAppConfig()
const router = useRouter()

const is404 = ref(props.error?.statusCode === 404)
const errorMessage = ref(is404.value ? "抱歉，我們找不到這個頁面" : "伺服器發生問題，請稍後再試")

const errorTitle = ref(is404.value ? "頁面不存在" : "出現錯誤")

function goHome() {
    router.push("/")
}

function goBack() {
    router.back()
}

useHead({
    title: is404.value ? `404 - 頁面不存在 | ${appConfig.siteName}` : `錯誤 | ${appConfig.siteName}`,
})
</script>

<template>
    <div class="min-h-screen bg-white dark:bg-gray-950 flex items-center justify-center px-4 relative overflow-hidden">
        <!-- Subtle Background Pattern -->
        <div class="absolute inset-0 bg-grid-pattern opacity-[0.02] dark:opacity-[0.03]"></div>

        <!-- Gradient Orbs -->
        <div class="absolute top-20 left-10 w-72 h-72 bg-gray-500/10 rounded-full blur-3xl animate-float"></div>
        <div class="absolute bottom-20 right-10 w-96 h-96 bg-gray-500/10 rounded-full blur-3xl animate-float-delay"></div>

        <main class="max-w-4xl w-full relative z-10">
            <div class="text-center space-y-8 py-12">
                <!-- Error Code - Large and Bold -->
                <div class="relative">
                    <h1 class="text-[clamp(6rem,20vw,12rem)] font-black leading-none tracking-tighter">
                        <span class="bg-gradient-to-br from-gray-900 via-gray-700 to-gray-500 dark:from-white dark:via-gray-200 dark:to-gray-400 bg-clip-text text-transparent">
                            {{ error?.statusCode || "500" }}
                        </span>
                    </h1>
                    <!-- Decorative line -->
                    <div class="absolute -bottom-4 left-1/2 -translate-x-1/2 w-24 h-1 bg-gray-600 dark:bg-gray-400 rounded-full"></div>
                </div>

                <!-- Error Title -->
                <div class="space-y-3 pt-4">
                    <h2 class="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white">
                        {{ errorTitle }}
                    </h2>

                    <!-- Error Message -->
                    <p class="text-lg sm:text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
                        {{ errorMessage }}
                    </p>
                </div>

                <!-- Error Details (for non-404 errors) -->
                <div v-if="error?.message && !is404" class="max-w-2xl mx-auto">
                    <details class="text-left group">
                        <summary class="cursor-pointer text-sm text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors flex items-center justify-center gap-2">
                            <span class="material-icons text-base group-open:rotate-180 transition-transform">expand_more</span>
                            技術細節
                        </summary>
                        <div class="mt-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800">
                            <code class="text-sm text-red-600 dark:text-red-400 font-mono break-words">
                                {{ error.message }}
                            </code>
                        </div>
                    </details>
                </div>

                <!-- Action Buttons -->
                <div class="flex flex-col sm:flex-row gap-4 justify-center items-center pt-6">
                    <button @click="goHome" class="action-btn primary group">
                        <span class="material-icons text-xl group-hover:scale-110 transition-transform">home</span>
                        <span>返回首頁</span>
                    </button>
                    <button @click="goBack" class="action-btn secondary group">
                        <span class="material-icons text-xl group-hover:-translate-x-1 transition-transform">arrow_back</span>
                        <span>返回上一頁</span>
                    </button>
                </div>
            </div>
        </main>
    </div>
</template>

<style scoped>
/* Grid Pattern Background */
.bg-grid-pattern {
    background-image: linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px);
    background-size: 40px 40px;
}

/* Action Buttons */
.action-btn {
    @apply px-8 py-4 rounded-full font-semibold text-base
           flex items-center justify-center gap-3
           transition-all duration-300
           w-full sm:w-auto min-w-[180px]
           focus:outline-none focus:ring-2 focus:ring-offset-2;
}

.action-btn.primary {
    @apply bg-gray-900 dark:bg-white 
           text-white dark:text-gray-900
           hover:scale-105 hover:shadow-2xl
           focus:ring-gray-900 dark:focus:ring-white;
}

.action-btn.secondary {
    @apply bg-transparent
           text-gray-700 dark:text-gray-300
           border-2 border-gray-300 dark:border-gray-700
           hover:border-gray-900 dark:hover:border-white
           hover:text-gray-900 dark:hover:text-white
           hover:scale-105
           focus:ring-gray-400 dark:focus:ring-gray-600;
}

/* Page entrance animation */
@keyframes fadeInUp {
    from {
        opacity: 0;
        transform: translateY(30px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

main {
    animation: fadeInUp 0.6s ease-out;
}
</style>
