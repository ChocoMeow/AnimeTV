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
        // Wait for panel to be rendered in DOM (teleported to body)
        nextTick(() => {
            requestAnimationFrame(() => {
                updatePanelPosition()
            })
        })
    }
}

watch(open, (isOpen) => {
    if (isOpen) {
        // Wait for panel to be rendered in DOM (teleported to body)
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
            class="dropdown-trigger w-full rounded-xl border border-gray-200 dark:border-white/10 bg-black/5 dark:bg-white/10 text-gray-900 dark:text-gray-100 text-sm pl-3 pr-10 py-2 text-left flex items-center justify-between gap-2 focus:outline-none focus:ring-2 focus:ring-black/70 dark:focus:ring-white/70 focus:border-transparent transition-colors hover:border-gray-300 dark:hover:border-white/20"
            :class="{ 'opacity-60': !modelValue && placeholder }"
            @click="onOpen"
        >
            <span class="truncate">{{ selectedLabel }}</span>
            <span
                class="dropdown-arrow absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500 dark:text-gray-400 transition-transform"
                :class="{ 'rotate-180': open }"
            >
                <span class="material-icons text-xl">expand_more</span>
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
                    class="dropdown-panel z-[10] max-h-[min(24rem,70vh)] overflow-auto rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-gray-950 shadow-lg py-1"
                    :style="panelStyle"
                >
                    <button
                        v-for="opt in normalizedOptions"
                        :key="opt.value"
                        type="button"
                        class="dropdown-option w-full px-3 py-2 text-left text-sm text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-white/10 focus:bg-gray-100 dark:focus:bg-white/10 focus:outline-none transition-colors"
                        :class="{ 'bg-gray-100 dark:bg-white/10': modelValue === opt.value }"
                        @click="select(opt)"
                    >
                        {{ opt.label }}
                    </button>
                    <p
                        v-if="normalizedOptions.length === 0"
                        class="px-3 py-2 text-sm text-gray-500 dark:text-gray-400"
                    >
                        暫無選項
                    </p>
                </div>
            </Transition>
        </Teleport>
    </div>
</template>
