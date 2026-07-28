<script setup>
const { aiEnabled } = useRuntimeConfig().public
</script>

<template>
    <NuxtRouteAnnouncer />
    <NuxtPwaAssets />
    <AppSplashScreen />
    <NuxtLayout>
        <NuxtLoadingIndicator :throttle="0" />
        <NuxtPage />
    </NuxtLayout>
    <LazyAiAssistantWidget v-if="aiEnabled" />
</template>
