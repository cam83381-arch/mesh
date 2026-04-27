/**
 * mesh.ts -- P2P bootstrap via BitTorrent trackers (trystero v0.23)
 *
 * Zero server, zero ngrok, zero cost.
 * Peers discover each other via public WebTorrent trackers.
 *
 * trystero v0.23 API: config = { appId, relayUrls?, relayRedundancy? }
 *   - relayUrls       : wss:// tracker list (replaces old "trackerUrls")
 *   - appId           : unique namespace to isolate app from other trystero users
 *   - relayRedundancy : number of trackers to connect to in parallel
 */

import { joinRoom, selfId } from '@trystero-p2p/torrent'

export { selfId }

// Public BitTorrent trackers maintained by the WebTorrent community
const RELAY_URLS = [
  'wss://tracker.openwebtorrent.com',
  'wss://tracker.webtorrent.dev',
  'wss://tracker.btorrent.xyz',
  'wss://tracker.files.fm:7073/announce',
]

const TORRENT_CONFIG = {
  appId: 'mesh-discord-clone-v1',
  relayUrls: RELAY_URLS,
  relayRedundancy: 3,
}

const APP_NAMESPACE = 'mesh-v1'

// Active room cache -- avoids joining the same room twice
const rooms: Record<string, ReturnType<typeof joinRoom>> = {}

/**
 * Join a P2P room (or return existing instance).
 * roomId = semantic identifier e.g. "srv123_chan456"
 */
export function joinMeshRoom(roomId: string) {
  const key = `${APP_NAMESPACE}__${roomId}`
  if (!rooms[key]) {
    try {
      rooms[key] = joinRoom(TORRENT_CONFIG, key)
      console.log('[Mesh P2P] Joined room:', key, '| selfId:', selfId)
    } catch (e) {
      console.warn('[Mesh P2P] Tracker unavailable, local mode only:', e)
    }
  }
  return rooms[key]
}

/**
 * Leave a room cleanly (frees WebRTC/tracker resources).
 */
export function leaveMeshRoom(roomId: string) {
  const key = `${APP_NAMESPACE}__${roomId}`
  if (rooms[key]) {
    try { rooms[key].leave() } catch {}
    delete rooms[key]
    console.log('[Mesh P2P] Left room:', key)
  }
}

/**
 * Leave all active rooms (called on logout or app close).
 */
export function leaveAllMeshRooms() {
  Object.keys(rooms).forEach(key => {
    try { rooms[key].leave() } catch {}
    delete rooms[key]
  })
  console.log('[Mesh P2P] All rooms left')
}

export default { joinMeshRoom, leaveMeshRoom, leaveAllMeshRooms }
