/**
 * User status management composable using WebSocket
 * Tracks and updates user online/watching/idle/offline status
 * Ensures singleton WebSocket connection across all component instances
 */

// Singleton state - shared across all composable instances
const sharedState = {
    ws: null,
    reconnectTimer: null,
    heartbeatTimer: null,
    idleTimer: null,
    currentStatus: ref('offline'),
    isTracking: ref(false),
    isConnected: ref(false),
    watchingData: ref(null),
    instanceCount: 0,
}

// Constants
const CONFIG = {
    HEARTBEAT_INTERVAL: 30 * 1000,  // 30 seconds
    IDLE_TIMEOUT: 5 * 60 * 1000,    // 5 minutes
    RECONNECT_DELAY: 5 * 1000,      // 5 seconds
}

export const useUserStatus = () => {
    const { userSettings } = useUserSettings()
    const supabase = useSupabaseClient()

    // Increment instance count
    sharedState.instanceCount++

    // ============================================================================
    // WebSocket Connection Management
    // ============================================================================

    /**
     * Get WebSocket URL with authentication token
     */
    const getWsUrl = async () => {
        if (typeof window === 'undefined') return null

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        const host = window.location.host
        const { data } = await supabase.auth.getSession()

        if (!data?.session?.access_token) return null

        return `${protocol}//${host}/api/user-status-ws?token=${encodeURIComponent(data.session.access_token)}`
    }

    /**
     * Send message through WebSocket if connection is open
     */
    const sendMessage = (data) => {
        if (sharedState.ws?.readyState === WebSocket.OPEN) {
            sharedState.ws.send(JSON.stringify(data))
            return true
        }
        return false
    }

    /**
     * Handle incoming WebSocket messages
     */
    const handleMessage = (event) => {
        try {
            const data = JSON.parse(event.data)

            switch (data.type) {
                case 'connected':
                    sharedState.currentStatus.value = 'online'
                    console.log('[Status] Connected as online')
                    break

                case 'status_updated':
                    console.log('[Status] Status updated to:', data.status)
                    break

                case 'heartbeat_ack':
                    // Heartbeat acknowledged - connection is healthy
                    break

                case 'error':
                    console.error('[Status] Server error:', data.message)
                    break

                default:
                    console.warn('[Status] Unknown message type:', data.type)
            }
        } catch (err) {
            console.error('[Status] Failed to parse message:', err)
        }
    }

    /**
     * Connect to WebSocket server (singleton connection)
     */
    const connectWebSocket = async () => {
        // Prevent multiple connections
        if (!userSettings.value?.id) {
            console.warn('[Status] Cannot connect: No user ID')
            return
        }

        if (sharedState.ws?.readyState === WebSocket.OPEN) {
            console.log('[Status] Already connected')
            return
        }

        const wsUrl = await getWsUrl()
        if (!wsUrl) {
            console.warn('[Status] Cannot connect: No WebSocket URL')
            return
        }

        try {
            console.log('[Status] Connecting to WebSocket...')
            sharedState.ws = new WebSocket(wsUrl)

            sharedState.ws.onopen = () => {
                console.log('[Status] ✓ WebSocket connected')
                sharedState.isConnected.value = true

                // Clear any reconnect timer
                clearTimeout(sharedState.reconnectTimer)
                sharedState.reconnectTimer = null

                // Send initial connect message
                sendMessage({
                    type: 'connect',
                    userId: userSettings.value.id,
                })

                // Start heartbeat
                startHeartbeat()
            }

            sharedState.ws.onmessage = handleMessage

            sharedState.ws.onclose = () => {
                console.log('[Status] WebSocket disconnected')
                sharedState.isConnected.value = false
                sharedState.currentStatus.value = 'offline'
                stopHeartbeat()

                // Attempt to reconnect if still tracking
                if (sharedState.isTracking.value) {
                    sharedState.reconnectTimer = setTimeout(() => {
                        console.log('[Status] Reconnecting...')
                        connectWebSocket()
                    }, CONFIG.RECONNECT_DELAY)
                }
            }

            sharedState.ws.onerror = (error) => {
                console.error('[Status] WebSocket error:', error)
                sharedState.isConnected.value = false
            }
        } catch (err) {
            console.error('[Status] Failed to create WebSocket:', err)
        }
    }

    /**
     * Disconnect WebSocket and clean up
     */
    const disconnectWebSocket = () => {
        if (sharedState.ws) {
            // Send disconnect message before closing
            sendMessage({
                type: 'disconnect',
                userId: userSettings.value?.id,
            })

            sharedState.ws.close()
            sharedState.ws = null
        }

        clearTimeout(sharedState.reconnectTimer)
        sharedState.reconnectTimer = null
        sharedState.isConnected.value = false
    }

    // ============================================================================
    // Heartbeat Management
    // ============================================================================

    /**
     * Start heartbeat to keep connection alive
     */
    const startHeartbeat = () => {
        if (sharedState.heartbeatTimer) return

        sharedState.heartbeatTimer = setInterval(() => {
            // Skip heartbeat if page is hidden
            if (typeof document !== 'undefined' && document.hidden) return

            sendMessage({
                type: 'heartbeat',
                userId: userSettings.value?.id,
                status: sharedState.currentStatus.value,
                animeData: sharedState.watchingData.value,
            })
        }, CONFIG.HEARTBEAT_INTERVAL)
    }

    /**
     * Stop heartbeat
     */
    const stopHeartbeat = () => {
        clearInterval(sharedState.heartbeatTimer)
        sharedState.heartbeatTimer = null
    }

    // ============================================================================
    // Status Management
    // ============================================================================

    /**
     * Update status via WebSocket
     */
    const updateStatus = (status, animeData = null) => {
        if (!userSettings.value?.id) return false

        sharedState.currentStatus.value = status
        sharedState.watchingData.value = status === 'watching' ? animeData : null

        return sendMessage({
            type: 'status_update',
            userId: userSettings.value.id,
            status,
            animeData,
        })
    }

    /**
     * Set status to watching with anime information
     */
    const setWatching = (animeData) => {
        clearIdleTimer()
        updateStatus('watching', animeData)
    }

    /**
     * Set status to online (on site but not watching)
     */
    const setOnline = () => {
        updateStatus('online')
        resetIdleTimer()
    }

    /**
     * Set status to idle (inactive)
     */
    const setIdle = () => {
        updateStatus('idle')
    }

    /**
     * Set status to offline
     */
    const setOffline = () => {
        updateStatus('offline')
        disconnectWebSocket()
        stopTracking()
    }

    // ============================================================================
    // Idle Detection
    // ============================================================================

    /**
     * Clear idle timer
     */
    const clearIdleTimer = () => {
        clearTimeout(sharedState.idleTimer)
        sharedState.idleTimer = null
    }

    /**
     * Reset idle timer
     */
    const resetIdleTimer = () => {
        clearIdleTimer()

        // Don't set idle timer if watching or offline
        if (sharedState.currentStatus.value === 'watching' ||
            sharedState.currentStatus.value === 'offline') {
            return
        }

        // Don't set idle timer if page is hidden
        if (typeof document !== 'undefined' && document.hidden) {
            return
        }

        sharedState.idleTimer = setTimeout(() => {
            // Double-check status hasn't changed and page is visible
            const isWatchingOrOffline = ['watching', 'offline'].includes(sharedState.currentStatus.value)
            const isPageVisible = typeof document === 'undefined' || !document.hidden

            if (!isWatchingOrOffline && isPageVisible) {
                setIdle()
            }
        }, CONFIG.IDLE_TIMEOUT)
    }

    // ============================================================================
    // Event Handlers
    // ============================================================================

    /**
     * Handle user activity (mouse, keyboard, touch, scroll)
     */
    const handleActivity = () => {
        // Don't change status if watching or page is hidden
        if (sharedState.currentStatus.value === 'watching') return
        if (typeof document !== 'undefined' && document.hidden) return

        if (sharedState.currentStatus.value === 'idle') {
            setOnline()
        } else {
            resetIdleTimer()
        }
    }

    /**
     * Handle page visibility change
     */
    const handleVisibilityChange = () => {
        if (typeof document === 'undefined') return

        if (document.hidden) {
            // Page hidden - clear idle timer
            clearIdleTimer()
        } else {
            // Page visible - restore appropriate status
            const status = sharedState.currentStatus.value

            if (status === 'watching' && sharedState.watchingData.value) {
                // Refresh watching status
                updateStatus('watching', sharedState.watchingData.value)
            } else if (status === 'idle') {
                // Return from idle to online
                setOnline()
            } else if (status === 'online') {
                // Restart idle timer
                resetIdleTimer()
            }
        }
    }

    /**
     * Handle before unload (page close/refresh)
     */
    const handleBeforeUnload = () => {
        disconnectWebSocket()
    }

    // ============================================================================
    // Tracking Management
    // ============================================================================

    /**
     * Start tracking user status
     */
    const startTracking = () => {
        if (sharedState.isTracking.value || !userSettings.value?.id) return

        console.log('[Status] Starting status tracking')
        sharedState.isTracking.value = true

        // Connect to WebSocket
        connectWebSocket()

        // Start idle detection
        resetIdleTimer()

        // Register event listeners (only once)
        if (typeof window !== 'undefined') {
            const events = ['mousemove', 'keydown', 'touchstart', 'scroll']
            events.forEach(event => window.addEventListener(event, handleActivity, { passive: true }))

            document.addEventListener('visibilitychange', handleVisibilityChange)
            window.addEventListener('beforeunload', handleBeforeUnload)
            window.addEventListener('pagehide', handleBeforeUnload)
        }
    }

    /**
     * Stop tracking user status
     */
    const stopTracking = () => {
        if (!sharedState.isTracking.value) return

        console.log('[Status] Stopping status tracking')
        sharedState.isTracking.value = false

        stopHeartbeat()
        clearIdleTimer()

        // Remove event listeners
        if (typeof window !== 'undefined') {
            const events = ['mousemove', 'keydown', 'touchstart', 'scroll']
            events.forEach(event => window.removeEventListener(event, handleActivity))

            document.removeEventListener('visibilitychange', handleVisibilityChange)
            window.removeEventListener('beforeunload', handleBeforeUnload)
            window.removeEventListener('pagehide', handleBeforeUnload)
        }
    }

    // ============================================================================
    // Lifecycle
    // ============================================================================

    /**
     * Initialize status tracking
     */
    const initialize = () => {
        if (!userSettings.value?.id) {
            console.warn('[Status] Cannot initialize: No user ID')
            return
        }

        startTracking()
    }

    /**
     * Cleanup when composable is destroyed
     */
    const cleanup = () => {
        sharedState.instanceCount--

        // Only fully cleanup if this is the last instance
        if (sharedState.instanceCount <= 0) {
            console.log('[Status] Last instance - full cleanup')
            setOffline()
            stopTracking()
            sharedState.instanceCount = 0
        } else {
            console.log(`[Status] Instance cleanup (${sharedState.instanceCount} remaining)`)
        }
    }

    // Auto-cleanup on unmount (only if called from component context)
    // Check if we're in a component setup context before registering lifecycle hook
    if (import.meta.client) {
        // getCurrentInstance() returns the current component instance if in setup context, null otherwise
        const instance = getCurrentInstance()
        if (instance) {
            onUnmounted(() => {
                cleanup()
            })
        }
        // If no instance (e.g., called from middleware), skip lifecycle hook
        // Cleanup will be handled manually if needed
    }

    // ============================================================================
    // Public API
    // ============================================================================

    return {
        // Read-only state
        currentStatus: readonly(sharedState.currentStatus),
        isTracking: readonly(sharedState.isTracking),
        isConnected: readonly(sharedState.isConnected),
        watchingData: readonly(sharedState.watchingData),

        // Status setters
        setWatching,
        setOnline,
        setIdle,
        setOffline,

        // Tracking control
        startTracking,
        stopTracking,
        initialize,
        cleanup,
    }
}