/**
 * useChannelPermissions
 *
 * Gère les overrides de permission par salon.
 * Stocké dans GunDB : channel_perms.{serverId}.{channelId}.{overrideId}
 *
 * Résolution des permissions (priorité décroissante) :
 *   1. Override utilisateur (deny > allow)
 *   2. Override rôle (deny > allow)
 *   3. Permission globale du rôle (DEFAULT_PERMISSIONS)
 *   4. Fallback : member par défaut
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import type { ChannelPermOverride, CustomRole, Member, Role } from './types'
import { DEFAULT_PERMISSIONS } from './types'
import gun from './gun'

export interface ResolvedChannelPerms {
  canRead: boolean
  canWrite: boolean
  canManage: boolean
}

// ── Hook principal ─────────────────────────────────────────────────
function useChannelPermissions(serverId: string, channelId: string) {
  const [overrides, setOverrides] = useState<ChannelPermOverride[]>([])
  // useRef pour que la map survive aux re-renders sans se réinitialiser
  const overridesRef = useRef<Record<string, ChannelPermOverride>>({})

  useEffect(() => {
    overridesRef.current = {} // reset propre au changement de salon/serveur
    if (!serverId || !channelId) return
    const g = gun
    g.get('channel_perms').get(serverId).get(channelId).map().on((data: any, id: string) => {
      if (!data || !data.targetId) {
        delete overridesRef.current[id]
      } else {
        overridesRef.current[id] = {
          targetId: data.targetId,
          targetType: data.targetType,
          allow: JSON.parse(data.allow || '{}'),
          deny: JSON.parse(data.deny || '{}'),
        }
      }
      setOverrides(Object.values(overridesRef.current))
    })
  }, [serverId, channelId]) // eslint-disable-line react-hooks/exhaustive-deps

  const setOverride = useCallback((override: ChannelPermOverride) => {
    if (!serverId || !channelId) return
    const id = `${override.targetType}_${override.targetId}`
    const g = gun
    g.get('channel_perms').get(serverId).get(channelId).get(id).put({
      targetId: override.targetId,
      targetType: override.targetType,
      allow: JSON.stringify(override.allow),
      deny: JSON.stringify(override.deny),
    })
  }, [serverId, channelId])

  const removeOverride = useCallback((targetType: string, targetId: string) => {
    if (!serverId || !channelId) return
    const id = `${targetType}_${targetId}`
    gun.get('channel_perms').get(serverId).get(channelId).get(id).put(null)
  }, [serverId, channelId])

  return { overrides, setOverride, removeOverride }
}

// ── Résolution des permissions pour un utilisateur donné ──────────
export function resolveChannelPerms(
  username: string,
  member: Member | undefined,
  _customRoles: CustomRole[],
  overrides: ChannelPermOverride[],
): ResolvedChannelPerms {
  // Permissions globales de base (rôle système)
  const sysRole: Role = member?.role || 'member'
  const base = DEFAULT_PERMISSIONS[sysRole]

  // Propriétaire → tout autorisé, aucun override possible
  if (sysRole === 'owner') return { canRead: true, canWrite: true, canManage: true }
  if (sysRole === 'banned') return { canRead: false, canWrite: false, canManage: false }

  // Résolution initiale depuis permissions globales
  let canRead = true   // par défaut tout le monde peut lire
  let canWrite = base.canSendMessages
  let canManage = base.canDeleteMessages

  // Appliquer overrides de rôle
  const roleId = member?.customRoleId
  if (roleId) {
    const roleOverride = overrides.find(o => o.targetType === 'role' && o.targetId === roleId)
    if (roleOverride) {
      if (roleOverride.deny.canRead === true) canRead = false
      if (roleOverride.deny.canWrite === true) canWrite = false
      if (roleOverride.deny.canManage === true) canManage = false
      if (roleOverride.allow.canRead === true) canRead = true
      if (roleOverride.allow.canWrite === true) canWrite = true
      if (roleOverride.allow.canManage === true) canManage = true
    }
  }

  // Appliquer overrides utilisateur (priorité max)
  const userOverride = overrides.find(o => o.targetType === 'user' && o.targetId === username)
  if (userOverride) {
    if (userOverride.deny.canRead === true) canRead = false
    if (userOverride.deny.canWrite === true) canWrite = false
    if (userOverride.deny.canManage === true) canManage = false
    if (userOverride.allow.canRead === true) canRead = true
    if (userOverride.allow.canWrite === true) canWrite = true
    if (userOverride.allow.canManage === true) canManage = true
  }

  return { canRead, canWrite, canManage }
}

export default useChannelPermissions
