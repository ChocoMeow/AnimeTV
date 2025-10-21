<script setup>
const appConfig = useAppConfig()
const user = useSupabaseUser()
const redirectInfo = useSupabaseCookieRedirect()

const status = ref("verifying") // 'verifying', 'success', 'error'
const message = ref("正在驗證您的身份...")
const userEmail = ref("")
const userName = ref("")
const userAvatarUrl = ref("")
const hasRedirected = ref(false)

// Get redirect path from cookies
const path = redirectInfo.pluck() || "/"

watch(
    user,
    async (newUser) => {
        if (newUser && !hasRedirected.value) {
            hasRedirected.value = true

            // User is authenticated
            status.value = "success"
            userEmail.value = newUser.email || ""
            userName.value = newUser.user_metadata?.full_name || newUser.user_metadata?.name || "用戶"
            userAvatarUrl.value = newUser.user_metadata?.avatar_url || ""
            message.value = "登入成功！"

            // Wait 1 seconds to show success message, then redirect
            setTimeout(() => {
                navigateTo(path, { replace: true })
            }, 1000)
        }
    },
    { immediate: true }
)

useHead({ title: `驗證中 | ${appConfig.siteName}` })
definePageMeta({
    layout: "",
})
</script>

<template>
    <div class="min-h-screen bg-gradient-to-br from-gray-50 via-indigo-50/30 to-purple-50/20 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800">
        <main class="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-8 flex items-center justify-center min-h-screen">
            <div class="confirm-card w-full max-w-md">
                <!-- Verifying State -->
                <div v-if="status === 'verifying'" class="text-center">
                    <div class="relative inline-flex items-center justify-center mb-6">
                        <!-- Outer rotating ring -->
                        <div class="absolute w-20 h-20 border-4 border-indigo-200 dark:border-indigo-900 border-t-indigo-600 dark:border-t-indigo-400 rounded-full animate-spin"></div>
                        <!-- Inner icon -->
                        <div class="w-16 h-16 rounded-full bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center shadow-lg">
                            <span class="material-icons text-white text-3xl">security</span>
                        </div>
                    </div>

                    <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">驗證中</h2>
                    <p class="text-sm text-gray-500 dark:text-gray-400">
                        {{ message }}
                    </p>

                    <!-- Loading dots animation -->
                    <div class="flex justify-center gap-2 mt-6">
                        <div class="w-2 h-2 bg-indigo-600 dark:bg-indigo-400 rounded-full animate-bounce" style="animation-delay: 0ms"></div>
                        <div class="w-2 h-2 bg-indigo-600 dark:bg-indigo-400 rounded-full animate-bounce" style="animation-delay: 150ms"></div>
                        <div class="w-2 h-2 bg-indigo-600 dark:bg-indigo-400 rounded-full animate-bounce" style="animation-delay: 300ms"></div>
                    </div>
                </div>

                <!-- Success State -->
                <div v-else-if="status === 'success'" class="text-center">
                    <div class="relative inline-flex items-center justify-center mb-6">
                        <!-- Success checkmark animation -->
                        <div class="w-20 h-20 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg animate-success-pop">
                            <span class="material-icons text-white text-4xl animate-checkmark">check</span>
                        </div>
                        <!-- Success ring -->
                        <div class="absolute w-24 h-24 border-4 border-green-200 dark:border-green-900 rounded-full animate-ping-slow"></div>
                    </div>

                    <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">登入成功！</h2>
                    <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">歡迎回來，{{ userName }}</p>

                    <!-- User info card -->
                    <div class="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 rounded-xl p-4 mb-4 border border-indigo-100 dark:border-indigo-800">
                        <div class="flex items-center justify-center gap-3">
                            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center overflow-hidden">
                                <img :src="userAvatarUrl" alt="" />
                            </div>
                            <div class="text-left">
                                <p class="text-xs text-gray-500 dark:text-gray-400">已登入為</p>
                                <p class="text-sm font-semibold text-gray-900 dark:text-white">{{ userEmail }}</p>
                            </div>
                        </div>
                    </div>

                    <p class="text-xs text-gray-500 dark:text-gray-400 flex items-center justify-center gap-1">
                        <span class="material-icons text-xs">schedule</span>
                        正在重定向到{{ redirectPath ? "您的目標頁面" : "首頁" }}...
                    </p>
                </div>

                <!-- Error State -->
                <div v-else-if="status === 'error'" class="text-center">
                    <div class="relative inline-flex items-center justify-center mb-6">
                        <div class="w-20 h-20 rounded-full bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center shadow-lg animate-error-shake">
                            <span class="material-icons text-white text-4xl">error_outline</span>
                        </div>
                    </div>

                    <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">登入失敗</h2>
                    <p class="text-sm text-gray-500 dark:text-gray-400 mb-6">
                        {{ message }}
                    </p>

                    <!-- Error details -->
                    <div class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 mb-4">
                        <div class="flex items-start gap-3 text-left">
                            <span class="material-icons text-red-600 dark:text-red-400 text-xl flex-shrink-0">info</span>
                            <div class="text-sm text-red-800 dark:text-red-300">
                                <p class="font-semibold mb-1">可能的原因：</p>
                                <ul class="text-xs space-y-1 list-disc list-inside">
                                    <li>網路連線問題</li>
                                    <li>驗證過期</li>
                                    <li>帳號權限問題</li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    <p class="text-xs text-gray-500 dark:text-gray-400 flex items-center justify-center gap-1">
                        <span class="material-icons text-xs">schedule</span>
                        3 秒後返回登入頁面...
                    </p>
                </div>
            </div>
        </main>
    </div>
</template>

<style scoped>
/* Confirm Card */
.confirm-card {
    @apply bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 sm:p-10 
           transition-all duration-300
           border border-gray-100 dark:border-gray-700;
    animation: fadeInUp 0.6s ease-out;
}

/* Custom Animations */
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

@keyframes success-pop {
    0% {
        transform: scale(0);
        opacity: 0;
    }
    50% {
        transform: scale(1.1);
    }
    100% {
        transform: scale(1);
        opacity: 1;
    }
}

@keyframes checkmark {
    0% {
        transform: scale(0) rotate(-45deg);
        opacity: 0;
    }
    50% {
        transform: scale(1.2) rotate(0deg);
    }
    100% {
        transform: scale(1) rotate(0deg);
        opacity: 1;
    }
}

@keyframes error-shake {
    0%,
    100% {
        transform: translateX(0);
    }
    10%,
    30%,
    50%,
    70%,
    90% {
        transform: translateX(-5px);
    }
    20%,
    40%,
    60%,
    80% {
        transform: translateX(5px);
    }
}

@keyframes ping-slow {
    0% {
        transform: scale(1);
        opacity: 1;
    }
    75%,
    100% {
        transform: scale(1.5);
        opacity: 0;
    }
}

.animate-success-pop {
    animation: success-pop 0.6s ease-out;
}

.animate-checkmark {
    animation: checkmark 0.6s ease-out 0.2s both;
}

.animate-error-shake {
    animation: error-shake 0.6s ease-out;
}

.animate-ping-slow {
    animation: ping-slow 2s cubic-bezier(0, 0, 0.2, 1) infinite;
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
</style>
