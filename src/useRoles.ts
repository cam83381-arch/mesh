import { useState, useEffect, useRef } from 'react'
import type { CustomRole, Permissions } from './types'
import { readLocal, writeLocal } from './localStore'
import { joinMeshRoom } from './mesh'

const FILE = 'roles.json'
const DEFAULT_COLORS = ['#f47fff', '#f23f43', '#23a559', '#5865f2', '#faa61a', '#eb459e', '#57f287']

async function loadRoles(serverId: string): Promise<Record<string, CustomRole>> {
  const data = await readLocal<Record<string, Record<string, CustomRole>>>(FILE) || {}
  return data[serverId] || {}
}

async function saveRoles(serverId: string, roles: Record<string, CustomRole>) {
  const data = await readLocal<Record<string, Record<string, CustomRole>>>(FILE) || {}
  data[serverId] = roles
  await writeLocal(FILE, data)
}

function useRoles(serverId: string) {
  const [customRoles, setCustomRoles] = useState<CustomRole[]>([])
  const sendRoleFn = useRef<((data: any) => void) | null>(null)

  const sortRoles = (roles: Record<string, CustomRole>) =>
    Object.values(roles).sort((a, b) => b.position - a.position)

  // ── Charger depuis disque + setup Trystero sync ──────────────
  useEffect(() => {
    if (!serverId) return
    let active = true

    loadRoles(serverId).then(roles => {
      if (!active) return
      setCustomRoles(sortRoles(roles))
    })

    // Trystero room pour sync cross-machine
    const room = joinMeshRoom(`roles_${serverId}`)
    if (room) {
      const [sendRole, getRole] = (room.makeAction as any)('role_update') as [any, any]
      sendRoleFn.current = sendRole

      // Recevoir un rôle mis à jour / supprimé depuis un pair
      getRole(async (role: any) => {
        if (!active || !role?.id) return
        const roles = await loadRoles(serverId)
        if (role._deleted) {
          delete roles[role.id]
        } else {
          roles[role.id] = role
        }
        await saveRoles(serverId, roles)
        setCustomRoles(sortRoles(roles))
      })

      // Quand un nouveau pair rejoint, lui envoyer tous nos rôles
      room.onPeerJoin(async () => {
        const roles = await loadRoles(serverId)
        Object.values(roles).forEach(r => {
          try { sendRole(r) } catch {}
        })
      })
    }

    return () => { active = false }
  }, [serverId])

  const createRole = async (name: string) => {
    if (!serverId || !name.trim()) return
    const id = Date.now().toString()
    const color = DEFAULT_COLORS[customRoles.length % DEFAULT_COLORS.length]
    const role: CustomRole = {
      id, name: name.trim(), color, serverId, position: customRoles.length,
      permissions: {
        canSendMessages: true, canDeleteMessages: false,
        canManageChannels: false, canKickMembers: false,
        canBanMembers: false, canManageRoles: false, canMuteMembers: false,
      }
    }
    const roles = await loadRoles(serverId)
    roles[id] = role
    await saveRoles(serverId, roles)
    setCustomRoles(sortRoles(roles))
    try { sendRoleFn.current?.(role) } catch {}
  }

  const updateRole = async (roleId: string, updates: Partial<Omit<CustomRole, 'id' | 'serverId'>>) => {
    const roles = await loadRoles(serverId)
    if (!roles[roleId]) return
    roles[roleId] = { ...roles[roleId], ...updates }
    await saveRoles(serverId, roles)
    setCustomRoles(sortRoles(roles))
    try { sendRoleFn.current?.(roles[roleId]) } catch {}
  }

  const updatePermission = async (roleId: string, permission: keyof Permissions, value: boolean) => {
    const roles = await loadRoles(serverId)
    if (!roles[roleId]) return
    roles[roleId] = { ...roles[roleId], permissions: { ...roles[roleId].permissions, [permission]: value } }
    await saveRoles(serverId, roles)
    setCustomRoles(sortRoles(roles))
    try { sendRoleFn.current?.(roles[roleId]) } catch {}
  }

  const deleteRole = async (roleId: string) => {
    const roles = await loadRoles(serverId)
    const deleted = roles[roleId]
    delete roles[roleId]
    await saveRoles(serverId, roles)
    setCustomRoles(sortRoles(roles))
    if (deleted) {
      try { sendRoleFn.current?.({ ...deleted, _deleted: true }) } catch {}
    }
  }

  const getRoleById = (roleId: string): CustomRole | undefined =>
    customRoles.find(r => r.id === roleId)

  return { customRoles, createRole, updateRole, updatePermission, deleteRole, getRoleById }
}

export default useRoles
