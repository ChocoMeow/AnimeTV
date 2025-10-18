// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
    css: ["~/assets/css/tailwind.css"],
    modules: ["@nuxtjs/tailwindcss", "@vite-pwa/nuxt", "@nuxtjs/supabase"],
    compatibilityDate: "2025-07-15",
    devtools: { enabled: true },
    devServer: {
        port: 3000,
        host: "0.0.0.0",
    },
    nitro: {
        prerender: {
            routes: ["/"],
        },
    },
    experimental: {
        entryImportMap: false
    },
    app: {
        head: {
            title: "Anime Hub",
            meta: [
                { name: "description", content: "Stream your favorite anime series and movies anytime, anywhere." },
                { charset: "utf-8" },
                { name: "viewport", content: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" },
                // iOS specific meta tags
                { name: "apple-mobile-web-app-capable", content: "yes" },
                { name: "apple-mobile-web-app-status-bar-style", content: "default" },
                { name: "apple-mobile-web-app-title", content: "Anime Hub" },
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
        manifest: {
            name: "Anime Hub",
            short_name: "Anime Hub",
            description: "Stream your favorite anime series and movies anytime, anywhere.",
            theme_color: "#2d3748",
            background_color: "#2d3748",
            display: "standalone",
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
            runtimeCaching: [
                {
                    urlPattern: "/*",
                    handler: "NetworkFirst",
                    options: {
                        cacheName: "default-cache",
                        expiration: {
                            maxEntries: 50,
                            maxAgeSeconds: 30 * 24 * 60 * 60,
                        },
                    },
                },
            ],
        },
        devOptions: {
            enabled: true,
            type: "module",
        },
    },
    supabase: {
        redirectOptions: {
            login: "/auth/login",
            callback: "/auth/confirm",
            include: undefined,
            exclude: [],
            saveRedirectToCookie: true,
        },
        types: false,
    },
})
