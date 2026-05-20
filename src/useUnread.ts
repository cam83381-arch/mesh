import { useState, useEffect, useRef } from 'react'
import type { Channel, Message } from './types'
import { joinMeshRoom } from './mesh'

function useUnread(serverId: string, channels: Channel[], currentChannelId: string, currentUsername: string) {
  const [unreadByChannel, setUnreadByChannel] = useState<Record<string, number>>({})
  const countedRef = useRef<Record<string, Set<string>>>({})
  const cleanupRef = useRef<Array<() => void>>([])

  const getLastRead = (channelId: string): number =>
    parseInt(localStorage.getItem(`lastRead_${channelId}`) || '0')

  const markRead = (channelId: string) => {
    localStorage.setItem(`lastRead_${channelId}`, Date.now().toString())
    countedRef.current[channelId] = new Set()
    setUnreadByChannel(prev => ({ ...prev, [channelId]: 0 }))
  }

  // Reset + cleanup des listeners au changement de serveur
  useEffect(() => {
    cleanupRef.current.forEach(fn => fn())
    cleanupRef.current = []
    countedRef.current = {}
    setUnreadByChannel({})
  }, [serverId])

  // S'abonner aux messages de chaque salon texte via Trystero
  useEffect(() => {
    if (!serverId || channels.length === 0) return

    // Cleanup des anciens listeners d'abord
    cleanupRef.current.forEach(fn => fn())
    cleanupRef.current = []
    countedRef.current = {}

    channels.filter(c => c.type === 'text').forEach(channel => {
      const lrKey = `lastRead_${channel.id}`
      if (!localStorage.getItem(lrKey)) {
        localStorage.setItem(lrKey, Date.now().toString())
      }

      if (!countedRef.current[channel.id]) {
        countedRef.current[channel.id] = new Set()
      }

      const roomKey = `${serverId}_${channel.id}`
      const room = joinMeshRoom(roomKey)
      if (!room) return

      let active = true
      const [, getMsg] = (room.makeAction as any)('msg') as [any, (cb: (data: Message, peerId: string) => void) => void]

      getMsg((msg: Message) => {
        if (!active) return
        if (!msg || !msg.content || !msg.timestamp) return
        if ((msg.author || (msg as any).authorName) === currentUsername) return

        const msgId = msg.id || `${msg.timestamp}_${msg.author}`
        if (countedRef.current[channel.id]?.has(msgId)) return

        const lastRead = getLastRead(channel.id)
        if ((msg.timestamp || 0) > lastRead && channel.id !== currentChannelId) {
          countedRef.current[channel.id].add(msgId)
          setUnreadByChannel(prev => ({ ...prev, [channel.id]: (prev[channel.id] || 0) + 1 }))
        }
      })

      cleanupRef.current.push(() => { active = false })
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
