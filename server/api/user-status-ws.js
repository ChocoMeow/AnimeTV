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

// peerId -> { peer, userId, status, watchingData, lastSeen, supabase }
const connections = new Map()
// userId -> Set<peerId>
const userPeers = new Map()
// userId -> { status, animeRefId, episodeNumber }  (skip DB write if unchanged)
const lastWrittenStatus = new Map()

const VALID_STATUSES = new Set(['online', 'idle', 'watching', 'offline'])
const STATUS_PRIORITY = ['watching', 'online', 'idle']
const CLEANUP_INTERVAL = 60 * 1000 // 1 min
const CONNECTION_TIMEOUT = 2 * 60 * 1000 // 2 min

let cleanupTimer = null

// ── Supabase ──────────────────────────────────────────────────────────────────

function getSupabaseClient(authToken) {
    const {
        public: { supabaseUrl, supabaseKey },
    } = useRuntimeConfig()
    if (!supabaseUrl) throw new Error('SUPABASE_URL not configured')
    if (!supabaseKey) throw new Error('SUPABASE_KEY not configured')

    return createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: authToken ? { Authorization: `Bearer ${authToken}` } : {} },
    })
}

// ── Connection helpers ────────────────────────────────────────────────────────

function addPeer(userId, peerId) {
    if (!userPeers.has(userId)) userPeers.set(userId, new Set())
    userPeers.get(userId).add(peerId)
}

function removePeer(userId, peerId) {
    const peers = userPeers.get(userId)
    if (!peers) return
    peers.delete(peerId)
    if (peers.size === 0) {
        userPeers.delete(userId)
        lastWrittenStatus.delete(userId)
    }
}

function peerCount(userId) {
    return userPeers.get(userId)?.size ?? 0
}

function isConnectionActive(conn, now = Date.now()) {
    return !!conn && now - conn.lastSeen < CONNECTION_TIMEOUT
}

function aggregateStatus(userId) {
    const peers = userPeers.get(userId)
    if (!peers?.size) return 'offline'

    const now = Date.now()
    const statuses = new Set(
        [...peers]
            .map((id) => connections.get(id))
            .filter((conn) => isConnectionActive(conn, now))
            .map((conn) => conn.status)
            .filter(Boolean)
    )
    return STATUS_PRIORITY.find((s) => statuses.has(s)) ?? 'offline'
}

function activeWatchingData(userId) {
    const peers = userPeers.get(userId)
    if (!peers) return null
    const now = Date.now()
    for (const id of peers) {
        const conn = connections.get(id)
        if (isConnectionActive(conn, now) && conn.status === 'watching' && conn.watchingData) return conn.watchingData
    }
    return null
}

function safeSend(peer, payload) {
    try {
        peer.send(JSON.stringify(payload))
    } catch {}
}

// ── Database ──────────────────────────────────────────────────────────────────

async function flushStatus(supabase, userId, { force = false } = {}) {
    try {
        const status = aggregateStatus(userId)
        const watching = status === 'watching' ? activeWatchingData(userId) : null

        // Skip write if nothing changed (unless forced, e.g. on disconnect)
        if (!force) {
            const last = lastWrittenStatus.get(userId)
            if (last?.status === status && last?.animeRefId === (watching?.refId ?? null) && last?.episodeNumber === (watching?.episode ?? null)) return
        }

        const now = new Date().toISOString()
        const row = {
            user_id: userId,
            status,
            last_seen: now,
            updated_at: now,
            anime_ref_id: watching?.refId ?? null,
            anime_title: watching?.title ?? null,
            anime_image: watching?.image ?? null,
            episode_number: watching?.episode ?? null,
        }

        const { error } = await supabase.from('user_status').upsert(row, { onConflict: 'user_id' })
        if (error) {
            console.error('[DB] upsert error:', error)
            return
        }

        lastWrittenStatus.set(userId, {
            status,
            animeRefId: row.anime_ref_id,
            episodeNumber: row.episode_number,
        })
        console.log(`[DB] ${userId} → ${status}`)
    } catch (err) {
        console.error('[DB] flushStatus error:', err)
    }
}

// ── Cleanup ───────────────────────────────────────────────────────────────────

function startCleanup() {
    if (cleanupTimer) return
    cleanupTimer = setInterval(async () => {
        const now = Date.now()
        for (const [peerId, conn] of connections) {
            if (isConnectionActive(conn, now)) continue
            console.log(`[WS] Timeout peer ${peerId} (user ${conn.userId})`)
            connections.delete(peerId)
            removePeer(conn.userId, peerId)
            // Force-write so offline/stale watching is cleared immediately
            await flushStatus(conn.supabase, conn.userId, { force: true })
            try {
                conn.peer.websocket.close(1000, 'Connection timeout')
            } catch {}
        }
    }, CLEANUP_INTERVAL)
}

function stopCleanup() {
    if (!cleanupTimer) return
    clearInterval(cleanupTimer)
    cleanupTimer = null
}

// ── Disconnect helper (shared by close / error / explicit disconnect) ─────────

async function handleDisconnect(peerId) {
    const conn = connections.get(peerId)
    if (!conn) return
    connections.delete(peerId)
    removePeer(conn.userId, peerId)
    // Force-write: clears stale watching/online even if cache says nothing changed
    await flushStatus(conn.supabase, conn.userId, { force: true })
    if (connections.size === 0) stopCleanup()
}

// ── WebSocket handler ─────────────────────────────────────────────────────────

export default defineWebSocketHandler({
    async open(peer) {
        const ticketData = consumeWsTicket(new URL(peer.websocket.url).searchParams.get('ticket'))
        if (!ticketData) {
            try {
                peer.websocket.close(1008, 'Unauthorized')
            } catch {}
            return
        }

        const { userId, accessToken } = ticketData
        const supabase = getSupabaseClient(accessToken)

        connections.set(peer.id, { peer, userId, status: 'online', watchingData: null, lastSeen: Date.now(), supabase })
        addPeer(userId, peer.id)
        startCleanup()

        await flushStatus(supabase, userId)
        safeSend(peer, { type: 'connected', peerId: peer.id, userId, status: 'online', activeConnections: peerCount(userId) })
        console.log(`[WS] open  peer=${peer.id} user=${userId} (${peerCount(userId)} total)`)
    },

    async message(peer, message) {
        const conn = connections.get(peer.id)
        if (!conn) {
            safeSend(peer, { type: 'error', message: 'Unknown connection' })
            return
        }

        let payload
        try {
            const raw = typeof message === 'string' ? message : typeof message?.text === 'function' ? await message.text() : String(message)
            payload = JSON.parse(raw)
        } catch {
            safeSend(peer, { type: 'error', message: 'Invalid JSON' })
            return
        }

        conn.lastSeen = Date.now()

        switch (payload?.type) {
            case 'connect':
                safeSend(peer, { type: 'connected', peerId: peer.id, userId: conn.userId, status: conn.status, activeConnections: peerCount(conn.userId) })
                break

            case 'heartbeat':
            case 'status_update': {
                const { status, animeData = null } = payload

                if (status) {
                    if (!VALID_STATUSES.has(status)) {
                        safeSend(peer, { type: 'error', message: `Invalid status. Valid: ${[...VALID_STATUSES].join(', ')}` })
                        return
                    }
                    conn.status = status
                    // Always clear watchingData when not watching — fixes stale anime after tab switch
                    conn.watchingData = status === 'watching' ? (animeData ?? null) : null
                }

                await flushStatus(conn.supabase, conn.userId)

                const ackType = payload.type === 'heartbeat' ? 'heartbeat_ack' : 'status_updated'
                safeSend(peer, {
                    type: ackType,
                    peerId: peer.id,
                    ...(payload.type === 'status_update' && {
                        userId: conn.userId,
                        status: conn.status,
                        aggregateStatus: aggregateStatus(conn.userId),
                    }),
                    timestamp: Date.now(),
                })
                break
            }

            case 'get_status':
                safeSend(peer, {
                    type: 'status_info',
                    userId: conn.userId,
                    peerStatus: conn.status,
                    aggregateStatus: aggregateStatus(conn.userId),
                    activeConnections: peerCount(conn.userId),
                    watchingData: activeWatchingData(conn.userId),
                })
                break

            case 'disconnect':
                safeSend(peer, { type: 'disconnected', peerId: peer.id })
                await handleDisconnect(peer.id)
                try {
                    peer.websocket.close(1000, 'Client disconnect')
                } catch {}
                console.log(`[WS] client disconnect peer=${peer.id} user=${conn.userId}`)
                break

            default:
                safeSend(peer, { type: 'error', message: `Unknown type: ${payload?.type}` })
        }
    },

    async close(peer) {
        const userId = connections.get(peer.id)?.userId
        await handleDisconnect(peer.id)
        console.log(`[WS] close peer=${peer.id} user=${userId} (${peerCount(userId)} remaining)`)
    },

    async error(peer, err) {
        console.error('[WS] error:', err)
        await handleDisconnect(peer.id)
    },
})
