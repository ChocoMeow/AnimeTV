<script setup>
useHead({ title: '離線模式 | AnimeTV' })
</script>

<template>
    <div class="min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <span class="material-icons text-gray-500 text-7xl mb-6">wifi_off</span>
        <h1 class="text-2xl font-bold text-white mb-3">你目前處於離線模式</h1>
        <p class="text-gray-400 max-w-md mb-8 leading-relaxed">
            請檢查你的網絡連接。某些功能可能無法使用，但已下載的內容仍可觀看。
        </p>
        <NuxtLink
            to="/"
            class="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
        >
            返回首頁
        </NuxtLink>
    </div>
</template>
