const THEME_KEY = 'theme'
const THEME_ANIM_MS = 200

/** Apply theme from localStorage (or system). Call early to avoid FOUC. */
export function initTheme() {
    if (import.meta.server || typeof document === 'undefined') return
    const stored = localStorage.getItem(THEME_KEY)
    const isDark =
        stored === 'dark' || (!stored && window.matchMedia('(prefers-color-scheme: dark)').matches)
    document.documentElement.classList.toggle('dark', isDark)
}

function getStoredTheme() {
    if (!import.meta.client) return 'system'
    const stored = localStorage.getItem(THEME_KEY)
    return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system'
}

function isDarkPreferred() {
    return import.meta.client && window.matchMedia('(prefers-color-scheme: dark)').matches
}

function applyThemeToDocument(theme, animate = false) {
    if (import.meta.server || typeof document === 'undefined') return
    const root = document.documentElement
    const isDark = theme === 'dark' || (theme === 'system' && isDarkPreferred())
    if (animate) root.classList.add('theme-animating')
    root.classList.toggle('dark', isDark)
    if (animate) setTimeout(() => root.classList.remove('theme-animating'), THEME_ANIM_MS)
}

let systemListener = null

function applyTheme(theme, animate = false) {
    applyThemeToDocument(theme, animate)
    if (!import.meta.client || !window.matchMedia) return

    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    if (systemListener) {
        mq.removeEventListener('change', systemListener)
        systemListener = null
    }
    if (theme === 'system') {
        systemListener = () => applyThemeToDocument('system', true)
        mq.addEventListener('change', systemListener)
    }
}

export function useTheme() {
    const theme = ref(getStoredTheme())

    function setTheme(value) {
        const v = value === 'light' || value === 'dark' || value === 'system' ? value : 'system'
        theme.value = v
        if (!import.meta.client) return
        if (v === 'system') localStorage.removeItem(THEME_KEY)
        else localStorage.setItem(THEME_KEY, v)
        applyTheme(v, true)
    }

    onMounted(() => {
        theme.value = getStoredTheme()
        applyTheme(theme.value)
    })

    if (import.meta.client) {
        const onStorage = (e) => {
            if (e.key !== THEME_KEY) return
            theme.value = getStoredTheme()
            applyTheme(theme.value)
        }
        window.addEventListener('storage', onStorage)
        onUnmounted(() => {
            window.removeEventListener('storage', onStorage)
            if (systemListener) {
                window.matchMedia('(prefers-color-scheme: dark)').removeEventListener('change', systemListener)
                systemListener = null
            }
        })
    }

    return { theme, setTheme }
}
