/**
 * WebSocket API for real-time user status tracking (Nuxt/Nitro)
 * Supports multiple connections per user (multiple tabs/devices)
 */

import { createClient } from '@supabase/supabase-js'

// Store connections by peer ID: peerId -> { peer, userId, status, watchingData, lastSeen, supabase }
const connections = new Map()

// Track all peers for each user: userId -> Set<peerId>
const userPeers = new Map()

// Configuration
const CONFIG = {
    CLEANUP_INTERVAL: 5 * 60 * 1000,      // 5 minutes
    CONNECTION_TIMEOUT: 2 * 60 * 1000,    // 2 minutes
    VALID_STATUSES: ['online', 'idle', 'watching', 'offline'],
}

let cleanupTimer = null

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Extract user ID from JWT token
 */
function getUserIdFromToken(token) {
    if (!token) return null

    try {
        const parts = token.split('.')
        if (parts.length !== 3) return null

        const payload = parts[1]
        const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
        const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
        const decoded = Buffer.from(padded, 'base64').toString('utf-8')
        const parsed = JSON.parse(decoded)

        return parsed.sub || null
    } catch (err) {
        console.error('[WS] Failed to decode token:', err)
        return null
    }
}

/**
 * Create authenticated Supabase client
 */
function getSupabaseClient(authToken) {
    const config = useRuntimeConfig()

    if (!config.private.supabaseUrl) {
        throw new Error('SUPABASE_URL not configured')
    }
    if (!config.private.supabaseKey) {
        throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured')
    }

    return createClient(config.private.supabaseUrl, config.private.supabaseKey, {
        auth: {
            persistSession: false,
            autoRefreshToken: false
        },
        global: {
            headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
        },
    })
}

/**
 * Safely send JSON message to peer
 */
function safeSend(peer, payload) {
    try {
        peer.send(JSON.stringify(payload))
    } catch (err) {
        // Connection might be closed, ignore
    }
}

/**
 * Get connection by peer ID
 */
function getConnection(peerId) {
    return connections.get(peerId) || null
}

/**
 * Get all peer IDs for a user
 */
function getUserPeerIds(userId) {
    return userPeers.get(userId) || new Set()
}

/**
 * Add peer to user's peer list
 */
function addUserPeer(userId, peerId) {
    if (!userPeers.has(userId)) {
        userPeers.set(userId, new Set())
    }
    userPeers.get(userId).add(peerId)
}

/**
 * Remove peer from user's peer list
 */
function removeUserPeer(userId, peerId) {
    const peers = userPeers.get(userId)
    if (peers) {
        peers.delete(peerId)
        if (peers.size === 0) {
            userPeers.delete(userId)
        }
    }
}

/**
 * Get aggregate status for a user across all connections
 * Priority: watching > online > idle > offline
 */
function getAggregateUserStatus(userId) {
    const peerIds = getUserPeerIds(userId)
    if (peerIds.size === 0) return 'offline'

    let hasWatching = false
    let hasOnline = false
    let hasIdle = false

    for (const peerId of peerIds) {
        const conn = connections.get(peerId)
        if (!conn) continue

        if (conn.status === 'watching') hasWatching = true
        else if (conn.status === 'online') hasOnline = true
        else if (conn.status === 'idle') hasIdle = true
    }

    // Priority order
    if (hasWatching) return 'watching'
    if (hasOnline) return 'online'
    if (hasIdle) return 'idle'
    return 'offline'
}

/**
 * Get watching data from any connection that's currently watching
 */
function getWatchingData(userId) {
    const peerIds = getUserPeerIds(userId)

    for (const peerId of peerIds) {
        const conn = connections.get(peerId)
        if (conn?.status === 'watching' && conn.watchingData) {
            return conn.watchingData
        }
    }

    return null
}

// ============================================================================
// Database Operations
// ============================================================================

/**
 * Update user status in database
 * Uses aggregate status from all user's connections
 */
async function updateUserStatus(supabase, userId) {
    try {
        const aggregateStatus = getAggregateUserStatus(userId)
        const watchingData = getWatchingData(userId)
        const nowIso = new Date().toISOString()

        const statusData = {
            user_id: userId,
            status: aggregateStatus,
            last_seen: nowIso,
            updated_at: nowIso,
        }

        // Add anime data if watching
        if (aggregateStatus === 'watching' && watchingData) {
            statusData.anime_ref_id = watchingData.refId || null
            statusData.anime_title = watchingData.title || null
            statusData.anime_image = watchingData.image || null
            statusData.episode_number = watchingData.episode || null
        } else {
            statusData.anime_ref_id = null
            statusData.anime_title = null
            statusData.anime_image = null
            statusData.episode_number = null
        }

        const { error } = await supabase
            .from('user_status')
            .upsert(statusData, { onConflict: 'user_id' })

        if (error) {
            console.error('[DB] Error updating user status:', error)
            return false
        }

        console.log(`[DB] Updated user ${userId} status to: ${aggregateStatus}`)
        return true
    } catch (err) {
        console.error('[DB] Failed to update user status:', err)
        return false
    }
}

// ============================================================================
// Cleanup Management
// ============================================================================

/**
 * Start periodic cleanup of stale connections
 */
function startCleanupTimer() {
    if (cleanupTimer) return

    console.log('[WS] Starting cleanup timer')
    cleanupTimer = setInterval(async () => {
        const now = Date.now()
        const staleConnections = []

        // Find stale connections
        for (const [peerId, conn] of connections.entries()) {
            if (now - conn.lastSeen > CONFIG.CONNECTION_TIMEOUT) {
                staleConnections.push({ peerId, conn })
            }
        }

        // Clean up stale connections
        for (const { peerId, conn } of staleConnections) {
            console.log(`[WS] Timeout for peer ${peerId} (user ${conn.userId})`)

            // Remove connection
            connections.delete(peerId)
            removeUserPeer(conn.userId, peerId)

            // Update aggregate status for user
            await updateUserStatus(conn.supabase, conn.userId)

            // Close WebSocket if still open
            try {
                conn.peer.websocket.close(1000, 'Connection timeout')
            } catch { }
        }

        if (staleConnections.length > 0) {
            console.log(`[WS] Cleaned up ${staleConnections.length} stale connections`)
        }
    }, CONFIG.CLEANUP_INTERVAL)
}

/**
 * Stop cleanup timer
 */
function stopCleanupTimer() {
    if (cleanupTimer) {
        clearInterval(cleanupTimer)
        cleanupTimer = null
        console.log('[WS] Stopped cleanup timer')
    }
}

// ============================================================================
// WebSocket Handlers
// ============================================================================

export default defineWebSocketHandler({
    /**
     * Handle new WebSocket connection
     */
    async open(peer) {
        const peerId = peer.id
        const url = new URL(peer.websocket.url)
        const authToken = url.searchParams.get('token')

        // Validate token and extract user ID
        const userId = getUserIdFromToken(authToken)
        if (!userId) {
            console.error('[WS] Missing/invalid token for peer:', peerId)
            try {
                peer.websocket.close(1008, 'Unauthorized')
            } catch { }
            return
        }

        // Create Supabase client
        const supabase = getSupabaseClient(authToken)

        // Store connection
        connections.set(peerId, {
            peer,
            userId,
            status: 'online',
            watchingData: null,
            lastSeen: Date.now(),
            supabase,
        })

        // Track peer for user
        addUserPeer(userId, peerId)

        // Start cleanup timer if not already running
        startCleanupTimer()

        // Update database with aggregate status
        await updateUserStatus(supabase, userId)

        // Send connection confirmation
        safeSend(peer, {
            type: 'connected',
            peerId,
            userId,
            status: 'online',
            activeConnections: getUserPeerIds(userId).size,
        })

        console.log(`[WS] ✓ Connection opened - Peer: ${peerId}, User: ${userId} (${getUserPeerIds(userId).size} total)`)
    },

    /**
     * Handle incoming messages
     */
    async message(peer, message) {
        const peerId = peer.id
        const conn = getConnection(peerId)

        if (!conn) {
            safeSend(peer, { type: 'error', message: 'Unknown connection' })
            return
        }

        // Parse message
        let payload
        try {
            const raw = typeof message === 'string'
                ? message
                : typeof message?.text === 'function'
                    ? await message.text()
                    : String(message)

            payload = JSON.parse(raw)
        } catch {
            safeSend(peer, { type: 'error', message: 'Invalid JSON' })
            return
        }

        // Update last seen
        conn.lastSeen = Date.now()

        // Handle message types
        switch (payload?.type) {
            case 'connect': {
                // Optional client handshake
                safeSend(peer, {
                    type: 'connected',
                    peerId,
                    userId: conn.userId,
                    status: conn.status,
                    activeConnections: getUserPeerIds(conn.userId).size,
                })
                break
            }

            case 'heartbeat': {
                // Update status if provided in heartbeat
                const status = payload?.status
                const animeData = payload?.animeData || null

                if (status && CONFIG.VALID_STATUSES.includes(status)) {
                    const statusChanged = status !== conn.status

                    conn.status = status
                    conn.watchingData = status === 'watching' ? animeData : null

                    // Update DB if status changed
                    if (statusChanged) {
                        await updateUserStatus(conn.supabase, conn.userId)
                    }
                }

                safeSend(peer, {
                    type: 'heartbeat_ack',
                    peerId,
                    timestamp: Date.now(),
                })
                break
            }

            case 'status_update': {
                const status = payload?.status
                const animeData = payload?.animeData || null

                // Validate status
                if (!status || !CONFIG.VALID_STATUSES.includes(status)) {
                    safeSend(peer, {
                        type: 'error',
                        message: `Invalid status. Must be one of: ${CONFIG.VALID_STATUSES.join(', ')}`,
                    })
                    return
                }

                // Update connection status
                conn.status = status
                conn.watchingData = status === 'watching' ? animeData : null

                // Update database with aggregate status
                await updateUserStatus(conn.supabase, conn.userId)

                safeSend(peer, {
                    type: 'status_updated',
                    peerId,
                    userId: conn.userId,
                    status,
                    aggregateStatus: getAggregateUserStatus(conn.userId),
                })
                break
            }

            case 'disconnect': {
                // Client-initiated disconnect
                connections.delete(peerId)
                removeUserPeer(conn.userId, peerId)

                // Update aggregate status
                await updateUserStatus(conn.supabase, conn.userId)

                safeSend(peer, { type: 'disconnected', peerId })

                try {
                    peer.websocket.close(1000, 'Client disconnect')
                } catch { }

                console.log(`[WS] Client disconnect - Peer: ${peerId}, User: ${conn.userId}`)
                break
            }

            case 'get_status': {
                // Get current aggregate status for user
                safeSend(peer, {
                    type: 'status_info',
                    userId: conn.userId,
                    peerStatus: conn.status,
                    aggregateStatus: getAggregateUserStatus(conn.userId),
                    activeConnections: getUserPeerIds(conn.userId).size,
                    watchingData: getWatchingData(conn.userId),
                })
                break
            }

            default: {
                safeSend(peer, {
                    type: 'error',
                    message: `Unknown message type: ${payload?.type}`,
                })
            }
        }
    },

    /**
     * Handle connection close
     */
    async close(peer) {
        const peerId = peer.id
        const conn = getConnection(peerId)

        if (!conn) return

        // Remove connection
        connections.delete(peerId)
        removeUserPeer(conn.userId, peerId)

        // Update aggregate status
        await updateUserStatus(conn.supabase, conn.userId)

        console.log(`[WS] Connection closed - Peer: ${peerId}, User: ${conn.userId} (${getUserPeerIds(conn.userId).size} remaining)`)

        // Stop cleanup timer if no connections left
        if (connections.size === 0) {
            stopCleanupTimer()
        }
    },

    /**
     * Handle WebSocket errors
     */
    async error(peer, err) {
        console.error('[WS] WebSocket error:', err)

        const peerId = peer.id
        const conn = getConnection(peerId)

        if (!conn) return

        // Clean up connection
        connections.delete(peerId)
        removeUserPeer(conn.userId, peerId)

        // Update aggregate status
        await updateUserStatus(conn.supabase, conn.userId)
    },
})