/**
 * User status management composable
 * Tracks and updates user online/watching/idle/offline status
 * Supports multiple browser tabs/sessions
 */
export const useUserStatus = () => {
    const supabase = useSupabaseClient()
    const { userSettings } = useUserSettings()

    // State
    const currentStatus = ref("offline")
    const isTracking = ref(false)
    const sessionId = ref(null)
    const activeSessions = ref(new Set())
    const watchingData = ref(null)

    // Timers
    let idleTimer = null
    let heartbeatTimer = null
    let watchingHeartbeatTimer = null

    // Broadcast channel for cross-tab communication
    let broadcastChannel = null

    // Constants
    const IDLE_TIMEOUT = 5 * 60 * 1000 // 5 minutes
    const HEARTBEAT_INTERVAL = 60 * 1000 // 1 minute (reduced for better accuracy)
    const WATCHING_HEARTBEAT_INTERVAL = 30 * 1000 // 30 seconds when watching

    /**
     * Generate or retrieve session ID
     */
    const getSessionId = () => {
        if (typeof window === "undefined") return null
        
        if (!sessionId.value) {
            // Try to get from sessionStorage first
            let stored = sessionStorage.getItem("user_status_session_id")
            if (!stored) {
                // Generate new session ID
                stored = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
                sessionStorage.setItem("user_status_session_id", stored)
            }
            sessionId.value = stored
        }
        return sessionId.value
    }

    /**
     * Initialize broadcast channel for cross-tab communication
     */
    const initBroadcastChannel = () => {
        if (typeof BroadcastChannel === "undefined" || broadcastChannel) return

        broadcastChannel = new BroadcastChannel("user_status_channel")
        
        broadcastChannel.onmessage = (event) => {
            const { type, sessionId: otherSessionId, status, watchingData: otherWatchingData } = event.data

            if (otherSessionId === getSessionId()) return // Ignore own messages

            switch (type) {
                case "session_active":
                    activeSessions.value.add(otherSessionId)
                    break
                case "session_closed":
                    activeSessions.value.delete(otherSessionId)
                    break
                case "status_update":
                    // If another session is watching, we should know about it
                    if (status === "watching" && currentStatus.value !== "watching") {
                        // Don't override, but track it
                    }
                    break
            }
        }
    }

    /**
     * Broadcast session activity to other tabs
     */
    const broadcastSessionActivity = (type, data = {}) => {
        if (!broadcastChannel) return
        
        broadcastChannel.postMessage({
            type,
            sessionId: getSessionId(),
            ...data
        })
    }

    /**
     * Update user status in database
     */
    const updateStatus = async (status, animeData = null) => {
        if (!userSettings.value?.id) return false

        // Don't update if status is the same (except for watching which needs periodic updates)
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
                watchingData.value = animeData
            } else {
                // Only clear anime data if we're not watching in any session
                // For now, we'll clear it when this session stops watching
                if (status !== "watching") {
                    statusData.anime_ref_id = null
                    statusData.anime_title = null
                    statusData.anime_image = null
                    statusData.episode_number = null
                }
            }

            const { error } = await supabase.from("user_status").upsert(statusData, {
                onConflict: "user_id",
            })

            if (error) throw error

            currentStatus.value = status
            
            // Broadcast status update to other tabs
            broadcastSessionActivity("status_update", { status, watchingData: animeData })

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
        // Clear idle timer when watching - user is actively watching, no need for idle timer
        if (idleTimer) {
            clearTimeout(idleTimer)
            idleTimer = null
        }

        await updateStatus("watching", animeData)
        
        // Start watching heartbeat to keep status fresh
        startWatchingHeartbeat(animeData)
    }

    /**
     * Start heartbeat specifically for watching status
     */
    const startWatchingHeartbeat = (animeData) => {
        // Clear existing watching heartbeat
        if (watchingHeartbeatTimer) {
            clearInterval(watchingHeartbeatTimer)
            watchingHeartbeatTimer = null
        }

        // Update watching status periodically to prevent idle
        watchingHeartbeatTimer = setInterval(() => {
            if (currentStatus.value === "watching" && animeData) {
                updateStatus("watching", animeData)
            } else {
                // Stop if no longer watching
                if (watchingHeartbeatTimer) {
                    clearInterval(watchingHeartbeatTimer)
                    watchingHeartbeatTimer = null
                }
            }
        }, WATCHING_HEARTBEAT_INTERVAL)
    }

    /**
     * Stop watching heartbeat
     */
    const stopWatchingHeartbeat = () => {
        if (watchingHeartbeatTimer) {
            clearInterval(watchingHeartbeatTimer)
            watchingHeartbeatTimer = null
        }
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
     * Set status to offline (only for this session)
     */
    const setOffline = async () => {
        stopWatchingHeartbeat()
        stopTracking()
        
        // Broadcast that this session is closing
        broadcastSessionActivity("session_closed")
        
        // Only set offline in DB if this is the last active session
        // For now, we'll set offline and let other sessions set themselves back to online
        // A better approach would be to check active sessions, but for simplicity:
        await updateStatus("offline")
    }

    /**
     * Reset idle timer
     */
    const resetIdleTimer = () => {
        // Clear existing timer
        if (idleTimer) {
            clearTimeout(idleTimer)
            idleTimer = null
        }

        // Don't set idle timer if status is "watching" or "offline"
        // Also check if page is hidden (tab in background)
        if (currentStatus.value === "watching" || 
            currentStatus.value === "offline" ||
            (typeof document !== "undefined" && document.hidden)) {
            return
        }

        idleTimer = setTimeout(() => {
            // Double check status hasn't changed to watching and page is still visible
            if (currentStatus.value !== "offline" && 
                currentStatus.value !== "watching" &&
                typeof document !== "undefined" && 
                !document.hidden) {
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
            // Don't send heartbeat if page is hidden (tab in background)
            if (typeof document !== "undefined" && document.hidden) {
                return
            }

            // For watching status, the watching heartbeat handles updates
            // For other statuses, update to refresh last_seen
            if (currentStatus.value !== "offline" && currentStatus.value !== "watching") {
                updateStatus(currentStatus.value)
            }
            
            // Broadcast session is still active
            broadcastSessionActivity("session_active")
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
        // Don't reset idle timer if watching - watching has its own heartbeat
        if (currentStatus.value === "watching") {
            return
        }
        
        // Don't handle activity if page is hidden
        if (typeof document !== "undefined" && document.hidden) {
            return
        }
        
        if (currentStatus.value === "idle") {
            setOnline()
        } else {
            resetIdleTimer()
        }
    }

    /**
     * Handle page visibility change
     */
    const handleVisibilityChange = () => {
        if (typeof document === "undefined") return

        if (document.hidden) {
            // Page is hidden - clear idle timer but don't set offline yet
            if (idleTimer) {
                clearTimeout(idleTimer)
                idleTimer = null
            }
        } else {
            // Page is visible again - resume tracking
            if (currentStatus.value === "watching") {
                // If watching, refresh the status
                if (watchingData.value) {
                    updateStatus("watching", watchingData.value)
                }
            } else if (currentStatus.value !== "offline") {
                setOnline()
            }
        }
    }

    /**
     * Start tracking user status
     */
    const startTracking = () => {
        if (isTracking.value || !userSettings.value?.id) return

        isTracking.value = true
        
        // Initialize session tracking
        getSessionId()
        initBroadcastChannel()
        broadcastSessionActivity("session_active")

        setOnline()
        startHeartbeat()
        resetIdleTimer()

        // Listen for user activity
        if (typeof window !== "undefined") {
            window.addEventListener("mousemove", handleActivity)
            window.addEventListener("keydown", handleActivity)
            window.addEventListener("touchstart", handleActivity)
            window.addEventListener("scroll", handleActivity)
            
            // Listen for page visibility changes
            document.addEventListener("visibilitychange", handleVisibilityChange)
            
            // Listen for page unload
            window.addEventListener("beforeunload", handleBeforeUnload)
            window.addEventListener("pagehide", handlePageHide)
        }
    }

    /**
     * Handle before unload event
     */
    const handleBeforeUnload = () => {
        // Use sendBeacon for reliable cleanup
        if (typeof navigator !== "undefined" && navigator.sendBeacon) {
            navigator.sendBeacon("/api/set-offline")
        }
        
        // Also try to set offline directly (may not complete)
        if (userSettings.value?.id) {
            setOffline()
        }
    }

    /**
     * Handle page hide event (more reliable than beforeunload)
     */
    const handlePageHide = () => {
        // Use sendBeacon for reliable cleanup
        if (typeof navigator !== "undefined" && navigator.sendBeacon) {
            navigator.sendBeacon("/api/set-offline")
        }
    }

    /**
     * Stop tracking user status
     */
    const stopTracking = () => {
        if (!isTracking.value) return

        isTracking.value = false
        stopHeartbeat()
        stopWatchingHeartbeat()

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
            document.removeEventListener("visibilitychange", handleVisibilityChange)
            window.removeEventListener("beforeunload", handleBeforeUnload)
            window.removeEventListener("pagehide", handlePageHide)
        }

        // Close broadcast channel
        if (broadcastChannel) {
            broadcastChannel.close()
            broadcastChannel = null
        }
    }

    /**
     * Initialize status tracking
     */
    const initialize = () => {
        // Only initialize if user is logged in
        if (!userSettings.value?.id) return

        startTracking()
    }

    /**
     * Cleanup
     */
    const cleanup = () => {
        stopWatchingHeartbeat()
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
