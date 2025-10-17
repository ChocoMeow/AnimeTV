<template>
    <NuxtRouteAnnouncer />
    <NuxtPwaManifest />
    <NuxtLayout>
        <NuxtLoadingIndicator :throttle="0" />
        <NuxtPage />
    </NuxtLayout>
</template>
