import { useState, useEffect, useRef } from 'react'
import type { Message } from './types'
import gun from './gun'

// ── Helper notification ──
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

export interface DMConversation {
  id: string        // toujours trié alphabétiquement : "alice_bob"
  participants: string[]
  lastMessage?: string
  lastTimestamp?: number
}

function useDMs(username: string, dmPrivacy: 'everyone' | 'friends' = 'everyone', friends: string[] = []) {
  const [conversations, setConversations] = useState<DMConversation[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [activeConv, setActiveConv] = useState<string | null>(null)
  const [unreadDMs, setUnreadDMs] = useState(0)
  const msgsRef = useRef<Record<string, Message>>({})
  const convsRef = useRef<Record<string, DMConversation>>({})
  const seenTimestamps = useRef<Record<string, number>>({}) // convId → dernière timestamp lue

  // Charger les conversations de l'utilisateur
  useEffect(() => {
    if (!username) return

    gun.get('dmConversations').get(username).map().on((convId: string, key: string) => {
      if (!convId) {
        delete convsRef.current[key]
        setConversations(Object.values(convsRef.current)
          .sort((a, b) => (b.lastTimestamp || 0) - (a.lastTimestamp || 0)))
        return
      }

      // .on() déclenche immédiatement avec les données existantes (pas besoin de .once() en amont)
      gun.get('dms').get(convId).on((conv: any) => {
        if (!conv) return
        const updated: DMConversation = {
          id: convId,
          participants: conv.participants ? conv.participants.split(',') : [],
          lastMessage: conv.lastMessage || '',
          lastTimestamp: conv.lastTimestamp || 0
        }
        convsRef.current[convId] = updated
        setConversations(Object.values(convsRef.current)
          .sort((a, b) => (b.lastTimestamp || 0) - (a.lastTimestamp || 0)))

        // Badge non-lu + notification si la conv n'est pas active
        const lastTs = conv.lastTimestamp || 0
        const seen = seenTimestamps.current[convId] || 0
        if (convId !== activeConv && lastTs > seen && conv.lastMessage) {
          seenTimestamps.current[convId] = lastTs
          // Recalculer le badge en comptant toutes les convs avec non-lus
          const unreadCount = Object.entries(convsRef.current).filter(([cId, c]) => {
            const ts = c.lastTimestamp || 0
            const s = seenTimestamps.current[cId] || 0
            return cId !== activeConv && ts > s && c.lastMessage
          }).length
          setUnreadDMs(unreadCount)
          // Notification native DM
          const parts = convId.split('_')
          const sender = parts.find((p: string) => p !== username) || 'Quelqu\'un'
          sendDMNotification(sender, conv.lastMessage)
        }
      })
    })

    return () => {
      gun.get('dmConversations').get(username).map().off()
    }
  }, [username])

  // Charger les messages de la conversation active
  useEffect(() => {
    if (!activeConv) return

    msgsRef.current = {}
    setMessages([])

    gun.get('dmMessages').get(activeConv).map().on((msg: Message, id: string) => {
      if (!msg || !msg.content) {
        delete msgsRef.current[id]
        setMessages(Object.values(msgsRef.current)
          .filter(m => m && m.content)
          .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0)))
        return
      }
      msgsRef.current[id] = { ...msg, id }
      setMessages(Object.values(msgsRef.current)
        .filter(m => m && m.content)
        .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0)))
    })

    return () => {
      gun.get('dmMessages').get(activeConv).map().off()
    }
  }, [activeConv])

  // Créer ou ouvrir une conversation avec un utilisateur
  const openConversation = (otherUser: string) => {
    if (!username || !otherUser || otherUser === username) return
    // Respecter la privacy : si la cible a dmPrivacy=friends, vérifier l'amitié
    // (côté local : si MOI j'ai dmPrivacy=friends, je ne peux envoyer qu'à mes amis)
    // Note: enforcement côté destinataire est géré par GunDB read dans sendDM

    // ID de conv = les deux usernames triés alphabétiquement
    const convId = [username, otherUser].sort().join('_')

    // Créer la conv dans GunDB si elle n'existe pas
    gun.get('dms').get(convId).once((existing: any) => {
      if (!existing || !existing.participants) {
        gun.get('dms').get(convId).put({
          participants: [username, otherUser].sort().join(','),
          lastMessage: '',
          lastTimestamp: Date.now()
        })
      }
    })

    // Lier la conv aux deux participants
    gun.get('dmConversations').get(username).get(convId).put(convId)
    gun.get('dmConversations').get(otherUser).get(convId).put(convId)

    setActiveConv(convId)
    return convId
  }

  const sendDM = (content: string, replyTo?: { id: string; author: string; content: string }) => {
    if (!activeConv || !content.trim() || !username) return
    // Vérifier la privacy de l'expéditeur
    const convParts = activeConv.split('_')
    const recipient = convParts.find((p: string) => p !== username) || ''
    if (dmPrivacy === 'friends' && recipient && !friends.includes(recipient)) {
      console.warn('[DM] Bloque par dmPrivacy=friends:', recipient, 'pas un ami')
      return
    }

    const msgId = Date.now().toString()
    const message: Message = {
      id: msgId,
      channelId: activeConv,
      authorId: username,
      authorName: username,
      content,
      color: '#5865f2',
      time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      timestamp: Date.now(),
      ...(replyTo ? {
        replyToId: replyTo.id,
        replyToAuthor: replyTo.author,
        replyToContent: replyTo.content.slice(0, 100)
      } : {})
    }

    gun.get('dmMessages').get(activeConv).get(msgId).put(message)

    // Mettre à jour le dernier message de la conv
    gun.get('dms').get(activeConv).get('lastMessage').put(content.slice(0, 50))
    gun.get('dms').get(activeConv).get('lastTimestamp').put(Date.now())
  }

  const getOtherUser = (conv: DMConversation) => {
    return conv.participants.find(p => p !== username) || ''
  }

  // Ouvrir une conv et marquer comme lue — recalcule les non-lus des AUTRES convs
  const openConvAndRead = (convId: string) => {
    setActiveConv(convId)
    const conv = convsRef.current[convId]
    if (conv?.lastTimestamp) {
      seenTimestamps.current[convId] = conv.lastTimestamp
    }
    // Recalculer le badge en excluant la conv qu'on vient d'ouvrir
    const remaining = Object.entries(convsRef.current).filter(([cId, c]) => {
      if (cId === convId) return false
      const ts = (c as any).lastTimestamp || 0
      const s = seenTimestamps.current[cId] || 0
      return ts > s && (c as any).lastMessage
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