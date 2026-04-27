/**
 * useSocket.ts — Transport P2P pur via Trystero (WebRTC + trackers BitTorrent)
 *
 * Architecture :
 *   - Trystero  → transport temps réel entre pairs (messages, réactions, typing)
 *   - GunDB     → cache local radisk (historique, persistance offline)
 *   - Zéro serveur central entre utilisateurs
 */

import { useEffect, useState, useRef } from 'react'
import gun from './gun'
import { joinMeshRoom } from './mesh'
import type { Message } from './types'

interface AutoModConfig {
  words: string
  action: 'delete' | 'warn' | 'both'
  enabled: boolean
}

function useSocket(channelId: string, username: string, serverId: string, myProfile?: any) {
  const [messages, setMessages] = useState<Message[]>([])
  const [reactions, setReactions] = useState<Record<string, Record<string, string[]>>>({})
  const [typingUsers, setTypingUsers] = useState<string[]>([])
  const msgsRef = useRef<Record<string, Message>>({})
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

    // ── Trystero P2P ──
    const room = joinMeshRoom(roomKey, myProfile)

    if (room) {
      // makeAction<any> contourne la contrainte DataPayload pour nos objets custom
      const [sendMsg, getMsg] = (room.makeAction as any)('msg') as [any, any]
      const [sendReaction, getReaction] = (room.makeAction as any)('reaction') as [any, any]
      const [sendTypingFn, getTyping] = (room.makeAction as any)('typing') as [any, any]

      sendP2PMsg.current = (msg: Message) => { try { sendMsg(msg) } catch {} }
      sendP2PReaction.current = (r: object) => { try { sendReaction(r) } catch {} }
      sendP2PTyping.current = (t: object) => { try { sendTypingFn(t) } catch {} }

      // Réception messages P2P
      getMsg((msg: any) => {
        if (!active || !msg || !msg.content || !msg.id) return
        msgsRef.current[msg.id] = { ...msg }
        setMessages(sortMsgs(msgsRef.current))
        gun.get('messages').get(roomKey).get(msg.id).put(msg)
      })

      // Réception réactions P2P
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

      // Réception typing P2P
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

    // ── AutoMod ──
    gun.get('automod').get(serverId).on((data: AutoModConfig) => {
      if (!active) return
      if (data) automodRef.current = data
    })

    // ── Historique depuis radisk ──
    gun.get('messages').get(roomKey).map().once((msg: Message, id: string) => {
      if (!active || !msg || !msg.content) return
      msgsRef.current[id] = { ...msg, id }
      setMessages(sortMsgs(msgsRef.current))
    })

    // ── Réactions depuis radisk ──
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

    // Nettoyage typing expiré
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
      try { gun.get('messages').get(roomKey).map().off() } catch {}
      try { gun.get('automod').get(serverId).off() } catch {}
      try { gun.get('reactions').get(roomKey).map().off() } catch {}
    }
  }, [channelId, serverId])

  // ── AutoMod ──
  const checkAutoMod = (content: string): boolean => {
    const cfg = automodRef.current
    if (!cfg || !cfg.enabled || !cfg.words.trim()) return false
    const banned = cfg.words.split(',').map(w => w.trim().toLowerCase()).filter(Boolean)
    const hit = banned.some(w => content.toLowerCase().includes(w))
    if (!hit) return false
    if (cfg.action === 'warn' || cfg.action === 'both') {
      const warnId = 'warn_' + Date.now()
      const warn: Message = {
        id: warnId, author: '🛡️ AutoMod',
        content: '⚠️ Ton message contient un mot interdit et a été bloqué.',
        color: '#f0b232',
        time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        timestamp: Date.now(),
      }
      msgsRef.current[warnId] = warn
      setMessages(sortMsgs(msgsRef.current))
      setTimeout(() => {
        delete msgsRef.current[warnId]
        setMessages(sortMsgs(msgsRef.current))
      }, 5000)
    }
    return cfg.action === 'delete' || cfg.action === 'both'
  }

  const sendMessage = (
    content: string,
    replyTo?: { id: string; author: string; content: string },
    fileUrl?: string, fileName?: string, fileType?: string, fileSize?: number
  ) => {
    if (!serverId) return
    if (!content.trim() && !fileUrl) return
    if (content && checkAutoMod(content)) return

    const roomKey = `${serverId}_${channelId}`
    const msgId = Date.now().toString()
    const message: Message = {
      id: msgId, author: username, content: content || '',
      color: '#5865f2',
      time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      timestamp: Date.now(),
      ...(replyTo ? { replyTo } : {}),
      ...(fileUrl ? { fileUrl, fileName, fileType, fileSize } : {})
    }
    msgsRef.current[msgId] = message
    setMessages(sortMsgs(msgsRef.current))
    sendP2PMsg.current?.(message)
    gun.get('messages').get(roomKey).get(msgId).put(message)
  }

  const editMessage = (msgId: string, newContent: string) => {
    if (!serverId) return
    const roomKey = `${serverId}_${channelId}`
    const updated = { ...(msgsRef.current[msgId] || {}), content: newContent + ' ✏️' } as Message
    msgsRef.current[msgId] = updated
    setMessages(sortMsgs(msgsRef.current))
    sendP2PMsg.current?.(updated)
    gun.get('messages').get(roomKey).get(msgId).get('content').put(newContent + ' ✏️')
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

  return {
    messages, reactions, typingUsers,
    sendMessage, editMessage, deleteMessage,
    addReaction, removeReaction, sendTyping,
  }
}

export default useSocket

export default useSocket
