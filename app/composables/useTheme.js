const THEME_KEY = "theme";

/**
 * Apply theme from localStorage (or system) to document. Call early (e.g. from a client plugin) to avoid FOUC.
 */
export function initTheme() {
    if (import.meta.server || typeof document === "undefined") return;
    const isDark =
        localStorage.getItem(THEME_KEY) === "dark" ||
        (!localStorage.getItem(THEME_KEY) &&
            window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", isDark);
}

/** @type {'light'|'dark'|'system'} */
function getStoredTheme() {
    if (import.meta.client && typeof localStorage !== "undefined") {
        const stored = localStorage.getItem(THEME_KEY);
        if (stored === "light" || stored === "dark" || stored === "system") return stored;
    }
    return "system";
}

function isDarkPreferred() {
    if (import.meta.client && window.matchMedia) {
        return window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    return false;
}

function applyThemeToDocument(theme) {
    if (import.meta.server || typeof document === "undefined") return;
    const isDark =
        theme === "dark" || (theme === "system" && isDarkPreferred());
    document.documentElement.classList.toggle("dark", isDark);
}

let systemListener = null;

function applyTheme(theme) {
    applyThemeToDocument(theme);
    if (import.meta.client && window.matchMedia) {
        const mq = window.matchMedia("(prefers-color-scheme: dark)");
        if (systemListener) {
            mq.removeEventListener("change", systemListener);
            systemListener = null;
        }
        if (theme === "system") {
            systemListener = () => applyThemeToDocument("system");
            mq.addEventListener("change", systemListener);
        }
    }
}

export function useTheme() {
    const theme = ref(getStoredTheme());

    function setTheme(value) {
        const v = value === "light" || value === "dark" || value === "system" ? value : "system";
        theme.value = v;
        if (import.meta.client) {
            if (v === "system") {
                localStorage.removeItem(THEME_KEY);
            } else {
                localStorage.setItem(THEME_KEY, v);
            }
            applyTheme(v);
        }
    }

    // Sync on mount: read from localStorage (client) and apply
    onMounted(() => {
        theme.value = getStoredTheme();
        applyTheme(theme.value);
    });

    if (import.meta.client) {
        // Optional: sync when storage changes (e.g. another tab)
        const handleStorage = (e) => {
            if (e.key === THEME_KEY) {
                theme.value = getStoredTheme();
                applyTheme(theme.value);
            }
        };
        window.addEventListener("storage", handleStorage);
        onUnmounted(() => {
            window.removeEventListener("storage", handleStorage);
            if (systemListener && window.matchMedia) {
                window.matchMedia("(prefers-color-scheme: dark)").removeEventListener("change", systemListener);
            }
        });
    }

    return { theme, setTheme };
}
