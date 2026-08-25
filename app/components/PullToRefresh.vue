<script setup>
/**
 * iOS/Android-style pull-to-refresh for the installed PWA.
 * No third-party library — same idea as pulltorefresh.js (top-of-page pull, resistance, then reload).
 */
const { isMobile } = useMobile()
const { searchModalOpen } = useMobileSearchState()
const splashDone = useState('app-splash-done', () => false)

const THRESHOLD = 64
const MAX_PULL = 96
const HOLD = 52
const IGNORE_SELECTORS = 'input, textarea, select, [contenteditable="true"], [contenteditable=""], video, [data-no-ptr]'

const enabled = ref(false)
const pull = ref(0)
const state = ref('idle') // idle | pulling | ready | refreshing
const snapping = ref(false)

let startX = 0
let startY = 0
let tracking = false
let pulling = false
let mqStandalone
let mqMinimal

const visible = computed(() => enabled.value && (state.value !== 'idle' || pull.value > 0 || snapping.value))
const progress = computed(() => Math.min(1, pull.value / THRESHOLD))
const iconRotate = computed(() => (state.value === 'ready' ? 180 : Math.round(progress.value * 180)))
let snapTimer = 0
let reloadTimer = 0

function isStandaloneDisplay() {
    return (
        window.matchMedia('(display-mode: standalone)').matches ||
        window.matchMedia('(display-mode: minimal-ui)').matches ||
        Boolean(window.navigator?.standalone)
    )
}

function updateEnabled() {
    if (typeof window === 'undefined') return
    const next = isMobile.value && isStandaloneDisplay()
    enabled.value = next
    document.documentElement.classList.toggle('ptr-enabled', next)
}

function getScrollY() {
    return window.scrollY || document.documentElement.scrollTop || 0
}

function resist(distance) {
    if (distance <= 0) return 0
    return Math.min(MAX_PULL, distance * 0.48)
}

function isVerticallyScrollable(el) {
    const style = window.getComputedStyle(el)
    return /(auto|scroll|overlay)/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 1
}

function hasNestedScrollNotAtTop(target) {
    let node = target instanceof Element ? target : target?.parentElement
    while (node && node !== document.body && node !== document.documentElement) {
        if (isVerticallyScrollable(node) && node.scrollTop > 1) return true
        node = node.parentElement
    }
    return false
}

function shouldIgnore(target) {
    if (!splashDone.value) return true
    if (searchModalOpen.value) return true
    if (document.fullscreenElement) return true
    if (document.body.style.overflow === 'hidden') return true
    if (state.value === 'refreshing') return true
    if (!(target instanceof Element)) return false
    return Boolean(target.closest(IGNORE_SELECTORS))
}

function onTouchStart(event) {
    if (!enabled.value || event.touches.length !== 1) return
    if (shouldIgnore(event.target) || getScrollY() > 1 || hasNestedScrollNotAtTop(event.target)) {
        tracking = false
        pulling = false
        return
    }
    const touch = event.touches[0]
    startX = touch.clientX
    startY = touch.clientY
    tracking = true
    pulling = false
    snapping.value = false
}

function onTouchMove(event) {
    if (!tracking || !enabled.value || state.value === 'refreshing') return
    if (event.touches.length !== 1) {
        resetPull()
        return
    }

    const touch = event.touches[0]
    const dx = touch.clientX - startX
    const dy = touch.clientY - startY

    if (!pulling) {
        if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
            tracking = false
            return
        }
        if (dy < 8) return
        if (getScrollY() > 1 || hasNestedScrollNotAtTop(event.target)) {
            tracking = false
            return
        }
        pulling = true
        state.value = 'pulling'
    }

    if (dy <= 0) {
        pull.value = 0
        state.value = 'pulling'
        return
    }

    if (event.cancelable) event.preventDefault()
    pull.value = resist(dy)
    state.value = pull.value >= THRESHOLD ? 'ready' : 'pulling'
}

function resetPull() {
    window.clearTimeout(snapTimer)
    snapping.value = true
    pull.value = 0
    state.value = 'idle'
    tracking = false
    pulling = false
    snapTimer = window.setTimeout(() => {
        snapping.value = false
    }, 220)
}

function onTouchEnd() {
    if (!tracking) return
    tracking = false

    if (!pulling) {
        pulling = false
        return
    }
    pulling = false

    if (state.value === 'ready') {
        snapping.value = true
        pull.value = HOLD
        state.value = 'refreshing'
        window.clearTimeout(reloadTimer)
        reloadTimer = window.setTimeout(() => {
            window.location.reload()
        }, 280)
        return
    }

    resetPull()
}

function onTouchCancel() {
    if (state.value === 'refreshing') return
    if (tracking || pulling) resetPull()
}

onMounted(() => {
    updateEnabled()
    mqStandalone = window.matchMedia('(display-mode: standalone)')
    mqMinimal = window.matchMedia('(display-mode: minimal-ui)')
    mqStandalone.addEventListener('change', updateEnabled)
    mqMinimal.addEventListener('change', updateEnabled)
    window.addEventListener('resize', updateEnabled)
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('touchend', onTouchEnd, { passive: true })
    window.addEventListener('touchcancel', onTouchCancel, { passive: true })
})

onUnmounted(() => {
    window.clearTimeout(snapTimer)
    window.clearTimeout(reloadTimer)
    mqStandalone?.removeEventListener('change', updateEnabled)
    mqMinimal?.removeEventListener('change', updateEnabled)
    window.removeEventListener('resize', updateEnabled)
    window.removeEventListener('touchstart', onTouchStart)
    window.removeEventListener('touchmove', onTouchMove)
    window.removeEventListener('touchend', onTouchEnd)
    window.removeEventListener('touchcancel', onTouchCancel)
    document.documentElement.classList.remove('ptr-enabled')
})

watch(state, (next) => {
    if (next !== 'ready') return
    try {
        navigator.vibrate?.(12)
    } catch {
        /* ignore — unsupported or blocked */
    }
})

watch(isMobile, updateEnabled)
</script>

<template>
    <Teleport to="body">
        <div
            v-show="visible"
            class="ptr-indicator pointer-events-none fixed left-1/2 z-[55]"
            :class="snapping ? 'ptr-indicator--snap' : ''"
            :style="{
                transform: `translate(-50%, ${Math.max(0, pull - 8)}px) scale(${0.72 + progress * 0.28})`,
                opacity: state === 'refreshing' ? 1 : Math.min(1, progress * 1.35),
            }"
            role="status"
            aria-live="polite"
            :aria-busy="state === 'refreshing'"
            :aria-label="state === 'refreshing' ? '正在重新整理' : state === 'ready' ? '放開即可重新整理' : '下拉重新整理'"
        >
            <div
                class="flex h-9 w-9 items-center justify-center rounded-full bg-black/50 backdrop-blur-md shadow-[0_4px_18px_rgba(0,0,0,0.22)] ring-1 ring-white/10"
            >
                <LoadingSpinner v-if="state === 'refreshing'" size="sm" variant="on-dark" />
                <span
                    v-else
                    class="material-symbols-rounded text-[22px] text-white"
                    :style="{ transform: `rotate(${iconRotate}deg)` }"
                    aria-hidden="true"
                >
                    {{ state === 'ready' ? 'refresh' : 'arrow_downward' }}
                </span>
            </div>
        </div>
    </Teleport>
</template>

<style>
html.ptr-enabled {
    overscroll-behavior-y: contain;
}
</style>

<style scoped>
.ptr-indicator {
    top: calc(env(safe-area-inset-top, 0px) + 0.35rem);
    will-change: transform, opacity;
}

.ptr-indicator--snap {
    transition:
        transform 0.22s ease,
        opacity 0.22s ease;
}

.ptr-indicator span {
    transition: transform 0.16s ease;
}

@media (prefers-reduced-motion: reduce) {
    .ptr-indicator--snap,
    .ptr-indicator span {
        transition: none;
    }
}
</style>
