import { useState, useEffect } from 'react'
import type { Channel } from './types'
import gun from './gun'

function useChannels(serverId: string) {
  const [channels, setChannels] = useState<Channel[]>([])
  const [currentChannel, setCurrentChannel] = useState<Channel | null>(null)

  useEffect(() => {
    setCurrentChannel(null)
    setChannels([])

    if (!serverId) return

    let active = true
    const channelsRef: Record<string, Channel> = {}

    const applyChannel = (channel: any, id: string) => {
      if (!active) return
      if (!channel || !channel.name) {
        delete channelsRef[id]
      } else {
        channelsRef[id] = { ...channel, id }
      }
      const sorted = Object.values(channelsRef).sort((a: any, b: any) => {
        if (a.type !== b.type) return a.type === 'text' ? -1 : 1
        return a.name.localeCompare(b.name)
      })
      setChannels(sorted as Channel[])
    }

    const ref = gun.get('channels').get(serverId)

    ref.map().once((channel: any, id: string) => {
      if (channel && channel.name) applyChannel(channel, id)
    })

    ref.map().on(applyChannel)

    return () => {
      active = false
      ref.map().off()
    }
  }, [serverId])

  useEffect(() => {
    if (!currentChannel && channels.length > 0) {
      const first = channels.find(c => c.type === 'text') || channels[0]
      setCurrentChannel(first)
    }
  }, [channels, currentChannel])

  const updateChannel = (channelId: string, updates: Partial<Channel>) => {
    if (!serverId || !channelId) return
    gun.get('channels').get(serverId).get(channelId).put(updates)
  }

  const createChannel = (name: string, type: 'text' | 'voice', categoryId?: string) => {
    if (!serverId || !name.trim()) return
    const id = `ch_${Date.now()}`
    gun.get('channels').get(serverId).get(id).put({
      id, name: name.trim(), type, serverId,
      categoryId: categoryId || null,
      userLimit: 0
    })
  }

  const deleteChannel = (channelId: string) => {
    if (!serverId || !channelId) return
    gun.get('channels').get(serverId).get(channelId).put(null)
    if (currentChannel?.id === channelId) setCurrentChannel(null)
  }

  return { channels, currentChannel, setCurrentChannel, updateChannel, createChannel, deleteChannel }
}

export default useChannels
