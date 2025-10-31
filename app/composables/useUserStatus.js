/**
 * User status management composable
 * Tracks and updates user online/watching/idle/offline status
 */
export const useUserStatus = () => {
    const supabase = useSupabaseClient()
    const { userSettings } = useUserSettings()

    // State
    const currentStatus = ref("offline")
    const isTracking = ref(false)

    // Timers
    let idleTimer = null
    let heartbeatTimer = null

    // Constants
    const IDLE_TIMEOUT = 5 * 60 * 1000 // 5 minutes
    const HEARTBEAT_INTERVAL = 60 * 3000 // 3 minute

    /**
     * Update user status in database
     */
    const updateStatus = async (status, animeData = null) => {
        if (!userSettings.value?.id) return false

        if (currentStatus.value === status && status !== "watching") return

        try {
            const statusData = {
                user_id: userSettings.value.id,
                status: status,
                last_seen: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            }

            // Add anime data if watching
            if (status === "watching" && animeData) {
                statusData.anime_ref_id = animeData.refId
                statusData.anime_title = animeData.title
                statusData.anime_image = animeData.image
                statusData.episode_number = animeData.episode
            } else {
                // Clear anime data when not watching
                statusData.anime_ref_id = null
                statusData.anime_title = null
                statusData.anime_image = null
                statusData.episode_number = null
            }

            const { error } = await supabase.from("user_status").upsert(statusData, {
                onConflict: "user_id",
            })

            if (error) throw error

            currentStatus.value = status
            return true
        } catch (err) {
            console.error("Failed to update user status:", err)
            return false
        }
    }

    /**
     * Set status to watching with anime information
     */
    const setWatching = async (animeData) => {
        await updateStatus("watching", animeData)
        resetIdleTimer()
    }

    /**
     * Set status to online (on site but not watching)
     */
    const setOnline = async () => {
        await updateStatus("online")
        resetIdleTimer()
    }

    /**
     * Set status to idle (inactive)
     */
    const setIdle = async () => {
        await updateStatus("idle")
    }

    /**
     * Set status to offline
     */
    const setOffline = async () => {
        await updateStatus("offline")
        stopTracking()
    }

    /**
     * Reset idle timer
     */
    const resetIdleTimer = () => {
        if (idleTimer) {
            clearTimeout(idleTimer)
        }

        idleTimer = setTimeout(() => {
            if (currentStatus.value !== "offline" && currentStatus.value !== "watching") {
                setIdle()
            }
        }, IDLE_TIMEOUT)
    }

    /**
     * Start heartbeat to keep status updated
     */
    const startHeartbeat = () => {
        if (heartbeatTimer) return

        heartbeatTimer = setInterval(() => {
            if (currentStatus.value !== "offline") {
                // Update with current status to refresh last_seen
                updateStatus(currentStatus.value)
            }
        }, HEARTBEAT_INTERVAL)
    }

    /**
     * Stop heartbeat
     */
    const stopHeartbeat = () => {
        if (heartbeatTimer) {
            clearInterval(heartbeatTimer)
            heartbeatTimer = null
        }
    }

    /**
     * Handle user activity (mouse, keyboard, touch)
     */
    const handleActivity = () => {
        if (currentStatus.value === "idle") {
            // If was idle, set back to online (or watching if video is playing)
            setOnline()
        }
        resetIdleTimer()
    }

    /**
     * Start tracking user status
     */
    const startTracking = () => {
        if (isTracking.value || !userSettings.value?.id) return

        isTracking.value = true
        setOnline()
        startHeartbeat()
        resetIdleTimer()

        // Listen for user activity
        if (typeof window !== "undefined") {
            window.addEventListener("mousemove", handleActivity)
            window.addEventListener("keydown", handleActivity)
            window.addEventListener("touchstart", handleActivity)
            window.addEventListener("scroll", handleActivity)
        }
    }

    /**
     * Stop tracking user status
     */
    const stopTracking = () => {
        if (!isTracking.value) return

        isTracking.value = false
        stopHeartbeat()

        if (idleTimer) {
            clearTimeout(idleTimer)
            idleTimer = null
        }

        // Remove event listeners
        if (typeof window !== "undefined") {
            window.removeEventListener("mousemove", handleActivity)
            window.removeEventListener("keydown", handleActivity)
            window.removeEventListener("touchstart", handleActivity)
            window.removeEventListener("scroll", handleActivity)
        }
    }

    /**
     * Initialize status tracking with beforeunload handler
     */
    const initialize = () => {
        startTracking()

        // Set offline when page unloads
        if (typeof window !== "undefined") {
            window.addEventListener("beforeunload", () => {
                // Use sendBeacon for reliable offline status
                if (userSettings.value?.id) {
                    const data = JSON.stringify({
                        user_id: userSettings.value.id,
                        status: "offline",
                        last_seen: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                        anime_ref_id: null,
                        anime_title: null,
                        anime_image: null,
                        episode_number: null,
                    })

                    setOffline()
                }
            })
        }
    }

    /**
     * Cleanup
     */
    const cleanup = () => {
        setOffline()
        stopTracking()
    }

    return {
        currentStatus: readonly(currentStatus),
        isTracking: readonly(isTracking),
        setWatching,
        setOnline,
        setIdle,
        setOffline,
        startTracking,
        stopTracking,
        initialize,
        cleanup,
    }
}
