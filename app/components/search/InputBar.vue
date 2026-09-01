<script setup>
defineProps({
    modelValue: { type: String, default: '' },
    placeholder: { type: String, default: '' },
    loading: { type: Boolean, default: false },
    isAskIntent: { type: Boolean, default: false },
    aiEnabled: { type: Boolean, default: false },
    isListening: { type: Boolean, default: false },
    speechSupported: { type: Boolean, default: false },
    micError: { type: String, default: '' },
    /** Pill styling for header-embedded desktop bar */
    embedded: { type: Boolean, default: false },
    showClose: { type: Boolean, default: false },
    showMic: { type: Boolean, default: true },
    showIntentDesktop: { type: Boolean, default: true },
    showIntentMobile: { type: Boolean, default: false },
})

defineEmits(['update:modelValue', 'keydown', 'close', 'set-intent', 'mic-toggle'])

const inputRef = ref(null)

defineExpose({ focus: () => inputRef.value?.focus() })
</script>

<template>
    <div
        class="flex w-full min-w-0 items-center gap-2"
        :class="
            embedded
                ? 'min-h-9 items-center rounded-full bg-white px-4 py-2 shadow-sm ring-1 ring-black/8 focus-within:ring-black/15 dark:bg-gray-950 dark:ring-white/10 dark:focus-within:ring-white/20'
                : 'px-3 py-3 sm:px-4'
        "
    >
        <span
            class="relative inline-flex shrink-0 items-center justify-center overflow-hidden text-gray-400"
            :class="embedded ? 'h-[18px] w-[18px]' : 'h-9 w-6'"
            aria-hidden="true"
        >
            <span
                class="material-symbols-rounded absolute leading-none transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
                :class="[
                    embedded ? 'text-[18px]' : 'text-[22px]',
                    isAskIntent ? 'translate-y-2 scale-75 opacity-0' : 'translate-y-0 scale-100 opacity-100',
                ]"
            >search</span>
            <span
                class="material-symbols-rounded absolute leading-none transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
                :class="[
                    embedded ? 'text-[18px]' : 'text-[22px]',
                    isAskIntent ? 'translate-y-0 scale-100 opacity-100' : '-translate-y-2 scale-75 opacity-0',
                ]"
            >smart_toy</span>
        </span>
        <div class="relative flex min-w-0 flex-1 items-center" :class="embedded ? '' : 'h-9'">
            <input
                ref="inputRef"
                :value="modelValue"
                type="search"
                :placeholder="placeholder"
                class="w-full appearance-none bg-transparent py-0 text-gray-900 outline-none placeholder:text-gray-400 dark:text-gray-100 dark:placeholder:text-gray-500"
                :class="embedded ? 'pr-2 text-sm leading-5' : 'h-full pr-12 text-base leading-none sm:text-sm'"
                autocomplete="off"
                @input="$emit('update:modelValue', ($event.target).value)"
                @keydown.stop="$emit('keydown', $event)"
            />
            <LoadingSpinner
                v-if="loading && !isAskIntent"
                size="xs"
                class="pointer-events-none absolute top-1/2 -translate-y-1/2"
                :class="embedded ? 'right-2' : 'right-10'"
            />
            <SearchMicButton
                v-if="showMic"
                idle-class="bg-transparent text-gray-400 dark:text-gray-500"
                hover-class="hover:bg-black/5 hover:text-gray-700 dark:hover:bg-white/10 dark:hover:text-gray-200"
                :listening="isListening"
                :supported="speechSupported"
                :error="micError"
                @toggle="$emit('mic-toggle')"
            />
        </div>
        <SearchIntentSwitcher
            v-if="aiEnabled && showIntentDesktop"
            class="hidden h-8 w-[5.75rem] shrink-0 md:block"
            :ask="isAskIntent"
            ask-label="AI"
            @select="$emit('set-intent', $event)"
        />
        <button
            v-if="showClose"
            type="button"
            class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-black/5 dark:hover:bg-white/10 md:hidden"
            aria-label="關閉"
            @click="$emit('close')"
        >
            <span class="material-symbols-rounded text-[22px] leading-none">close</span>
        </button>
    </div>
    <SearchIntentSwitcher
        v-if="aiEnabled && showIntentMobile"
        class="mx-3 mb-2 h-9 shrink-0 md:hidden"
        :ask="isAskIntent"
        ask-label="問 AI"
        @select="$emit('set-intent', $event)"
    />
</template>

<style scoped>
input[type='search']::-webkit-search-cancel-button,
input[type='search']::-webkit-search-decoration {
    -webkit-appearance: none;
    appearance: none;
    display: none;
}
</style>
