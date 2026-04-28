import { useState, useEffect, useRef } from 'react'
import type { Friendship } from '../useFriends'
import gun from '../gun'

const STATUS_COLORS: Record<string, string> = {
  online: '#23a559',
  idle: '#f0b232',
  dnd: '#f23f43',
  invisible: '#56527e'
}

type Tab = 'online' | 'all' | 'pending' | 'add'

interface Props {
  friends: Friendship[]
  pendingIncoming: Friendship[]
  pendingSent: Friendship[]
  onAcceptFriend: (pairId: string) => void
  onDeclineFriend: (pairId: string) => void
  onRemoveFriend: (pairId: string) => void
  onOpenFriendDM: (username: string) => void
  onSendFriendRequest: (username: string) => void
}

function FriendCard({
  friendship,
  onOpenDM,
  onRemove,
  onAccept,
  onDecline,
  type
}: {
  friendship: Friendship
  onOpenDM: (u: string) => void
  onRemove?: (pairId: string) => void
  onAccept?: (pairId: string) => void
  onDecline?: (pairId: string) => void
  type: 'friend' | 'pending-in' | 'pending-out'
}) {
  const [status, setStatus] = useState('invisible')
  const [avatarColor, setAvatarColor] = useState('#6354ff')
  const [customStatus, setCustomStatus] = useState('')
  const [showMenu, setShowMenu] = useState(false)

  useEffect(() => {
    if (!friendship.otherUser) return
    gun.get('profiles').get(friendship.otherUser).on((p: any) => {
      if (!p) return
      if (p.status) setStatus(p.status)
      if (p.avatarColor) setAvatarColor(p.avatarColor)
      if (p.customStatus !== undefined) setCustomStatus(p.customStatus || '')
    })
    return () => { gun.get('profiles').get(friendship.otherUser).off() }
  }, [friendship.otherUser])

  const statusLabel = status === 'online' ? 'En ligne'
    : status === 'idle' ? 'Absent'
    : status === 'dnd' ? 'Ne pas déranger'
    : 'Hors ligne'

  const subLabel = customStatus || statusLabel

  return (
    <div className="fp-friend-row" onMouseLeave={() => setShowMenu(false)}>
      <div className="fp-avatar" style={{ background: avatarColor }}>
        {friendship.otherUser[0]?.toUpperCase() || '?'}
        <div className="fp-status-dot" style={{ background: STATUS_COLORS[status] }} />
      </div>
      <div className="fp-info">
        <div className="fp-name">{friendship.otherUser}</div>
        <div className="fp-sub" style={{ color: STATUS_COLORS[status] }}>
          {type === 'pending-in' ? <span style={{ color: '#56527e' }}>{"Demande d'ami reçue"}</span>
           : type === 'pending-out' ? <span style={{ color: '#56527e' }}>Demande envoyée</span>
           : subLabel}
        </div>
      </div>
      <div className="fp-actions">
        {type === 'friend' && (
          <>
            <button
              className="fp-action-btn"
              title="Envoyer un message"
              onClick={() => onOpenDM(friendship.otherUser)}
            >
              💬
            </button>
            <button
              className="fp-action-btn"
              title="Plus d'options"
              onClick={() => setShowMenu(v => !v)}
            >
              ⋯
            </button>
            {showMenu && (
              <div className="fp-context-menu">
                <button
                  className="fp-context-item"
                  onClick={() => { onOpenDM(friendship.otherUser); setShowMenu(false) }}
                >
                  💬 Envoyer un message
                </button>
                <div className="fp-context-divider" />
                <button
                  className="fp-context-item danger"
                  onClick={() => {
                    setShowMenu(false)
                    if (confirm(`Retirer ${friendship.otherUser} de tes amis ?`)) onRemove?.(friendship.pairId)
                  }}
                >
                  Retirer des amis
                </button>
                <button
                  className="fp-context-item danger"
                  onClick={() => {
                    setShowMenu(false)
                    if (confirm(`Bloquer ${friendship.otherUser} ?`)) onRemove?.(friendship.pairId)
                  }}
                >
                  Bloquer
                </button>
              </div>
            )}
          </>
        )}
        {type === 'pending-in' && (
          <>
            <button className="fp-action-btn accept" title="Accepter" onClick={() => onAccept?.(friendship.pairId)}>✓</button>
            <button className="fp-action-btn danger" title="Refuser" onClick={() => onDecline?.(friendship.pairId)}>✕</button>
          </>
        )}
        {type === 'pending-out' && (
          <button className="fp-action-btn danger" title="Annuler" onClick={() => onDecline?.(friendship.pairId)}>✕</button>
        )}
      </div>
    </div>
  )
}

function FriendsPage({
  friends, pendingIncoming, pendingSent,
  onAcceptFriend, onDeclineFriend, onRemoveFriend, onOpenFriendDM, onSendFriendRequest
}: Props) {
  const [tab, setTab] = useState<Tab>('online')
  const [onlineStatuses, setOnlineStatuses] = useState<Record<string, string>>({})
  const [addFriendInput, setAddFriendInput] = useState('')
  const [addFriendMsg, setAddFriendMsg] = useState('')
  const [addFriendError, setAddFriendError] = useState('')
  const [addFriendLoading, setAddFriendLoading] = useState(false)
  const [search, setSearch] = useState('')
  const addFriendInputRef = useRef<HTMLInputElement>(null)

  // Focus automatique sur l'input quand on ouvre le tab "add"
  useEffect(() => {
    if (tab === 'add') {
      setTimeout(() => addFriendInputRef.current?.focus(), 50)
    }
  }, [tab])

  useEffect(() => {
    const all = [...friends, ...pendingIncoming, ...pendingSent]
    const usernames = all.map(f => f.otherUser)
    usernames.forEach(u => {
      gun.get('profiles').get(u).on((p: any) => {
        if (!p) return
        setOnlineStatuses(prev => ({ ...prev, [u]: p.status || 'invisible' }))
      })
    })
    return () => {
      usernames.forEach(u => gun.get('profiles').get(u).off())
    }
  }, [friends.map(f => f.otherUser).join(','), pendingIncoming.length, pendingSent.length])

  const onlineFriends = friends.filter(f => {
    const s = onlineStatuses[f.otherUser]
    return s === 'online' || s === 'idle' || s === 'dnd'
  })

  const displayedFriends = tab === 'online' ? onlineFriends : friends
  const filtered = displayedFriends.filter(f =>
    f.otherUser.toLowerCase().includes(search.toLowerCase())
  )

  const handleAddFriend = async () => {
    const target = addFriendInput.trim()
    if (!target) return
    setAddFriendError('')
    setAddFriendMsg('')
    setAddFriendLoading(true)

    const exists = await new Promise<boolean>((resolve) => {
      const tid = setTimeout(() => resolve(false), 4000)
      gun.get('userIndex').get(target.toLowerCase()).once((data: any) => {
        clearTimeout(tid)
        resolve(!!(data && data.exists))
      })
    })

    if (!exists) {
      setAddFriendError(`Aucun utilisateur trouvé avec le pseudo « ${target} ». Vérifie l'orthographe.`)
      setAddFriendLoading(false)
      return
    }

    onSendFriendRequest(target)
    setAddFriendMsg(`Demande d'ami envoyée à ${target} !`)
    setAddFriendInput('')
    setAddFriendLoading(false)
    setTimeout(() => setAddFriendMsg(''), 4000)
  }

  return (
    <div className="friends-page">
      <div className="friends-page-header">
        <div className="friends-page-title">
          <span className="friends-page-icon">👥</span>
          <span>Amis</span>
        </div>
        <div className="friends-page-tabs">
          <button className={`fp-tab ${tab === 'online' ? 'active' : ''}`} onClick={() => setTab('online')}>
            En ligne
          </button>
          <button className={`fp-tab ${tab === 'all' ? 'active' : ''}`} onClick={() => setTab('all')}>
            Tous
          </button>
          <button
            className={`fp-tab ${tab === 'pending' ? 'active' : ''}`}
            onClick={() => setTab('pending')}
          >
            En attente
            {(pendingIncoming.length + pendingSent.length) > 0 && (
              <span className="fp-tab-badge">{pendingIncoming.length + pendingSent.length}</span>
            )}
          </button>
          <button
            className={`fp-tab add ${tab === 'add' ? 'active' : ''}`}
            onClick={() => setTab('add')}
          >
            Ajouter un ami
          </button>
        </div>
      </div>

      <div className="friends-page-body">
        {tab === 'add' && (
          <div className="fp-add-section">
            <div className="fp-add-title">AJOUTER UN AMI</div>
            <div className="fp-add-subtitle">
              Tu peux ajouter des amis avec leur nom d&apos;utilisateur.
            </div>
            <div className="fp-add-input-row">
              <input
                ref={addFriendInputRef}
                className="fp-add-input"
                placeholder="Nom d'utilisateur"
                value={addFriendInput}
                onChange={e => { setAddFriendInput(e.target.value); setAddFriendMsg('') }}
                onKeyDown={e => e.key === 'Enter' && handleAddFriend()}
                autoComplete="off"
                spellCheck={false}
              />
              <button
                className="fp-add-btn"
                onClick={handleAddFriend}
                disabled={!addFriendInput.trim() || addFriendLoading}
              >
                {addFriendLoading ? 'Vérification…' : "Envoyer une demande d'ami"}
              </button>
            </div>
            {addFriendMsg && (
              <div className="fp-add-success">✓ {addFriendMsg}</div>
            )}
            {addFriendError && (
              <div className="fp-add-error">⚠ {addFriendError}</div>
            )}
          </div>
        )}

        {tab === 'pending' && (
          <div className="fp-list-section">
            <div className="fp-list-header">EN ATTENTE — {pendingIncoming.length + pendingSent.length}</div>
            {pendingIncoming.length === 0 && pendingSent.length === 0 && (
              <div className="fp-empty">{"Aucune demande d'ami en attente."}</div>
            )}
            {pendingIncoming.map(f => (
              <FriendCard
                key={f.pairId} friendship={f} type="pending-in"
                onOpenDM={onOpenFriendDM}
                onAccept={onAcceptFriend}
                onDecline={onDeclineFriend}
              />
            ))}
            {pendingSent.length > 0 && (
              <>
                <div className="fp-list-header" style={{ marginTop: 16 }}>{"EN ATTENTE D'ACCEPTATION"} — {pendingSent.length}</div>
                {pendingSent.map(f => (
                  <FriendCard
                    key={f.pairId} friendship={f} type="pending-out"
                    onOpenDM={onOpenFriendDM}
                    onDecline={onDeclineFriend}
                  />
                ))}
              </>
            )}
          </div>
        )}

        {(tab === 'online' || tab === 'all') && (
          <div className="fp-list-section">
            <div className="fp-search-row">
              <input
                className="fp-search"
                placeholder="Rechercher"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <div className="fp-list-header">
              {tab === 'online' ? 'EN LIGNE' : 'TOUS LES AMIS'} — {filtered.length}
            </div>
            {filtered.length === 0 ? (
              <div className="fp-empty">
                {tab === 'online' ? 'Aucun ami en ligne.' : "Aucun ami pour l'instant."}
              </div>
            ) : (
              filtered.map(f => (
                <FriendCard
                  key={f.pairId} friendship={f} type="friend"
                  onOpenDM={onOpenFriendDM}
                  onRemove={onRemoveFriend}
                />
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default FriendsPage
