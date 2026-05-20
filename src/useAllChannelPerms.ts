/**
 * useAllChannelPerms
 *
 * Charge tous les overrides de permission de tous les salons d'un serveur.
 * Source : localStore channel_perms.json → { serverId: { channelId: ChannelPermOverride[] } }
 * Sync P2P : joinMeshRoom('perms_{serverId}') → 'perms_update' → reload
 *
 * Retourne : Map<channelId, ChannelPermOverride[]>
 */
import { useEffect, useRef, useState } from 'react'
import type { ChannelPermOverride, CustomRole, Member } from './types'
import { resolveChannelPerms } from './useChannelPermissions'
import { readLocal } from './localStore'
import { joinMeshRoom } from './mesh'

type PermsData = Record<string, Record<string, ChannelPermOverride[]>>

function useAllChannelPerms(serverId: string) {
  const [permsMap, setPermsMap] = useState<Record<string, ChannelPermOverride[]>>({})
  const activeRef = useRef(true)

  const loadAll = async () => {
    const data = await readLocal<PermsData>('channel_perms.json') || {}
    const serverPerms = data[serverId] || {}
    if (activeRef.current) setPermsMap({ ...serverPerms })
  }

  useEffect(() => {
    if (!serverId) return
    activeRef.current = true

    loadAll()

    // Écouter mises à jour P2P
    const room = joinMeshRoom(`perms_${serverId}`)
    if (room) {
      const [, getPermsUpdate] = (room.makeAction as any)('perms_update') as [any, any]
      getPermsUpdate(() => { if (activeRef.current) loadAll() })
    }

    return () => { activeRef.current = false }
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
    const resolved = resolveChannelPerms(username, member, customRoles, overrides, member?.role)
    return resolved.canRead
  }

  return { permsMap, canAccessChannel }
}

export default useAllChannelPerms
