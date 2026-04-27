import { useState, useEffect } from 'react'
import type { CustomRole, Permissions } from './types'
import gun from './gun'

const DEFAULT_COLORS = ['#f47fff', '#f23f43', '#23a559', '#5865f2', '#faa61a', '#eb459e', '#57f287']

function useRoles(serverId: string) {
  const [customRoles, setCustomRoles] = useState<CustomRole[]>([])

  useEffect(() => {
    if (!serverId) return

    const rolesRef: Record<string, CustomRole> = {}

    gun.get('roles').get(serverId).map().on((role: CustomRole, id: string) => {
      if (!role || !role.name) {
        delete rolesRef[id]
        setCustomRoles(Object.values(rolesRef).sort((a, b) => b.position - a.position))
        return
      }
      rolesRef[id] = { ...role, id }
      setCustomRoles(Object.values(rolesRef).sort((a, b) => b.position - a.position))
    })

    return () => {
      gun.get('roles').get(serverId).map().off()
    }
  }, [serverId])

  const createRole = (name: string) => {
    if (!serverId || !name.trim()) return
    const id = Date.now().toString()
    const color = DEFAULT_COLORS[customRoles.length % DEFAULT_COLORS.length]
    const role: CustomRole = {
      id,
      name: name.trim(),
      color,
      serverId,
      position: customRoles.length,
      permissions: {
        canSendMessages: true,
        canDeleteMessages: false,
        canManageChannels: false,
        canKickMembers: false,
        canBanMembers: false,
        canManageRoles: false,
        canMuteMembers: false,
      }
    }
    gun.get('roles').get(serverId).get(id).put(role)
  }

  const updateRole = (roleId: string, updates: Partial<Omit<CustomRole, 'id' | 'serverId'>>) => {
    const role = customRoles.find(r => r.id === roleId)
    if (!role) return
    const updated = { ...role, ...updates }
    gun.get('roles').get(serverId).get(roleId).put(updated)
    setCustomRoles(prev => prev.map(r => r.id === roleId ? updated : r))
  }

  const updatePermission = (roleId: string, permission: keyof Permissions, value: boolean) => {
    const role = customRoles.find(r => r.id === roleId)
    if (!role) return
    const updated = {
      ...role,
      permissions: { ...role.permissions, [permission]: value }
    }
    gun.get('roles').get(serverId).get(roleId).put(updated)
    setCustomRoles(prev => prev.map(r => r.id === roleId ? updated : r))
  }

  const deleteRole = (roleId: string) => {
    gun.get('roles').get(serverId).get(roleId).put(null)
    setCustomRoles(prev => prev.filter(r => r.id !== roleId))
  }

  const getRoleById = (roleId: string): CustomRole | undefined => {
    return customRoles.find(r => r.id === roleId)
  }

  return { customRoles, createRole, updateRole, updatePermission, deleteRole, getRoleById }
}

export default useRoles