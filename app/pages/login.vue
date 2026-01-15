<script setup>
const appConfig = useAppConfig()
const user = useSupabaseUser()
const redirectInfo = useSupabaseCookieRedirect()

const loading = ref(false)
const error = ref(null)
const featuredAnime = ref([])
const randomMobileAnime = ref(null)
const animeLoaded = ref(false)
const animationsReady = ref(false)
const scrollContainer = ref(null)

// Auth status states
const authStatus = ref("idle") // 'idle', 'verifying', 'success', 'error'
const authMessage = ref("")
const userEmail = ref("")
const userName = ref("")
const userAvatarUrl = ref("")
const hasRedirected = ref(false)

// Get redirect path from cookies
const path = redirectInfo.pluck() || "/"

const client = useSupabaseClient()

// OAuth providers configuration
const oauthProviders = [
    {
        id: 'google',
        name: 'Google',
        label: '使用 Google 登入',
        icon: 'google',
        buttonClass: 'modern-login-btn'
    },
    {
        id: 'discord',
        name: 'Discord',
        label: '使用 Discord 登入',
        icon: 'discord',
        buttonClass: 'modern-login-btn-discord'
    }
]

// Fetch featured anime for background
async function fetchFeaturedAnime() {
    try {
        const res = await $fetch("/api/public-animeList")
        if (res.results && res.results.length > 0) {
            const animeWithImages = res.results.filter(anime => anime.image)
            featuredAnime.value = animeWithImages
            
            // Set random mobile background
            if (animeWithImages.length > 0) {
                const randomIndex = Math.floor(Math.random() * animeWithImages.length)
                randomMobileAnime.value = animeWithImages[randomIndex]
            }
            
            // Mark as loaded after a short delay to trigger fade-in
            await nextTick()
            setTimeout(() => {
                animeLoaded.value = true
                // Force Safari to recognize animations by triggering a reflow
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        // Force reflow by reading layout properties
                        if (scrollContainer.value) {
                            const lanes = scrollContainer.value.querySelectorAll('.anime-scroll-track')
                            if (lanes.length > 0) {
                                lanes.forEach(lane => {
                                    // Trigger reflow - this forces Safari to recalculate and start animations
                                    void lane.offsetHeight
                                })
                            }
                        }
                        // Small additional delay for Safari
                        setTimeout(() => {
                            animationsReady.value = true
                        }, 50)
                    })
                })
            }, 150)
        }
    } catch (err) {
        console.error("Failed to fetch featured anime:", err)
    }
}

// Shuffle array function
function shuffleArray(array) {
    const shuffled = [...array]
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    return shuffled
}

// Create randomized lanes dynamically
const createLane = () => {
    if (!featuredAnime.value.length) return []
    // Duplicate array twice for seamless infinite scrolling
    return [...shuffleArray(featuredAnime.value), ...shuffleArray(featuredAnime.value)]
}

// Lane configurations (5 lanes total, 3 visible on lg, 5 on xl)
const lanes = computed(() => [
    { class: 'lane-down', anime: createLane(), extra: '' },
    { class: 'lane-down lane-2', anime: createLane(), extra: '' },
    { class: 'lane-down lane-3', anime: createLane(), extra: '' },
    { class: 'lane-down lane-4', anime: createLane(), extra: 'hidden xl:block' },
    { class: 'lane-down lane-5', anime: createLane(), extra: 'hidden xl:block' },
])

// Fetch featured anime on mount
onMounted(async () => {
    await fetchFeaturedAnime()
})


async function signInWithOAuth(provider) {
    loading.value = true
    error.value = null
    authStatus.value = "idle"

    try {
        const { data, error } = await client.auth.signInWithOAuth({
            provider: provider,
            options: {
                redirectTo: `${window.location.origin}/login`,
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

// Watch for user authentication (OAuth callback)
watch(
    user,
    async (newUser) => {
        if (newUser && !hasRedirected.value) {
            hasRedirected.value = true
            authStatus.value = "success"
            userEmail.value = newUser.email || ""
            userName.value = newUser.user_metadata?.full_name || newUser.user_metadata?.name || "用戶"
            userAvatarUrl.value = newUser.user_metadata?.avatar_url || ""
            authMessage.value = "登入成功！"

            // Wait 1 second to show success message, then redirect
            setTimeout(() => {
                navigateTo(path, { replace: true })
            }, 1000)
        } else if (!newUser && authStatus.value === "idle") {
            // Check if we're coming from OAuth callback
            if (import.meta.client) {
                const urlParams = new URLSearchParams(window.location.search)
                if (urlParams.has("code") || urlParams.has("error")) {
                    authStatus.value = "verifying"
                    authMessage.value = "正在驗證您的身份..."
                }
            }
        }
    },
    { immediate: true }
)

definePageMeta({
    layout: "",
})
useHead({ title: `登入 | ${appConfig.siteName}` })
</script>

<template>
    <div class="min-h-screen flex relative overflow-hidden bg-white dark:bg-gray-900">
        <!-- Left Side: Anime Showcase -->
        <div class="hidden lg:flex lg:w-2/3 relative overflow-hidden">
            <!-- Infinite Scrolling Lanes -->
            <div ref="scrollContainer" class="absolute inset-0 flex flex-row gap-6">
                    <div
                        v-for="(lane, i) in lanes"
                        :key="i"
                        :class="['anime-scroll-lane', lane.class, lane.extra]"
                    >
                        <div :class="['anime-scroll-track', { 'animate-ready': animationsReady }]">
                            <div
                                v-for="(anime, index) in lane.anime"
                                :key="`${lane.class}-${anime.refId || index}-${index}`"
                                class="anime-scroll-item"
                            >
                                <div class="relative w-full h-full rounded-2xl overflow-hidden shadow-lg group">
                                    <img
                                        v-if="anime.image"
                                        :src="anime.image"
                                        :alt="anime.title"
                                        :class="['w-full h-full object-cover transition-all duration-500 group-hover:scale-110 rounded-2xl border-2 border-gray-300 dark:border-white/10', animeLoaded ? 'fade-in-image' : 'opacity-0']"
                                    />
                                    <div class="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl"></div>
                                </div>
                            </div>
                        </div>
                    </div>
            </div>
            
            <!-- Gradient Overlay -->
            <div class="absolute inset-0 bg-gradient-to-r from-white/60 via-white/40 to-transparent dark:from-gray-900 dark:via-gray-900/80 dark:to-transparent z-[5]"></div>
            
            <!-- Info Overlay -->
            <div class="absolute bottom-0 left-0 right-0 p-8 z-20 pointer-events-none">
                <div class="space-y-2">
                    <h3 class="text-3xl font-bold text-gray-900 dark:text-white drop-shadow-lg">
                        探索精彩動漫
                    </h3>
                    <p class="text-gray-700 dark:text-white/80 text-sm">
                        無限滾動瀏覽精選作品
                    </p>
                </div>
            </div>
        </div>

        <!-- Right Side: Login Form / Auth Status -->
        <div class="w-full lg:w-1/3 flex items-center justify-center p-6 sm:p-8 lg:p-12 relative z-10">
            <div class="w-full max-w-md space-y-8">

                <!-- Verifying State -->
                <div v-if="authStatus === 'verifying'" class="text-center space-y-6">
                    <div class="relative inline-flex items-center justify-center">
                        <!-- Outer rotating ring -->
                        <div class="absolute w-20 h-20 border-4 border-gray-300 dark:border-gray-600 border-t-gray-900 dark:border-t-gray-100 rounded-full animate-spin"></div>
                        <!-- Inner icon -->
                        <div class="w-16 h-16 rounded-full bg-gray-600 dark:bg-gray-800 flex items-center justify-center shadow-lg">
                            <span class="material-icons text-white text-3xl">security</span>
                        </div>
                    </div>

                    <div>
                        <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">驗證中</h2>
                        <p class="text-sm text-gray-500 dark:text-gray-400">{{ authMessage }}</p>
                    </div>

                    <!-- Loading dots animation -->
                    <div class="flex justify-center gap-2">
                        <div class="w-2 h-2 bg-gray-600 dark:bg-gray-400 rounded-full animate-bounce" style="animation-delay: 0ms"></div>
                        <div class="w-2 h-2 bg-gray-600 dark:bg-gray-400 rounded-full animate-bounce" style="animation-delay: 150ms"></div>
                        <div class="w-2 h-2 bg-gray-600 dark:bg-gray-400 rounded-full animate-bounce" style="animation-delay: 300ms"></div>
                    </div>
                </div>

                <!-- Success State -->
                <div v-else-if="authStatus === 'success'" class="text-center space-y-6">
                    <div class="relative inline-flex items-center justify-center">
                        <!-- Success checkmark animation -->
                        <div class="w-20 h-20 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg animate-success-pop">
                            <span class="material-icons text-white text-4xl animate-checkmark">check</span>
                        </div>
                        <!-- Success ring -->
                        <div class="absolute w-24 h-24 border-4 border-green-200 dark:border-green-900 rounded-full animate-ping-slow"></div>
                    </div>

                    <div>
                        <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">登入成功！</h2>
                        <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">歡迎回來，{{ userName }}</p>
                    </div>

                    <!-- User info -->
                    <div class="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
                        <div class="flex items-center justify-center gap-3">
                            <div class="w-10 h-10 rounded-full bg-gray-600 dark:bg-gray-800 flex items-center justify-center overflow-hidden">
                                <img v-if="userAvatarUrl" :src="userAvatarUrl" alt="" class="w-full h-full object-cover" />
                            </div>
                            <div class="text-left">
                                <p class="text-xs text-gray-500 dark:text-gray-400">已登入為</p>
                                <p class="text-sm font-semibold text-gray-900 dark:text-white">{{ userEmail }}</p>
                            </div>
                        </div>
                    </div>

                    <p class="text-xs text-gray-500 dark:text-gray-400 flex items-center justify-center gap-1">
                        <span class="material-icons text-xs">schedule</span>
                        正在重定向到{{ path ? "您的目標頁面" : "首頁" }}...
                    </p>
                </div>

                <!-- Login Form (Default State) -->
                <div v-else class="space-y-8">
                    <!-- Logo -->
                    <div class="flex justify-center lg:justify-start">
                        <img class="w-16 h-16" src="/icons/icon_1024x1024.png" alt="" />
                    </div>
                    
                    <!-- Welcome Section -->
                    <div class="text-center lg:text-left space-y-3">
                        <h1 class="text-4xl sm:text-5xl font-bold text-gray-900 dark:text-white">
                            歡迎回來
                        </h1>
                        <p class="text-lg text-gray-600 dark:text-gray-300">
                            開始您的動漫之旅
                        </p>
                    </div>

                    <!-- Error Message -->
                    <Transition name="fade">
                        <div v-if="error" class="p-4 bg-red-50 dark:bg-red-500/10 backdrop-blur-sm border border-red-200 dark:border-red-500/30 rounded-xl">
                            <div class="flex items-center gap-2 text-red-600 dark:text-red-400">
                                <span class="material-icons text-sm">error</span>
                                <p class="text-sm font-medium">{{ error }}</p>
                            </div>
                        </div>
                    </Transition>

                    <!-- Login Buttons -->
                    <div class="space-y-3">
                        <button
                            v-for="provider in oauthProviders"
                            :key="provider.id"
                            @click="signInWithOAuth(provider.id)"
                            :disabled="loading"
                            :class="[provider.buttonClass, 'group w-full']"
                        >
                            <div class="flex items-center justify-center gap-3">
                                <!-- Provider Icon -->
                                <template v-if="!loading">
                                    <!-- Google Icon -->
                                    <svg v-if="provider.icon === 'google'" class="w-5 h-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                                    </svg>
                                    <!-- Discord Icon -->
                                    <svg v-else-if="provider.icon === 'discord'" class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                                    </svg>
                                </template>

                                <!-- Loading Spinner -->
                                <div v-if="loading" class="w-5 h-5 border-2 border-gray-300 dark:border-gray-600 border-t-gray-900 dark:border-t-white rounded-full animate-spin"></div>

                                <span class="font-semibold text-base">
                                    {{ loading ? "登入中..." : provider.label }}
                                </span>
                            </div>
                        </button>
                    </div>

                    <!-- Footer -->
                    <div class="pt-6 border-t border-gray-200 dark:border-white/10">
                        <p class="text-xs text-center text-gray-500 dark:text-gray-400">
                            登入即表示您同意我們的
                            <a href="#" class="text-gray-700 dark:text-white/80 hover:text-gray-900 dark:hover:text-white hover:underline transition-colors">服務條款</a>
                            和
                            <a href="#" class="text-gray-700 dark:text-white/80 hover:text-gray-900 dark:hover:text-white hover:underline transition-colors">隱私政策</a>
                        </p>
                    </div>
                </div>
            </div>
        </div>

        <!-- Mobile Background: Show random anime image -->
        <div class="lg:hidden absolute inset-0 z-0">
            <div v-if="randomMobileAnime?.image" class="absolute inset-0">
                <img
                    :src="randomMobileAnime.image"
                    :alt="randomMobileAnime.title"
                    class="w-full h-full object-cover"
                />
            </div>
            <div class="absolute inset-0 bg-gradient-to-b from-white via-white/90 to-white dark:from-gray-900 dark:via-gray-900/90 dark:to-gray-900"></div>
        </div>
    </div>
</template>

<style scoped>
/* Scrolling Lanes */
.anime-scroll-lane {
    flex: 1;
    overflow: hidden;
    position: relative;
}

.anime-scroll-track {
    display: flex;
    flex-direction: column;
    will-change: transform;
    transform: translateZ(0);
    -webkit-transform: translateZ(0);
    backface-visibility: hidden;
    -webkit-backface-visibility: hidden;
}

/* All lanes scroll down with different speeds - only when ready */
.lane-down .anime-scroll-track.animate-ready {
    animation: scrollDown 120s linear infinite;
    -webkit-animation: scrollDown 120s linear infinite;
}

.lane-2 .anime-scroll-track.animate-ready {
    animation: scrollDown 140s linear infinite;
    -webkit-animation: scrollDown 140s linear infinite;
}

.lane-3 .anime-scroll-track.animate-ready {
    animation: scrollDown 110s linear infinite;
    -webkit-animation: scrollDown 110s linear infinite;
}

.lane-4 .anime-scroll-track.animate-ready {
    animation: scrollDown 150s linear infinite;
    -webkit-animation: scrollDown 150s linear infinite;
}

.lane-5 .anime-scroll-track.animate-ready {
    animation: scrollDown 130s linear infinite;
    -webkit-animation: scrollDown 130s linear infinite;
}

.anime-scroll-item {
    flex-shrink: 0;
    width: 100%;
    aspect-ratio: 9 / 13;
    position: relative;
    margin: 0.75rem 0;
    overflow: visible;
}

/* Modern Login Button */
.modern-login-btn {
    @apply px-6 py-4 rounded-xl font-semibold text-base
           flex items-center justify-center gap-3
           transition-all duration-200
           bg-white dark:bg-white
           border-2 border-gray-300 dark:border-transparent
           hover:bg-gray-50 dark:hover:bg-gray-50
           hover:shadow-lg dark:hover:shadow-none
           active:bg-gray-100 dark:active:bg-gray-100
           focus:outline-none focus:ring-2 focus:ring-gray-400 dark:focus:ring-white focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-gray-900
           disabled:opacity-50 disabled:cursor-not-allowed
           text-gray-900;
}

/* Discord Login Button */
.modern-login-btn-discord {
    @apply px-6 py-4 rounded-xl font-semibold text-base
           flex items-center justify-center gap-3
           transition-all duration-200
           bg-[#5865F2] dark:bg-[#5865F2]
           border-2 border-[#5865F2] dark:border-[#5865F2]
           hover:bg-[#4752C4] dark:hover:bg-[#4752C4]
           hover:shadow-lg dark:hover:shadow-lg
           active:bg-[#3C45A5] dark:active:bg-[#3C45A5]
           focus:outline-none focus:ring-2 focus:ring-[#5865F2] dark:focus:ring-[#5865F2] focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-gray-900
           disabled:opacity-50 disabled:cursor-not-allowed
           text-white;
}

/* Fade in image animation */
.fade-in-image {
    opacity: 1;
    animation: fadeInImage 0.8s ease-out;
}

/* Infinite Scroll Animation - Top to Bottom */
@keyframes scrollDown {
    0% {
        transform: translate3d(0, 0, 0);
        -webkit-transform: translate3d(0, 0, 0);
    }
    100% {
        transform: translate3d(0, -50%, 0);
        -webkit-transform: translate3d(0, -50%, 0);
    }
}

@keyframes fadeInImage {
    from {
        opacity: 0;
        transform: scale(0.95);
    }
    to {
        opacity: 1;
        transform: scale(1);
    }
}

/* Auth Status Animations */
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

.animate-ping-slow {
    animation: ping-slow 2s cubic-bezier(0, 0, 0.2, 1) infinite;
}

/* Fade transition */
.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}

</style>
