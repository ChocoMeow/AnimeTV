<template>
    <div class="min-h-screen flex flex-col bg-gradient-to-br from-gray-50 via-indigo-50/30 to-purple-50/20 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 text-gray-800 dark:text-gray-100">
        <SiteHeader @search="onSearch" />

        <main class="flex-1 w-full">
            <slot />
        </main>

        <SiteFooter />
    </div>
</template>

<script setup>
import { useRouter } from "vue-router"
import SiteHeader from "~/components/SiteHeader.vue"
import SiteFooter from "~/components/SiteFooter.vue"

const router = useRouter()

// Header emits 'search' with the query string; layout handles navigation
function onSearch(query) {
    if (!query || !query.trim()) return
    router.push({ path: "/search", query: { q: query.trim() } })
}
</script>

<style>
/* Smooth transitions for theme switching */
* {
    transition-property: background-color, border-color, color;
    transition-duration: 200ms;
    transition-timing-function: ease-in-out;
}

/* Prevent transition on page load */
.dark-mode-transition-disabled * {
    transition: none !important;
}

/* Global scrollbar styling */
::-webkit-scrollbar {
    width: 10px;
    height: 10px;
}

::-webkit-scrollbar-track {
    background: rgb(243 244 246);
}

.dark ::-webkit-scrollbar-track {
    background: rgb(17 24 39);
}

::-webkit-scrollbar-thumb {
    background: rgb(209 213 219);
    border-radius: 5px;
}

.dark ::-webkit-scrollbar-thumb {
    background: rgb(75 85 99);
}

::-webkit-scrollbar-thumb:hover {
    background: rgb(156 163 175);
}

.dark ::-webkit-scrollbar-thumb:hover {
    background: rgb(107 114 128);
}

/* Smooth scroll behavior */
html {
    scroll-behavior: smooth;
}

/* Focus visible styles for accessibility */
*:focus-visible {
    outline: 2px solid rgb(99 102 241);
    outline-offset: 2px;
}

.dark *:focus-visible {
    outline-color: rgb(129 140 248);
}
</style>
