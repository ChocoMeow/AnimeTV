<template>
    <transition name="slide-up">
        <div v-if="toastState.show" class="fixed bottom-4 right-4 z-50 max-w-sm">
            <div
                :class="{
                    'bg-green-500': toastState.type === 'success',
                    'bg-red-500': toastState.type === 'error',
                    'bg-blue-500': toastState.type === 'info',
                    'bg-yellow-500': toastState.type === 'warning',
                }"
                class="px-6 py-3 rounded-lg shadow-lg text-white flex items-center gap-3"
            >
                <span class="material-icons">
                    {{ toastState.type === "success" ? "check_circle" : toastState.type === "error" ? "error" : toastState.type === "warning" ? "warning" : "info" }}
                </span>
                <span>{{ toastState.message }}</span>
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
