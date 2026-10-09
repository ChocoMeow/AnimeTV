// https://nuxt.com/docs/api/configuration/nuxt-config

// Build/prerender only — real values come from .env or container runtime.
const SUPABASE_URL = process.env.NUXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const SUPABASE_KEY = process.env.NUXT_PUBLIC_SUPABASE_KEY || 'placeholder-anon-key'

export default defineNuxtConfig({
    css: ['~/assets/css/tailwind.css'],
    modules: ['@nuxtjs/tailwindcss', '@nuxtjs/supabase', '@vite-pwa/nuxt', '@nuxt/image', 'nuxt-security'],
    compatibilityDate: '2025-07-15',
    devtools: { enabled: true },
    typescript: {
        tsConfig: {
            exclude: ['../app/service-worker'],
        },
    },
    runtimeConfig: {
        supabaseSecretKey: process.env.NUXT_SUPABASE_SECRET_KEY,
        cfFetchFlaresolverr: process.env.NUXT_CF_FETCH_FLARESOLVERR,
        aiApiKey: process.env.NUXT_AI_API_KEY,
        aiBaseUrl: process.env.NUXT_AI_BASE_URL,
        aiModel: process.env.NUXT_AI_MODEL,
        aiProxyUrl: process.env.NUXT_AI_PROXY_URL,
        logLevel: process.env.NUXT_LOG_LEVEL,
        logMaxDays: process.env.NUXT_LOG_MAX_DAYS,
        logToFile: process.env.NUXT_LOG_TO_FILE,
        public: {
            supabaseUrl: SUPABASE_URL,
            supabaseKey: SUPABASE_KEY,
            aiEnabled: false,
        },
    },
    $production: {
        vite: {
            esbuild: {
                drop: ['console', 'debugger'],
                pure: ['console.debug', 'console.info', 'console.warn', 'console.error'],
            },
        },
        nitro: {
            esbuild: {
                options: {
                    drop: ['console'],
                },
            },
        }
    },
    devServer: {
        port: 3000,
        host: '0.0.0.0',
    },
    nitro: {
        preset: 'bun',
        routeRules: {
            '/apple-touch-icon.png': { redirect: '/icons/icon_512x512.png' },
            '/apple-touch-icon-precomposed.png': { redirect: '/icons/icon_512x512.png' },
            '/apple-touch-icon-120x120-precomposed.png': { redirect: '/icons/icon_512x512.png' },
            // High-volume streaming / WS must not hit the global rate limiter
            '/api/proxy-video': { security: { rateLimiter: false } },
            '/api/download-proxy': { security: { rateLimiter: false } },
            '/api/download-video/**': { security: { rateLimiter: false } },
            '/api/user-status-ws': { security: { rateLimiter: false } },
        },
        experimental: {
            websocket: true,
        },
        // Only /offline is static for the SW. `/` and `/welcome` SSR at runtime
        // with each host’s own NUXT_PUBLIC_SUPABASE_* (not baked into the image).
        prerender: {
            crawlLinks: false,
            routes: ['/offline'],
            failOnError: false,
        },
    },
    experimental: {
        emitRouteChunkError: 'automatic-immediate',
        entryImportMap: false,
    },
    app: {
        head: {
            title: 'AnimeTV',
            script: [
                // Airplane / offline: jump to /offline before Vue paints the cached home shell.
                {
                    innerHTML: `(function(){try{if(navigator.onLine)return;var p=(location.pathname||'/').replace(/\\/$/,'')||'/';if(p==='/offline'||p==='/offline-downloads'||p.indexOf('/anime/')===0)return;location.replace('/offline')}catch(e){}})();`,
                    type: 'text/javascript',
                    tagPosition: 'head',
                },
                {
                    innerHTML:
                        "document.documentElement.classList.toggle('dark', localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches));",
                    type: 'text/javascript',
                    tagPosition: 'head',
                },
                // Instant splash before JS/Vue (all visitors) — avoids first paint showing app shell before Vue.
                {
                    innerHTML: `(function(){try{var h=document.documentElement;h.classList.add('app-splash-pending');var st=document.createElement('style');st.textContent='html.app-splash-pending body{visibility:hidden!important}#app-splash-inline{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:#fff}html.dark #app-splash-inline{background:#0a0a0a}#app-splash-inline img{width:144px;height:144px;border-radius:1rem;object-fit:contain}';document.head.appendChild(st);var el=document.createElement('div');el.id='app-splash-inline';var im=document.createElement('img');im.src='/icons/animated_icon_400x400.webp';im.alt='';im.width=144;im.height=144;im.setAttribute('fetchpriority','high');el.appendChild(im);h.appendChild(el);setTimeout(function(){try{document.documentElement.classList.remove('app-splash-pending');var e=document.getElementById('app-splash-inline');e&&e.remove()}catch(x){}},10000)}catch(e){}})();`,
                    type: 'text/javascript',
                    tagPosition: 'head',
                },
            ],
            meta: [
                { name: 'description', content: 'Stream your favorite anime series and movies anytime, anywhere.' },
                { charset: 'utf-8' },
                { name: 'viewport', content: 'width=device-width, initial-scale=1, minimum-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover' },
                // iOS specific meta tags
                { name: 'apple-mobile-web-app-capable', content: 'yes' },
                { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
                { name: 'apple-mobile-web-app-title', content: 'AnimeTV' },
                // Android specific meta tags
                { name: 'mobile-web-app-capable', content: 'yes' },
            ],
            link: [
                { rel: 'icon', type: 'image/svg+xml', href: '/icons/icon.svg' },
                { rel: 'apple-touch-icon', href: '/icons/icon_512x512.png', sizes: '512x512', type: 'image/png' },
                { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
                { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
                {
                    rel: 'stylesheet',
                    href: 'https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@100..900&display=swap',
                },
            ],
        },
    },
    pwa: {
        registerType: 'prompt',
        strategies: 'injectManifest',
        srcDir: 'service-worker',
        filename: 'sw.ts',
        includeAssets: [
            'hero.webp',
            'icons/icon.svg',
            'icons/animated_icon_400x400.webp',
            'icons/icon_512x512.png',
            'icons/icon_512x512.webp',
        ],
        injectManifest: {
            globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2}'],
        },
        manifest: {
            name: 'AnimeTV',
            short_name: 'AnimeTV',
            description: 'Stream your favorite anime series and movies anytime, anywhere.',
            theme_color: '#0a0a0a',
            background_color: '#0a0a0a',
            display: 'standalone',
            start_url: '/',
            icons: [
                {
                    src: 'icons/icon_64x64.webp',
                    sizes: '64x64',
                    type: 'image/webp',
                },
                {
                    src: 'icons/icon_144x144.webp',
                    sizes: '64x64',
                    type: 'image/webp',
                },
                {
                    src: 'icons/icon_512x512.webp',
                    sizes: '512x512',
                    type: 'image/webp',
                },
                {
                    src: 'icons/icon_1024x1024.webp',
                    sizes: '1024x1024',
                    type: 'image/webp',
                },
            ],
            screenshots: [
                {
                    src: 'screenshot.png',
                    sizes: '1920x960',
                    type: 'image/png',
                    form_factor: 'wide',
                    label: 'Application',
                },
            ],
        },
    },
    supabase: {
        // Fallbacks so `nuxt build` without .env can prerender /offline for the SW.
        url: SUPABASE_URL,
        key: SUPABASE_KEY,
        redirect: false,
        redirectOptions: {
            login: '/login',
            callback: '/login',
            include: undefined,
            exclude: [],
            saveRedirectToCookie: true,
        },
        types: false,
    },
    security: {
        headers: {
            referrerPolicy: 'strict-origin-when-cross-origin',
            // Default is credentialless — breaks wiki YouTube iframes / CDNs without CORP
            crossOriginEmbedderPolicy: 'unsafe-none',
            xFrameOptions: 'DENY',
            strictTransportSecurity: {
                maxAge: 63072000,
                includeSubdomains: true,
                preload: true,
            },
            permissionsPolicy: {
                // Default fullscreen: [] blocks the video player
                autoplay: ['self'],
                'clipboard-write': ['self'],
                fullscreen: ['self'],
                'picture-in-picture': ['self'],
                'web-share': ['self'],
                accelerometer: [],
                'clipboard-read': [],
                gyroscope: [],
                magnetometer: [],
                midi: [],
                payment: [],
                'publickey-credentials-get': [],
                'screen-wake-lock': [],
                'sync-xhr': [],
                usb: [],
                'xr-spatial-tracking': [],
            },
            contentSecurityPolicy: {
                'frame-ancestors': ["'none'"],
                // Google Fonts CSS (googleapis) + font files (gstatic)
                'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
                'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
                'img-src': ["'self'", 'data:', 'blob:', 'https:'],
                'media-src': ["'self'", 'blob:', 'https://*.bzcdn.net'],
                'connect-src': [
                    "'self'",
                    'https://*.supabase.co',
                    'wss://*.supabase.co',
                    'https://*.bzcdn.net',
                    'https://*.anime1.me',
                    'https://fonts.googleapis.com',
                    'https://fonts.gstatic.com',
                ],
                'frame-src': [
                    "'self'",
                    'https://www.youtube.com',
                    'https://www.youtube-nocookie.com',
                    'https://youtube.com',
                ],
                'worker-src': ["'self'", 'blob:'],
                'manifest-src': ["'self'"],
            },
        },
    },
})