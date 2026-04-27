/**
 * useVoicePresence.ts — Lit gun.get('voice_presence') pour TOUS les salons vocaux
 * et construit un map channelId → membres présents.
 * Utilisé par ChannelSidebar pour afficher qui est dans quel salon.
 */

import { useState, useEffect, useRef } from 'react'
import gun from './gun'
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

    const cleanups: (() => void)[] = []

    voiceChannels.forEach(channel => {
      if (!presenceRef.current[channel.id]) presenceRef.current[channel.id] = {}

      const node = gun.get('voice_presence').get(channel.id)

      const handler = (data: any, username: string) => {
        if (!username || username === '_' || !presenceRef.current[channel.id]) return
        const isActive = data && data.active === true && (Date.now() - (data.ts || 0)) < 30000
        if (isActive) {
          presenceRef.current[channel.id][username] = { active: true, ts: data.ts || Date.now() }
          // Charger l'avatar si pas encore chargé
          if (!avatarRef.current[username]) {
            gun.get('profiles').get(username).once((profile: any) => {
              if (profile?.avatarImage) {
                avatarRef.current[username] = profile.avatarImage
                rebuildPresence()
              }
            })
          }
        } else {
          delete presenceRef.current[channel.id][username]
        }
        rebuildPresence()
      }

      node.map().on(handler)
      cleanups.push(() => node.map().off())
    })

    const rebuildPresence = () => {
      const next: Record<string, VoicePresenceMember[]> = {}
      Object.entries(presenceRef.current).forEach(([channelId, users]) => {
        next[channelId] = Object.entries(users)
          .filter(([, d]) => d.active && (Date.now() - d.ts) < 30000)
          .map(([username]) => ({
            username,
            avatarImage: avatarRef.current[username]
          }))
      })
      setVoicePresence(next)
    }

    // Nettoyage stale presence toutes les 15s
    const interval = setInterval(rebuildPresence, 15000)
    cleanups.push(() => clearInterval(interval))

    return () => {
      cleanups.forEach(fn => fn())
      presenceRef.current = {}
    }
  }, [serverId, channels.map(c => c.id).join(',')])

  return voicePresence
}

export default useVoicePresence
