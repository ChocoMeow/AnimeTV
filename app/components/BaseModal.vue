<script setup>
const props = defineProps({
    show: {
        type: Boolean,
        required: true,
    },
    title: {
        type: String,
        default: "",
    },
    icon: {
        type: String,
        default: "",
    },
    iconColor: {
        type: String,
        default: "text-indigo-500",
    },
    maxWidth: {
        type: String,
        default: "max-w-md",
    },
    persistent: {
        type: Boolean,
        default: false,
    },
})

const emit = defineEmits(["close"])

function handleBackdropClick() {
    if (!props.persistent) {
        emit("close")
    }
}

function handleEscape(event) {
    if (event.key === "Escape" && !props.persistent) {
        emit("close")
    }
}

function lockScroll() {
    document.body.style.overflow = "hidden"
}

function unlockScroll() {
    document.body.style.overflow = ""
}

watch(
    () => props.show,
    (val) => {
        if (val) lockScroll()
        else unlockScroll()
    },
    { immediate: true }
)

onMounted(() => {
    document.addEventListener("keydown", handleEscape)
})

onBeforeUnmount(() => {
    document.removeEventListener("keydown", handleEscape)
    unlockScroll()
})
</script>

<template>
    <transition name="fade">
        <div v-if="show" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4" @click="handleBackdropClick">
            <div class="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full p-6" :class="maxWidth" @click.stop>
                <!-- Header -->
                <div v-if="title || icon" class="flex items-center gap-3 mb-4">
                    <span v-if="icon" class="material-icons text-3xl" :class="iconColor">
                        {{ icon }}
                    </span>
                    <h3 class="text-xl font-bold text-gray-900 dark:text-gray-100">
                        {{ title }}
                    </h3>
                </div>

                <!-- Content Slot -->
                <slot />

                <!-- Actions Slot (with default styling) -->
                <div v-if="$slots.actions" class="flex gap-3 justify-end mt-6">
                    <slot name="actions" />
                </div>
            </div>
        </div>
    </transition>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}
</style>
