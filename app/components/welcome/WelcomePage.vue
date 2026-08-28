<script setup>
const appConfig = useAppConfig()
const user = useSupabaseUser()

const deferredInstall = ref(null)
const installReady = ref(false)

const stormChars = '追番動畫觀看紀錄收藏離線下載好友播放新番搜尋劇場模式'.split('')

const githubIconPath = 'M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z'

const footerLinks = [
    { label: 'GitHub 原始碼', href: appConfig.social.github, external: true },
    { label: '服務條款', to: '/terms' },
    { label: '隱私政策', to: '/privacy' },
    { label: 'Ko-fi', href: appConfig.social.kofi, external: true },
]

function onBeforeInstall(e) {
    e.preventDefault()
    deferredInstall.value = e
    installReady.value = true
}

async function promptInstall() {
    const prompt = deferredInstall.value
    if (!prompt) return
    await prompt.prompt()
    const { outcome } = await prompt.userChoice
    if (outcome === 'accepted') {
        installReady.value = false
        deferredInstall.value = null
    }
}

function goAuth() {
    navigateTo(user.value ? '/' : '/login')
}

onMounted(() => {
    if (!import.meta.client) return
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
})

onBeforeUnmount(() => {
    if (!import.meta.client) return
    window.removeEventListener('beforeinstallprompt', onBeforeInstall)
})

useHead({
    title: `${appConfig.siteName} — 繁中追番，從排程到播放`,
    link: [
        {
            rel: 'stylesheet',
            href: 'https://fonts.googleapis.com/css2?family=ZCOOL+KuHei&family=IBM+Plex+Mono:wght@400;500&display=swap',
        },
    ],
})
</script>

<template>
    <div class="welcome-page relative overflow-x-hidden">
        <div class="storm-field pointer-events-none fixed inset-0 z-0" aria-hidden="true">
            <span
                v-for="(ch, i) in stormChars"
                :key="`${ch}-${i}`"
                class="storm-char"
                :style="{
                    left: `${(i * 17 + 3) % 94}%`,
                    animationDelay: `${i * 0.55}s`,
                    animationDuration: `${14 + (i % 5) * 2}s`,
                    fontSize: `${2.5 + (i % 4) * 0.6}rem`,
                }"
            >{{ ch }}</span>
        </div>

        <header class="relative z-20 mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
            <NuxtLink :to="user ? '/' : '/welcome'" class="flex items-center gap-2.5 group">
                <img src="/icons/icon.svg" alt="" width="36" height="36" class="h-9 w-9" />
                <span class="font-display text-xl font-bold tracking-tight">{{ appConfig.siteName }}</span>
            </NuxtLink>
            <nav class="flex items-center gap-2 sm:gap-3">
                <a
                    :href="appConfig.social.github"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="nav-chip hidden sm:inline-flex"
                >
                    <svg class="h-4 w-4 shrink-0" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path :d="githubIconPath" />
                    </svg>
                    GitHub
                </a>
                <button type="button" class="nav-chip-solid" @click="goAuth">
                    {{ user ? '進入 App' : '登入' }}
                </button>
            </nav>
        </header>

        <main class="relative z-10">
            <section class="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6 sm:pb-24 sm:pt-10">
                <div class="hero-banner">
                    <img
                        src="/hero.webp"
                        alt=""
                        class="hero-bg"
                        width="1920"
                        height="1080"
                        fetchpriority="high"
                    >
                    <div class="hero-overlay" aria-hidden="true" />

                    <div class="hero-content">
                        <p class="hero-label mono-label mb-4">台港追番 · 個人使用 · GPL-3.0 開源</p>
                        <h1 class="hero-title font-display">
                            <span class="hero-word">追</span><span class="hero-word hero-word-b">番</span>
                            <span class="hero-rest">從排程到播放</span>
                        </h1>
                        <p class="hero-lead mt-6 max-w-xl text-base leading-relaxed sm:text-lg">
                            每日新番、續播、離線下載與好友動態，繁中介面一次到位。
                            整合動畫資訊與可設定的播放來源——個人追番工具，不是授權串流平台。
                        </p>
                        <div class="mt-8 flex flex-wrap items-center gap-3">
                            <button type="button" class="cta-primary hero-cta" @click="goAuth">
                                <span class="material-symbols-rounded text-xl" aria-hidden="true">login</span>
                                {{ user ? '開始追番' : '使用 Google / Discord 登入' }}
                            </button>
                            <button
                                v-if="installReady"
                                type="button"
                                class="cta-secondary hero-cta-outline"
                                @click="promptInstall"
                            >
                                <span class="material-symbols-rounded text-xl" aria-hidden="true">install_mobile</span>
                                安裝 PWA
                            </button>
                            <a
                                :href="appConfig.social.github"
                                target="_blank"
                                rel="noopener noreferrer"
                                class="cta-secondary hero-cta-outline sm:hidden"
                            >
                                <svg class="h-5 w-5 shrink-0" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                    <path :d="githubIconPath" />
                                </svg>
                                GitHub
                            </a>
                        </div>
                        <p class="mt-4 text-sm hero-note">
                            個人、非商業觀賞用途。請支持正版與原始平台。
                        </p>
                    </div>
                </div>
            </section>

            <section class="welcome-section">
                <div class="section-head">
                    <p class="mono-label">PROOF · 實際介面</p>
                    <h2 class="section-title font-display">文字聚成介面，介面接住追番</h2>
                    <p class="section-desc text-sm sm:text-base leading-relaxed">
                        真實番劇資料與 App 版面——預覽首頁、自訂播放器、續播紀錄與好友即時狀態。
                    </p>
                </div>
                <WelcomeAppPreviewGrid />
            </section>

            <section class="welcome-section">
                <div class="section-head mb-10">
                    <p class="mono-label">FEATURES · 功能語彙</p>
                    <h2 class="section-title font-display">每個字是一陣功能雨</h2>
                    <p class="section-desc">
                        每個字對應一項真實能力——動態預覽說明功能，不含虛構授權或數據。
                    </p>
                </div>
                <WelcomeFeatureShowcase />
            </section>

            <section class="welcome-section">
                <div class="section-head mb-8">
                    <p class="mono-label">Q&A · 常見問題</p>
                    <h2 class="section-title font-display">使用前你可能想問</h2>
                    <p class="section-desc">
                        關於定位、登入、離線、AI 與開源授權的簡要說明。
                    </p>
                </div>
                <WelcomeFaq />
            </section>

            <section class="welcome-section welcome-section-close">
                <div class="closing-plate">
                    <p class="mono-label mb-3">READY · 開始</p>
                    <h2 class="closing-title font-display">讓下一集自己找上門</h2>
                    <p class="section-desc max-w-lg">
                        登入後即可使用觀看紀錄、收藏與離線下載。AI 助手需另行同意隱私授權。
                    </p>
                    <div class="mt-8 flex flex-wrap gap-3">
                        <button type="button" class="cta-primary" @click="goAuth">
                            {{ user ? '進入每日新番' : '免費登入' }}
                        </button>
                        <NuxtLink to="/login" class="cta-secondary">已有帳號？前往登入頁</NuxtLink>
                    </div>
                    <div class="mt-10 flex flex-wrap gap-4 border-t border-[#0D0D0D]/10 pt-8 dark:border-white/10">
                        <template v-for="link in footerLinks" :key="link.label">
                            <a
                                v-if="link.external"
                                :href="link.href"
                                target="_blank"
                                rel="noopener noreferrer"
                                class="footer-link"
                            >{{ link.label }}</a>
                            <NuxtLink v-else :to="link.to" class="footer-link">{{ link.label }}</NuxtLink>
                        </template>
                    </div>
                </div>
            </section>
        </main>
    </div>
</template>

<style scoped>
.font-display {
    font-family: 'ZCOOL KuHei', 'Noto Sans TC', sans-serif;
}

.mono-label {
    font-family: 'IBM Plex Mono', ui-monospace, monospace;
    font-size: 0.6875rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #6B6B6B;
}

.dark .mono-label {
    color: #9A9A92;
}

.storm-char {
    position: absolute;
    top: -10%;
    color: rgba(13, 13, 13, 0.06);
    font-family: 'ZCOOL KuHei', sans-serif;
    font-weight: 400;
    animation: char-fall linear infinite;
    will-change: transform;
}

.dark .storm-char {
    color: rgba(245, 245, 240, 0.05);
}

@keyframes char-fall {
    0% {
        transform: translateY(-10vh) translateX(0) rotate(0deg);
        opacity: 0;
    }
    8% { opacity: 1; }
    92% { opacity: 0.7; }
    100% {
        transform: translateY(110vh) translateX(1.5rem) rotate(12deg);
        opacity: 0;
    }
}

.hero-banner {
    position: relative;
    isolation: isolate;
    overflow: hidden;
    border-radius: 1.25rem;
    border: 1px solid rgba(13, 13, 13, 0.12);
    min-height: clamp(22rem, 62vw, 34rem);
    display: flex;
    align-items: flex-end;
}

.dark .hero-banner {
    border-color: rgba(255, 255, 255, 0.12);
}

.hero-bg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center 35%;
}

.hero-overlay {
    position: absolute;
    inset: 0;
    background:
        linear-gradient(90deg, rgba(8, 12, 10, 0.92) 0%, rgba(8, 12, 10, 0.72) 42%, rgba(8, 12, 10, 0.2) 68%, transparent 100%),
        linear-gradient(0deg, rgba(8, 12, 10, 0.75) 0%, transparent 45%);
}

.hero-content {
    position: relative;
    z-index: 1;
    width: 100%;
    padding: 1.75rem 1.5rem 2rem;
}

@media (min-width: 640px) {
    .hero-banner {
        align-items: center;
        min-height: clamp(24rem, 48vw, 32rem);
    }

    .hero-content {
        max-width: 34rem;
        padding: 2.5rem 2.25rem;
    }
}

@media (min-width: 1024px) {
    .hero-content {
        max-width: 36rem;
        padding: 3rem 2.75rem;
    }
}

.hero-label { color: rgba(245, 245, 240, 0.72); }
.hero-lead { color: rgba(245, 245, 240, 0.88); }
.hero-note { color: rgba(245, 245, 240, 0.62); }

.hero-title {
    font-size: clamp(3rem, 10vw, 5.5rem);
    line-height: 1.05;
    letter-spacing: -0.02em;
    color: #f5f5f0;
}

.hero-word {
    display: inline-block;
    color: #f5f5f0;
    animation: word-settle 1.2s cubic-bezier(0.22, 1, 0.36, 1) both;
}

.hero-word-b {
    animation-delay: 0.12s;
    color: transparent;
    -webkit-text-stroke: 2px #f5f5f0;
}

.hero-rest {
    display: block;
    margin-top: 0.15em;
    font-size: 0.42em;
    font-weight: 400;
    letter-spacing: 0.02em;
    color: rgba(245, 245, 240, 0.92);
    animation: word-settle 1s 0.25s cubic-bezier(0.22, 1, 0.36, 1) both;
}

.hero-cta {
    @apply bg-[#F5F5F0] text-[#0A0A0A] hover:opacity-90;
}

.hero-cta-outline {
    @apply border-white/35 text-[#F5F5F0] hover:bg-white/10;
}

@keyframes word-settle {
    from {
        opacity: 0;
        transform: translateY(1.5rem) scale(0.92);
        filter: blur(6px);
    }
    60% { filter: blur(0); }
    to {
        opacity: 1;
        transform: translateY(0) scale(1);
    }
}

.nav-chip {
    @apply inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium
           border border-[#0D0D0D]/15 dark:border-white/15
           hover:bg-[#0D0D0D]/5 dark:hover:bg-white/10 transition-colors;
}

.nav-chip-solid {
    @apply inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium
           border border-transparent
           bg-[#0D0D0D] text-[#FAFAF8]
           dark:bg-[#F5F5F0] dark:text-[#0A0A0A]
           hover:bg-[#333333] dark:hover:bg-[#EBEBE5]
           transition-colors;
}

.cta-primary {
    @apply inline-flex items-center gap-2 rounded-full px-6 py-3.5 text-sm font-semibold
           bg-[#0D0D0D] text-[#FAFAF8] dark:bg-[#F5F5F0] dark:text-[#0A0A0A]
           hover:opacity-90 transition-opacity;
}

.cta-secondary {
    @apply inline-flex items-center gap-2 rounded-full px-6 py-3.5 text-sm font-medium
           border border-[#0D0D0D]/20 dark:border-white/20
           hover:bg-[#0D0D0D]/5 dark:hover:bg-white/10 transition-colors;
}

.nav-chip:focus-visible,
.nav-chip-solid:focus-visible,
.cta-primary:focus-visible,
.cta-secondary:focus-visible {
    @apply outline-none ring-2 ring-[#0D0D0D] dark:ring-[#F5F5F0] ring-offset-2 ring-offset-[#FAFAF8] dark:ring-offset-[#0A0A0A];
}

.welcome-section {
    @apply mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16;
}

.welcome-section-close {
    @apply py-16 sm:py-24;
}

.section-title {
    font-size: clamp(1.75rem, 4vw, 2.75rem);
    line-height: 1.15;
    margin-top: 0.35rem;
}

.section-desc {
    @apply mt-3 max-w-2xl text-[#4A4A4A] dark:text-[#B0B0A8];
}

.closing-plate {
    border-top: 3px solid #0D0D0D;
    padding-top: 2.5rem;
}

.dark .closing-plate {
    border-color: rgba(255, 255, 255, 0.2);
}

.closing-title {
    font-size: clamp(2rem, 5vw, 3.25rem);
    line-height: 1.1;
}

.footer-link {
    font-size: 0.875rem;
    font-weight: 500;
    text-decoration: underline;
    text-underline-offset: 3px;
    color: #4A4A4A;
}

.dark .footer-link {
    color: #B0B0A8;
}

.footer-link:hover {
    color: #0D0D0D;
}

.dark .footer-link:hover {
    color: #F5F5F0;
}

@media (prefers-reduced-motion: reduce) {
    .storm-char,
    .hero-word,
    .hero-rest {
        animation: none !important;
    }
}
</style>
