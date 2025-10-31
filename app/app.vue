<script setup>
const { initialize: initializeStatus } = useUserStatus()

onMounted(() => {
    initializeStatus()
})
</script>

<template>
    <NuxtRouteAnnouncer />
    <NuxtPwaAssets />
    <NuxtLayout>
        <NuxtLoadingIndicator :throttle="0" />
        <NuxtPage />
    </NuxtLayout>
</template>
