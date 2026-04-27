import { useState, useEffect, useCallback } from 'react'
import type { Channel } from './types'
import { readLocal, writeLocal } from './localStore'
import gun from './gun'

const CHANNELS_FILE = 'channels.json'

async function loadChannels(serverId: string): Promise<Channel[]> {
  const data = await readLocal<Record<string, Channel[]>>(CHANNELS_FILE) || {}
  return data[serverId] || []
}

async function saveChannels(serverId: string, channels: Channel[]) {
  const data = await readLocal<Record<string, Channel[]>>(CHANNELS_FILE) || {}
  data[serverId] = channels
  await writeLocal(CHANNELS_FILE, data)
}

function useChannels(serverId: string) {
  const [channels, setChannels] = useState<Channel[]>([])
  const [currentChannel, setCurrentChannel] = useState<Channel | null>(null)

  useEffect(() => {
    setCurrentChannel(null)
    setChannels([])
    if (!serverId) return

    let active = true

    const load = async () => {
      // 1. Charger depuis fichier local (instantané)
      const local = await loadChannels(serverId)
      if (!active) return

      const sorted = [...local].sort((a, b) => {
        if (a.type !== b.type) return a.type === 'text' ? -1 : 1
        return a.name.localeCompare(b.name)
      })
      if (sorted.length > 0) setChannels(sorted)

      // 2. Écouter GunDB pour les mises à jour en temps réel (nouveaux canaux d'autres membres)
      const channelsRef: Record<string, Channel> = {}
      sorted.forEach(ch => { channelsRef[ch.id] = ch })

      gun.get('channels').get(serverId).map().on(async (channel: any, id: string) => {
        if (!active) return
        if (!channel?.name) {
          delete channelsRef[id]
        } else {
          channelsRef[id] = { ...channel, id }
        }
        const updated = Object.values(channelsRef).sort((a, b) => {
          if (a.type !== b.type) return a.type === 'text' ? -1 : 1
          return a.name.localeCompare(b.name)
        })
        setChannels(updated)
        await saveChannels(serverId, updated)
      })
    }

    load()

    return () => {
      active = false
      try { gun.get('channels').get(serverId).map().off() } catch {}
    }
  }, [serverId])

  // Auto-sélectionner le premier canal texte
  useEffect(() => {
    if (!currentChannel && channels.length > 0) {
      const first = channels.find(c => c.type === 'text') || channels[0]
      setCurrentChannel(first)
    }
  }, [channels, currentChannel])

  const createChannel = useCallback(async (name: string, type: 'text' | 'voice', categoryId?: string) => {
    if (!serverId || !name.trim()) return
    const id = `ch_${Date.now()}`
    const channel: Channel = {
      id, name: name.trim(), type, serverId,
      categoryId: categoryId || undefined,
      userLimit: 0
    }

    // Sauvegarder localement immédiatement
    const current = await loadChannels(serverId)
    const updated = [...current, channel].sort((a, b) => {
      if (a.type !== b.type) return a.type === 'text' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    await saveChannels(serverId, updated)
    setChannels(updated)

    // Publier sur GunDB pour les autres membres
    gun.get('channels').get(serverId).get(id).put(channel)
  }, [serverId])

  const updateChannel = useCallback((channelId: string, updates: Partial<Channel>) => {
    if (!serverId || !channelId) return
    gun.get('channels').get(serverId).get(channelId).put(updates)
    setChannels(prev => prev.map(ch => ch.id === channelId ? { ...ch, ...updates } : ch))
  }, [serverId])

  const deleteChannel = useCallback(async (channelId: string) => {
    if (!serverId || !channelId) return
    gun.get('channels').get(serverId).get(channelId).put(null)
    const current = await loadChannels(serverId)
    await saveChannels(serverId, current.filter(ch => ch.id !== channelId))
    setChannels(prev => prev.filter(ch => ch.id !== channelId))
    if (currentChannel?.id === channelId) setCurrentChannel(null)
  }, [serverId, currentChannel])

  return { channels, currentChannel, setCurrentChannel, updateChannel, createChannel, deleteChannel }
}

export default useChannels
