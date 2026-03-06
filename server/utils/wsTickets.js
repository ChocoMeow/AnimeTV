import { randomBytes } from 'crypto'

/**
 * Short-lived single-use ticket store for WebSocket authentication.
 * The access token is kept server-side; only an opaque ticket ID is sent to the client.
 *
 * Ticket lifecycle:
 *   1. POST /api/ws-ticket  → creates ticket (TTL: 30s), returns { ticket: id }
 *   2. WS open              → consumeWsTicket(id) deletes ticket, returns { userId, accessToken }
 */

const TICKET_TTL = 30 * 1000 // 30 seconds

// ticketId (hex string) → { userId, accessToken, expires }
const store = new Map()

// Periodic cleanup so stale (never-consumed) tickets don't accumulate in memory
const cleanupTimer = setInterval(() => {
    const now = Date.now()
    for (const [id, ticket] of store.entries()) {
        if (now > ticket.expires) store.delete(id)
    }
}, 60 * 1000)

// Prevent Node from keeping the process alive just for this timer
if (cleanupTimer?.unref) cleanupTimer.unref()

/**
 * Create a single-use ticket tied to a user session.
 * @returns {string} The opaque ticket ID to send to the client
 */
export function createWsTicket(userId, accessToken) {
    const id = randomBytes(32).toString('hex') // 64-char hex, cryptographically random
    store.set(id, { userId, accessToken, expires: Date.now() + TICKET_TTL })
    return id
}

/**
 * Consume a ticket (single-use — deleted on first call).
 * @returns {{ userId: string, accessToken: string } | null}
 *   Returns null if the ticket is unknown or expired.
 */
export function consumeWsTicket(ticketId) {
    if (!ticketId) return null
    const ticket = store.get(ticketId)
    store.delete(ticketId) // Delete immediately regardless — prevent replay
    if (!ticket || Date.now() > ticket.expires) return null
    return { userId: ticket.userId, accessToken: ticket.accessToken }
}
