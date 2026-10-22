<script setup>
definePageMeta({ offlineOnly: true, offlineAccess: true })

const appConfig = useAppConfig()
const { signedIn, hydrate } = useOfflineAuthCache()
hydrate()

function retry() {
    if (navigator.onLine) navigateTo('/')
    else window.location.reload()
}

useHead({ title: `離線模式 | ${appConfig.siteName}` })
</script>

<template>
    <div class="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 py-6 sm:py-8">
        <div class="mb-6 sm:mb-8">
            <h1 class="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 dark:text-white">離線模式</h1>
            <p class="text-gray-600 dark:text-gray-400 mt-1">目前無法連上網路</p>
        </div>

        <div class="empty-state">
            <span class="material-symbols-rounded text-gray-400 dark:text-gray-500 text-6xl mb-4 opacity-60">wifi_off</span>
            <h3 class="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-2">已下載的內容仍可觀看</h3>
            <p class="text-gray-500 dark:text-gray-400 mb-6">請檢查網路後再試</p>
            <div class="flex flex-col items-center gap-3">
                <NuxtLink v-if="signedIn" to="/offline-downloads" class="btn-primary">開啟下載管理</NuxtLink>
                <button type="button" class="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors" @click="retry">
                    點一下重試
                </button>
            </div>
        </div>
    </div>
</template>
