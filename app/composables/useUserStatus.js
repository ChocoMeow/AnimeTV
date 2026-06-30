/**
 * User status management composable using WebSocket
 * Tracks and updates user online/watching/idle/offline status
 * Ensures singleton WebSocket connection across all component instances
 */

// Status values that imply an active connection (restored after tab visible)
const ACTIVE_STATUSES = ['online', 'idle', 'watching']

// Events used for idle detection (passive for performance)
const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'touchstart', 'scroll']

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
    /** True when we disconnected because tab was hidden — do not auto-reconnect until tab is visible */
    disconnectedDueToHiddenTab: false,
    /** Status to restore when tab becomes visible again (set when tab hidden) */
    lastStatusBeforeHidden: null,
    lastWatchingDataBeforeHidden: null,
    /** Timer for delayed disconnect when tab hidden (cancel if user returns quickly) */
    hiddenTabDisconnectTimer: null,
    /** Proactive JWT rotation on the server connection */
    tokenRefreshTimer: null,
    /** Watchdog when heartbeat ack is missing */
    heartbeatAckTimer: null,
    /** True while swapping WebSocket without tearing down page/video */
    reconnecting: false,
}

const CONFIG = {
    HEARTBEAT_INTERVAL: 1 * 60 * 1000,  // 1 min
    HEARTBEAT_ACK_TIMEOUT: 90 * 1000,     // 90s — reconnect if no ack
    TOKEN_REFRESH_INTERVAL: 20 * 60 * 1000, // 20 min — rotate JWT before typical expiry
    IDLE_TIMEOUT: 3 * 60 * 1000,    // 3 min
    RECONNECT_DELAY: 5 * 1000,      // 5s
    HIDDEN_TAB_DISCONNECT_DELAY: 30000, // 30s delay before disconnect when tab hidden
}

const isClient = () => typeof window !== 'undefined'
const isPageVisible = () => isClient() && !document.hidden

export const useUserStatus = () => {
    const { userSettings } = useUserSettings()

    // ============================================================================
    // WebSocket Connection Management
    // ============================================================================

    /**
     * Fetch a short-lived WebSocket auth ticket from the server.
     */
    const fetchWsTicket = async () => {
        if (!isClient()) return null
        try {
            const res = await $fetch('/api/ws-ticket', { method: 'POST' })
            return res?.ticket ?? null
        } catch {
            return null
        }
    }

    /**
     * Get a WebSocket URL backed by a short-lived server-issued ticket.
     * The access token stays on the server — only an opaque ticket ID goes in the URL.
     */
    const getWsUrl = async () => {
        const ticket = await fetchWsTicket()
        if (!ticket) return null

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        const host = window.location.host
        return `${protocol}//${host}/api/user-status-ws?ticket=${encodeURIComponent(ticket)}`
    }

    const clearHeartbeatAckTimer = () => {
        clearTimeout(sharedState.heartbeatAckTimer)
        sharedState.heartbeatAckTimer = null
    }

    const expectHeartbeatAck = () => {
        clearHeartbeatAckTimer()
        sharedState.heartbeatAckTimer = setTimeout(() => {
            console.warn('[Status] Heartbeat ack timeout — reconnecting WebSocket')
            reconnectWebSocket()
        }, CONFIG.HEARTBEAT_ACK_TIMEOUT)
    }

    /**
     * Rotate the server-side Supabase JWT on the existing WebSocket (no page reload).
     */
    const refreshServerToken = async () => {
        if (sharedState.ws?.readyState !== WebSocket.OPEN) return false
        const ticket = await fetchWsTicket()
        if (!ticket) return false
        return sendMessage({ type: 'refresh_ticket', ticket })
    }

    /**
     * Swap WebSocket only — preserves local status/video playback.
     */
    const reconnectWebSocket = async () => {
        if (!sharedState.isTracking.value || sharedState.disconnectedDueToHiddenTab) return
        if (sharedState.reconnecting) return

        sharedState.reconnecting = true
        stopHeartbeat()
        stopTokenRefresh()
        clearHeartbeatAckTimer()
        clearTimeout(sharedState.reconnectTimer)
        sharedState.reconnectTimer = null

        if (sharedState.ws) {
            const oldWs = sharedState.ws
            oldWs.onclose = null
            oldWs.onerror = null
            oldWs.onmessage = null
            try {
                oldWs.close()
            } catch {}
            sharedState.ws = null
        }

        sharedState.isConnected.value = false

        try {
            await connectWebSocket()
        } finally {
            sharedState.reconnecting = false
        }
    }

    const handleAuthFailure = async () => {
        const refreshed = await refreshServerToken()
        if (!refreshed) {
            await reconnectWebSocket()
        }
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

    const buildWatchingPayload = (animeData) => {
        if (!animeData?.refId || animeData?.episode == null) return null
        return {
            refId: animeData.refId,
            title: animeData.title ?? null,
            image: animeData.image ?? null,
            episode: String(animeData.episode),
            updatedAtMs: Date.now(),
        }
    }

    /**
     * Handle incoming WebSocket messages
     */
    const handleMessage = (event) => {
        try {
            const data = JSON.parse(event.data)

            switch (data.type) {
                case 'connected':
                    console.log('[Status] Connected as online')
                    break

                case 'status_updated':
                    console.log('[Status] Status updated to:', data.status)
                    break

                case 'heartbeat_ack':
                    clearHeartbeatAckTimer()
                    break

                case 'heartbeat_failed':
                case 'status_update_failed':
                    console.warn('[Status] Server DB write failed:', data.reason)
                    clearHeartbeatAckTimer()
                    handleAuthFailure()
                    break

                case 'token_refreshed':
                    console.log('[Status] Server token refreshed')
                    break

                case 'token_refresh_failed':
                    console.warn('[Status] Token refresh failed:', data.reason)
                    reconnectWebSocket()
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
            return
        }

        if (sharedState.ws?.readyState === WebSocket.CONNECTING) {
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

                // Always publish a concrete state after connect.
                // If we still have watching payload, prefer watching to avoid reconnect downgrades to online.
                const hasWatching = !!sharedState.watchingData.value?.refId && sharedState.watchingData.value?.episode != null
                const status = hasWatching
                    ? 'watching'
                    : (ACTIVE_STATUSES.includes(sharedState.currentStatus.value) ? sharedState.currentStatus.value : 'online')

                sharedState.currentStatus.value = status
                sendMessage({
                    type: 'status_update',
                    userId: userSettings.value.id,
                    status,
                    animeData: status === 'watching' ? sharedState.watchingData.value : null,
                })

                // Start heartbeat and proactive token refresh for active tabs.
                if (isPageVisible()) {
                    startHeartbeat()
                    startTokenRefresh()
                }
            }

            sharedState.ws.onmessage = handleMessage

            sharedState.ws.onclose = () => {
                console.log('[Status] WebSocket disconnected')
                sharedState.isConnected.value = false
                stopHeartbeat()
                stopTokenRefresh()
                clearHeartbeatAckTimer()

                if (sharedState.reconnecting) return

                if (!sharedState.disconnectedDueToHiddenTab) {
                    sharedState.currentStatus.value = 'offline'
                }

                if (sharedState.isTracking.value && !sharedState.disconnectedDueToHiddenTab) {
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
        stopTokenRefresh()
        clearHeartbeatAckTimer()
        sharedState.isConnected.value = false
    }

    // ============================================================================
    // Heartbeat & token refresh
    // ============================================================================

    const startTokenRefresh = () => {
        if (sharedState.tokenRefreshTimer) return
        if (!isPageVisible()) return

        sharedState.tokenRefreshTimer = setInterval(() => {
            if (!isPageVisible() || sharedState.ws?.readyState !== WebSocket.OPEN) return
            refreshServerToken()
        }, CONFIG.TOKEN_REFRESH_INTERVAL)
    }

    const stopTokenRefresh = () => {
        clearInterval(sharedState.tokenRefreshTimer)
        sharedState.tokenRefreshTimer = null
    }

    /**
     * Start heartbeat to keep connection alive
     */
    const startHeartbeat = () => {
        if (sharedState.heartbeatTimer) return
        if (!isPageVisible()) return

        sharedState.heartbeatTimer = setInterval(() => {
            if (!isPageVisible()) {
                stopHeartbeat()
                return
            }

            const sent = sendMessage({
                type: 'heartbeat',
                userId: userSettings.value?.id,
                status: sharedState.currentStatus.value,
                animeData: sharedState.watchingData.value,
            })
            if (sent) {
                expectHeartbeatAck()
            } else if (sharedState.isTracking.value) {
                reconnectWebSocket()
            }
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

        const watchingPayload = status === 'watching' ? buildWatchingPayload(animeData) : null
        sharedState.currentStatus.value = status
        sharedState.watchingData.value = watchingPayload

        const sent = sendMessage({
            type: 'status_update',
            userId: userSettings.value.id,
            status,
            animeData: watchingPayload,
        })
        if (!sent && sharedState.isTracking.value) {
            reconnectWebSocket()
        }
        return sent
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

        if (!isPageVisible()) return

        sharedState.idleTimer = setTimeout(() => {
            // Double-check status hasn't changed and page is visible
            const isWatchingOrOffline = ['watching', 'offline'].includes(sharedState.currentStatus.value)
            if (!isWatchingOrOffline && isPageVisible()) {
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
        if (!isPageVisible()) return

        if (sharedState.currentStatus.value === 'idle') {
            setOnline()
        } else {
            resetIdleTimer()
        }
    }

    /**
     * Handle page visibility change.
     * When tab is hidden: after a short delay, disconnect WebSocket (avoids disconnect on quick tab switches).
     * When tab is visible: cancel any pending disconnect, reconnect if needed, restore status.
     */
    const handleVisibilityChange = () => {
        if (!isClient()) return

        if (document.hidden) {
            // Tab hidden — schedule disconnect after delay (cancel if user returns quickly)
            clearIdleTimer()
            stopHeartbeat()
            stopTokenRefresh()
            clearHeartbeatAckTimer()
            clearTimeout(sharedState.reconnectTimer)
            sharedState.reconnectTimer = null
            clearTimeout(sharedState.hiddenTabDisconnectTimer)
            sharedState.hiddenTabDisconnectTimer = setTimeout(() => {
                sharedState.hiddenTabDisconnectTimer = null
                sharedState.lastStatusBeforeHidden = sharedState.currentStatus.value
                sharedState.lastWatchingDataBeforeHidden = sharedState.watchingData.value
                sharedState.disconnectedDueToHiddenTab = true
                disconnectWebSocket()
                sharedState.currentStatus.value = 'offline'
            }, CONFIG.HIDDEN_TAB_DISCONNECT_DELAY)
        } else {
            // Tab visible again — cancel pending disconnect, restore if we had disconnected
            clearTimeout(sharedState.hiddenTabDisconnectTimer)
            sharedState.hiddenTabDisconnectTimer = null

            if (sharedState.disconnectedDueToHiddenTab) {
                sharedState.disconnectedDueToHiddenTab = false
                const restored = sharedState.lastStatusBeforeHidden
                const restoredWatching = sharedState.lastWatchingDataBeforeHidden
                sharedState.lastStatusBeforeHidden = null
                sharedState.lastWatchingDataBeforeHidden = null

                if (restored && restored !== 'offline') {
                    sharedState.currentStatus.value = restored
                    if (restored === 'watching' && restoredWatching) {
                        sharedState.watchingData.value = restoredWatching
                    }
                }

                if (sharedState.isTracking.value && userSettings.value?.id) {
                    connectWebSocket()
                }

                if (restored === 'online' || restored === 'idle') {
                    resetIdleTimer()
                }
            } else {
                // User returned before disconnect delay — still connected, restart heartbeat and idle
                startHeartbeat()
                startTokenRefresh()
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
        if (isClient()) {
            ACTIVITY_EVENTS.forEach(event => window.addEventListener(event, handleActivity, { passive: true }))

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
        stopTokenRefresh()
        clearIdleTimer()
        clearTimeout(sharedState.hiddenTabDisconnectTimer)
        sharedState.hiddenTabDisconnectTimer = null

        // Remove event listeners
        if (isClient()) {
            ACTIVITY_EVENTS.forEach(event => window.removeEventListener(event, handleActivity))

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
        // Singleton status tracking is managed by middleware/app lifecycle.
        // Component unmount should not tear down global user presence.
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