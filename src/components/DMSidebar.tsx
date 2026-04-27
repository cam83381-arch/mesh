import React, { useState, useEffect } from 'react'
import type { DMConversation } from '../useDMs'
import type { Friendship } from '../useFriends'
import gun from '../gun'

const STATUS_COLORS: Record<string, string> = {
  online: '#23a559',
  idle: '#f0b232',
  dnd: '#f23f43',
  invisible: '#56527e'
}

interface Props {
  conversations: DMConversation[]
  activeConv: string | null
  onSelectConv: (convId: string) => void
  onNewDM: (username: string) => void
  getOtherUser: (conv: DMConversation) => string
  friends: Friendship[]
  pendingIncoming: Friendship[]
  pendingSent: Friendship[]
  onAcceptFriend: (pairId: string) => void
  onDeclineFriend: (pairId: string) => void
  onRemoveFriend: (pairId: string) => void
  onOpenFriendDM: (username: string) => void
  onSendFriendRequest: (username: string) => void
  onShowFriends: () => void
  isFriendsPage: boolean
  footer?: React.ReactNode
}

// Avatar avec dot de statut chargé depuis GunDB
function DMConvRow({
  conv, otherUser, isActive, onClick
}: {
  conv: DMConversation
  otherUser: string
  isActive: boolean
  onClick: () => void
}) {
  const [status, setStatus] = useState('invisible')
  const [avatarColor, setAvatarColor] = useState('#6354ff')

  useEffect(() => {
    if (!otherUser) return
    gun.get('profiles').get(otherUser).on((p: any) => {
      if (!p) return
      if (p.status) setStatus(p.status)
      if (p.avatarColor) setAvatarColor(p.avatarColor)
    })
    return () => { gun.get('profiles').get(otherUser).off() }
  }, [otherUser])

  const statusLabel = status === 'online' ? 'En ligne'
    : status === 'idle' ? 'Absent'
    : status === 'dnd' ? 'Ne pas déranger'
    : 'Hors ligne'

  return (
    <div
      className={`dm-conv-row ${isActive ? 'active' : ''}`}
      onClick={onClick}
      title={otherUser}
    >
      <div className="dm-conv-avatar" style={{ background: avatarColor }}>
        {otherUser[0]?.toUpperCase() || '?'}
        <div className="dm-conv-status-dot" style={{ background: STATUS_COLORS[status] }} />
      </div>
      <div className="dm-conv-info">
        <div className="dm-conv-name">{otherUser}</div>
        <div className="dm-conv-sub">
          {conv.lastMessage
            ? <span className="dm-conv-last">{conv.lastMessage.slice(0, 32)}{conv.lastMessage.length > 32 ? '…' : ''}</span>
            : <span style={{ color: '#4e5058' }}>{statusLabel}</span>}
        </div>
      </div>
    </div>
  )
}

function DMSidebar({
  conversations, activeConv, onSelectConv, onNewDM, getOtherUser,
  pendingIncoming, onShowFriends, isFriendsPage, footer
}: Props) {
  const [showNewDM, setShowNewDM] = useState(false)
  const [newDMUser, setNewDMUser] = useState('')
  const pendingCount = pendingIncoming.length

  const handleNewDM = () => {
    if (!newDMUser.trim()) return
    onNewDM(newDMUser.trim())
    setNewDMUser('')
    setShowNewDM(false)
  }

  return (
    <div className="dm-sidebar">
      {/* Barre de recherche / titre */}
      <div className="dm-sidebar-search-box">
        <div className="dm-sidebar-search">
          <span className="dm-search-icon">🔍</span>
          <input
            className="dm-search-input"
            placeholder="Recherche ou lance une convers..."
            readOnly
            onClick={() => setShowNewDM(true)}
          />
        </div>
      </div>

      <div className="dm-sidebar-list">
        {/* Lien Amis */}
        <div
          className={`dm-sidebar-friends-btn ${isFriendsPage ? 'active' : ''}`}
          onClick={onShowFriends}
        >
          <div className="dm-friends-icon">👥</div>
          <span className="dm-friends-label">Amis</span>
          {pendingCount > 0 && (
            <span className="dm-friends-badge">{pendingCount}</span>
          )}
        </div>

        {/* Section Messages Privés */}
        <div className="dm-section-header">
          <span>MESSAGES PRIVÉS</span>
          <button
            className="dm-section-add-btn"
            title="Nouveau message"
            onClick={() => setShowNewDM(v => !v)}
          >+</button>
        </div>

        {showNewDM && (
          <div className="dm-new-conv">
            <input
              className="dm-new-conv-input"
              placeholder="Nom d'utilisateur..."
              value={newDMUser}
              onChange={e => setNewDMUser(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleNewDM()
                if (e.key === 'Escape') setShowNewDM(false)
              }}
              autoFocus
            />
          </div>
        )}

        {/* Liste conversations */}
        {conversations.length === 0 && (
          <div className="dm-empty">
            <div style={{ fontSize: 32, marginBottom: 8 }}>💬</div>
            <div>Aucune conversation</div>
          </div>
        )}

        {conversations.map(conv => {
          const otherUser = getOtherUser(conv)
          return (
            <DMConvRow
              key={conv.id}
              conv={conv}
              otherUser={otherUser}
              isActive={activeConv === conv.id}
              onClick={() => onSelectConv(conv.id)}
            />
          )
        })}
      </div>

      {footer}
    </div>
  )
}

export default DMSidebar
