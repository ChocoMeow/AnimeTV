const THEME_KEY = 'theme'
const THEMES = new Set(['light', 'dark', 'system'])

function darkMq() {
    return window.matchMedia('(prefers-color-scheme: dark)')
}

function getStoredTheme() {
    if (!import.meta.client) return 'system'
    const stored = localStorage.getItem(THEME_KEY)
    return THEMES.has(stored) ? stored : 'system'
}

function resolveDark(theme) {
    return theme === 'dark' || (theme === 'system' && darkMq().matches)
}

/** Flip `.dark` with per-element transitions frozen (View Transition snapshots the result). */
function setDark(isDark) {
    const root = document.documentElement
    root.classList.add('theme-animating')
    root.classList.toggle('dark', isDark)
    requestAnimationFrame(() => {
        requestAnimationFrame(() => root.classList.remove('theme-animating'))
    })
}

function applyTheme(theme, animate = false) {
    if (!import.meta.client) return
    const isDark = resolveDark(theme)
    if (document.documentElement.classList.contains('dark') === isDark) return

    const flip = () => setDark(isDark)
    const canFade =
        animate &&
        !window.matchMedia('(prefers-reduced-motion: reduce)').matches &&
        typeof document.startViewTransition === 'function'

    if (canFade) document.startViewTransition(flip).finished.catch(() => {})
    else flip()
}

let systemListener = null

function watchSystemTheme(enabled) {
    const mq = darkMq()
    if (systemListener) {
        mq.removeEventListener('change', systemListener)
        systemListener = null
    }
    if (!enabled) return
    systemListener = () => applyTheme('system', true)
    mq.addEventListener('change', systemListener)
}

export function useTheme() {
    const theme = ref(getStoredTheme())

    function setTheme(value) {
        const next = THEMES.has(value) ? value : 'system'
        theme.value = next
        if (!import.meta.client) return
        if (next === 'system') localStorage.removeItem(THEME_KEY)
        else localStorage.setItem(THEME_KEY, next)
        applyTheme(next, true)
        watchSystemTheme(next === 'system')
    }

    onMounted(() => {
        theme.value = getStoredTheme()
        applyTheme(theme.value)
        watchSystemTheme(theme.value === 'system')
    })

    if (import.meta.client) {
        const onStorage = (e) => {
            if (e.key !== THEME_KEY) return
            theme.value = getStoredTheme()
            applyTheme(theme.value)
            watchSystemTheme(theme.value === 'system')
        }
        window.addEventListener('storage', onStorage)
        onUnmounted(() => {
            window.removeEventListener('storage', onStorage)
            watchSystemTheme(false)
        })
    }

    return { theme, setTheme }
}
