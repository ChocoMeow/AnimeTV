<script setup>
const props = defineProps({
    modelValue: {
        type: Boolean,
        required: true,
    },
    title: {
        type: String,
        default: "",
    },
    maxWidth: {
        type: String,
        default: "max-w-md",
    },
    persistent: {
        type: Boolean,
        default: false,
    },
    showClose: {
        type: Boolean,
        default: true,
    },
    scrollable: {
        type: Boolean,
        default: false,
    },
})

const emit = defineEmits(["update:modelValue"])

function close() {
    if (!props.persistent) {
        emit("update:modelValue", false)
    }
}

function handleBackdropClick() {
    if (!props.persistent) {
        close()
    }
}

function handleEscape(event) {
    if (event.key === "Escape" && !props.persistent) {
        close()
    }
}

function lockScroll() {
    document.body.style.overflow = "hidden"
}

function unlockScroll() {
    document.body.style.overflow = ""
}

onMounted(() => {
    watch(
        () => props.modelValue,
        (val) => {
        if (val) lockScroll()
        else unlockScroll()
        },
        { immediate: true }
    )
    document.addEventListener("keydown", handleEscape)
})

onBeforeUnmount(() => {
    document.removeEventListener("keydown", handleEscape)
    unlockScroll()
})
</script>

<template>
    <Teleport to="body">
        <Transition name="dialog">
            <div v-if="modelValue" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" :class="{ 'overflow-y-auto': scrollable }" @click.self="handleBackdropClick">
                <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full p-6 transform transition-all" :class="[maxWidth, scrollable ? 'my-8' : '']" @click.stop>
                    <!-- Header -->
                    <div v-if="title || showClose || $slots.header" class="flex items-center justify-between mb-6">
                        <slot name="header">
                            <h3 class="text-2xl font-bold text-gray-900 dark:text-white">
                                {{ title }}
                            </h3>
                        </slot>

                        <button v-if="showClose" @click="close" class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                            <span class="material-icons text-gray-500 dark:text-gray-400">close</span>
                        </button>
                    </div>

                    <!-- Content -->
                    <div :class="scrollable ? 'max-h-[70vh] overflow-y-auto custom-scrollbar pr-2' : ''">
                        <slot />
                    </div>

                    <!-- Footer -->
                    <div v-if="$slots.footer" class="mt-6">
                        <slot name="footer" />
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<style scoped>
.dialog-enter-active,
.dialog-leave-active {
    transition: all 0.3s ease-out;
}

.dialog-enter-active > div,
.dialog-leave-active > div {
    transition: all 0.3s ease-out;
}

.dialog-enter-from {
    opacity: 0;
}

.dialog-enter-from > div {
    transform: scale(0.95) translateY(20px);
}

.dialog-leave-to {
    opacity: 0;
}

.dialog-leave-to > div {
    transform: scale(0.95) translateY(20px);
}

.custom-scrollbar::-webkit-scrollbar {
    width: 6px;
}

.custom-scrollbar::-webkit-scrollbar-track {
    @apply bg-gray-100 dark:bg-gray-900 rounded-full;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
    @apply bg-gray-300 dark:bg-gray-600 rounded-full;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
    @apply bg-gray-400 dark:bg-gray-500;
}
</style>
