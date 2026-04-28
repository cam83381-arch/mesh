import { useState, useEffect, useCallback, useRef } from 'react'
import type { Member, Role } from './types'
import { readLocal, writeLocal } from './localStore'
import gun from './gun'
import { joinMeshRoom } from './mesh'

const MEMBERS_FILE = 'members.json'

async function loadMembers(serverId: string): Promise<Member[]> {
  const data = await readLocal<Record<string, Member[]>>(MEMBERS_FILE) || {}
  return data[serverId] || []
}

async function saveMembers(serverId: string, members: Member[]) {
  const data = await readLocal<Record<string, Member[]>>(MEMBERS_FILE) || {}
  data[serverId] = members
  await writeLocal(MEMBERS_FILE, data)
}

function useMembers(serverId: string, username: string) {
  const [members, setMembers] = useState<Member[]>([])
  const [isKicked, setIsKicked] = useState(false)
  const sendPresenceRef = useRef<((m: Member) => void) | null>(null)

  useEffect(() => {
    setIsKicked(false)
    setMembers([])
    if (!serverId || !username) return

    let active = true
    const membersRef: Record<string, Member> = {}

    // ── Room P2P dédiée à la présence des membres ──
    const presenceRoomKey = `presence_${serverId}`
    const room = joinMeshRoom(presenceRoomKey)

    if (room) {
      const [sendPresence, getPresence] = (room.makeAction as any)('member_join') as [any, any]
      sendPresenceRef.current = (m: Member) => { try { sendPresence(m) } catch {} }

      // Recevoir la présence d'un pair → écrire dans GunDB local
      getPresence((member: any) => {
        if (!active || !member?.username) return
        membersRef[member.username] = member
        setMembers(Object.values(membersRef))
        gun.get('members').get(serverId).get(member.username).put(member)
        saveMembers(serverId, Object.values(membersRef))
      })

      // Quand un nouveau pair rejoint, lui renvoyer notre présence + tous les membres connus
      room.onPeerJoin(() => {
        if (!active) return
        // Broadcaster tous les membres qu'on connaît pour que le pair ait la liste complète
        Object.values(membersRef).forEach(m => {
          try { sendPresence(m) } catch {}
        })
      })
    }

    const load = async () => {
      // 1. Charger depuis fichier local (instantané)
      const local = await loadMembers(serverId)
      if (!active) return
      local.forEach(m => { membersRef[m.username] = m })
      setMembers(local)

      // S'assurer que l'utilisateur courant est dans la liste
      gun.get('servers').get(serverId).once((server: any) => {
        if (!active) return
        const role = server?.ownerId === username ? 'owner' : 'member'
        const existing = membersRef[username]
        const me: Member = existing || { username, role, joinedAt: Date.now() }
        if (!existing) {
          membersRef[username] = me
          gun.get('members').get(serverId).get(username).put(me)
          const updated = Object.values(membersRef)
          setMembers(updated)
          saveMembers(serverId, updated)
        }
        // Broadcaster notre présence aux pairs
        sendPresenceRef.current?.(me)
        // Re-broadcaster toutes les 30s pour les pairs qui arrivent plus tard
        const interval = setInterval(() => {
          if (!active) { clearInterval(interval); return }
          sendPresenceRef.current?.(membersRef[username] || me)
        }, 30_000)
        return () => clearInterval(interval)
      })

      // 2. Écouter GunDB pour les membres qui rejoignent en temps réel
      gun.get('members').get(serverId).map().on(async (member: any, id: string) => {
        if (!active) return
        if (!member?.username) {
          delete membersRef[id]
        } else {
          membersRef[id] = member
        }
        const updated = Object.values(membersRef)
        setMembers(updated)
        await saveMembers(serverId, updated)

        if (member?.username === username && member?.role === 'banned') {
          setIsKicked(true)
        }
      })

      // Écouter kick
      gun.get('kicked').get(serverId).get(username).on((kicked: boolean) => {
        if (kicked === true) {
          setIsKicked(true)
          gun.get('kicked').get(serverId).get(username).put(null)
        }
      })

      // Écouter ban temporaire AutoMod
      gun.get('tempbans').get(serverId).get(username).on((data: any) => {
        if (!active || !data?.bannedUntil) return
        const remaining = data.bannedUntil - Date.now()
        if (remaining <= 0) {
          // Ban expiré — nettoyer
          gun.get('tempbans').get(serverId).get(username).put(null)
          return
        }
        setIsKicked(true)
        // Lever le ban automatiquement à expiration
        setTimeout(() => {
          if (!active) return
          gun.get('tempbans').get(serverId).get(username).put(null)
          setIsKicked(false)
        }, remaining)
      })
    }

    load()

    return () => {
      active = false
      sendPresenceRef.current = null
      try { gun.get('members').get(serverId).map().off() } catch {}
      try { gun.get('kicked').get(serverId).get(username).off() } catch {}
      try { gun.get('tempbans').get(serverId).get(username).off() } catch {}
    }
  }, [serverId, username])

  const updateRole = useCallback((targetUsername: string, role: Role) => {
    gun.get('members').get(serverId).get(targetUsername).get('role').put(role)
    setMembers(prev => prev.map(m => m.username === targetUsername ? { ...m, role } : m))
  }, [serverId])

  const kickMember = useCallback((targetUsername: string) => {
    gun.get('members').get(serverId).get(targetUsername).put(null)
    gun.get('kicked').get(serverId).get(targetUsername).put(true)
    gun.get('userServers').get(targetUsername).get(serverId).put(null)
    setMembers(prev => prev.filter(m => m.username !== targetUsername))
  }, [serverId])

  const assignCustomRole = useCallback((targetUsername: string, roleId: string | undefined) => {
    gun.get('members').get(serverId).get(targetUsername).get('customRoleId').put(roleId || null)
    setMembers(prev => prev.map(m => m.username === targetUsername ? { ...m, customRoleId: roleId } : m))
  }, [serverId])

  const getMemberRole = useCallback((targetUsername: string): Role => {
    return members.find(m => m.username === targetUsername)?.role || 'member'
  }, [members])

  return { members, isKicked, updateRole, kickMember, getMemberRole, assignCustomRole }
}

export default useMembers
