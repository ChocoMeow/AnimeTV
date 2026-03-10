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
    padding: {
        type: Boolean,
        default: true,
    },
    showHeader: {
        type: Boolean,
        default: true,
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
                <div class="bg-white dark:bg-gray-950 rounded-2xl shadow-2xl w-full transform transition-all border-1 border-gray-950/5 dark:border-white/10 overflow-hidden" :class="[maxWidth, scrollable ? 'my-8' : '', padding ? 'p-6' : 'p-0']" @click.stop>
                    <!-- Header -->
                    <div v-if="showHeader && (title || showClose || $slots.header)" class="flex items-center justify-between mb-2 flex-shrink-0">
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
                    <div :class="['base-dialog-content', scrollable ? 'max-h-[70vh] overflow-y-auto min-h-0' : '']">
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
.base-dialog-content {
    scrollbar-gutter: stable;
}

.base-dialog-content::-webkit-scrollbar {
    width: 6px;
}

.base-dialog-content::-webkit-scrollbar-track {
    background: transparent;
}

.base-dialog-content::-webkit-scrollbar-thumb {
    background: rgb(156 163 175 / 0.5);
    border-radius: 3px;
}

.base-dialog-content::-webkit-scrollbar-thumb:hover {
    background: rgb(156 163 175 / 0.7);
}

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
</style>
