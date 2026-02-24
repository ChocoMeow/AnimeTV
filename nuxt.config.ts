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
        emitRouteChunkError: "automatic-immediate",
        entryImportMap: false,
    },
    app: {
        head: {
            title: "AnimeTV",
            script: [
                {
                    innerHTML: "document.documentElement.classList.toggle('dark', localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches));",
                    type: "text/javascript",
                    tagPosition: "head",
                },
            ],
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
            theme_color: "#030712",
            background_color: "#030712",
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
                    src: "icons/icon_819x819.png",
                    sizes: "819x819",
                    type: "image/png",
                },
                {
                    src: "icons/icon_1024x1024.png",
                    sizes: "1024x1024",
                    type: "image/png",
                },
            ],
            screenshots: [
                {
                    src: "screenshot.png",
                    sizes: "1920x960",
                    type: "image/png",
                    form_factor: "wide",
                    label: "Application",
                },
            ],
        }
    },
    nitro: {
        prerender: {
            routes: [],
        },
    },
    supabase: {
        redirect: true,
        redirectOptions: {
            login: "/login",
            callback: "/login",
            include: undefined,
            exclude: [],
            saveRedirectToCookie: true,
        },
        types: false
    },
})
