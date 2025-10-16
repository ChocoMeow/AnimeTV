<script setup>
const loading = ref(false)
const error = ref(null)

const client = useSupabaseClient()

async function signInWithGoogle() {
    loading.value = true
    error.value = null

    try {
        const { data, error } = await client.auth.signInWithOAuth({
            provider: "google",
            options: {
                redirectTo: `${window.location.origin}/auth/confirm`,
            },
        })

        if (error) {
            throw error
        }
    } catch (err) {
        console.error("Login error:", err)
        error.value = "登入失敗，請稍後再試"
        loading.value = false
    }
}

definePageMeta({
    layout: "",
})
useHead({ title: "登入 | Anime Hub" })
</script>

<template>
    <div class="min-h-screen bg-gradient-to-br from-gray-50 via-indigo-50/30 to-purple-50/20 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800">
        <main class="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-8 flex items-center justify-center min-h-screen">
            <div class="login-card w-full max-w-md">
                <!-- Logo/Header Section -->
                <div class="text-center mb-8">
                    <div class="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br mb-4 shadow-lg">
                        <!-- <span class="material-icons text-white text-3xl">movie_filter</span> -->
                        <img class="flex items-center justify-center" src="/icons/icon_1024x1024.png" alt="" />
                    </div>
                    <h1 class="text-3xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-300 bg-clip-text text-transparent mb-2">歡迎回來</h1>
                    <p class="text-sm text-gray-500 dark:text-gray-400">使用 Google 帳號登入 Anime Hub</p>
                </div>

                <!-- Error Message -->
                <div v-if="error" class="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
                    <div class="flex items-center gap-2 text-red-600 dark:text-red-400">
                        <span class="material-icons text-sm">error</span>
                        <p class="text-sm font-medium">{{ error }}</p>
                    </div>
                </div>

                <!-- Google Sign In Button -->
                <button @click="signInWithGoogle" :disabled="loading" class="google-btn group">
                    <div class="flex items-center justify-center gap-3">
                        <!-- Google Logo -->
                        <svg v-if="!loading" class="w-5 h-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                        </svg>

                        <!-- Loading Spinner -->
                        <div v-if="loading" class="w-5 h-5 border-2 border-gray-300 border-t-white rounded-full animate-spin"></div>

                        <span class="font-semibold text-base">
                            {{ loading ? "登入中..." : "使用 Google 登入" }}
                        </span>
                    </div>
                </button>

                <!-- Footer -->
                <div class="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
                    <p class="text-xs text-center text-gray-500 dark:text-gray-400">
                        登入即表示您同意我們的
                        <a href="#" class="text-indigo-600 dark:text-indigo-400 hover:underline">服務條款</a>
                        和
                        <a href="#" class="text-indigo-600 dark:text-indigo-400 hover:underline">隱私政策</a>
                    </p>
                </div>
            </div>
        </main>
    </div>
</template>

<style scoped>
/* Login Card */
.login-card {
    @apply bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 sm:p-10 
           transition-all duration-300 hover:shadow-2xl
           border border-gray-100 dark:border-gray-700;
    animation: fadeInUp 0.6s ease-out;
}

/* Google Button */
.google-btn {
    @apply w-full py-4 px-6 rounded-xl font-medium text-gray-700 dark:text-gray-200
           bg-white dark:bg-gray-700 border-2 border-gray-300 dark:border-gray-600
           hover:border-indigo-400 dark:hover:border-indigo-500
           hover:shadow-lg hover:-translate-y-0.5
           transition-all duration-300 
           disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none
           focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800;
}

/* Smooth Scrollbar */
::-webkit-scrollbar {
    width: 8px;
    height: 8px;
}

::-webkit-scrollbar-track {
    @apply bg-gray-100 dark:bg-gray-800;
}

::-webkit-scrollbar-thumb {
    @apply bg-gray-300 dark:bg-gray-600 rounded-full;
}

::-webkit-scrollbar-thumb:hover {
    @apply bg-gray-400 dark:bg-gray-500;
}

/* Animation */
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
</style>
