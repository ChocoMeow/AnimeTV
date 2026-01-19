<template>
    <div class="min-h-screen flex flex-col">
        <SiteHeader />

        <main class="flex-1 w-full transition-all duration-300 ease-in-out">
            <slot />
            <GlobalToast />
        </main>

        <FriendList />

        <SiteFooter />
    </div>
</template>

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

/* Smooth scroll behavior */
html {
    scroll-behavior: smooth;
}

/* Push main content when friend list is open on desktop */
@media (min-width: 1024px) {
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
