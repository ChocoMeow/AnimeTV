<script setup>
const props = defineProps({
    modelValue: {
        type: [String, Number],
        default: '',
    },
    /** Array of option values (strings) or { value, label } objects */
    options: {
        type: Array,
        default: () => [],
    },
    placeholder: {
        type: String,
        default: '請選擇',
    },
})

const emit = defineEmits(['update:modelValue'])

const open = ref(false)
const triggerRef = ref(null)
const panelRef = ref(null)
const panelStyle = ref({})

const normalizedOptions = computed(() => {
    return props.options.map((opt) =>
        typeof opt === 'object' && opt !== null && 'value' in opt && 'label' in opt
            ? { value: opt.value, label: opt.label }
            : { value: opt, label: String(opt) },
    )
})

const selectedLabel = computed(() => {
    const opt = normalizedOptions.value.find((o) => o.value === props.modelValue)
    return opt ? opt.label : props.placeholder
})

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
    emit('update:modelValue', option.value)
    open.value = false
}

function onClickOutside(event) {
    if (
        triggerRef.value &&
        panelRef.value &&
        !triggerRef.value.contains(event.target) &&
        !panelRef.value.contains(event.target)
    ) {
        open.value = false
    }
}

function onOpen() {
    open.value = !open.value
    if (open.value) {
        nextTick(() => {
            requestAnimationFrame(() => {
                updatePanelPosition()
            })
        })
    }
}

watch(open, (isOpen) => {
    if (isOpen) {
        nextTick(() => {
            requestAnimationFrame(() => {
                updatePanelPosition()
            })
        })
        window.addEventListener('scroll', updatePanelPosition, true)
        window.addEventListener('resize', updatePanelPosition)
    } else {
        window.removeEventListener('scroll', updatePanelPosition, true)
        window.removeEventListener('resize', updatePanelPosition)
    }
})

onMounted(() => {
    document.addEventListener('click', onClickOutside)
})

onUnmounted(() => {
    document.removeEventListener('click', onClickOutside)
    window.removeEventListener('scroll', updatePanelPosition, true)
    window.removeEventListener('resize', updatePanelPosition)
})
</script>

<template>
    <div class="dropdown-root relative w-full">
        <button
            ref="triggerRef"
            type="button"
            class="dropdown-trigger w-full rounded-full border border-transparent bg-black/5 dark:bg-white/10 text-gray-900 dark:text-gray-100 text-sm font-medium pl-4 pr-10 py-2.5 text-left flex items-center justify-between gap-2 focus:outline-none focus:ring-2 focus:ring-black/20 dark:focus:ring-white/20 focus:border-transparent transition-colors hover:bg-black/10 dark:hover:bg-white/15"
            :class="{ 'opacity-60': !modelValue && placeholder }"
            @click="onOpen"
        >
            <span class="truncate">{{ selectedLabel }}</span>
            <span
                class="dropdown-arrow absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500 dark:text-gray-400 transition-transform"
                :class="{ 'rotate-180': open }"
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
                    class="dropdown-panel z-[60] max-h-[min(24rem,70vh)] overflow-auto rounded-2xl ring-1 ring-black/5 dark:ring-white/10 bg-white dark:bg-gray-950 shadow-xl py-1.5"
                    :style="panelStyle"
                >
                    <button
                        v-for="opt in normalizedOptions"
                        :key="opt.value"
                        type="button"
                        class="dropdown-option w-full px-4 py-2.5 text-left text-sm text-gray-900 dark:text-gray-100 hover:bg-black/5 dark:hover:bg-white/10 focus:bg-black/5 dark:focus:bg-white/10 focus:outline-none transition-colors"
                        :class="{ 'bg-black/5 dark:bg-white/10 font-medium': modelValue === opt.value }"
                        @click="select(opt)"
                    >
                        {{ opt.label }}
                    </button>
                    <p
                        v-if="normalizedOptions.length === 0"
                        class="px-4 py-2.5 text-sm text-gray-500 dark:text-gray-400"
                    >
                        暫無選項
                    </p>
                </div>
            </Transition>
        </Teleport>
    </div>
</template>
