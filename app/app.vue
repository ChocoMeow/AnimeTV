<template>
    <NuxtRouteAnnouncer />
    <NuxtPwaAssets />
    <AppSplashScreen />
    <PullToRefresh />
    <NuxtLayout>
        <NuxtLoadingIndicator :throttle="0" />
        <NuxtPage />
    </NuxtLayout>
</template>