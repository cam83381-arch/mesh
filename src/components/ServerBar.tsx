import type { Server } from '../types'

interface Props {
  servers: Server[]
  activeServer: string
  onSelectServer: (id: string) => void
  onAddServer: () => void
  onOpenDMs: () => void
  isDMMode: boolean
  unreadDMs?: number
  friendRequestCount?: number
  unreadServers?: Record<string, number>
}

// Logo Mesh — Nebula Dark v3 (version sidebar compacte)
const MeshLogo = () => (
  <svg viewBox="0 0 36 36" width="28" height="28" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="sb-g1" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#6dd6d0"/>
        <stop offset="100%" stopColor="#00c9b1"/>
      </linearGradient>
      <linearGradient id="sb-g2" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#7c5aff"/>
        <stop offset="100%" stopColor="#00c9b1"/>
      </linearGradient>
      <filter id="sb-glow">
        <feGaussianBlur stdDeviation="1.5" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>
    <circle cx="18" cy="18" r="5" fill="url(#sb-g1)" filter="url(#sb-glow)"/>
    <circle cx="7"  cy="9"  r="2.8" fill="#7c5aff" opacity="0.95"/>
    <circle cx="29" cy="9"  r="2.8" fill="#7c5aff" opacity="0.95"/>
    <circle cx="7"  cy="27" r="2.8" fill="#00c9b1" opacity="0.95"/>
    <circle cx="29" cy="27" r="2.8" fill="#00c9b1" opacity="0.95"/>
    <line x1="18" y1="18" x2="7"  y2="9"  stroke="url(#sb-g2)" strokeWidth="1.5" opacity="0.8"/>
    <line x1="18" y1="18" x2="29" y2="9"  stroke="url(#sb-g2)" strokeWidth="1.5" opacity="0.8"/>
    <line x1="18" y1="18" x2="7"  y2="27" stroke="url(#sb-g1)" strokeWidth="1.5" opacity="0.8"/>
    <line x1="18" y1="18" x2="29" y2="27" stroke="url(#sb-g1)" strokeWidth="1.5" opacity="0.8"/>
    <line x1="7"  y1="9"  x2="29" y2="9"  stroke="#7c5aff" strokeWidth="1" opacity="0.32"/>
    <line x1="7"  y1="27" x2="29" y2="27" stroke="#00c9b1" strokeWidth="1" opacity="0.32"/>
    <line x1="7"  y1="9"  x2="7"  y2="27" stroke="url(#sb-g2)" strokeWidth="1" opacity="0.32"/>
    <line x1="29" y1="9"  x2="29" y2="27" stroke="url(#sb-g2)" strokeWidth="1" opacity="0.32"/>
    <line x1="7"  y1="9"  x2="29" y2="27" stroke="url(#sb-g2)" strokeWidth="0.7" opacity="0.15"/>
    <line x1="29" y1="9"  x2="7"  y2="27" stroke="url(#sb-g2)" strokeWidth="0.7" opacity="0.15"/>
  </svg>
)

// Icône DM (bulle de chat — style Nebula)
const IconDM = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10z" fill="currentColor" fillOpacity="0.15"/>
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10z"/>
  </svg>
)

function ServerBar({ servers, activeServer, onSelectServer, onAddServer, onOpenDMs, isDMMode, unreadDMs = 0, friendRequestCount = 0, unreadServers = {} }: Props) {
  const totalDMBadge = unreadDMs + friendRequestCount

  return (
    <div className="server-bar">

      {/* Logo Mesh en haut de la barre */}
      <div className="server-bar-logo" title="Mesh — P2P Chat">
        <MeshLogo />
      </div>

      <div className="server-divider" />

      {/* Bouton DMs */}
      <div
        className={`server-icon sb-dm-icon ${isDMMode ? 'active' : ''}`}
        onClick={onOpenDMs}
        title="Messages privés"
      >
        <IconDM />
        {totalDMBadge > 0 && !isDMMode && (
          <span className="sb-badge">{totalDMBadge > 9 ? '9+' : totalDMBadge}</span>
        )}
      </div>

      <div className="server-divider" />

      {/* Serveurs */}
      {servers.map(s => {
        const sUnread = unreadServers[s.id] || 0
        const isActive = !isDMMode && activeServer === s.id
        // Générer les initiales : 1-2 chars selon la longueur du nom
        const name = s.name || s.label || '?'
        const initials = name.length <= 2
          ? name.toUpperCase()
          : name.split(/\s+/).map((w: string) => w[0]).join('').slice(0, 2).toUpperCase() || name.slice(0, 2).toUpperCase()

        return (
          <div
            key={s.id}
            className={`server-icon sb-server-icon ${isActive ? 'active' : ''}`}
            onClick={() => onSelectServer(s.id)}
            title={name}
          >
            {/* Pastille gauche (pilule de sélection) */}
            <div className={`sb-pill ${isActive ? 'active' : sUnread > 0 ? 'unread' : ''}`} />

            {s.iconUrl
              ? <span className="sb-icon-clip"><img src={s.iconUrl} alt={name} className="sb-server-icon-img" /></span>
              : <span className="sb-initials" style={{ background: s.color || '#5865f2' }}>{initials}</span>
            }

            {sUnread > 0 && !isActive && (
              <span className="sb-badge">{sUnread > 99 ? '99+' : sUnread}</span>
            )}
          </div>
        )
      })}

      <div className="server-divider" />

      {/* Ajouter un serveur */}
      <div
        className="server-icon sb-add-icon"
        onClick={onAddServer}
        title="Ajouter un serveur"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 11h-6V5a1 1 0 0 0-2 0v6H5a1 1 0 0 0 0 2h6v6a1 1 0 0 0 2 0v-6h6a1 1 0 0 0 0-2z"/>
        </svg>
      </div>
    </div>
  )
}

export default ServerBar
