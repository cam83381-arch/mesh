import { useState, useEffect, useRef } from 'react'
import type { Channel } from './types'
import gun from './gun'

function useUnread(serverId: string, channels: Channel[], currentChannelId: string, currentUsername: string) {
  const [unreadByChannel, setUnreadByChannel] = useState<Record<string, number>>({})
  const countedRef = useRef<Record<string, Set<string>>>({})
  const subscribedRef = useRef<Set<string>>(new Set())

  const getLastRead = (channelId: string): number =>
    parseInt(localStorage.getItem(`lastRead_${channelId}`) || '0')

  const markRead = (channelId: string) => {
    localStorage.setItem(`lastRead_${channelId}`, Date.now().toString())
    countedRef.current[channelId] = new Set()
    setUnreadByChannel(prev => ({ ...prev, [channelId]: 0 }))
  }

  // Reset + cleanup des listeners au changement de serveur
  useEffect(() => {
    subscribedRef.current.forEach(channelId => {
      const roomKey = `${serverId}_${channelId}`
      gun.get('messages').get(roomKey).map().off()
    })
    subscribedRef.current = new Set()
    countedRef.current = {}
    setUnreadByChannel({})
  }, [serverId])

  // S'abonner aux messages de chaque salon texte
  useEffect(() => {
    if (!serverId || channels.length === 0) return

    channels.filter(c => c.type === 'text').forEach(channel => {
      if (subscribedRef.current.has(channel.id)) return
      subscribedRef.current.add(channel.id)

      const lrKey = `lastRead_${channel.id}`
      if (!localStorage.getItem(lrKey)) {
        localStorage.setItem(lrKey, Date.now().toString())
      }

      if (!countedRef.current[channel.id]) {
        countedRef.current[channel.id] = new Set()
      }

      const roomKey = `${serverId}_${channel.id}`
      gun.get('messages').get(roomKey).map().on((msg: any, msgId: string) => {
        if (!msg || !msg.content || !msg.timestamp) return
        if ((msg.author || msg.authorName) === currentUsername) return
        if (countedRef.current[channel.id]?.has(msgId)) return

        const lastRead = getLastRead(channel.id)
        if ((msg.timestamp || 0) > lastRead) {
          countedRef.current[channel.id].add(msgId)
          setUnreadByChannel(prev => ({ ...prev, [channel.id]: (prev[channel.id] || 0) + 1 }))
        }
      })
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId, channels.map(c => c.id).join(','), currentUsername])

  // Marquer le salon courant comme lu
  useEffect(() => {
    if (currentChannelId) markRead(currentChannelId)
  }, [currentChannelId]) // eslint-disable-line react-hooks/exhaustive-deps

  const totalUnread = Object.values(unreadByChannel).reduce((s, n) => s + n, 0)

  return { unreadByChannel, markRead, totalUnread }
}

export default useUnread
