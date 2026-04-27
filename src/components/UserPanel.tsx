import { useState } from 'react'
import type { Status, UserProfile } from '../types'

interface Props {
  profile: UserProfile
  onUpdateStatus: (status: Status) => void
  onUpdateCustomStatus: (status: string) => void
  onLogout: () => void
  onOpenSettings?: () => void
  isMuted?: boolean
  isDeafened?: boolean
  onToggleMute?: () => void
  onToggleDeafen?: () => void
}

const STATUS_OPTIONS: { value: Status; label: string; color: string }[] = [
  { value: 'online', label: 'En ligne', color: '#23a559' },
  { value: 'idle', label: 'Absent', color: '#f0b232' },
  { value: 'dnd', label: 'Ne pas déranger', color: '#f23f43' },
  { value: 'invisible', label: 'Invisible', color: '#80848e' },
]

const STATUS_COLORS: Record<Status, string> = {
  online: '#23a559',
  idle: '#f0b232',
  dnd: '#f23f43',
  invisible: '#80848e'
}

function UserPanel({ profile, onUpdateStatus, onUpdateCustomStatus, onLogout, onOpenSettings, isMuted = false, isDeafened = false, onToggleMute, onToggleDeafen }: Props) {
  const [showMenu, setShowMenu] = useState(false)
  const [editingStatus, setEditingStatus] = useState(false)
  const [customStatusInput, setCustomStatusInput] = useState(profile?.customStatus || '')

  if (!profile?.username) {
    return (
      <div className="user-panel-bar">
        <div className="upb-avatar" style={{ background: '#5865f2', opacity: 0.5 }}>?</div>
        <div className="upb-info">
          <div className="upb-name">Chargement...</div>
        </div>
      </div>
    )
  }

  const handleCustomStatus = () => {
    onUpdateCustomStatus(customStatusInput)
    setEditingStatus(false)
  }

  return (
    <div className="user-panel-bar">
      {/* Avatar + infos — clicable pour ouvrir le menu */}
      <div
        className="upb-identity"
        onClick={() => setShowMenu(v => !v)}
        title="Cliquer pour les options"
      >
        <div className="upb-avatar-wrap">
          <div
            className="upb-avatar"
            style={profile.avatarImage
              ? { backgroundImage: `url(${profile.avatarImage})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundColor: profile.avatarColor }
              : { backgroundColor: profile.avatarColor }
            }
          >
            {!profile.avatarImage && (profile.displayName || profile.username)[0].toUpperCase()}
          </div>
          <div className="upb-status-dot" style={{ background: STATUS_COLORS[profile.status] }} />
        </div>
        <div className="upb-info">
          <div className="upb-name">{profile.displayName || profile.username}</div>
          <div className="upb-tag">
            {profile.customStatus
              ? profile.customStatus
              : STATUS_OPTIONS.find(s => s.value === profile.status)?.label}
          </div>
        </div>
      </div>

      {/* Boutons de contrôle (micro / casque / paramètres) */}
      <div className="upb-controls">
        <button
          className={`upb-ctrl-btn ${isMuted ? 'muted' : ''}`}
          title={isMuted ? 'Activer le micro' : 'Couper le micro'}
          onClick={onToggleMute}
        >
          {isMuted
            ? <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v3m-3 0h6M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3zM3 3l18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none"/></svg>
            : <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3zM19 10v2a7 7 0 01-14 0v-2M12 19v3M9 22h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none"/></svg>
          }
        </button>

        <button
          className={`upb-ctrl-btn ${isDeafened ? 'muted' : ''}`}
          title={isDeafened ? 'Réactiver le son' : 'Couper le son'}
          onClick={onToggleDeafen}
        >
          {isDeafened
            ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 3l18 18M9 9v3a3 3 0 005.12 2.12M12 6V4a3 3 0 013 3v.88"/><path d="M19 10a7 7 0 01-1 3.56M5 10a7 7 0 0010 6.3"/><path d="M12 19v3M9 22h6"/></svg>
            : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 9v3a3 3 0 006 0V9"/><path d="M17 9.7A7 7 0 015 10v1a7 7 0 0014 0v-1a7 7 0 00-.28-2"/><path d="M12 19v3M9 22h6"/></svg>
          }
        </button>

        <button
          className="upb-ctrl-btn"
          title="Paramètres utilisateur"
          onClick={e => { e.stopPropagation(); setShowMenu(false); onOpenSettings?.() }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 15a3 3 0 100-6 3 3 0 000 6z"/>
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
          </svg>
        </button>
      </div>

      {/* Menu popup */}
      {showMenu && (
        <div className="upb-menu" onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div
            className="upb-menu-header"
            style={profile.bannerImage
              ? { backgroundImage: `url(${profile.bannerImage})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundColor: profile.bannerColor || profile.avatarColor }
              : { backgroundColor: profile.bannerColor || profile.avatarColor, background: `linear-gradient(135deg, ${profile.bannerColor || profile.avatarColor}dd, ${profile.bannerColor || profile.avatarColor}55)` }
            }
          >
            <div className="upb-avatar-wrap">
              <div
                className="upb-menu-avatar"
                style={profile.avatarImage
                  ? { backgroundImage: `url(${profile.avatarImage})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundColor: profile.avatarColor }
                  : { backgroundColor: profile.avatarColor }
                }
              >
                {!profile.avatarImage && (profile.displayName || profile.username)[0].toUpperCase()}
              </div>
              <div className="upb-status-dot" style={{ background: STATUS_COLORS[profile.status] }} />
            </div>
          </div>
          <div className="upb-menu-body">
            <div className="upb-menu-name">{profile.displayName || profile.username}</div>
            {profile.customStatus && (
              <div className="upb-menu-custom-status">{profile.customStatus}</div>
            )}

            <div className="upb-menu-divider" />

            {/* Statut personnalisé */}
            {editingStatus ? (
              <div className="upb-menu-edit-status">
                <input
                  placeholder="Statut personnalisé..."
                  value={customStatusInput}
                  onChange={e => setCustomStatusInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleCustomStatus()
                    if (e.key === 'Escape') setEditingStatus(false)
                  }}
                  autoFocus
                />
                <div className="upb-menu-edit-status-btns">
                  <button onClick={handleCustomStatus}>Sauvegarder</button>
                  <button onClick={() => setEditingStatus(false)}>Annuler</button>
                </div>
              </div>
            ) : (
              <div className="upb-menu-item" onClick={() => setEditingStatus(true)}>
                ✏️ {profile.customStatus ? 'Modifier le statut' : 'Définir un statut'}
              </div>
            )}

            <div className="upb-menu-divider" />

            {/* Options statut */}
            {STATUS_OPTIONS.map(s => (
              <div
                key={s.value}
                className={`upb-menu-item status-item ${profile.status === s.value ? 'active' : ''}`}
                onClick={() => { onUpdateStatus(s.value); setShowMenu(false) }}
              >
                <span className="status-dot-sm" style={{ background: s.color }} />
                {s.label}
                {profile.status === s.value && <span className="status-check">✓</span>}
              </div>
            ))}

            <div className="upb-menu-divider" />

            <div className="upb-menu-item danger" onClick={() => { onLogout(); setShowMenu(false) }}>
              🚪 Se déconnecter
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default UserPanel
