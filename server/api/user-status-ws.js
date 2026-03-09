/**
 * WebSocket API for real-time user status tracking (Nuxt/Nitro)
 * Supports multiple connections per user (multiple tabs/devices)
 *
 * Auth flow (token never appears in any URL):
 *   1. Client calls POST /api/ws-ticket  →  gets a short-lived opaque ticket ID
 *   2. Client opens  ws://.../api/user-status-ws?ticket=<id>
 *   3. On open, consumeWsTicket() deletes the ticket and returns { userId, accessToken }
 */

import { createClient } from '@supabase/supabase-js'

// Store connections by peer ID: peerId -> { peer, userId, status, watchingData, lastSeen, supabase }
const connections = new Map()

// Track all peers for each user: userId -> Set<peerId>
const userPeers = new Map()

// Configuration
const CONFIG = {
    CLEANUP_INTERVAL: 5 * 60 * 1000,   // 5 minutes
    CONNECTION_TIMEOUT: 2 * 60 * 1000, // 2 minutes
    VALID_STATUSES: new Set(['online', 'idle', 'watching', 'offline']),
}

/** Status priority for aggregation: first match wins */
const STATUS_PRIORITY = ['watching', 'online', 'idle']

let cleanupTimer = null

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create authenticated Supabase client
 */
function getSupabaseClient(authToken) {
    const config = useRuntimeConfig()

    if (!config.public.supabaseUrl) {
        throw new Error('SUPABASE_URL not configured')
    }
    if (!config.public.supabaseKey) {
        throw new Error('SUPABASE_KEY not configured')
    }

    return createClient(config.public.supabaseUrl, config.public.supabaseKey, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
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
 * Get number of active connections for a user
 */
function getPeerCount(userId) {
    return getUserPeerIds(userId).size
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
 * Remove peer from user's peer list.
 * Clears lastWrittenStatus when user has no peers left (avoids stale cache, saves memory).
 */
function removeUserPeer(userId, peerId) {
    const peers = userPeers.get(userId)
    if (peers) {
        peers.delete(peerId)
        if (peers.size === 0) {
            userPeers.delete(userId)
            lastWrittenStatus.delete(userId)
        }
    }
}

/**
 * Get aggregate status for a user across all connections.
 * Priority: watching > online > idle > offline.
 */
function getAggregateUserStatus(userId) {
    const peerIds = getUserPeerIds(userId)
    if (peerIds.size === 0) return 'offline'

    const seen = new Set()
    for (const peerId of peerIds) {
        const conn = connections.get(peerId)
        if (conn?.status) seen.add(conn.status)
    }
    for (const s of STATUS_PRIORITY) {
        if (seen.has(s)) return s
    }
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

// Track last written status per user so we only hit the DB when status or watching anime actually changes
const lastWrittenStatus = new Map() // userId -> { status, animeRefId, episodeNumber }

/**
 * True when aggregate status and watching anime match last DB write — skip upsert
 */
function isSameAsLastWritten(userId, aggregateStatus, watchingData) {
    const last = lastWrittenStatus.get(userId)
    if (!last || last.status !== aggregateStatus) return false
    if (aggregateStatus !== 'watching') return true
    const refId = watchingData?.refId ?? null
    const episode = watchingData?.episode ?? null
    return last.animeRefId === refId && last.episodeNumber === episode
}

/**
 * Build DB payload and last-written snapshot from aggregate state
 */
function buildStatusPayload(aggregateStatus, watchingData, nowIso) {
    const base = {
        status: aggregateStatus,
        animeRefId: null,
        animeTitle: null,
        animeImage: null,
        episodeNumber: null,
    }
    if (aggregateStatus === 'watching' && watchingData) {
        base.animeRefId = watchingData.refId ?? null
        base.animeTitle = watchingData.title ?? null
        base.animeImage = watchingData.image ?? null
        base.episodeNumber = watchingData.episode ?? null
    }
    return {
        db: {
            user_id: null, // caller sets
            status: base.status,
            last_seen: nowIso,
            updated_at: nowIso,
            anime_ref_id: base.animeRefId,
            anime_title: base.animeTitle,
            anime_image: base.animeImage,
            episode_number: base.episodeNumber,
        },
        lastWritten: { status: base.status, animeRefId: base.animeRefId, episodeNumber: base.episodeNumber },
    }
}

/**
 * Update user status in database.
 * Skips the write when status and watching anime are unchanged.
 */
async function updateUserStatus(supabase, userId) {
    try {
        const aggregateStatus = getAggregateUserStatus(userId)
        const watchingData = getWatchingData(userId)

        if (isSameAsLastWritten(userId, aggregateStatus, watchingData)) {
            return true
        }

        const nowIso = new Date().toISOString()
        const { db: statusData, lastWritten } = buildStatusPayload(aggregateStatus, watchingData, nowIso)
        statusData.user_id = userId

        const { error } = await supabase.from('user_status').upsert(statusData, { onConflict: 'user_id' })

        if (error) {
            console.error('[DB] Error updating user status:', error)
            return false
        }

        lastWrittenStatus.set(userId, lastWritten)
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
            } catch {}
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
        const ticketId = url.searchParams.get('ticket')

        // Consume the one-time ticket — this also deletes it from the store
        const ticketData = consumeWsTicket(ticketId)
        if (!ticketData) {
            console.error('[WS] Invalid or expired ticket for peer:', peerId)
            try {
                peer.websocket.close(1008, 'Unauthorized')
            } catch {}
            return
        }

        const { userId, accessToken } = ticketData

        // Create Supabase client using the access token retrieved from server-side store
        const supabase = getSupabaseClient(accessToken)

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
            activeConnections: getPeerCount(userId),
        })

        console.log(`[WS] ✓ Connection opened - Peer: ${peerId}, User: ${userId} (${getPeerCount(userId)} total)`)
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
            const raw = typeof message === 'string' ? message : typeof message?.text === 'function' ? await message.text() : String(message)

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
                    activeConnections: getPeerCount(conn.userId),
                })
                break
            }

            case 'heartbeat': {
                // Update status if provided in heartbeat
                const status = payload?.status
                const animeData = payload?.animeData || null

                if (status && CONFIG.VALID_STATUSES.has(status)) {
                    conn.status = status
                    conn.watchingData = status === 'watching' ? animeData : null
                }

                // Update DB only when aggregate status or watching anime actually changed (see updateUserStatus)
                await updateUserStatus(conn.supabase, conn.userId)

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
                if (!status || !CONFIG.VALID_STATUSES.has(status)) {
                    safeSend(peer, {
                        type: 'error',
                        message: `Invalid status. Must be one of: ${[...CONFIG.VALID_STATUSES].join(', ')}`,
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
                } catch {}

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
                    activeConnections: getPeerCount(conn.userId),
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

        console.log(`[WS] Connection closed - Peer: ${peerId}, User: ${conn.userId} (${getPeerCount(conn.userId)} remaining)`)

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
