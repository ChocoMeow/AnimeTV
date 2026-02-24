<script setup>
const appConfig = useAppConfig()

const navExplore = [
    { label: '首頁', to: '/' },
    { label: '全部作品', to: '/show-all-anime' },
]

const navAccount = [
    { label: '觀看紀錄', to: '/history' },
    { label: '我的收藏', to: '/favorites' },
    { label: '個人設定', to: '/profile' },
]

const navLegal = [
    { label: '服務條款', to: '/terms' },
    { label: '隱私政策', to: '/privacy' },
]

const socialLinks = [
    {
        name: 'GitHub',
        url: appConfig.social?.github,
        icon: 'M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z',
    },
    {
        name: 'Ko-fi',
        url: appConfig.social?.kofi,
        icon: 'M23.881 8.948c-.773-4.085-4.859-4.593-4.859-4.593H.723c-.604 0-.679.798-.679.798s-.082 7.324-.022 11.822c.164 2.424 2.586 2.672 2.586 2.672s8.267-.023 11.966-.049c2.438-.426 2.683-2.566 2.658-3.734 4.352.24 7.422-2.831 6.649-6.916zm-11.062 3.511c-1.246 1.453-4.011 3.976-4.011 3.976s-.121.119-.31.023c-.076-.057-.108-.09-.108-.09-.443-.441-3.368-3.049-4.034-3.954-.709-.965-1.041-2.7-.091-3.71.951-1.01 3.005-1.086 4.363.407 0 0 1.565-1.782 3.468-.963 1.904.82 1.832 3.011.723 4.311zm6.173.478c-.928.116-1.682.028-1.682.028V7.284h1.77s1.971.551 1.971 2.638c0 1.913-.985 2.667-2.059 3.015z',
    },
].filter((s) => s.url)

const year = new Date().getFullYear()
</script>

<template>
    <footer class="relative mt-auto border-t border-gray-200/80 dark:border-white/10 bg-gray-50/80 dark:bg-gray-950/80 backdrop-blur-sm">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
            <!-- Main content: flex row on desktop, stacked on mobile -->
            <div class="flex flex-col gap-10 lg:flex-row lg:flex-wrap lg:justify-between lg:gap-x-12 lg:gap-y-8">
                <!-- Brand -->
                <div class="lg:max-w-xs">
                    <NuxtLink to="/" class="inline-flex items-center gap-2 group">
                        <img src="/icons/icon_1024x1024.png" :alt="appConfig.siteName" class="w-10 h-10 rounded-xl" />
                        <span class="text-lg font-bold text-gray-900 dark:text-white group-hover:opacity-90">{{ appConfig.siteName }}</span>
                    </NuxtLink>
                    <p class="mt-3 text-sm text-gray-500 dark:text-gray-400">
                        隨時隨地探索與觀賞您喜愛的動畫
                    </p>
                </div>

                <!-- Link columns -->
                <div class="flex flex-wrap gap-x-14 gap-y-8 sm:gap-x-16 lg:gap-x-20">
                    <!-- Explore -->
                    <div>
                        <h3 class="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">探索</h3>
                        <ul class="space-y-2">
                            <li v-for="item in navExplore" :key="item.to">
                                <NuxtLink
                                    :to="item.to"
                                    class="text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
                                >
                                    {{ item.label }}
                                </NuxtLink>
                            </li>
                        </ul>
                    </div>

                    <!-- Account -->
                    <div>
                        <h3 class="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">帳戶</h3>
                        <ul class="space-y-2">
                            <li v-for="item in navAccount" :key="item.to">
                                <NuxtLink
                                    :to="item.to"
                                    class="text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
                                >
                                    {{ item.label }}
                                </NuxtLink>
                            </li>
                        </ul>
                    </div>

                    <!-- Legal -->
                    <div>
                        <h3 class="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">法律</h3>
                        <ul class="space-y-2">
                            <li v-for="item in navLegal" :key="item.to">
                                <NuxtLink
                                    :to="item.to"
                                    class="text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
                                >
                                    {{ item.label }}
                                </NuxtLink>
                            </li>
                        </ul>
                    </div>

                    <!-- Follow -->
                    <div class="lg:text-right">
                        <h3 class="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">
                            {{ socialLinks.length ? '追蹤我們' : '使用提示' }}
                        </h3>
                        <p v-if="socialLinks.length" class="text-sm text-gray-500 dark:text-gray-400 mb-3">
                            在社群關注我們，獲取最新動態與更新
                        </p>
                        <div v-if="socialLinks.length" class="flex flex-wrap gap-3 lg:justify-end">
                            <a
                                v-for="social in socialLinks"
                                :key="social.name"
                                :href="social.url"
                                target="_blank"
                                rel="noopener noreferrer"
                                :aria-label="social.name"
                                class="inline-flex w-10 h-10 rounded-xl bg-gray-200/80 dark:bg-white/10 items-center justify-center text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-300 dark:hover:bg-white/20 transition-all duration-200 hover:scale-105"
                            >
                                <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                    <path :d="social.icon" />
                                </svg>
                            </a>
                        </div>
                        <p class="mt-3 text-xs text-gray-400 dark:text-gray-500">
                            支援 PWA · 可加入主畫面離線使用
                        </p>
                    </div>
                </div>
            </div>

            <!-- Bottom bar -->
            <div class="mt-10 pt-8 border-t border-gray-200/80 dark:border-white/10">
                <p class="text-sm text-gray-500 dark:text-gray-400">
                    © {{ year }} {{ appConfig.siteName }}. 保留所有權利。
                </p>
            </div>
        </div>
    </footer>
</template>
