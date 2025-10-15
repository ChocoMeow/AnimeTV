<script setup>
import { ref } from "vue"
import { useRouter } from "vue-router"

const props = defineProps({
    error: Object
})

const router = useRouter()

const is404 = ref(props.error?.statusCode === 404)
const errorMessage = ref(
    is404.value 
        ? "找不到您要尋找的頁面" 
        : "發生了一些問題"
)

const errorTitle = ref(
    is404.value 
        ? "頁面不存在" 
        : "出現錯誤"
)

function goHome() {
    router.push("/")
}

function goBack() {
    router.back()
}

useHead({ 
    title: is404.value ? "404 - 頁面不存在 | Anime Hub" : "錯誤 | Anime Hub"
})
</script>

<template>
    <div class="min-h-screen bg-gradient-to-br from-gray-50 via-indigo-50/30 to-purple-50/20 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 flex items-center justify-center px-4">
        <main class="max-w-2xl w-full">
            <!-- Error Card -->
            <div class="error-card">
                <!-- Animated Icon -->
                <div class="text-center mb-8">
                    <div class="inline-flex items-center justify-center w-24 h-24 rounded-full bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/30 dark:to-purple-900/30 mb-6 animate-bounce-slow">
                        <span class="material-icons text-6xl text-indigo-600 dark:text-indigo-400">
                            {{ is404 ? 'search_off' : 'error_outline' }}
                        </span>
                    </div>
                    
                    <!-- Error Code -->
                    <div class="mb-4">
                        <h1 class="text-8xl font-black bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent mb-2">
                            {{ error?.statusCode || '500' }}
                        </h1>
                    </div>

                    <!-- Error Title -->
                    <h2 class="text-3xl font-bold text-gray-900 dark:text-white mb-3">
                        {{ errorTitle }}
                    </h2>

                    <!-- Error Message -->
                    <p class="text-gray-600 dark:text-gray-400 text-lg mb-8">
                        {{ errorMessage }}
                    </p>

                    <!-- Error Details (if available) -->
                    <div v-if="error?.message && !is404" class="mb-8 p-4 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800">
                        <p class="text-sm text-red-600 dark:text-red-400 font-mono">
                            {{ error.message }}
                        </p>
                    </div>
                </div>

                <!-- Action Buttons -->
                <div class="flex flex-col sm:flex-row gap-4 justify-center items-center">
                    <button @click="goHome" class="btn-primary group">
                        <span class="material-icons text-xl mr-2 group-hover:rotate-12 transition-transform">home</span>
                        返回首頁
                    </button>
                    <button @click="goBack" class="btn-secondary group">
                        <span class="material-icons text-xl mr-2 group-hover:-translate-x-1 transition-transform">arrow_back</span>
                        返回上一頁
                    </button>
                </div>

                <!-- Decorative Elements -->
                <div class="mt-12 pt-8 border-t border-gray-200 dark:border-gray-700">
                    <div class="flex items-center justify-center gap-6 text-gray-400 dark:text-gray-600">
                        <span class="material-icons text-4xl opacity-50 animate-float">live_tv</span>
                        <span class="material-icons text-3xl opacity-30 animate-float-delay-1">movie</span>
                        <span class="material-icons text-4xl opacity-40 animate-float-delay-2">theaters</span>
                        <span class="material-icons text-3xl opacity-30 animate-float-delay-3">play_circle</span>
                    </div>
                </div>
            </div>

            <!-- Helpful Links (for 404) -->
            <div v-if="is404" class="mt-8 text-center">
                <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">您可能在尋找：</p>
                <div class="flex flex-wrap gap-3 justify-center">
                    <NuxtLink to="/" class="link-tag">
                        <span class="material-icons text-sm mr-1">home</span>
                        首頁
                    </NuxtLink>
                    <NuxtLink to="/show-all-anime" class="link-tag">
                        <span class="material-icons text-sm mr-1">list</span>
                        所有動漫
                    </NuxtLink>
                </div>
            </div>
        </main>
    </div>
</template>

<style scoped>
/* Error Card Styles */
.error-card {
    @apply bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 sm:p-12 
           transition-all duration-300 
           border border-gray-100 dark:border-gray-700
           backdrop-blur-sm;
}

/* Button Styles */
.btn-primary {
    @apply px-6 py-3 rounded-xl text-base font-semibold
           bg-gradient-to-r from-indigo-600 to-purple-600 text-white
           shadow-lg shadow-indigo-500/30 dark:shadow-purple-500/30
           hover:shadow-xl hover:shadow-indigo-500/40 dark:hover:shadow-purple-500/40
           hover:-translate-y-1
           transition-all duration-300
           flex items-center justify-center
           w-full sm:w-auto;
}

.btn-secondary {
    @apply px-6 py-3 rounded-xl text-base font-semibold
           bg-white dark:bg-gray-700 
           text-gray-700 dark:text-gray-200
           border-2 border-gray-300 dark:border-gray-600
           hover:border-indigo-400 dark:hover:border-indigo-500
           hover:text-indigo-600 dark:hover:text-indigo-400
           hover:shadow-lg
           hover:-translate-y-1
           transition-all duration-300
           flex items-center justify-center
           w-full sm:w-auto;
}

/* Link Tag Styles */
.link-tag {
    @apply inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium
           bg-gray-100 dark:bg-gray-700
           text-gray-700 dark:text-gray-300
           hover:bg-indigo-100 dark:hover:bg-indigo-900/30
           hover:text-indigo-600 dark:hover:text-indigo-400
           transition-all duration-300
           hover:shadow-md
           hover:-translate-y-0.5;
}

/* Animation Keyframes */
@keyframes bounce-slow {
    0%, 100% {
        transform: translateY(0);
    }
    50% {
        transform: translateY(-10px);
    }
}

@keyframes float {
    0%, 100% {
        transform: translateY(0);
    }
    50% {
        transform: translateY(-15px);
    }
}

.animate-bounce-slow {
    animation: bounce-slow 2s ease-in-out infinite;
}

.animate-float {
    animation: float 3s ease-in-out infinite;
}

.animate-float-delay-1 {
    animation: float 3s ease-in-out infinite;
    animation-delay: 0.5s;
}

.animate-float-delay-2 {
    animation: float 3s ease-in-out infinite;
    animation-delay: 1s;
}

.animate-float-delay-3 {
    animation: float 3s ease-in-out infinite;
    animation-delay: 1.5s;
}

/* Fade In Animation */
@keyframes fadeInUp {
    from {
        opacity: 0;
        transform: translateY(20px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

.error-card {
    animation: fadeInUp 0.6s ease-out;
}
</style>

