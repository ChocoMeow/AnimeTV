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

const { isMobile } = useMobile()

const effectiveShowClose = computed(() => props.showClose && !isMobile.value)

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

function handleDrawerClose() {
    emit("update:modelValue", false)
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
    <!-- Mobile: bottom drawer -->
    <BaseBottomDrawer
        v-if="isMobile"
        :model-value="modelValue"
        :title="showHeader ? title : ''"
        :persistent="persistent"
        @update:model-value="handleDrawerClose"
    >
        <template v-if="showHeader && (title || effectiveShowClose || $slots.header)" #header>
            <div class="flex items-center justify-between w-full gap-3">
                <slot name="header">
                    <h3 v-if="title" class="text-xl font-bold text-gray-900 dark:text-white">
                        {{ title }}
                    </h3>
                </slot>

                <button
                    v-if="effectiveShowClose"
                    type="button"
                    class="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                    @click.stop="close"
                >
                    <span class="material-symbols-rounded text-gray-500 dark:text-gray-400">close</span>
                </button>
            </div>
        </template>

        <div :class="padding ? '' : '-mx-4 -my-4'">
            <slot />
        </div>

        <template v-if="$slots.footer" #footer>
            <slot name="footer" />
        </template>
    </BaseBottomDrawer>

    <!-- Desktop: centered dialog -->
    <Teleport v-else to="body">
        <Transition name="dialog">
            <div v-if="modelValue" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" :class="{ 'overflow-y-auto': scrollable }" @click.self="handleBackdropClick">
                <div class="bg-white dark:bg-gray-950 rounded-2xl shadow-2xl w-full transform transition-all ring-1 ring-black/5 dark:ring-white/10 overflow-hidden" :class="[maxWidth, scrollable ? 'my-8' : '', padding ? 'p-6' : 'p-0']" @click.stop>
                    <!-- Header -->
                    <div v-if="showHeader && (title || effectiveShowClose || $slots.header)" class="flex items-center justify-between mb-2 flex-shrink-0">
                        <slot name="header">
                            <h3 class="text-2xl font-bold text-gray-900 dark:text-white">
                                {{ title }}
                            </h3>
                        </slot>

                        <button v-if="effectiveShowClose" type="button" @click="close" class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors">
                            <span class="material-symbols-rounded text-gray-500 dark:text-gray-400">close</span>
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
