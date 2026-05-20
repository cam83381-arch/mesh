/**
 * useChannelPermissions
 *
 * Gère les overrides de permission par salon.
 * Stocké dans localStore : channel_perms.json → {serverId: {channelId: ChannelPermOverride[]}}
 *
 * Résolution des permissions (priorité décroissante) :
 *   1. Override utilisateur (deny > allow)
 *   2. Override rôle (deny > allow)
 *   3. Permission globale du rôle (DEFAULT_PERMISSIONS)
 *   4. Fallback : member par défaut
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import type { ChannelPermOverride, CustomRole, Member, Role } from './types'
import { readLocal, writeLocal } from './localStore'
import { joinMeshRoom } from './mesh'

export interface ResolvedChannelPerms {
  canRead: boolean
  canWrite: boolean
  canManage: boolean
}

const PERMS_FILE = 'channel_perms.json'

type PermsData = Record<string, Record<string, ChannelPermOverride[]>>

async function loadOverrides(serverId: string, channelId: string): Promise<ChannelPermOverride[]> {
  const data = await readLocal<PermsData>(PERMS_FILE) || {}
  return data[serverId]?.[channelId] || []
}

async function saveOverrides(serverId: string, channelId: string, overrides: ChannelPermOverride[]) {
  const data = await readLocal<PermsData>(PERMS_FILE) || {}
  if (!data[serverId]) data[serverId] = {}
  data[serverId][channelId] = overrides
  await writeLocal(PERMS_FILE, data)
}

// ── Hook principal ─────────────────────────────────────────────────
function useChannelPermissions(serverId: string, channelId: string) {
  const [overrides, setOverrides] = useState<ChannelPermOverride[]>([])
  const overridesRef = useRef<ChannelPermOverride[]>([])

  useEffect(() => {
    overridesRef.current = []
    setOverrides([])
    if (!serverId || !channelId) return
    let active = true

    loadOverrides(serverId, channelId).then(loaded => {
      if (!active) return
      overridesRef.current = loaded
      setOverrides(loaded)
    })

    // Écouter les mises à jour des permissions via P2P
    const room = joinMeshRoom(`perms_${serverId}`)
    if (room) {
      const [, getPermsUpdate] = (room.makeAction as any)('perms_update') as [any, any]
      getPermsUpdate(async (data: any) => {
        if (!active || data?.channelId !== channelId) return
        const loaded = await loadOverrides(serverId, channelId)
        overridesRef.current = loaded
        setOverrides(loaded)
      })
    }

    return () => { active = false }
  }, [serverId, channelId])

  const setOverride = useCallback(async (override: ChannelPermOverride) => {
    if (!serverId || !channelId) return
    const current = await loadOverrides(serverId, channelId)
    const id = `${override.targetType}_${override.targetId}`
    const idx = current.findIndex(o => `${o.targetType}_${o.targetId}` === id)
    if (idx >= 0) current[idx] = override
    else current.push(override)
    await saveOverrides(serverId, channelId, current)
    overridesRef.current = current
    setOverrides(current)

    const room = joinMeshRoom(`perms_${serverId}`)
    if (room) {
      const [sendPermsUpdate] = (room.makeAction as any)('perms_update') as [any, any]
      try { sendPermsUpdate({ channelId }) } catch (_e) {}
    }
  }, [serverId, channelId])

  const removeOverride = useCallback(async (targetType: string, targetId: string) => {
    if (!serverId || !channelId) return
    const current = await loadOverrides(serverId, channelId)
    const updated = current.filter(o => !(o.targetType === targetType && o.targetId === targetId))
    await saveOverrides(serverId, channelId, updated)
    overridesRef.current = updated
    setOverrides(updated)

    const room = joinMeshRoom(`perms_${serverId}`)
    if (room) {
      const [sendPermsUpdate] = (room.makeAction as any)('perms_update') as [any, any]
      try { sendPermsUpdate({ channelId }) } catch (_e) {}
    }
  }, [serverId, channelId])

  return { overrides, setOverride, removeOverride }
}

// ── Résolution des permissions pour un utilisateur donné ──────────
export function resolveChannelPerms(
  username: string,
  member: Member | undefined,
  _customRoles: CustomRole[],
  overrides: ChannelPermOverride[],
  serverRole: Role = 'member'
): ResolvedChannelPerms {
  // Owners et admins ont toujours accès
  if (serverRole === 'owner' || serverRole === 'admin') {
    return { canRead: true, canWrite: true, canManage: true }
  }
  if (serverRole === 'banned') {
    return { canRead: false, canWrite: false, canManage: false }
  }

  // Appliquer les overrides explicites (utilisateur ou rôle)
  let canRead = true
  let canWrite = true
  let canManage = serverRole === 'moderator'

  for (const override of overrides) {
    const matchUser = override.targetType === 'user' && override.targetId === username
    const matchRole = override.targetType === 'role' && override.targetId === (member?.customRoleId || '')
    if (!matchUser && !matchRole) continue
    // deny prend priorité sur allow
    if (override.deny.canRead === true) canRead = false
    else if (override.allow.canRead === true) canRead = true
    if (override.deny.canWrite === true) canWrite = false
    else if (override.allow.canWrite === true) canWrite = true
    if (override.deny.canManage === true) canManage = false
    else if (override.allow.canManage === true) canManage = true
  }

  return { canRead, canWrite, canManage }
}

export default useChannelPermissions
