/**
 * useAllChannelPerms
 *
 * Charge tous les overrides de permission de tous les salons d'un serveur.
 * Structure GunDB : channel_perms.{serverId}.{channelId}.{overrideId}
 *
 * Retourne : Map<channelId, ChannelPermOverride[]>
 */
import { useEffect, useRef, useState } from 'react'
import type { ChannelPermOverride } from './types'
import { resolveChannelPerms } from './useChannelPermissions'
import type { CustomRole, Member } from './types'
import gun from './gun'

function useAllChannelPerms(serverId: string) {
  const [permsMap, setPermsMap] = useState<Record<string, ChannelPermOverride[]>>({})
  const rawRef = useRef<Record<string, Record<string, ChannelPermOverride>>>({})

  useEffect(() => {
    if (!serverId) return
    const g = gun

    // Écouter tous les salons du serveur
    g.get('channel_perms').get(serverId).map().on((chanData: any, channelId: string) => {
      if (!chanData) {
        delete rawRef.current[channelId]
        setPermsMap({ ...rawRef.current } as any)
        return
      }
      if (!rawRef.current[channelId]) rawRef.current[channelId] = {}

      // Écouter chaque override de ce salon
      g.get('channel_perms').get(serverId).get(channelId).map().on((data: any, ovId: string) => {
        if (!data || !data.targetId) {
          delete rawRef.current[channelId]?.[ovId]
        } else {
          rawRef.current[channelId] = rawRef.current[channelId] || {}
          rawRef.current[channelId][ovId] = {
            targetId: data.targetId,
            targetType: data.targetType,
            allow: JSON.parse(data.allow || '{}'),
            deny: JSON.parse(data.deny || '{}'),
          }
        }
        setPermsMap(prev => ({
          ...prev,
          [channelId]: Object.values(rawRef.current[channelId] || {}),
        }))
      })
    })
  }, [serverId]) // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Retourne true si l'utilisateur peut voir ce salon.
   */
  const canAccessChannel = (
    channelId: string,
    username: string,
    member: Member | undefined,
    customRoles: CustomRole[],
  ): boolean => {
    const overrides = permsMap[channelId] || []
    const resolved = resolveChannelPerms(username, member, customRoles, overrides)
    return resolved.canRead
  }

  return { permsMap, canAccessChannel }
}

export default useAllChannelPerms
