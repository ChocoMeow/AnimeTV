// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
    css: ["@/assets/css/tailwind.css"],
    modules: ["@nuxtjs/tailwindcss", "@vite-pwa/nuxt"],
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
            ],
        },
        workbox: {
            navigateFallback: "/",
        },
        devOptions: {
            enabled: true,
            type: "module",
        },
    },
    compatibilityDate: "2025-07-15",
    devtools: { enabled: true },
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
    devServer: {
        port: 3000,
        host: "0.0.0.0",
    },
})
