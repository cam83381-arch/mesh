/**
 * useDMs.ts - Messages directs P2P
 *
 * Persistance : localStore dms.json (conversations + messages)
 * Transport temps reel : Trystero makeAction('dm_message') via joinMeshRoom
 * GunDB : ZERO utilisation -- supprime
 */

import { useState, useEffect, useRef } from 'react'
import type { Message } from './types'
import { readLocal, writeLocal } from './localStore'
import { joinMeshRoom } from './mesh'
import {
  initECDH,
  getECDHPublicKey,
  deriveSharedSecret,
  hasSharedSecret,
  encryptDM,
  decryptDM,
  type EncryptedPayload,
} from './crypto'

// -- Types --
export interface DMConversation {
  id: string              // toujours trie alphabetiquement : "alice_bob"
  participants: string[]
  lastMessage?: string
  lastTimestamp?: number
}

interface DMStore {
  conversations: Record<string, DMConversation>
  messages: Record<string, Record<string, Message>>
}

// -- Helpers localStore --
async function loadDMStore(): Promise<DMStore> {
  const data = await readLocal<DMStore>('dms.json')
  return data || { conversations: {}, messages: {} }
}

async function saveDMStore(store: DMStore): Promise<void> {
  await writeLocal('dms.json', store)
}

// -- Notification desktop --
function sendDMNotification(from: string, content: string) {
  if ((window as any).electron?.showNotification) {
    (window as any).electron.showNotification(`Message de ${from}`, content.slice(0, 80))
  } else if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(`Message de ${from}`, {
      body: content.slice(0, 80),
      icon: '/favicon.svg'
    })
  }
}

// -- Hook principal --
function useDMs(
  username: string,
  dmPrivacy: 'everyone' | 'friends' = 'everyone',
  friends: string[] = []
) {
  const [conversations, setConversations] = useState<DMConversation[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [activeConv, setActiveConvState] = useState<string | null>(null)
  const [unreadDMs, setUnreadDMs] = useState(0)

  const msgsRef = useRef<Record<string, Message>>({})
  const convsRef = useRef<Record<string, DMConversation>>({})
  const seenTimestamps = useRef<Record<string, number>>({})
  const activeConvRef = useRef<string | null>(null)

  // -- Charger conversations + ecouter DMs entrants via Trystero --
  useEffect(() => {
    if (!username) return
    let active = true

    // 1. Charger depuis localStore
    const load = async () => {
      const store = await loadDMStore()
      if (!active) return
      const myConvs = Object.values(store.conversations).filter(c =>
        c.participants.includes(username)
      )
      myConvs.forEach(c => { convsRef.current[c.id] = c })
      setConversations(
        myConvs.sort((a, b) => (b.lastTimestamp || 0) - (a.lastTimestamp || 0))
      )
    }
    load()

    // 2. Initialiser ECDH et écouter les DMs entrants via Trystero
    initECDH().then(() => {
      if (!active) return

      const dmRoom = joinMeshRoom(`dm_inbox_${username}`)
      if (!dmRoom) return

      const [sendKeyEx, getKeyEx] = (dmRoom.makeAction as any)('dm_keyex') as [any, any]
      const [, getDMMsg]          = (dmRoom.makeAction as any)('dm_message') as [any, any]
      const [, getDMConv]         = (dmRoom.makeAction as any)('dm_conv') as [any, any]

      // ── Échange de clés ECDH ──
      // Recevoir la clé publique ECDH d'un pair
      getKeyEx(async (payload: { username: string; ecdhPublicKey: string }) => {
        if (!active || !payload?.username || !payload?.ecdhPublicKey) return
        await deriveSharedSecret(payload.username, payload.ecdhPublicKey)
        // Répondre avec notre clé si le pair ne l'a pas encore
        const myECDHKey = getECDHPublicKey()
        if (myECDHKey) {
          try { sendKeyEx({ username, ecdhPublicKey: myECDHKey }) } catch (_e) {}
        }
      })

      // ── Recevoir un message DM chiffré ──
      getDMMsg(async (msg: any) => {
        if (!active || !msg?.id || !msg?.convId) return
        if (!msg.participants?.includes(username)) return

        // Déchiffrement E2E
        let content: string
        if (msg.encrypted && msg.iv && msg.ciphertext) {
          const sender = msg.participants.find((p: string) => p !== username) || ''
          const plain = await decryptDM(
            { iv: msg.iv, ciphertext: msg.ciphertext } as EncryptedPayload,
            sender
          )
          if (plain === null) {
            console.warn('[E2E] Impossible de déchiffrer le message de', sender)
            return
          }
          content = plain
        } else {
          // Message legacy non chiffré — accepté avec avertissement
          if (!msg.content) return
          content = msg.content
          console.warn('[E2E] Message non chiffré reçu (pair legacy)')
        }

        const finalMsg: Message = { ...msg, content, encrypted: undefined, iv: undefined, ciphertext: undefined }

        const store = await loadDMStore()

        // Créer la conv si absente
        if (!store.conversations[msg.convId]) {
          store.conversations[msg.convId] = {
            id: msg.convId,
            participants: msg.participants,
            lastMessage: content.slice(0, 50),
            lastTimestamp: msg.timestamp
          }
        } else {
          store.conversations[msg.convId].lastMessage = content.slice(0, 50)
          store.conversations[msg.convId].lastTimestamp = msg.timestamp
        }

        // Sauvegarder le message déchiffré
        if (!store.messages[msg.convId]) store.messages[msg.convId] = {}
        store.messages[msg.convId][msg.id] = finalMsg
        await saveDMStore(store)

        convsRef.current[msg.convId] = store.conversations[msg.convId]
        setConversations(
          Object.values(convsRef.current)
            .filter(c => c.participants.includes(username))
            .sort((a, b) => (b.lastTimestamp || 0) - (a.lastTimestamp || 0))
        )

        if (activeConvRef.current === msg.convId) {
          msgsRef.current[msg.id] = finalMsg
          setMessages(
            Object.values(msgsRef.current)
              .filter(m => m?.content)
              .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
          )
        } else {
          const sender = msg.participants.find((p: string) => p !== username) || 'Quelqu\'un'
          sendDMNotification(sender, content)
          setUnreadDMs(prev => prev + 1)
        }
      })

      // ── Recevoir une création de conv ──
      getDMConv(async (conv: any) => {
        if (!active || !conv?.id || !conv?.participants?.includes(username)) return

        // L'expéditeur nous envoie aussi sa clé ECDH dans le paquet conv
        if (conv.ecdhPublicKey && conv.fromUsername) {
          await deriveSharedSecret(conv.fromUsername, conv.ecdhPublicKey)
          // Répondre avec notre clé
          const myECDHKey = getECDHPublicKey()
          if (myECDHKey) {
            try { sendKeyEx({ username, ecdhPublicKey: myECDHKey }) } catch (_e) {}
          }
        }

        const store = await loadDMStore()
        if (!store.conversations[conv.id]) {
          const { ecdhPublicKey: _, fromUsername: __, ...cleanConv } = conv
          store.conversations[conv.id] = cleanConv
          await saveDMStore(store)
          convsRef.current[conv.id] = cleanConv
          setConversations(
            Object.values(convsRef.current)
              .filter(c => c.participants.includes(username))
              .sort((a, b) => (b.lastTimestamp || 0) - (a.lastTimestamp || 0))
          )
        }
      })
    })

    return () => { active = false }
  }, [username])

  // -- Charger les messages de la conv active --
  useEffect(() => {
    activeConvRef.current = activeConv
    if (!activeConv) {
      setMessages([])
      msgsRef.current = {}
      return
    }

    let active = true
    msgsRef.current = {}
    setMessages([])

    const load = async () => {
      const store = await loadDMStore()
      if (!active) return
      const convMsgs = store.messages[activeConv] || {}
      msgsRef.current = { ...convMsgs }
      setMessages(
        Object.values(convMsgs)
          .filter(m => m?.content)
          .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
      )
      // Marquer comme lu
      const conv = store.conversations[activeConv]
      if (conv?.lastTimestamp) seenTimestamps.current[activeConv] = conv.lastTimestamp
    }
    load()

    return () => { active = false }
  }, [activeConv])

  // -- Creer ou ouvrir une conversation --
  const openConversation = async (otherUser: string) => {
    if (!username || !otherUser || otherUser === username) return
    const convId = [username, otherUser].sort().join('_')

    const store = await loadDMStore()
    if (!store.conversations[convId]) {
      const conv: DMConversation = {
        id: convId,
        participants: [username, otherUser].sort(),
        lastMessage: '',
        lastTimestamp: Date.now()
      }
      store.conversations[convId] = conv
      await saveDMStore(store)
      convsRef.current[convId] = conv
      setConversations(
        Object.values(convsRef.current)
          .filter(c => c.participants.includes(username))
          .sort((a, b) => (b.lastTimestamp || 0) - (a.lastTimestamp || 0))
      )

      // Notifier l'autre pair qu'une conv est ouverte + envoyer notre clé ECDH
      const theirRoom = joinMeshRoom(`dm_inbox_${otherUser}`)
      if (theirRoom) {
        const [sendConv] = (theirRoom.makeAction as any)('dm_conv') as [any, any]
        const myECDHKey = getECDHPublicKey()
        try {
          sendConv({
            ...conv,
            ecdhPublicKey: myECDHKey || undefined,
            fromUsername: username,
          })
        } catch (_e) {}
      }
    }

    setActiveConvState(convId)
    return convId
  }

  // -- Envoyer un DM --
  const sendDM = async (
    content: string,
    replyTo?: { id: string; author: string; content: string }
  ) => {
    if (!activeConv || !content.trim() || !username) return

    const recipient = activeConv.split('_').find((p: string) => p !== username) || ''
    if (dmPrivacy === 'friends' && recipient && !friends.includes(recipient)) {
      console.warn('[DM] Bloque par dmPrivacy=friends:', recipient)
      return
    }

    const conv = convsRef.current[activeConv]
    const msgId = Date.now().toString()
    const message: Message = {
      id: msgId,
      channelId: activeConv,
      authorId: username,
      authorName: username,
      author: username,
      content,
      color: '#5865f2',
      time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      timestamp: Date.now(),
      convId: activeConv,
      participants: conv?.participants || [username, recipient],
      ...(replyTo ? {
        replyToId: replyTo.id,
        replyToAuthor: replyTo.author,
        replyToContent: replyTo.content.slice(0, 100)
      } : {})
    }

    // Optimiste : afficher immediatement
    msgsRef.current[msgId] = message
    setMessages(
      Object.values(msgsRef.current)
        .filter(m => m?.content)
        .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
    )

    // Persister localement
    const store = await loadDMStore()
    if (!store.messages[activeConv]) store.messages[activeConv] = {}
    store.messages[activeConv][msgId] = message
    if (store.conversations[activeConv]) {
      store.conversations[activeConv].lastMessage = content.slice(0, 50)
      store.conversations[activeConv].lastTimestamp = Date.now()
    }
    await saveDMStore(store)

    // Mettre a jour la liste convs
    if (convsRef.current[activeConv]) {
      convsRef.current[activeConv].lastMessage = content.slice(0, 50)
      convsRef.current[activeConv].lastTimestamp = Date.now()
      setConversations(
        Object.values(convsRef.current)
          .filter(c => c.participants.includes(username))
          .sort((a, b) => (b.lastTimestamp || 0) - (a.lastTimestamp || 0))
      )
    }

    // Envoyer via Trystero — chiffré si possible
    if (recipient) {
      const theirRoom = joinMeshRoom(`dm_inbox_${recipient}`)
      if (theirRoom) {
        const [sendMsg]   = (theirRoom.makeAction as any)('dm_message') as [any, any]
        const [sendKeyEx] = (theirRoom.makeAction as any)('dm_keyex')   as [any, any]

        // Si pas encore de secret partagé → envoyer notre clé ECDH d'abord
        if (!hasSharedSecret(recipient)) {
          const myECDHKey = getECDHPublicKey()
          if (myECDHKey) {
            try { sendKeyEx({ username, ecdhPublicKey: myECDHKey }) } catch (_e) {}
          }
        }

        // Chiffrer si secret disponible, sinon envoyer en clair (legacy)
        const encrypted = await encryptDM(content, recipient)
        if (encrypted) {
          const { content: _c, ...msgWithoutContent } = message
          try {
            sendMsg({
              ...msgWithoutContent,
              encrypted: true,
              iv: encrypted.iv,
              ciphertext: encrypted.ciphertext,
            })
          } catch (_e) {}
        } else {
          // Fallback non chiffré (secret pas encore dérivé)
          try { sendMsg(message) } catch (_e) {}
          console.warn('[E2E] Message envoyé en clair — secret pas encore disponible avec', recipient)
        }
      }
    }
  }

  const getOtherUser = (conv: DMConversation) =>
    conv.participants.find(p => p !== username) || ''

  // Ouvrir une conv et recalculer les non-lus
  const openConvAndRead = (convId: string) => {
    setActiveConvState(convId)
    const conv = convsRef.current[convId]
    if (conv?.lastTimestamp) seenTimestamps.current[convId] = conv.lastTimestamp
    const remaining = Object.entries(convsRef.current).filter(([cId, c]) => {
      if (cId === convId) return false
      const ts = c.lastTimestamp || 0
      const s = seenTimestamps.current[cId] || 0
      return ts > s && c.lastMessage
    }).length
    setUnreadDMs(remaining)
  }

  return {
    conversations,
    messages,
    activeConv,
    setActiveConv: openConvAndRead,
    openConversation,
    sendDM,
    getOtherUser,
    unreadDMs
  }
}

export default useDMs
