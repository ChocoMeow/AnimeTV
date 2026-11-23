<script setup>
const model = defineModel({ type: [String, Number], default: '' })

const props = defineProps({
    /** Values, or `{ value, label }` objects */
    options: { type: Array, default: () => [] },
    placeholder: { type: String, default: '請選擇' },
    boxed: { type: Boolean, default: false },
})

const open = ref(false)
const triggerRef = ref(null)
const panelRef = ref(null)
const panelStyle = ref({})

const normalizedOptions = computed(() =>
    props.options.map((opt) =>
        opt && typeof opt === 'object' && 'value' in opt && 'label' in opt
            ? opt
            : { value: opt, label: String(opt) },
    ),
)

const selectedLabel = computed(
    () => normalizedOptions.value.find((o) => o.value === model.value)?.label ?? props.placeholder,
)

function updatePanelPosition() {
    if (!triggerRef.value || !open.value) return
    const rect = triggerRef.value.getBoundingClientRect()
    panelStyle.value = {
        position: 'fixed',
        top: `${rect.bottom + 4}px`,
        left: `${rect.left}px`,
        width: `${rect.width}px`,
    }
}

function select(option) {
    model.value = option.value
    open.value = false
}

function onClickOutside(event) {
    if (triggerRef.value?.contains(event.target) || panelRef.value?.contains(event.target)) return
    open.value = false
}

watch(open, (isOpen) => {
    if (isOpen) {
        nextTick(() => requestAnimationFrame(updatePanelPosition))
        window.addEventListener('scroll', updatePanelPosition, true)
        window.addEventListener('resize', updatePanelPosition)
        return
    }
    window.removeEventListener('scroll', updatePanelPosition, true)
    window.removeEventListener('resize', updatePanelPosition)
})

onMounted(() => document.addEventListener('click', onClickOutside))
onUnmounted(() => {
    document.removeEventListener('click', onClickOutside)
    window.removeEventListener('scroll', updatePanelPosition, true)
    window.removeEventListener('resize', updatePanelPosition)
})
</script>

<template>
    <div class="relative w-full">
        <button
            ref="triggerRef"
            type="button"
            class="field-trigger"
            :class="[boxed && '!rounded-2xl', !model && placeholder && 'opacity-60']"
            @click="open = !open"
        >
            <span class="truncate">{{ selectedLabel }}</span>
            <span
                class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 transition-transform dark:text-gray-400"
                :class="open && 'rotate-180'"
            >
                <span class="material-symbols-rounded text-xl">expand_more</span>
            </span>
        </button>

        <Teleport to="body">
            <Transition
                enter-active-class="transition duration-150 ease-out"
                enter-from-class="opacity-0 scale-95"
                enter-to-class="opacity-100 scale-100"
                leave-active-class="transition duration-100 ease-in"
                leave-from-class="opacity-100 scale-100"
                leave-to-class="opacity-0 scale-95"
            >
                <div
                    v-show="open"
                    ref="panelRef"
                    class="z-[60] max-h-[min(24rem,70vh)] overflow-auto rounded-2xl bg-white py-1.5 shadow-xl ring-1 ring-black/5 dark:bg-gray-950 dark:ring-white/10"
                    :class="boxed && 'border border-black/5 ring-0 dark:border-white/10'"
                    :style="panelStyle"
                >
                    <button
                        v-for="opt in normalizedOptions"
                        :key="opt.value"
                        type="button"
                        class="w-full px-4 py-2.5 text-left text-sm text-gray-900 transition-colors hover:bg-black/5 focus:bg-black/5 focus:outline-none dark:text-gray-100 dark:hover:bg-white/10 dark:focus:bg-white/10"
                        :class="model === opt.value && 'bg-black/5 font-medium dark:bg-white/10'"
                        @click="select(opt)"
                    >
                        {{ opt.label }}
                    </button>
                    <p
                        v-if="!normalizedOptions.length"
                        class="px-4 py-2.5 text-sm text-gray-500 dark:text-gray-400"
                    >
                        暫無選項
                    </p>
                </div>
            </Transition>
        </Teleport>
    </div>
</template>
