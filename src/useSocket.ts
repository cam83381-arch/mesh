/**
 * useSocket.ts - Transport P2P pur via Trystero (WebRTC + trackers BitTorrent)
 *
 * Architecture :
 *   - Trystero  -> transport temps reel entre pairs (messages, reactions, typing)
 *   - GunDB     -> cache local radisk (historique, persistance offline)
 *   - Zero serveur central entre utilisateurs
 */

import { useEffect, useState, useRef } from 'react'
import gun from './gun'
import { readLocal } from './localStore'
import { joinMeshRoom } from './mesh'
import { encryptMessage, decryptMessage, hasChannelKey } from './crypto'
import type { Message } from './types'

interface AutoModConfig {
  words: string
  action: 'delete' | 'warn' | 'both' | 'tempban'
  enabled: boolean
  banDuration?: number // minutes
}

const PAGE_SIZE = 50

function useSocket(channelId: string, username: string, serverId: string, myProfile?: any, applyTempban?: (target: string, durationMs: number) => void) {
  const [messages, setMessages] = useState<Message[]>([])
  const [reactions, setReactions] = useState<Record<string, Record<string, string[]>>>({})
  const [typingUsers, setTypingUsers] = useState<string[]>([])
  const [hasMore, setHasMore] = useState(false)
  const msgsRef = useRef<Record<string, Message>>({})
  const historyRef = useRef<Message[]>([])   // messages plus anciens, pas encore affichés
  const reactionsRef = useRef<Record<string, Record<string, string[]>>>({})
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const automodRef = useRef<AutoModConfig | null>(null)
  const sendP2PMsg = useRef<((msg: Message) => void) | null>(null)
  const sendP2PReaction = useRef<((r: object) => void) | null>(null)
  const sendP2PTyping = useRef<((t: object) => void) | null>(null)

  const sortMsgs = (ref: Record<string, Message>) =>
    Object.values(ref).filter(m => m && m.content).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))

  useEffect(() => {
    if (!serverId) return
    let active = true

    msgsRef.current = {}
    reactionsRef.current = {}
    setMessages([])
    setReactions({})
    setTypingUsers([])

    const roomKey = `${serverId}_${channelId}`

    // -- Trystero P2P --
    const room = joinMeshRoom(roomKey, myProfile)

    if (room) {
      // makeAction<any> contourne la contrainte DataPayload pour nos objets custom
      const [sendMsg, getMsg] = (room.makeAction as any)('msg') as [any, any]
      const [sendReaction, getReaction] = (room.makeAction as any)('reaction') as [any, any]
      const [sendTypingFn, getTyping] = (room.makeAction as any)('typing') as [any, any]
      const [sendHistoryBatch, getHistoryBatch] = (room.makeAction as any)('history_batch') as [any, any]
      const [sendHistoryReq, getHistoryReq] = (room.makeAction as any)('history_req') as [any, any]

      sendP2PMsg.current = (msg: Message) => { try { sendMsg(msg) } catch (_e) {} }
      sendP2PReaction.current = (r: object) => { try { sendReaction(r) } catch (_e) {} }
      sendP2PTyping.current = (t: object) => { try { sendTypingFn(t) } catch (_e) {} }

      // Reception messages P2P
      getMsg(async (msg: any) => {
        if (!active || !msg || !msg.id) return
        // Déchiffrement E2E si message chiffré
        if (msg.encrypted && msg.payload) {
          const plain = await decryptMessage(msg.payload, channelId)
          if (plain === null) {
            // Clé manquante ou déchiffrement échoué → afficher placeholder
            const displayed: Message = { ...msg, content: '🔒 Message chiffré (clé non disponible)', encrypted: true }
            msgsRef.current[msg.id] = displayed
            setMessages(sortMsgs(msgsRef.current))
            // Stocker le message chiffré dans radisk (pas le clair)
            gun.get('messages').get(roomKey).get(msg.id).put(msg)
            return
          }
          const decoded: Message = { ...msg, content: plain }
          msgsRef.current[decoded.id] = decoded
          setMessages(sortMsgs(msgsRef.current))
          gun.get('messages').get(roomKey).get(msg.id).put(msg) // stocke chiffré
          return
        }
        if (!msg.content) return
        msgsRef.current[msg.id] = { ...msg }
        setMessages(sortMsgs(msgsRef.current))
        gun.get('messages').get(roomKey).get(msg.id).put(msg)
      })

      // Quand un nouveau pair demande l'historique, on lui envoie nos messages locaux
      getHistoryReq((_: any, peerId: string) => {
        if (!active) return
        const allLocal = Object.values(msgsRef.current)
          .concat(historyRef.current)
          .filter(m => m && m.content && m.id)
          .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
          .slice(-100) // max 100 messages envoyés
        if (allLocal.length > 0) {
          try { sendHistoryBatch({ msgs: allLocal }, peerId) } catch (_e) {}
        }
      })

      // Reception d'un batch d'historique d'un pair
      getHistoryBatch(async (data: any) => {
        if (!active || !Array.isArray(data?.msgs)) return
        let changed = false
        for (const msg of data.msgs) {
          if (!msg || !msg.id) continue
          if (msgsRef.current[msg.id]) continue // déjà connu
          // Déchiffrement E2E si message chiffré
          if (msg.encrypted && msg.payload) {
            const plain = await decryptMessage(msg.payload, channelId)
            const decoded: Message = plain !== null
              ? { ...msg, content: plain }
              : { ...msg, content: '🔒 Message chiffré (clé non disponible)', encrypted: true }
            msgsRef.current[decoded.id] = decoded
            gun.get('messages').get(roomKey).get(msg.id).put(msg) // stocke chiffré
            changed = true
            continue
          }
          if (!msg.content) continue
          msgsRef.current[msg.id] = msg
          gun.get('messages').get(roomKey).get(msg.id).put(msg)
          changed = true
        }
        if (changed) setMessages(sortMsgs(msgsRef.current))
      })

      // Demander l'historique aux pairs déjà présents (avec délai pour laisser WebRTC s'établir)
      setTimeout(() => {
        if (!active) return
        try { sendHistoryReq({ ts: Date.now() }) } catch (_e) {}
      }, 1500)

      // Reception reactions P2P
      getReaction((r: any) => {
        if (!active || !r?.msgId || !r?.emoji || !r?.user) return
        if (!reactionsRef.current[r.msgId]) reactionsRef.current[r.msgId] = {}
        if (!reactionsRef.current[r.msgId][r.emoji]) reactionsRef.current[r.msgId][r.emoji] = []
        if (r.remove) {
          reactionsRef.current[r.msgId][r.emoji] = reactionsRef.current[r.msgId][r.emoji].filter((u: string) => u !== r.user)
          if (reactionsRef.current[r.msgId][r.emoji].length === 0) delete reactionsRef.current[r.msgId][r.emoji]
        } else if (!reactionsRef.current[r.msgId][r.emoji].includes(r.user)) {
          reactionsRef.current[r.msgId][r.emoji] = [...reactionsRef.current[r.msgId][r.emoji], r.user]
        }
        setReactions({ ...reactionsRef.current })
        gun.get('reactions').get(roomKey).get(r.msgId).get(r.emoji).get(r.user).put(r.remove ? null : true)
      })

      // Reception typing P2P
      getTyping((t: any) => {
        if (!active || !t?.user || t.user === username) return
        setTypingUsers(prev => {
          const set = new Set(prev)
          if (t.active) set.add(t.user)
          else set.delete(t.user)
          return Array.from(set)
        })
      })
    }

    // -- AutoMod - charge depuis localStore (source de verite) --
    readLocal<Record<string, AutoModConfig>>('automod.json').then(data => {
      if (!active) return
      if (data?.[serverId]) automodRef.current = data[serverId]
    })

    // -- Historique depuis radisk (chargement par tranches) --
    const allFromRadisk: any[] = []
    gun.get('messages').get(roomKey).map().once((msg: any, id: string) => {
      if (!active || !msg) return
      // Accepter les messages chiffrés (encrypted:true + payload) OU non chiffrés (content)
      if (!msg.content && !(msg.encrypted && msg.payload)) return
      allFromRadisk.push({ ...msg, id })
    })
    // GunDB .once() est synchrone sur radisk — on peut traiter juste après
    setTimeout(async () => {
      if (!active) return
      const sorted = allFromRadisk.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
      // Déchiffrer les messages chiffrés
      const decoded: Message[] = []
      for (const msg of sorted) {
        if (msg.encrypted && msg.payload) {
          const plain = await decryptMessage(msg.payload, channelId)
          decoded.push(plain !== null
            ? { ...msg, content: plain }
            : { ...msg, content: '🔒 Message chiffré (clé non disponible)' }
          )
        } else {
          decoded.push(msg as Message)
        }
      }
      const recent = decoded.slice(-PAGE_SIZE)
      const older = decoded.slice(0, Math.max(0, decoded.length - PAGE_SIZE))
      recent.forEach(m => { msgsRef.current[m.id] = m })
      historyRef.current = older
      setHasMore(older.length > 0)
      setMessages(sortMsgs(msgsRef.current))
    }, 0)

    // -- Reactions depuis radisk --
    gun.get('reactions').get(roomKey).map().on((_: any, msgId: string) => {
      if (!active || !msgId || msgId === '_') return
      gun.get('reactions').get(roomKey).get(msgId).map().on((_e: any, emoji: string) => {
        if (!active || !emoji || emoji === '_') return
        gun.get('reactions').get(roomKey).get(msgId).get(emoji).map().on((val: any, user: string) => {
          if (!active || !user || user === '_') return
          if (!reactionsRef.current[msgId]) reactionsRef.current[msgId] = {}
          if (!reactionsRef.current[msgId][emoji]) reactionsRef.current[msgId][emoji] = []
          if (val === true) {
            if (!reactionsRef.current[msgId][emoji].includes(user))
              reactionsRef.current[msgId][emoji] = [...reactionsRef.current[msgId][emoji], user]
          } else {
            reactionsRef.current[msgId][emoji] = reactionsRef.current[msgId][emoji].filter(u => u !== user)
            if (reactionsRef.current[msgId][emoji].length === 0) delete reactionsRef.current[msgId][emoji]
          }
          setReactions({ ...reactionsRef.current })
        })
      })
    })

    // Nettoyage typing expire
    const typingCleanup = setInterval(() => {
      if (!active) return
      setTypingUsers([])
    }, 6000)

    return () => {
      active = false
      sendP2PMsg.current = null
      sendP2PReaction.current = null
      sendP2PTyping.current = null
      clearInterval(typingCleanup)
      try { gun.get('messages').get(roomKey).map().off() } catch (_e) {}
      try { gun.get('reactions').get(roomKey).map().off() } catch (_e) {}
    }
  }, [channelId, serverId])

  // -- AutoMod --
  const checkAutoMod = (content: string): boolean => {
    const cfg = automodRef.current
    if (!cfg || !cfg.enabled || !cfg.words.trim()) return false
    const bannedWords = cfg.words.split(',').map(w => w.trim().toLowerCase()).filter(Boolean)
    const hit = bannedWords.some(w => content.toLowerCase().includes(w))
    if (!hit) return false

    const showWarn = (text: string, color = '#f0b232') => {
      const warnId = 'warn_' + Date.now()
      const warn: Message = {
        id: warnId, author: 'AutoMod',
        content: text, color,
        time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        timestamp: Date.now(),
      }
      msgsRef.current[warnId] = warn
      setMessages(sortMsgs(msgsRef.current))
      setTimeout(() => {
        delete msgsRef.current[warnId]
        setMessages(sortMsgs(msgsRef.current))
      }, 6000)
    }

    if (cfg.action === 'tempban') {
      const durationMin = cfg.banDuration || 10
      const durationMs = durationMin * 60 * 1000
      // Déclencher le ban via Trystero (cross-machine) — applyTempban vient de useMembers
      applyTempban?.(username, durationMs)
      showWarn(
        `Tu as ete banni temporairement pendant ${durationMin < 60 ? `${durationMin} min` : `${durationMin / 60}h`} pour avoir utilise un mot interdit.`,
        '#ed4245'
      )
      return true
    }

    if (cfg.action === 'warn' || cfg.action === 'both') {
      showWarn('Ton message contient un mot interdit et a ete bloque.')
    }
    return cfg.action === 'delete' || cfg.action === 'both'
  }

  const sendMessage = async (
    content: string,
    replyTo?: { id: string; author: string; content: string },
    fileUrl?: string, fileName?: string, fileType?: string, fileSize?: number
  ) => {
    if (!serverId) return
    if (!content.trim() && !fileUrl) return
    if (content && checkAutoMod(content)) return

    const roomKey = `${serverId}_${channelId}`
    const msgId = Date.now().toString()
    const time = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    const timestamp = Date.now()
    const base = {
      id: msgId, author: username, color: '#5865f2', time, timestamp,
      ...(replyTo ? { replyTo } : {}),
      ...(fileUrl ? { fileUrl, fileName, fileType, fileSize } : {})
    }

    // Chiffrement E2E si clé disponible pour ce canal
    if (content && hasChannelKey(channelId)) {
      const payload = await encryptMessage(content, channelId)
      if (payload) {
        // Message chiffré : contenu clair uniquement en local (jamais transmis)
        const localMsg: Message = { ...base, content }
        const wireMsg = { ...base, content: '', encrypted: true, payload }
        msgsRef.current[msgId] = localMsg
        setMessages(sortMsgs(msgsRef.current))
        sendP2PMsg.current?.(wireMsg)
        gun.get('messages').get(roomKey).get(msgId).put(wireMsg) // stocke chiffré
        return
      }
      // encryptMessage a retourné null (erreur crypto) → bloquer l'envoi
      console.error('[E2E] Échec chiffrement, message non envoyé')
      return
    }

    // Pas de clé de canal → envoi en clair (canal non chiffré ou en attente de clé)
    const message: Message = { ...base, content: content || '' }
    msgsRef.current[msgId] = message
    setMessages(sortMsgs(msgsRef.current))
    sendP2PMsg.current?.(message)
    gun.get('messages').get(roomKey).get(msgId).put(message)
  }

  const editMessage = async (msgId: string, newContent: string) => {
    if (!serverId) return
    const roomKey = `${serverId}_${channelId}`

    if (newContent && hasChannelKey(channelId)) {
      const payload = await encryptMessage(newContent, channelId)
      if (payload) {
        // Mise à jour locale avec contenu clair
        const localUpdated = { ...(msgsRef.current[msgId] || {}), content: newContent, edited: true } as Message
        msgsRef.current[msgId] = localUpdated
        setMessages(sortMsgs(msgsRef.current))
        // Envoi chiffré
        const wireUpdated = { ...localUpdated, content: '', encrypted: true, payload }
        sendP2PMsg.current?.(wireUpdated)
        gun.get('messages').get(roomKey).get(msgId).put(wireUpdated)
        return
      }
      console.error('[E2E] Échec chiffrement édition, message non envoyé')
      return
    }

    const updated = { ...(msgsRef.current[msgId] || {}), content: newContent, edited: true } as Message
    msgsRef.current[msgId] = updated
    setMessages(sortMsgs(msgsRef.current))
    sendP2PMsg.current?.(updated)
    gun.get('messages').get(roomKey).get(msgId).get('content').put(newContent)
    gun.get('messages').get(roomKey).get(msgId).get('edited').put(true)
  }

  const deleteMessage = (msgId: string) => {
    if (!serverId) return
    const roomKey = `${serverId}_${channelId}`
    delete msgsRef.current[msgId]
    setMessages(sortMsgs(msgsRef.current))
    gun.get('messages').get(roomKey).get(msgId).put(null)
  }

  const addReaction = (msgId: string, emoji: string, user: string) => {
    if (!serverId) return
    const roomKey = `${serverId}_${channelId}`
    if (!reactionsRef.current[msgId]) reactionsRef.current[msgId] = {}
    reactionsRef.current[msgId][emoji] = [...new Set([...(reactionsRef.current[msgId][emoji] || []), user])]
    setReactions({ ...reactionsRef.current })
    sendP2PReaction.current?.({ msgId, emoji, user })
    gun.get('reactions').get(roomKey).get(msgId).get(emoji).get(user).put(true)
  }

  const removeReaction = (msgId: string, emoji: string, user: string) => {
    if (!serverId) return
    const roomKey = `${serverId}_${channelId}`
    if (reactionsRef.current[msgId]?.[emoji]) {
      reactionsRef.current[msgId][emoji] = reactionsRef.current[msgId][emoji].filter(u => u !== user)
      if (reactionsRef.current[msgId][emoji].length === 0) delete reactionsRef.current[msgId][emoji]
      setReactions({ ...reactionsRef.current })
    }
    sendP2PReaction.current?.({ msgId, emoji, user, remove: true })
    gun.get('reactions').get(roomKey).get(msgId).get(emoji).get(user).put(null)
  }

  const sendTyping = () => {
    if (!serverId) return
    sendP2PTyping.current?.({ user: username, active: true })
    if (typingTimeout.current) clearTimeout(typingTimeout.current)
    typingTimeout.current = setTimeout(() => {
      sendP2PTyping.current?.({ user: username, active: false })
    }, 4000)
  }

  const loadMoreMessages = () => {
    if (historyRef.current.length === 0) return
    const batch = historyRef.current.slice(-PAGE_SIZE)
    historyRef.current = historyRef.current.slice(0, Math.max(0, historyRef.current.length - PAGE_SIZE))
    batch.forEach(m => { msgsRef.current[m.id] = m })
    setHasMore(historyRef.current.length > 0)
    setMessages(sortMsgs(msgsRef.current))
  }

  return {
    messages, reactions, typingUsers, hasMore,
    sendMessage, editMessage, deleteMessage,
    addReaction, removeReaction, sendTyping, loadMoreMessages,
  }
}

export default useSocket
