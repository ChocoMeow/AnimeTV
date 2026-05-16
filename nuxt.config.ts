// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
    css: ['~/assets/css/tailwind.css'],
    modules: ['@nuxtjs/tailwindcss', '@nuxtjs/supabase', '@vite-pwa/nuxt', '@nuxt/image'],
    compatibilityDate: '2025-07-15',
    devtools: { enabled: true },
    runtimeConfig: {
        supabaseSecretKey: process.env.SUPABASE_SECRET_KEY,
        public: {
            supabaseUrl: process.env.SUPABASE_URL,
            supabaseKey: process.env.SUPABASE_KEY,
        },
    },
    devServer: {
        port: 3000,
        host: '0.0.0.0',
    },
    vite: {
        esbuild: {
            drop: ['console', 'debugger'],
            pure: ['console.debug', 'console.info', 'console.warn', 'console.error'],
        },
    },
    nitro: {
        preset: 'bun',
        routeRules: {
            '/apple-touch-icon.png': { redirect: '/icons/icon_144x144.png' },
            '/apple-touch-icon-precomposed.png': { redirect: '/icons/icon_144x144.png' },
            '/apple-touch-icon-120x120-precomposed.png': { redirect: '/icons/icon_144x144.png' },
        },
        experimental: {
            websocket: true,
        },
        esbuild: {
            options: {
                drop: ['console'],
            },
        },
        prerender: {
            // Precache needs a document for navigateFallback "/" (see @vite-pwa/nuxt).
            // Prerender home so Workbox can include url "/" and avoid non-precached-url.
            crawlLinks: false,
            routes: ['/'],
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
                {
                    innerHTML:
                        "document.documentElement.classList.toggle('dark', localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches));",
                    type: 'text/javascript',
                    tagPosition: 'head',
                },
                // Instant splash before JS/Vue (all visitors) — avoids first paint showing app shell before Vue.
                {
                    innerHTML: `(function(){try{var h=document.documentElement;h.classList.add('app-splash-pending');var st=document.createElement('style');st.textContent='html.app-splash-pending body{visibility:hidden!important}#app-splash-inline{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:#fff}html.dark #app-splash-inline{background:#030712}#app-splash-inline img{width:72px;height:72px;border-radius:0.875rem;object-fit:cover}';document.head.appendChild(st);var el=document.createElement('div');el.id='app-splash-inline';var im=document.createElement('img');im.src='/icons/icon_512x512.webp';im.alt='';im.width=72;im.height=72;im.setAttribute('fetchpriority','high');el.appendChild(im);h.appendChild(el)}catch(e){}})();`,
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
                { rel: 'icon', type: 'image/png', href: '/icons/icon_64x64.png' },
                { rel: 'apple-touch-icon', href: '/icons/icon_144x144.png', sizes: '144x144', type: 'image/png' },
                {
                    rel: 'stylesheet',
                    href: 'https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,400..700,0..1,-50..200&display=swap',
                },
            ],
        },
    },
    pwa: {
        registerType: 'autoUpdate',
        workbox: {
            // SSR mode: no static index.html at root.
            // Setting to undefined prevents the default "/" fallback which causes precache errors.
            navigateFallback: undefined,
            globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2}'],
            cleanupOutdatedCaches: true,
            runtimeCaching: [
                {
                    // Cache all navigation requests (pages) for offline use
                    urlPattern: ({ request }) => request.mode === 'navigate',
                    handler: 'NetworkFirst',
                    options: {
                        cacheName: 'app-pages',
                        networkTimeoutSeconds: 4,
                        expiration: {
                            maxEntries: 80,
                            maxAgeSeconds: 60 * 60 * 24 * 7,
                        },
                    },
                },
                {
                    urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
                    handler: 'StaleWhileRevalidate',
                    options: {
                        cacheName: 'google-fonts-stylesheets',
                        expiration: {
                            maxEntries: 10,
                            maxAgeSeconds: 60 * 60 * 24 * 30,
                        },
                    },
                },
                {
                    urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
                    handler: 'CacheFirst',
                    options: {
                        cacheName: 'google-fonts-webfonts',
                        expiration: {
                            maxEntries: 30,
                            maxAgeSeconds: 60 * 60 * 24 * 365,
                        },
                    },
                },
                {
                    urlPattern: /^\/api\/(anime|search|public-animeList).*/i,
                    handler: 'NetworkFirst',
                    options: {
                        cacheName: 'anime-api',
                        networkTimeoutSeconds: 2,
                        expiration: {
                            maxEntries: 100,
                            maxAgeSeconds: 60 * 60 * 24 * 7,
                        },
                    },
                },
                {
                    urlPattern: /^\/api\/proxy-video.*/i,
                    handler: 'NetworkOnly',
                },
                {
                    urlPattern: /^\/api\/download-proxy.*/i,
                    handler: 'NetworkOnly',
                },
            ],
        },
        manifest: {
            name: 'AnimeTV',
            short_name: 'AnimeTV',
            description: 'Stream your favorite anime series and movies anytime, anywhere.',
            theme_color: '#030712',
            background_color: '#030712',
            display: 'standalone',
            start_url: '/',
            icons: [
                {
                    src: 'icons/icon_64x64.webp',
                    sizes: '64x64',
                    type: 'image/webp',
                },
                {
                    src: 'icons/icon_512x512.webp',
                    sizes: '512x512',
                    type: 'image/webp',
                },
                {
                    src: 'icons/icon_819x819.webp',
                    sizes: '819x819',
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
})
