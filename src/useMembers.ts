import { useState, useEffect } from 'react'
import type { Member, Role } from './types'
import gun from './gun'

function useMembers(serverId: string, username: string) {
  const [members, setMembers] = useState<Member[]>([])
  const [isKicked, setIsKicked] = useState(false)

  useEffect(() => {
    setIsKicked(false) // reset à chaque changement de serveur pour éviter les faux positifs

    if (!serverId || !username) return

    const membersRef: Record<string, Member> = {}

    gun.get('members').get(serverId).map().on((member: Member, id: string) => {
      if (!member || !member.username) {
        delete membersRef[id]
        setMembers(Object.values(membersRef))
        return
      }
      membersRef[id] = member
      setMembers(Object.values(membersRef))

      if (member.username === username && member.role === 'banned') {
        setIsKicked(true)
      }
    })

    gun.get('kicked').get(serverId).get(username).on((kicked: boolean) => {
      if (kicked === true) {
        setIsKicked(true)
        // Effacer le flag pour éviter les déclenchements persistants
        gun.get('kicked').get(serverId).get(username).put(null)
      }
    })

    // Auto-réparer : si l'utilisateur courant est le owner du serveur mais pas dans les membres,
    // l'ajouter comme owner (fix pour les serveurs créés avant ce correctif)
    gun.get('servers').get(serverId).once((server: any) => {
      if (server && server.ownerId === username) {
        gun.get('members').get(serverId).get(username).once((existing: any) => {
          if (!existing || !existing.username) {
            gun.get('members').get(serverId).get(username).put({ username, role: 'owner', joinedAt: Date.now() })
          }
        })
      }
    })

    return () => {
      gun.get('members').get(serverId).map().off()
      gun.get('kicked').get(serverId).get(username).off()
    }
  }, [serverId, username])

  const updateRole = (targetUsername: string, role: Role) => {
    gun.get('members').get(serverId).get(targetUsername).get('role').put(role)
    setMembers(prev => prev.map(m =>
      m.username === targetUsername ? { ...m, role } : m
    ))
  }

  const kickMember = (targetUsername: string) => {
    gun.get('members').get(serverId).get(targetUsername).put(null)
    gun.get('kicked').get(serverId).get(targetUsername).put(true)
    gun.get('userServers').get(targetUsername).get(serverId).put(null)
    setMembers(prev => prev.filter(m => m.username !== targetUsername))
  }

  const getMemberRole = (targetUsername: string): Role => {
    const member = members.find(m => m.username === targetUsername)
    return member?.role || 'member'
  }

  const assignCustomRole = (targetUsername: string, roleId: string | undefined) => {
    gun.get('members').get(serverId).get(targetUsername).get('customRoleId').put(roleId || null)
    setMembers(prev => prev.map(m =>
      m.username === targetUsername ? { ...m, customRoleId: roleId } : m
    ))
  }

  return { members, updateRole, kickMember, getMemberRole, isKicked, assignCustomRole }
}

export default useMembers