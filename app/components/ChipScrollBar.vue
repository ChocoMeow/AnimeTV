<script setup>
/**
 * YouTube-style horizontal chip scroller: fade edges + chevron buttons.
 * Put chip buttons in the default slot; call rebind() when chip count changes.
 */
defineProps({
    /** Larger chevrons (related tabs); smaller for episode ranges */
    large: { type: Boolean, default: false },
    gapClass: { type: String, default: 'gap-2' },
})

const scrollEl = ref(null)
const canScrollLeft = ref(false)
const canScrollRight = ref(false)
let resizeObserver = null

function update() {
    const el = scrollEl.value
    if (!el) {
        canScrollLeft.value = false
        canScrollRight.value = false
        return
    }
    const max = el.scrollWidth - el.clientWidth
    // Small epsilon so sub-pixel leftovers don't leave a useless extra click
    canScrollLeft.value = el.scrollLeft > 4
    canScrollRight.value = el.scrollLeft < max - 4
}

/** -1 = left, 1 = right. Snaps to the edge when near the end. */
function scrollByDir(direction) {
    const el = scrollEl.value
    if (!el) return
    const max = Math.max(0, el.scrollWidth - el.clientWidth)
    const step = Math.max(el.clientWidth * 0.75, 120)
    const remaining = direction > 0 ? max - el.scrollLeft : el.scrollLeft
    const delta = remaining <= step * 1.2 ? remaining : step
    el.scrollTo({ left: el.scrollLeft + direction * delta, behavior: 'smooth' })
}

function rebind() {
    nextTick(() => {
        resizeObserver?.disconnect()
        resizeObserver = null
        const el = scrollEl.value
        update()
        if (!el) return
        resizeObserver = new ResizeObserver(update)
        resizeObserver.observe(el)
    })
}

defineExpose({ rebind, update })

onMounted(rebind)
onUnmounted(() => resizeObserver?.disconnect())
</script>

<template>
    <div class="chip-scroll relative min-w-0 w-full">
        <div
            ref="scrollEl"
            class="flex overflow-x-auto scrollbar-none scroll-smooth"
            :class="gapClass"
            @scroll="update"
        >
            <slot />
        </div>

        <div
            class="chip-scroll-edge chip-scroll-edge--left"
            :class="[
                large ? 'chip-scroll-edge--wide' : '',
                canScrollLeft ? 'opacity-100' : 'opacity-0 pointer-events-none',
            ]"
        >
            <button type="button" class="chip-scroll-btn" :class="{ 'chip-scroll-btn--lg': large }" aria-label="向左捲動" @click="scrollByDir(-1)">
                <span class="material-symbols-rounded" :class="large ? 'text-2xl' : 'text-lg'">chevron_left</span>
            </button>
        </div>
        <div
            class="chip-scroll-edge chip-scroll-edge--right"
            :class="[
                large ? 'chip-scroll-edge--wide' : '',
                canScrollRight ? 'opacity-100' : 'opacity-0 pointer-events-none',
            ]"
        >
            <button type="button" class="chip-scroll-btn" :class="{ 'chip-scroll-btn--lg': large }" aria-label="向右捲動" @click="scrollByDir(1)">
                <span class="material-symbols-rounded" :class="large ? 'text-2xl' : 'text-lg'">chevron_right</span>
            </button>
        </div>
    </div>
</template>
