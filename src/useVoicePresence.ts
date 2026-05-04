/**
 * useVoicePresence.ts — Presence vocale pour TOUS les salons
 * Recoie les evenements Trystero 'voice_presence' diffuses par useStream.ts
 * et construit un map channelId -> membres presents.
 * Utilise par ChannelSidebar pour afficher qui est dans quel salon.
 */

import { useState, useEffect, useRef } from 'react'
import { joinMeshRoom } from './mesh'
import { readLocal } from './localStore'
import type { Channel } from './types'

interface VoicePresenceMember {
  username: string
  isMuted?: boolean
  isDeafened?: boolean
  avatarImage?: string
}

function useVoicePresence(channels: Channel[], serverId: string) {
  const [voicePresence, setVoicePresence] = useState<Record<string, VoicePresenceMember[]>>({})
  const presenceRef = useRef<Record<string, Record<string, { active: boolean; ts: number }>>>({})
  const avatarRef = useRef<Record<string, string>>({})

  useEffect(() => {
    if (!serverId || channels.length === 0) return

    const voiceChannels = channels.filter(c => c.type === 'voice')
    if (voiceChannels.length === 0) return

    let active = true
    const cleanups: (() => void)[] = []

    const rebuildPresence = () => {
      const next: Record<string, VoicePresenceMember[]> = {}
      Object.entries(presenceRef.current).forEach(([channelId, users]) => {
        next[channelId] = Object.entries(users)
          .filter(([, d]) => d.active && (Date.now() - d.ts) < 30000)
          .map(([user]) => ({
            username: user,
            avatarImage: avatarRef.current[user]
          }))
      })
      setVoicePresence(next)
    }

    const loadAvatar = async (username: string) => {
      if (avatarRef.current[username]) return
      const profiles = await readLocal<Record<string, any>>('profiles.json')
      const profile = profiles?.[username]
      if (profile?.avatarImage) {
        avatarRef.current[username] = profile.avatarImage
        rebuildPresence()
      }
    }

    voiceChannels.forEach(channel => {
      if (!presenceRef.current[channel.id]) presenceRef.current[channel.id] = {}

      // Ecouter la presence via Trystero (meme room que useStream joinVoice)
      const room = joinMeshRoom(`voice_${channel.id}`)
      if (!room) return

      const [, getPresence] = (room.makeAction as any)('voice_presence') as [any, any]

      getPresence((data: any) => {
        if (!active || !data?.user) return
        const { user, active: isActive } = data
        if (!presenceRef.current[channel.id]) presenceRef.current[channel.id] = {}

        if (isActive) {
          presenceRef.current[channel.id][user] = { active: true, ts: Date.now() }
          loadAvatar(user)
        } else {
          delete presenceRef.current[channel.id][user]
        }
        rebuildPresence()
      })

      cleanups.push(() => {
        // Pas de cleanup necessaire pour makeAction — le room reste actif
      })
    })

    // Nettoyage stale presence toutes les 15s
    const interval = setInterval(rebuildPresence, 15000)
    cleanups.push(() => clearInterval(interval))

    return () => {
      active = false
      cleanups.forEach(fn => fn())
      presenceRef.current = {}
    }
  }, [serverId, channels.map(c => c.id).join(',')])

  return voicePresence
}

export default useVoicePresence
