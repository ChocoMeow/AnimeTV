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
</style>
