/**
 * mesh.ts -- P2P bootstrap via BitTorrent trackers (trystero v0.23)
 *
 * Zero server, zero ngrok, zero cost.
 * Peers discover each other via public WebTorrent trackers.
 * Une fois connectés, tout passe par WebRTC direct.
 */

import { joinRoom, selfId } from '@trystero-p2p/torrent'

export { selfId }

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

// Cache des rooms actives
const rooms: Record<string, ReturnType<typeof joinRoom>> = {}

// Cache des profils pairs reçus via WebRTC
// peerProfiles[peerId] = { username, avatarColor, avatarImage, ... }
export const peerProfiles: Record<string, any> = {}

// Callbacks enregistrés pour notifier le UI quand un profil pair arrive
const profileListeners: Array<(peerId: string, profile: any) => void> = []

export function onPeerProfile(cb: (peerId: string, profile: any) => void) {
  profileListeners.push(cb)
  return () => {
    const i = profileListeners.indexOf(cb)
    if (i !== -1) profileListeners.splice(i, 1)
  }
}

/**
 * Rejoindre une room P2P (ou retourner l'instance existante).
 * Quand on rejoint, on broadcast notre profil aux pairs présents.
 */
export function joinMeshRoom(roomId: string, myProfile?: any) {
  const key = `${APP_NAMESPACE}__${roomId}`
  if (!rooms[key]) {
    try {
      rooms[key] = joinRoom(TORRENT_CONFIG, key)
      console.log('[Mesh P2P] Joined room:', key, '| selfId:', selfId)

      // Channel profil — échange bidirectionnel au join
      const [sendProfile, getProfile] = (rooms[key].makeAction as any)('profile') as [any, any]

      // Recevoir le profil des pairs
      getProfile((profile: any, peerId: string) => {
        if (!profile?.username) return
        peerProfiles[peerId] = profile
        profileListeners.forEach(cb => cb(peerId, profile))
        console.log('[Mesh P2P] Profil reçu de', peerId, ':', profile.username)
      })

      // Quand un nouveau pair rejoint, lui envoyer notre profil
      rooms[key].onPeerJoin((peerId: string) => {
        console.log('[Mesh P2P] Pair rejoint:', peerId)
        if (myProfile) {
          try { sendProfile(myProfile, [peerId]) } catch {}
        }
      })

      rooms[key].onPeerLeave((peerId: string) => {
        console.log('[Mesh P2P] Pair parti:', peerId)
        delete peerProfiles[peerId]
        profileListeners.forEach(cb => cb(peerId, null))
      })

      // Broadcaster notre profil immédiatement aux pairs déjà présents
      if (myProfile) {
        setTimeout(() => {
          try { sendProfile(myProfile) } catch {}
        }, 500)
      }
    } catch (e) {
      console.warn('[Mesh P2P] Tracker unavailable, local mode only:', e)
    }
  }
  return rooms[key]
}

/**
 * Mettre à jour notre profil dans toutes les rooms actives.
 */
export function broadcastProfile(myProfile: any) {
  Object.values(rooms).forEach(room => {
    if (!room) return
    try {
      const [sendProfile] = (room.makeAction as any)('profile') as [any, any]
      sendProfile(myProfile)
    } catch {}
  })
}

export function leaveMeshRoom(roomId: string) {
  const key = `${APP_NAMESPACE}__${roomId}`
  if (rooms[key]) {
    try { rooms[key].leave() } catch {}
    delete rooms[key]
  }
}

export function leaveAllMeshRooms() {
  Object.keys(rooms).forEach(key => {
    try { rooms[key].leave() } catch {}
    delete rooms[key]
  })
}

export default { joinMeshRoom, leaveMeshRoom, leaveAllMeshRooms, broadcastProfile }
