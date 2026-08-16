<template>
    <NuxtRouteAnnouncer />
    <NuxtPwaAssets />
    <AppSplashScreen />
    <NuxtLayout>
        <NuxtLoadingIndicator :throttle="0" />
        <NuxtPage />
    </NuxtLayout>
</template>

<style>
/* Persist chrome; only animate page body */
.page-main {
    view-transition-name: page-main;
}

@keyframes page-vt-out {
    to {
        opacity: 0;
        transform: translateY(-6px);
    }
}

@keyframes page-vt-in {
    from {
        opacity: 0;
        transform: translateY(8px);
    }
}

/* Out first, then in */
::view-transition-old(page-main) {
    animation: 0.2s cubic-bezier(0.4, 0, 1, 1) both page-vt-out;
}

::view-transition-new(page-main) {
    animation: 0.28s cubic-bezier(0.22, 1, 0.36, 1) 0.16s both page-vt-in;
}

::view-transition-group(page-main) {
    animation-duration: 0.44s;
}

/* Vue fallback when View Transitions API is unavailable */
.page-enter-active,
.page-leave-active {
    transition:
        opacity 0.28s cubic-bezier(0.22, 1, 0.36, 1),
        transform 0.28s cubic-bezier(0.22, 1, 0.36, 1);
}

.page-enter-from {
    opacity: 0;
    transform: translateY(8px);
}

.page-leave-to {
    opacity: 0;
    transform: translateY(-6px);
}

@media (prefers-reduced-motion: reduce) {
    .page-enter-active,
    .page-leave-active {
        transition-duration: 0.01ms;
    }

    .page-enter-from,
    .page-leave-to {
        transform: none;
    }

    ::view-transition-old(page-main),
    ::view-transition-new(page-main) {
        animation: none;
    }
}
</style>
