<template>
    <NuxtRouteAnnouncer />
    <NuxtPwaAssets />
    <AppSplashScreen />
    <NuxtLayout>
        <NuxtLoadingIndicator :throttle="0" />
        <NuxtPage />
    </NuxtLayout>
</template>
