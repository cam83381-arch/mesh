/**
 * useChannelKeys — gestion du cycle de vie des clés de salon E2E
 *
 * - Charge les clés locales au démarrage (channel_keys.json)
 * - Envoie/reçoit les clés via Trystero room `keys_${serverId}`
 * - Ne distribue une clé qu'à un pair présent dans members.json
 * - Max 3 tentatives de demande, timeout 10s entre chaque
 */
import { useEffect, useRef, useCallback } from 'react'
import { joinMeshRoom } from './mesh'
import { readLocal } from './localStore'
import {
  loadChannelKeys,
  hasChannelKey,
  encryptChannelKeyForPeer,
  decryptAndStoreChannelKey,
  generateChannelKey,
  hasSharedSecret,
} from './crypto'
import type { EncryptedPayload } from './crypto'

interface KeyRequest {
  type: 'key_request'
  channelId: string
  requesterUsername: string
}

interface KeyDelivery {
  type: 'key_delivery'
  channelId: string
  senderUsername: string
  payload: EncryptedPayload
}

type KeyMessage = KeyRequest | KeyDelivery

// Limite : max 3 tentatives par canal, délai 10s
const MAX_RETRIES = 3
const RETRY_DELAY_MS = 10_000

interface UseChannelKeysOptions {
  serverId: string
  username: string
  channelIds: string[]          // canaux texte du serveur courant
  isOwnerOrAdmin: boolean       // peut distribuer des clés
  onKeyReceived?: (channelId: string) => void
}

function useChannelKeys(opts: UseChannelKeysOptions) {
  const optsRef = useRef(opts)
  optsRef.current = opts

  const retriesRef = useRef<Record<string, number>>({})
  const pendingRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const cleanupRef = useRef<Array<() => void>>([])
  const sendKeyMsgRef = useRef<((msg: KeyMessage, peerId?: string) => void) | null>(null)

  // Charger les clés locales au montage
  useEffect(() => {
    loadChannelKeys()
  }, [])

  useEffect(() => {
    if (!opts.serverId) return
    let active = true

    cleanupRef.current.forEach(fn => fn())
    cleanupRef.current = []

    const room = joinMeshRoom(`keys_${opts.serverId}`)
    if (!room) return

    const [sendKeyMsg, getKeyMsg] = (room.makeAction as any)('channel_key') as [any, any]
    sendKeyMsgRef.current = (msg: KeyMessage, peerId?: string) => {
      try { peerId ? sendKeyMsg(msg, peerId) : sendKeyMsg(msg) } catch (_e) {}
    }

    getKeyMsg(async (msg: KeyMessage, peerId: string) => {
      if (!active) return
      const o = optsRef.current

      // ── Réception d'une demande de clé ──────────────────────────────────
      if (msg.type === 'key_request') {
        // Vérifier que le demandeur est bien membre du serveur
        const members = await readLocal<any[]>(`members_${o.serverId}.json`) || []
        const isMember = members.some(
          (m: any) => m.username === msg.requesterUsername
        )
        if (!isMember) {
          console.warn('[KeyMgr] Demande rejetée — pair non membre:', msg.requesterUsername)
          return
        }
        if (!hasChannelKey(msg.channelId)) return
        if (!hasSharedSecret(msg.requesterUsername)) {
          console.warn('[KeyMgr] Secret ECDH manquant avec', msg.requesterUsername)
          return
        }

        const encrypted = await encryptChannelKeyForPeer(msg.channelId, msg.requesterUsername)
        if (!encrypted) return

        const delivery: KeyDelivery = {
          type: 'key_delivery',
          channelId: msg.channelId,
          senderUsername: o.username,
          payload: encrypted,
        }
        sendKeyMsgRef.current?.(delivery, peerId)
        console.log('[KeyMgr] Clé envoyée pour canal', msg.channelId, 'à', msg.requesterUsername)
      }

      // ── Réception d'une clé ─────────────────────────────────────────────
      if (msg.type === 'key_delivery') {
        if (hasChannelKey(msg.channelId)) return // déjà connue
        const ok = await decryptAndStoreChannelKey(
          msg.channelId,
          msg.payload,
          msg.senderUsername
        )
        if (ok) {
          // Annuler les retries en cours pour ce canal
          if (pendingRef.current[msg.channelId]) {
            clearTimeout(pendingRef.current[msg.channelId])
            delete pendingRef.current[msg.channelId]
          }
          delete retriesRef.current[msg.channelId]
          optsRef.current.onKeyReceived?.(msg.channelId)
          console.log('[KeyMgr] Clé reçue et stockée pour canal', msg.channelId)
        }
      }
    })

    cleanupRef.current.push(() => { active = false })

    return () => {
      active = false
      cleanupRef.current.forEach(fn => fn())
      cleanupRef.current = []
      Object.values(pendingRef.current).forEach(clearTimeout)
      pendingRef.current = {}
    }
  }, [opts.serverId]) // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Demande la clé d'un canal à tous les pairs présents.
   * Retry automatique jusqu'à MAX_RETRIES si pas de réponse.
   */
  const requestChannelKey = useCallback((channelId: string) => {
    if (hasChannelKey(channelId)) return
    const retries = retriesRef.current[channelId] || 0
    if (retries >= MAX_RETRIES) {
      console.warn('[KeyMgr] Max tentatives atteint pour canal', channelId)
      return
    }

    retriesRef.current[channelId] = retries + 1
    const req: KeyRequest = {
      type: 'key_request',
      channelId,
      requesterUsername: optsRef.current.username,
    }
    sendKeyMsgRef.current?.(req)
    console.log('[KeyMgr] Demande clé canal', channelId, '(tentative', retries + 1, ')')

    // Retry si pas de réponse dans RETRY_DELAY_MS
    if (pendingRef.current[channelId]) clearTimeout(pendingRef.current[channelId])
    pendingRef.current[channelId] = setTimeout(() => {
      if (!hasChannelKey(channelId)) requestChannelKey(channelId)
    }, RETRY_DELAY_MS)
  }, [])

  /**
   * Génère les clés manquantes pour tous les canaux du serveur.
   * Appelé par l'owner à la création du serveur ou d'un nouveau canal.
   */
  const ensureChannelKeys = useCallback(async (channelIds: string[]) => {
    for (const id of channelIds) {
      if (!hasChannelKey(id)) {
        await generateChannelKey(id)
        console.log('[KeyMgr] Clé générée pour canal', id)
      }
    }
  }, [])

  return { requestChannelKey, ensureChannelKeys }
}

export default useChannelKeys
