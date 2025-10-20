<template>
    <NuxtRouteAnnouncer />
    <NuxtPwaAssets />
    <NuxtLayout>
        <NuxtLoadingIndicator :throttle="0" />
        <NuxtPage />
    </NuxtLayout>
</template>
