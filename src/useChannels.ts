/**
 * useChannels.ts — Gestion des canaux serveur
 *
 * Architecture v1.4.x :
 *   - localStore channels.json → persistance locale (source de vérité)
 *   - Trystero makeAction('channels_sync') → sync cross-machine en temps réel
 *   - GunDB : ZÉRO utilisation (peers:[] = pas de sync cross-machine)
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import type { Channel } from './types'
import { readLocal, writeLocal } from './localStore'
import { joinMeshRoom } from './mesh'

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

function sortChannels(list: Channel[]): Channel[] {
  return [...list].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'text' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

function useChannels(serverId: string) {
  const [channels, setChannels] = useState<Channel[]>([])
  const [currentChannel, setCurrentChannel] = useState<Channel | null>(null)
  const channelsRef = useRef<Record<string, Channel>>({})
  const sendSyncRef = useRef<((c: object) => void) | null>(null)

  useEffect(() => {
    setCurrentChannel(null)
    setChannels([])
    channelsRef.current = {}
    sendSyncRef.current = null
    if (!serverId) return

    let active = true

    // ── Room P2P dédiée aux settings (canaux, rôles, paramètres serveur) ──
    const settingsRoom = joinMeshRoom(`settings_${serverId}`)

    if (settingsRoom) {
      const [sendSync, getSync] = (settingsRoom.makeAction as any)('channels_sync') as [any, any]
      sendSyncRef.current = (c: object) => { try { sendSync(c) } catch (_e) {} }

      // Recevoir les mises à jour de canaux d'un pair
      getSync(async (data: any) => {
        if (!active) return

        if (data?.action === 'full_list' && Array.isArray(data.channels)) {
          // Réception d'une liste complète (onPeerJoin)
          data.channels.forEach((ch: Channel) => {
            if (ch?.id && ch?.name) channelsRef.current[ch.id] = ch
          })
          const updated = sortChannels(Object.values(channelsRef.current))
          setChannels(updated)
          await saveChannels(serverId, updated)

        } else if (data?.action === 'upsert' && data.channel?.id) {
          // Création ou mise à jour d'un canal
          channelsRef.current[data.channel.id] = data.channel
          const updated = sortChannels(Object.values(channelsRef.current))
          setChannels(updated)
          await saveChannels(serverId, updated)

        } else if (data?.action === 'delete' && data.channelId) {
          // Suppression d'un canal
          delete channelsRef.current[data.channelId]
          const updated = sortChannels(Object.values(channelsRef.current))
          setChannels(updated)
          await saveChannels(serverId, updated)
        }
      })

      // Quand un nouveau pair rejoint → lui envoyer la liste complète
      settingsRoom.onPeerJoin(() => {
        if (!active) return
        const list = Object.values(channelsRef.current)
        if (list.length > 0) {
          try { sendSync({ action: 'full_list', channels: list }) } catch (_e) {}
        }
      })
    }

    const load = async () => {
      const local = await loadChannels(serverId)
      if (!active) return
      local.forEach(ch => { channelsRef.current[ch.id] = ch })
      setChannels(sortChannels(local))
    }

    load()

    return () => {
      active = false
      sendSyncRef.current = null
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
    if (!serverId || !name.trim()) return null
    const id = `ch_${Date.now()}`
    const channel: Channel = {
      id, name: name.trim(), type, serverId,
      categoryId: categoryId || undefined,
      userLimit: 0
    }

    channelsRef.current[id] = channel
    const updated = sortChannels(Object.values(channelsRef.current))
    await saveChannels(serverId, updated)
    setChannels(updated)

    // Propager via Trystero aux pairs connectés
    sendSyncRef.current?.({ action: 'upsert', channel })
    return channel
  }, [serverId])

  const updateChannel = useCallback(async (channelId: string, updates: Partial<Channel>) => {
    if (!serverId || !channelId) return
    if (channelsRef.current[channelId]) {
      channelsRef.current[channelId] = { ...channelsRef.current[channelId], ...updates }
    }
    const updated = sortChannels(Object.values(channelsRef.current))
    await saveChannels(serverId, updated)
    setChannels(updated)

    // Propager via Trystero
    sendSyncRef.current?.({ action: 'upsert', channel: channelsRef.current[channelId] })
  }, [serverId])

  const deleteChannel = useCallback(async (channelId: string) => {
    if (!serverId || !channelId) return
    delete channelsRef.current[channelId]
    const updated = sortChannels(Object.values(channelsRef.current))
    await saveChannels(serverId, updated)
    setChannels(updated)
    if (currentChannel?.id === channelId) setCurrentChannel(null)

    // Propager via Trystero
    sendSyncRef.current?.({ action: 'delete', channelId })
  }, [serverId, currentChannel])

  return { channels, currentChannel, setCurrentChannel, updateChannel, createChannel, deleteChannel }
}

export default useChannels
