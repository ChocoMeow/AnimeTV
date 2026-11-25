/**
 * WebSocket API for real-time user status tracking (Nuxt/Nitro)
 * Supports multiple connections per user (multiple tabs/devices)
 *
 * Auth flow (token never appears in any URL):
 *   1. Client calls POST /api/presence/ticket  →  gets a short-lived opaque ticket ID
 *   2. Client opens  ws://.../api/presence/ws?ticket=<id>
 *   3. On open, consumeWsTicket() deletes the ticket and returns { userId, accessToken }
 *   4. Client may send refresh_ticket with a new ticket to rotate the server-side JWT in-place
 */

import { createPresenceHandlers } from '~~/server/services/presence.service.js'

export default defineWebSocketHandler(createPresenceHandlers())
