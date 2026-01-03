const userSettings = ref({
    id: null,
    watch_history_enabled: true,
    search_history_enabled: true,
    custom_shortcuts: null,
});

const searchHistory = ref([]);
const settingsLoaded = ref(false);
const settingsLoading = ref(false);

let userSubscription = null; // Subscription variable

export const useUserSettings = () => {
    const client = useSupabaseClient();
    const user = useSupabaseUser();
    const { showToast } = useToast();

    // Fetch user settings from database
    const fetchSettings = async () => {
        if (!user?.value?.sub) {
            console.warn('No user logged in');
            return;
        }

        if (settingsLoaded.value) {
            return userSettings.value;
        }

        if (userSubscription) {
            unsubscribe()
        }

        settingsLoading.value = true;
        try {
            const { data, error } = await client
                .from("user_settings")
                .select("*")
                .single();

            if (error && error.code !== "PGRST116") {
                throw error;
            }

            if (data) {
                userSettings.value = { 
                    ...data,
                    custom_shortcuts: data.custom_shortcuts || null
                };
            }

            subscribeToSettings()
            settingsLoaded.value = true;
            return userSettings.value;
        } catch (err) {
            console.error("Failed to fetch settings:", err);
            return userSettings.value;
        } finally {
            settingsLoading.value = false;
        }
    };

    // Save settings to database
    const saveSettings = async (newSettings = null) => {
        if (!user?.value?.sub) {
            showToast?.("請先登入", "error");
            return false;
        }

        try {
            const { error } = await client
                .from("user_settings")
                .update({ ...newSettings })
                .eq("id", user.value.sub);

            if (error) throw error;

            if (newSettings) {
                userSettings.value = { ...userSettings.value, ...newSettings };
            }

            return true;
        } catch (err) {
            console.error("Failed to save settings:", err);
            return false;
        }
    };

    // Update a single setting
    const updateSetting = async (key, value) => {
        const success = await saveSettings({ [key]: value });

        if (success && showToast) {
            showToast("設定已儲存", "success");
        } else if (!success && showToast) {
            showToast("儲存失敗，請稍後再試", "error");
        }

        return success;
    };

    // Update multiple settings at once
    const updateSettings = async (updates) => {
        const success = await saveSettings(updates);

        if (success && showToast) {
            showToast("設定已儲存", "success");
        } else if (!success && showToast) {
            showToast("儲存失敗，請稍後再試", "error");
        }

        return success;
    };

    // Subscribe to real-time updates
    const subscribeToSettings = () => {
        if (user?.value?.sub) {
            userSubscription = client
                .channel(`table_db_changes`)
                .on('postgres_changes', { event: "update", schema: "public", table: "user_settings" }, payload => {
                    if (payload.new) {
                        userSettings.value = { ...payload.new };
                    }
                })
                .subscribe();
        }
    };

    // Unsubscribe from real-time updates
    const unsubscribe = () => {
        if (userSubscription) {
            userSubscription.unsubscribe();
            userSubscription = null;
        }
    };

    // Get default keyboard shortcuts with labels
    const getDefaultShortcuts = () => ({
        playPause: {
            key: " ",
            label: "播放/暫停"
        },
        skipOP: {
            key: "\\",
            label: "跳過片頭"
        },
        previousEpisode: {
            key: "[",
            label: "上一集"
        },
        nextEpisode: {
            key: "]",
            label: "下一集"
        },
        volumeUp: {
            key: "ArrowUp",
            label: "增加音量"
        },
        volumeDown: {
            key: "ArrowDown",
            label: "減少音量"
        },
        mute: {
            key: "m",
            label: "靜音/取消靜音"
        },
        fullscreen: {
            key: "f",
            label: "全螢幕/退出全螢幕"
        },
        seekForward5: {
            key: "ArrowRight",
            label: "前進 5 秒"
        },
        seekBackward5: {
            key: "ArrowLeft",
            label: "後退 5 秒"
        },
        seekForward10: {
            key: "l",
            label: "前進 10 秒"
        },
        seekBackward10: {
            key: "j",
            label: "後退 10 秒"
        },
    });

    // Get merged shortcuts (custom + defaults)
    const getShortcuts = () => {
        const defaults = getDefaultShortcuts();
        const custom = userSettings.value?.custom_shortcuts;
        
        if (!custom || typeof custom !== 'object') {
            return defaults;
        }
        
        // Merge custom shortcuts with defaults
        // Custom shortcuts only contain keys, so we merge them with default structure
        const merged = { ...defaults };
        for (const [action, customKey] of Object.entries(custom)) {
            if (merged[action]) {
                merged[action] = {
                    ...merged[action],
                    key: customKey
                };
            }
        }
        
        return merged;
    };

    // Reset shortcuts to defaults
    const resetShortcuts = async () => {
        return await updateSetting('custom_shortcuts', null);
    };

    // Format key for display in shortcuts
    const formatShortcutKey = (key) => {
        if (!key) return ""
        // Handle both string keys and shortcut objects
        const keyValue = typeof key === 'string' ? key : key.key || ""
        if (!keyValue) return ""
        if (keyValue === " ") return "Space"
        if (keyValue.startsWith("Arrow")) {
            const direction = keyValue.replace("Arrow", "")
            const arrows = { Up: "↑", Down: "↓", Left: "←", Right: "→" }
            return arrows[direction] || keyValue
        }
        if (keyValue === "\\") return "\\"
        if (keyValue.length === 1) return keyValue.toUpperCase()
        return keyValue
    };

    return {
        userSettings: readonly(userSettings),
        settingsLoaded: readonly(settingsLoaded),
        settingsLoading: readonly(settingsLoading),
        searchHistory,
        fetchSettings,
        saveSettings,
        updateSetting,
        updateSettings,
        subscribeToSettings,
        unsubscribe,
        getDefaultShortcuts,
        getShortcuts,
        resetShortcuts,
        formatShortcutKey,
    };
};