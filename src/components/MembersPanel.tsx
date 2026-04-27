import React, { useEffect, useState } from 'react'
import type { Member, Role, CustomRole } from '../types'
import type { Friendship } from '../useFriends'
import MemberTooltip from './MemberTooltip'
import { useApp } from '../context/AppContext'
import { getAvatarGradient } from '../utils/avatarGradient'
import gun from '../gun'

const ROLE_COLORS: Record<Role, string> = {
  owner: '#f47fff',
  admin: '#f23f43',
  moderator: '#23a559',
  member: '#8884c4',
  banned: '#56527e'
}

const ROLE_LABELS: Record<Role, string> = {
  owner: '👑 Propriétaire',
  admin: '🛡️ Admins',
  moderator: '⚔️ Modérateurs',
  member: '👤 Membres',
  banned: '🔨 Bannis'
}

const STATUS_COLORS: Record<string, string> = {
  online: '#23a559',
  idle: '#f0b232',
  dnd: '#f23f43',
  invisible: '#56527e'
}

interface OnlineMember extends Member {
  status?: string
  avatarColor?: string
  avatarImage?: string
  displayName?: string
}

interface Props {
  members: Member[]
  serverId: string
  customRoles: CustomRole[]
  friends?: Friendship[]
  onOpenDM?: (username: string) => void
  onAddFriend?: (username: string) => void
  onRemoveFriend?: (pairId: string) => void
}

function MembersPanel({ members, serverId, customRoles, friends, onOpenDM, onAddFriend, onRemoveFriend }: Props) {
  const { user } = useApp()
  const currentUsername = user?.username || ''
  const [onlineMembers, setOnlineMembers] = useState<Record<string, OnlineMember>>({})
  const [offlineCollapsed, setOfflineCollapsed] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!serverId || members.length === 0) return
    const usernames = members.map(m => m.username)
    const cleanups: (() => void)[] = []

    usernames.forEach(uname => {
      const member = members.find(m => m.username === uname)!
      const ref = gun.get('profiles').get(uname)

      // Full profile load (handles large base64 fields like avatarImage)
      const loadFull = () => {
        ref.once((profile: any) => {
          if (!profile) return
          setOnlineMembers(prev => ({
            ...prev,
            [uname]: {
              ...member,
              status:       profile.status       || 'online',
              avatarColor:  profile.avatarColor   || '#6354ff',
              avatarImage:  profile.avatarImage   || undefined,
              displayName:  profile.displayName   || '',
            }
          }))
        })
      }

      // Initial load
      loadFull()

      // Light fields via .on()
      const lightCb = (profile: any) => {
        if (!profile) return
        setOnlineMembers(prev => {
          const existing = prev[uname] || { ...member }
          return {
            ...prev,
            [uname]: {
              ...existing,
              status:      profile.status      ?? existing.status ?? 'online',
              avatarColor: profile.avatarColor ?? existing.avatarColor ?? '#6354ff',
              displayName: profile.displayName ?? existing.displayName ?? '',
            }
          }
        })
      }
      ref.on(lightCb)

      // updatedAt triggers full re-fetch to catch photo changes
      const updatedAtCb = () => { loadFull() }
      ref.get('updatedAt').on(updatedAtCb)

      cleanups.push(() => {
        ref.off(lightCb)
        ref.get('updatedAt').off(updatedAtCb)
      })
    })

    return () => { cleanups.forEach(fn => fn()) }
  }, [serverId, members.map(m => m.username).join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Groupements ──
  const customRoleGroups: Record<string, { online: OnlineMember[]; offline: OnlineMember[] }> = {}
  customRoles.forEach(r => { customRoleGroups[r.id] = { online: [], offline: [] } })

  const grouped: Record<Role, { online: OnlineMember[]; offline: OnlineMember[] }> = {
    owner: { online: [], offline: [] },
    admin: { online: [], offline: [] },
    moderator: { online: [], offline: [] },
    member: { online: [], offline: [] },
    banned: { online: [], offline: [] }
  }

  members.forEach(m => {
    if (m.role === 'banned') return
    const withProfile = onlineMembers[m.username] || { ...m, status: 'online', avatarColor: '#6354ff' }
    const isOffline = withProfile.status === 'invisible'
    if (m.customRoleId && customRoleGroups[m.customRoleId] !== undefined) {
      isOffline
        ? customRoleGroups[m.customRoleId].offline.push(withProfile)
        : customRoleGroups[m.customRoleId].online.push(withProfile)
    } else {
      isOffline
        ? grouped[m.role].offline.push(withProfile)
        : grouped[m.role].online.push(withProfile)
    }
  })

  const renderMemberRow = (m: OnlineMember, nameColor: string, isOffline = false) => (
    <MemberTooltip
      key={m.username}
      username={m.username}
      currentUsername={currentUsername}
      members={members}
      customRoles={customRoles}
      friends={friends}
      onOpenDM={onOpenDM || (() => {})}
      onAddFriend={onAddFriend}
      onRemoveFriend={onRemoveFriend}
    >
      <div className={`member-entry ${isOffline ? 'offline' : ''}`}>
        <div
          className="member-entry-avatar"
          style={m.avatarImage
            ? { backgroundImage: `url(${m.avatarImage})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundColor: m.avatarColor || '#6354ff', opacity: isOffline ? 0.5 : 1 }
            : { background: getAvatarGradient(m.username, m.avatarColor), opacity: isOffline ? 0.5 : 1 }
          }
        >
          {!m.avatarImage && m.username[0].toUpperCase()}
          <div className="member-entry-status" style={{ background: STATUS_COLORS[m.status || 'online'] }} />
        </div>
        <div className="member-entry-info">
          <span className="member-entry-name" style={{ color: nameColor, opacity: isOffline ? 0.5 : 1 }}>
            {m.displayName || m.username}
          </span>
        </div>
      </div>
    </MemberTooltip>
  )

  const renderGroup = (label: string, nameColor: string, online: OnlineMember[], offline: OnlineMember[]) => {
    if (online.length === 0 && offline.length === 0) return null
    const total = online.length + offline.length
    return (
      <div className="members-group">
        <div className="members-group-title" style={{ color: nameColor }}>
          {label} — {total}
        </div>
        {online.map(m => renderMemberRow(m, nameColor, false))}
        {offline.length > 0 && (
          <div>
            <div
              className="members-group-title"
              style={{ color: '#4e5058', cursor: 'pointer', userSelect: 'none', marginTop: '8px' }}
              onClick={() => setOfflineCollapsed(c => !c)}
            >
              {offlineCollapsed ? '▸' : '▾'} HORS-LIGNE — {offline.length}
            </div>
            {!offlineCollapsed && offline.map(m => renderMemberRow(m, '#4e5058', true))}
          </div>
        )}
      </div>
    )
  }

  const q = search.toLowerCase().trim()
  const filterMembers = (list: OnlineMember[]) =>
    q ? list.filter(m => (m.displayName || m.username).toLowerCase().includes(q)) : list

  return (
    <div className="members-panel">
      <div className="members-panel-title">Membres</div>

      {/* Barre de recherche */}
      <div className="members-search-wrap">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="members-search-icon">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          className="members-search-input"
          placeholder="Rechercher…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {search && (
          <button className="members-search-clear" onClick={() => setSearch('')}>✕</button>
        )}
      </div>

      {/* Rôles custom */}
      {customRoles
        .filter(r => {
          const g = customRoleGroups[r.id]
          if (!g) return false
          return filterMembers(g.online).length > 0 || filterMembers(g.offline).length > 0
        })
        .map(r => (
          <React.Fragment key={r.id}>
            {renderGroup(`🎭 ${r.name}`, r.color, filterMembers(customRoleGroups[r.id].online), filterMembers(customRoleGroups[r.id].offline))}
          </React.Fragment>
        ))
      }

      {/* Rôles système */}
      {(['owner', 'admin', 'moderator', 'member'] as Role[]).map(role => (
        <React.Fragment key={role}>
          {renderGroup(ROLE_LABELS[role], ROLE_COLORS[role], filterMembers(grouped[role].online), filterMembers(grouped[role].offline))}
        </React.Fragment>
      ))}
    </div>
  )
}

export default MembersPanel
