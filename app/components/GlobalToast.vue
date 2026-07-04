<template>
    <transition name="slide-up">
        <div v-if="toastState.show" class="fixed bottom-4 right-4 z-50 max-w-sm">
            <div
                :class="{
                    'bg-emerald-500': toastState.type === 'success',
                    'bg-red-500': toastState.type === 'error',
                    'bg-blue-500': toastState.type === 'info',
                    'bg-amber-500': toastState.type === 'warning',
                }"
                class="px-5 py-3.5 rounded-2xl shadow-2xl shadow-black/20 dark:shadow-black/50 ring-1 ring-white/10 backdrop-blur-sm text-white flex items-center gap-3"
            >
                <span class="material-symbols-rounded text-xl flex-shrink-0">
                    {{ toastState.type === "success" ? "check_circle" : toastState.type === "error" ? "error" : toastState.type === "warning" ? "warning" : "info" }}
                </span>
                <span class="text-sm font-medium">{{ toastState.message }}</span>
            </div>
        </div>
    </transition>
</template>

<script setup>
const { toastState } = useToast()
</script>

<style scoped>
.slide-up-enter-active,
.slide-up-leave-active {
    transition: all 0.3s ease;
}
.slide-up-enter-from,
.slide-up-leave-to {
    opacity: 0;
    transform: translateY(20px);
}
</style>
