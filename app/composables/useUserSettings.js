const userSettings = ref({
    id: null,
    watch_history_enabled: true,
    search_history_enabled: true,
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
                userSettings.value = { ...data };
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
                .on('postgres_changes', { event: "update", schema: "public", "table": "user_settings" }, payload => {
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
        unsubscribe
    };
};