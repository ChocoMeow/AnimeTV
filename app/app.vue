<script setup>
const { aiEnabled } = useRuntimeConfig().public
const route = useRoute()
const showAiWidget = computed(() => aiEnabled && route.path !== '/login')
</script>

<template>
    <NuxtRouteAnnouncer />
    <NuxtPwaAssets />
    <AppSplashScreen />
    <NuxtLayout>
        <NuxtLoadingIndicator :throttle="0" />
        <NuxtPage />
    </NuxtLayout>
    <LazyAiAssistantWidget v-if="showAiWidget" />
</template>
