/**
 * mesh.ts -- P2P bootstrap via BitTorrent trackers (trystero v0.23)
 *
 * Zero server, zero ngrok, zero cost.
 * Peers discover each other via public WebTorrent trackers.
 * Une fois connectés, tout passe par WebRTC direct.
 *
 * Reconnexion automatique :
 *   - Écoute window.online pour déclencher une reconnexion immédiate
 *   - Backoff exponentiel (2s → 4s → 8s … max 60s) entre tentatives
 *   - Recrée toutes les rooms enregistrées + rebroadcast profil
 */

import { joinRoom, selfId } from '@trystero-p2p/torrent'
import {
  signData,
  verifyData,
  getPublicKey,
  storePeerPublicKey,
  removePeerPublicKey,
} from './crypto'

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

// ── Métadonnées de chaque room (pour pouvoir la recréer) ──
interface RoomMeta {
  roomId: string          // roomId sans namespace (ex: "settings_abc123")
  myProfile: any | null   // dernier profil broadcasté dans cette room
}

// Cache des rooms actives
const rooms: Record<string, ReturnType<typeof joinRoom>> = {}

// Métadonnées enregistrées pour la reconnexion
const roomMetas: Record<string, RoomMeta> = {}

// Cache des profils pairs reçus via WebRTC
export const peerProfiles: Record<string, any> = {}

// Callbacks enregistrés pour notifier le UI quand un profil pair arrive
const profileListeners: Array<(peerId: string, profile: any) => void> = []

// Dernier profil connu (pour rebroadcast après reconnexion)
let _lastMyProfile: any = null

// État de reconnexion
let _reconnectTimer: ReturnType<typeof setTimeout> | null = null
let _reconnectDelay = 2000   // commence à 2s
const RECONNECT_MAX = 60000  // plafond 60s
let _isReconnecting = false

// Listeners pour les changements d'état de connexion (UI)
const connectionListeners: Array<(online: boolean) => void> = []

export function onConnectionChange(cb: (online: boolean) => void) {
  connectionListeners.push(cb)
  return () => {
    const i = connectionListeners.indexOf(cb)
    if (i !== -1) connectionListeners.splice(i, 1)
  }
}

export function onPeerProfile(cb: (peerId: string, profile: any) => void) {
  profileListeners.push(cb)
  return () => {
    const i = profileListeners.indexOf(cb)
    if (i !== -1) profileListeners.splice(i, 1)
  }
}

// ── Format d'un paquet profil signé ──
interface SignedProfile {
  profile: any        // données profil
  publicKey: string   // clé publique de l'émetteur (base64)
  signature: string   // signature Ed25519 de `profile` (base64)
}

// ── Cœur : (re)créer une room Trystero ──
function _createRoom(key: string, meta: RoomMeta): ReturnType<typeof joinRoom> | null {
  try {
    const room = joinRoom(TORRENT_CONFIG, key)
    console.log('[Mesh P2P] Joined room:', key, '| selfId:', selfId)

    // Channel profil — échange bidirectionnel au join
    const [sendProfile, getProfile] = (room.makeAction as any)('profile') as [any, any]

    // Recevoir le profil des pairs (avec vérification signature)
    getProfile(async (packet: any, peerId: string) => {
      // Compatibilité : accepter les anciens profils non signés (transition)
      const isLegacy = !packet?.signature || !packet?.publicKey
      const profile: any = isLegacy ? packet : packet?.profile

      if (!profile?.username) return

      if (!isLegacy) {
        const { signature, publicKey } = packet as SignedProfile

        // Mémoriser la clé publique du pair (première fois ou mise à jour)
        storePeerPublicKey(peerId, publicKey)

        // Vérifier la signature — rejeter si invalide
        const valid = await verifyData(profile, signature, publicKey)
        if (!valid) {
          console.warn('[Crypto] Signature invalide reçue de', peerId, '— profil rejeté')
          return
        }
        console.log('[Crypto] Signature vérifiée ✓ pour', peerId, ':', profile.username)
      } else {
        console.warn('[Mesh P2P] Profil non signé reçu de', peerId, '(pair legacy)')
      }

      peerProfiles[peerId] = profile
      profileListeners.forEach(cb => cb(peerId, profile))
    })

    // Quand un nouveau pair rejoint, lui envoyer notre profil signé
    room.onPeerJoin((peerId: string) => {
      console.log('[Mesh P2P] Pair rejoint:', peerId)
      const profile = meta.myProfile || _lastMyProfile
      if (profile) {
        _sendSignedProfile(sendProfile, profile, [peerId])
      }
    })

    room.onPeerLeave((peerId: string) => {
      console.log('[Mesh P2P] Pair parti:', peerId)
      delete peerProfiles[peerId]
      removePeerPublicKey(peerId)
      profileListeners.forEach(cb => cb(peerId, null))
    })

    // Broadcaster notre profil signé immédiatement aux pairs déjà présents
    const profile = meta.myProfile || _lastMyProfile
    if (profile) {
      setTimeout(() => {
        _sendSignedProfile(sendProfile, profile)
      }, 500)
    }

    return room
  } catch (e) {
    console.warn('[Mesh P2P] Tracker unavailable:', e)
    return null
  }
}

// ── Helper : construire et envoyer un paquet profil signé ──
async function _sendSignedProfile(
  sendFn: (packet: any, targets?: string[]) => void,
  profile: any,
  targets?: string[]
) {
  const publicKey = getPublicKey()
  if (!publicKey) {
    // Clé pas encore prête — envoyer sans signature (transitoire)
    try { targets ? sendFn(profile, targets) : sendFn(profile) } catch (_e) {}
    return
  }

  const signature = await signData(profile)
  if (!signature) {
    try { targets ? sendFn(profile, targets) : sendFn(profile) } catch (_e) {}
    return
  }

  const packet: SignedProfile = { profile, publicKey, signature }
  try {
    targets ? sendFn(packet, targets) : sendFn(packet)
  } catch (_e) {}
}

// ── Reconnexion : recrée toutes les rooms enregistrées ──
function _reconnectAll() {
  if (_isReconnecting) return
  _isReconnecting = true
  console.log('[Mesh P2P] Reconnexion en cours…')
  connectionListeners.forEach(cb => cb(false))

  // Vider les rooms existantes
  Object.keys(rooms).forEach(key => {
    try { rooms[key]?.leave() } catch (_e) {}
    delete rooms[key]
  })

  // Vider les peerProfiles (ils seront re-reçus à la reconnexion)
  Object.keys(peerProfiles).forEach(k => delete peerProfiles[k])
  profileListeners.forEach(cb => cb('__reset__', null))

  // Recréer toutes les rooms connues
  let allOk = true
  Object.entries(roomMetas).forEach(([key, meta]) => {
    const room = _createRoom(key, meta)
    if (room) {
      rooms[key] = room
    } else {
      allOk = false
    }
  })

  if (allOk) {
    console.log('[Mesh P2P] Reconnexion réussie')
    _reconnectDelay = 2000
    _isReconnecting = false
    connectionListeners.forEach(cb => cb(true))

    // Rebroadcast profil
    if (_lastMyProfile) {
      setTimeout(() => broadcastProfile(_lastMyProfile), 800)
    }
  } else {
    // Retry avec backoff exponentiel
    _isReconnecting = false
    console.warn(`[Mesh P2P] Reconnexion partielle, retry dans ${_reconnectDelay / 1000}s`)
    _reconnectTimer = setTimeout(() => {
      _reconnectDelay = Math.min(_reconnectDelay * 2, RECONNECT_MAX)
      _reconnectAll()
    }, _reconnectDelay)
  }
}

// ── Écoute réseau OS ──
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.log('[Mesh P2P] Réseau disponible — reconnexion')
    if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null }
    _reconnectDelay = 2000
    // Petit délai pour laisser le réseau se stabiliser
    setTimeout(_reconnectAll, 1500)
  })

  window.addEventListener('offline', () => {
    console.warn('[Mesh P2P] Réseau perdu')
    connectionListeners.forEach(cb => cb(false))
  })
}

/**
 * Rejoindre une room P2P (ou retourner l'instance existante).
 */
export function joinMeshRoom(roomId: string, myProfile?: any): ReturnType<typeof joinRoom> {
  const key = `${APP_NAMESPACE}__${roomId}`

  // Mémoriser le profil pour la reconnexion
  if (myProfile) _lastMyProfile = myProfile

  // Enregistrer les métadonnées (pour pouvoir recréer la room)
  if (!roomMetas[key]) {
    roomMetas[key] = { roomId, myProfile: myProfile || null }
  } else if (myProfile) {
    roomMetas[key].myProfile = myProfile
  }

  if (!rooms[key]) {
    const room = _createRoom(key, roomMetas[key])
    if (room) rooms[key] = room
  }

  return rooms[key]
}

/**
 * Mettre à jour notre profil dans toutes les rooms actives (avec signature).
 */
export function broadcastProfile(myProfile: any) {
  _lastMyProfile = myProfile
  // Mettre à jour le profil dans toutes les metas
  Object.values(roomMetas).forEach(m => { m.myProfile = myProfile })

  Object.values(rooms).forEach(room => {
    if (!room) return
    try {
      const [sendProfile] = (room.makeAction as any)('profile') as [any, any]
      _sendSignedProfile(sendProfile, myProfile)
    } catch (_e) {}
  })
}

/**
 * Déclencher manuellement une reconnexion (ex: bouton UI).
 */
export function forceReconnect() {
  if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null }
  _reconnectDelay = 2000
  _reconnectAll()
}

export function leaveMeshRoom(roomId: string) {
  const key = `${APP_NAMESPACE}__${roomId}`
  if (rooms[key]) {
    try { rooms[key].leave() } catch (_e) {}
    delete rooms[key]
  }
  delete roomMetas[key]
}

export function leaveAllMeshRooms() {
  Object.keys(rooms).forEach(key => {
    try { rooms[key].leave() } catch (_e) {}
    delete rooms[key]
  })
  Object.keys(roomMetas).forEach(k => delete roomMetas[k])
}

export default { joinMeshRoom, leaveMeshRoom, leaveAllMeshRooms, broadcastProfile, forceReconnect }
