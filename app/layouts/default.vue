<script setup>
const showMobilePwaNav = useState("app-show-mobile-pwa-nav", () => false)
</script>

<template>
    <div
        class="min-h-screen flex flex-col md:pb-0"
        :class="
            showMobilePwaNav
                ? 'max-md:pb-[calc(3.75rem+(env(safe-area-inset-bottom,0px)/2))]'
                : ''
        "
    >
        <SiteHeader />

        <main class="flex-1 w-full max-md:pt-14 transition-all duration-300 ease-in-out max-md:transition-[margin-top,padding]">
            <slot />
            <GlobalToast />
        </main>

        <FriendList />

        <SiteFooter />

        <LazyMobileBottomNav />
    </div>
</template>

<style>
html.theme-animating * {
    transition: background-color 200ms ease-in-out, border-color 200ms ease-in-out, color 200ms ease-in-out;
}

/* Smooth scroll behavior */
html {
    scroll-behavior: smooth;
}

/* Push main content when friend list is open on desktop */
@media (min-width: 1024px) {
    footer {
        transition: padding-right 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }

    body.friend-list-open main,
    body.friend-list-open footer {
        padding-right: 320px;
        transition: padding-right 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }
}

/* Global Scrollbar Styles */
::-webkit-scrollbar {
    width: 8px;
    height: 8px;
}

::-webkit-scrollbar-track {
    background: transparent;
}

::-webkit-scrollbar-thumb {
    background: rgba(156, 163, 175, 0.5);
    border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
    background: rgba(156, 163, 175, 0.7);
}

/* Dark mode scrollbar */
.dark ::-webkit-scrollbar-thumb {
    background: rgba(75, 85, 99, 0.5);
}

.dark ::-webkit-scrollbar-thumb:hover {
    background: rgba(75, 85, 99, 0.7);
}

/* Firefox scrollbar */
* {
    scrollbar-width: thin;
    scrollbar-color: rgba(156, 163, 175, 0.5) transparent;
}

.dark * {
    scrollbar-color: rgba(75, 85, 99, 0.5) transparent;
}
</style>
