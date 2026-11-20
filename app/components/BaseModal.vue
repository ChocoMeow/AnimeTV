<script setup>
const props = defineProps({
    show: { type: Boolean, required: true },
    title: { type: String, default: '' },
    icon: { type: String, default: '' },
    iconColor: { type: String, default: 'text-gray-500' },
    maxWidth: { type: String, default: 'max-w-md' },
    persistent: { type: Boolean, default: false },
})

const emit = defineEmits(['close'])
const { isNarrow } = useMobile()

function close() {
    if (!props.persistent) emit('close')
}

function handleEscape(event) {
    if (event.key === 'Escape' && !props.persistent) emit('close')
}

function lockScroll() {
    document.body.style.overflow = 'hidden'
}

function unlockScroll() {
    document.body.style.overflow = ''
}

watch(
    () => props.show,
    (val) => {
        if (val) lockScroll()
        else unlockScroll()
    },
    { immediate: true },
)

onMounted(() => document.addEventListener('keydown', handleEscape))
onBeforeUnmount(() => {
    document.removeEventListener('keydown', handleEscape)
    unlockScroll()
})
</script>

<template>
    <!-- Narrow: bottom drawer (inherits Vaul sheet motion from BaseBottomDrawer) -->
    <BaseBottomDrawer
        v-if="isNarrow"
        :model-value="show"
        :title="title"
        :persistent="persistent"
        z-class="z-[70]"
        @update:model-value="(open) => { if (!open) emit('close') }"
    >
        <template #header>
            <div v-if="title || icon" class="flex items-center gap-3">
                <span v-if="icon" class="material-symbols-rounded text-3xl" :class="iconColor">
                    {{ icon }}
                </span>
                <h3 v-if="title" class="text-xl font-bold text-gray-900 dark:text-white">
                    {{ title }}
                </h3>
            </div>
        </template>

        <slot />

        <template v-if="$slots.actions" #footer>
            <div class="flex gap-3 justify-end">
                <slot name="actions" />
            </div>
        </template>
    </BaseBottomDrawer>

    <!-- Wide: same shadcn fade + zoom as BaseDialog -->
    <Teleport v-else to="body">
        <Transition name="dialog">
            <div
                v-if="show"
                class="fixed inset-0 bg-black/60 flex items-center justify-center z-[70] px-4"
                @click.self="close"
            >
                <div
                    class="bg-white dark:bg-gray-950 rounded-2xl shadow-2xl w-full px-6 pt-6 ring-1 ring-black/5 dark:ring-white/10"
                    :class="[maxWidth, $slots.actions ? '' : 'pb-safe']"
                    @click.stop
                >
                    <div v-if="title || icon" class="flex items-center gap-3 pb-4">
                        <span v-if="icon" class="material-symbols-rounded text-3xl" :class="iconColor">
                            {{ icon }}
                        </span>
                        <h3 class="text-xl font-bold text-gray-900 dark:text-white">
                            {{ title }}
                        </h3>
                    </div>

                    <div :class="$slots.actions ? 'pb-4' : ''">
                        <slot />
                    </div>

                    <div v-if="$slots.actions" class="flex gap-3 justify-end pb-safe">
                        <slot name="actions" />
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<style scoped>
.pb-safe {
    padding-bottom: calc(1rem + env(safe-area-inset-bottom, 0px));
}

.dialog-enter-active,
.dialog-leave-active {
    transition: opacity 200ms ease-out;
}

.dialog-enter-active > div,
.dialog-leave-active > div {
    transition:
        transform 200ms ease-out,
        opacity 200ms ease-out;
}

.dialog-enter-from,
.dialog-leave-to {
    opacity: 0;
}

.dialog-enter-from > div,
.dialog-leave-to > div {
    opacity: 0;
    transform: scale(0.95);
}

@media (prefers-reduced-motion: reduce) {
    .dialog-enter-active,
    .dialog-leave-active,
    .dialog-enter-active > div,
    .dialog-leave-active > div {
        transition-duration: 1ms;
    }
}
</style>
