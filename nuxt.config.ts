// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
    css: ["~/assets/css/tailwind.css"],
    modules: ["@nuxtjs/tailwindcss", "@nuxtjs/supabase", "@vite-pwa/nuxt"],
    compatibilityDate: "2025-07-15",
    devtools: { enabled: true },
    devServer: {
        port: 3000,
        host: "0.0.0.0",
    },
    experimental: {
        entryImportMap: false,
    },
    app: {
        head: {
            title: "AnimeTV",
            meta: [
                { name: "description", content: "Stream your favorite anime series and movies anytime, anywhere." },
                { charset: "utf-8" },
                { name: "viewport", content: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" },
                // iOS specific meta tags
                { name: "apple-mobile-web-app-capable", content: "yes" },
                { name: "apple-mobile-web-app-status-bar-style", content: "default" },
                { name: "apple-mobile-web-app-title", content: "AnimeTV" },
                // Android specific meta tags
                { name: "mobile-web-app-capable", content: "yes" },
            ],
            link: [
                { rel: "icon", type: "image/png", href: "/icons/icon_144x144.png" },
                { rel: "stylesheet", href: "https://fonts.googleapis.com/icon?family=Material+Icons" },
            ],
        },
    },
    pwa: {
        registerType: "autoUpdate",
        manifest: {
            name: "AnimeTV",
            short_name: "AnimeTV",
            description: "Stream your favorite anime series and movies anytime, anywhere.",
            theme_color: "#2d3748",
            background_color: "#2d3748",
            display: "standalone",
            start_url: "/",
            icons: [
                {
                    src: "icons/icon_64x64.png",
                    sizes: "64x64",
                    type: "image/png",
                },
                {
                    src: "icons/icon_144x144.png",
                    sizes: "144x144",
                    type: "image/png",
                },
                {
                    src: "icons/icon_512x512.png",
                    sizes: "512x512",
                    type: "image/png",
                },
                {
                    src: "icons/icon_1024x1024.png",
                    sizes: "1024x1024",
                    type: "image/png",
                },
            ],
        },
        workbox: {
            globPatterns: ["**/*.{js,css,html,png,svg,ico}"],
            globIgnores: ["**/auth/**"],
            navigateFallbackDenylist: [/^\/api\//, /^\/auth\//],
            cleanupOutdatedCaches: true,
            runtimeCaching: [
                {
                    urlPattern: /^\/auth\/.*/i,
                    handler: "NetworkOnly",
                },
                {
                    urlPattern: /^https:\/\/.*\.supabase\.co\/auth\/.*/i,
                    handler: "NetworkOnly",
                },
                {
                    urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
                    handler: "CacheFirst",
                    options: {
                        cacheName: "google-fonts-cache",
                        expiration: {
                            maxEntries: 10,
                            maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
                        },
                        cacheableResponse: {
                            statuses: [0, 200],
                        },
                    },
                },
                {
                    urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
                    handler: "CacheFirst",
                    options: {
                        cacheName: "gstatic-fonts-cache",
                        expiration: {
                            maxEntries: 10,
                            maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
                        },
                        cacheableResponse: {
                            statuses: [0, 200],
                        },
                    },
                },
                {
                    urlPattern: /\/api\/.*/i,
                    handler: "NetworkFirst",
                    options: {
                        cacheName: "api-cache",
                        expiration: {
                            maxEntries: 50,
                            maxAgeSeconds: 60 * 60 * 24, // 24 hours
                        },
                        networkTimeoutSeconds: 10,
                        cacheableResponse: {
                            statuses: [0, 200],
                        },
                    },
                },
                {
                    urlPattern: /\/_nuxt\/.*/i,
                    handler: "CacheFirst",
                    options: {
                        cacheName: "nuxt-cache",
                        expiration: {
                            maxEntries: 100,
                            maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
                        },
                    },
                },
            ],
        },
        client: {
            installPrompt: true,
            periodicSyncForUpdates: 3600, // Check for updates every hour
        },
    },
    nitro: {
        prerender: {
            routes: ["/"],
        },
    },
    supabase: {
        redirect: false,
        redirectOptions: {
            login: "/auth/login",
            callback: "/auth/confirm",
            include: undefined,
            exclude: [],
            saveRedirectToCookie: true,
        },
        types: false,
        cookieOptions: {
            maxAge: 60 * 60 * 24 * 365, // 1 year
            sameSite: "lax",
            secure: true,
        },
    },
})
