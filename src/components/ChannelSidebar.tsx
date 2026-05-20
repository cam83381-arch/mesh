import React, { useState, useEffect, useRef } from 'react'
import type { Channel, Category } from '../types'

interface VoicePresenceMember {
  username: string
  isMuted?: boolean
  isDeafened?: boolean
  avatarImage?: string
}

interface Props {
  channels: Channel[]
  currentChannel: Channel | null
  setCurrentChannel: (channel: Channel) => void
  categories?: Category[]
  serverName?: string
  serverBannerUrl?: string
  serverBannerColor?: string
  onOpenSettings?: () => void
  onEditChannel?: (channel: Channel) => void
  onCreateChannel?: (name: string, type: 'text' | 'voice', categoryId?: string) => void | Promise<any>
  onDeleteChannel?: (channelId: string) => void
  unreadByChannel?: Record<string, number>
  footer?: React.ReactNode
  onSplitView?: (channel: Channel) => void
  onSplitRight?: (channel: Channel) => void
  isSplitView?: boolean
  canAccessChannel?: (channelId: string) => boolean
  voicePresence?: Record<string, VoicePresenceMember[]> // channelId → membres
  activeVoiceChannelId?: string | null
  currentUsername?: string
}

// SVG icons for Discord-accurate channel icons
const IconHash = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M10.73 2.73a1 1 0 0 0-1.46-1.46L6.23 4.31A1 1 0 0 0 6.1 4.5H3a1 1 0 0 0 0 2h2.68l-.93 4H2a1 1 0 0 0 0 2h2.34l-1.07 4.27a1 1 0 0 0 1.94.48L6.54 13h3.87l-1.07 4.27a1 1 0 0 0 1.94.48L12.6 13H16a1 1 0 0 0 0-2h-3.8l.93-4H16a1 1 0 0 0 0-2h-2.46l1.19-1.19a1 1 0 0 0-1.46-1.46L11.13 4.5H8.46l2.27-1.77zM9.13 10.5l-.93 4H12.07l.93-4H9.13z" />
  </svg>
)

const IconVolume = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M11.553 3.064A.75.75 0 0 1 12 3.75v16.5a.75.75 0 0 1-1.255.555L5.46 16H3a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1h2.46l5.285-4.805a.75.75 0 0 1 .808-.131zM16.747 7.397a.75.75 0 0 1 1.061.033 9 9 0 0 1 0 9.14.75.75 0 1 1-1.094-1.027 7.5 7.5 0 0 0 0-7.085.75.75 0 0 1 .033-1.061zm-2.208 2.235a.75.75 0 0 1 1.06.041 5 5 0 0 1 0 6.654.75.75 0 1 1-1.1-1.019 3.5 3.5 0 0 0 0-4.616.75.75 0 0 1 .04-1.06z"/>
  </svg>
)

const IconSettings = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7.94-2.36a7.93 7.93 0 0 0 .06-1 8 8 0 0 0-.06-.64l1.4-1.09a.33.33 0 0 0 .08-.43l-1.33-2.3a.33.33 0 0 0-.4-.14l-1.65.66a7.52 7.52 0 0 0-1.11-.64l-.25-1.76a.32.32 0 0 0-.32-.27H9.64a.32.32 0 0 0-.32.27l-.25 1.76a7.52 7.52 0 0 0-1.11.64L6.3 7.14a.33.33 0 0 0-.4.14L4.57 9.57a.33.33 0 0 0 .08.43l1.4 1.09A7.93 7.93 0 0 0 6 12a8 8 0 0 0 .05.64l-1.4 1.09a.33.33 0 0 0-.08.43l1.33 2.3c.08.14.25.2.4.14l1.65-.66c.35.24.72.44 1.11.64l.25 1.76c.04.16.18.27.32.27h2.66a.32.32 0 0 0 .32-.27l.25-1.76a7.52 7.52 0 0 0 1.11-.64l1.65.66c.15.05.32 0 .4-.14l1.33-2.3a.33.33 0 0 0-.08-.43l-1.4-1.09z"/>
  </svg>
)

const IconInvite = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/>
  </svg>
)

const IconChevron = ({ collapsed }: { collapsed: boolean }) => (
  <svg
    width="12" height="12"
    viewBox="0 0 24 24"
    fill="currentColor"
    style={{ transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' }}
    aria-hidden="true"
  >
    <path d="M7 10l5 5 5-5z"/>
  </svg>
)

const IconAdd = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M19 11h-6V5a1 1 0 0 0-2 0v6H5a1 1 0 0 0 0 2h6v6a1 1 0 0 0 2 0v-6h6a1 1 0 0 0 0-2z"/>
  </svg>
)

function ChannelSidebar({ channels, currentChannel, setCurrentChannel, categories = [], serverName, serverBannerUrl, serverBannerColor, onOpenSettings, onEditChannel, onCreateChannel, onDeleteChannel, unreadByChannel = {}, footer, onSplitView, onSplitRight, isSplitView, canAccessChannel, voicePresence = {}, activeVoiceChannelId, currentUsername }: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [creating, setCreating] = useState<{ categoryId?: string; type: 'text' | 'voice' } | null>(null)
  const [newName, setNewName] = useState('')
  const [showServerMenu, setShowServerMenu] = useState(false)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; channel: Channel } | null>(null)
  const [draggingChannel, setDraggingChannel] = useState<Channel | null>(null)
  const ctxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ctxMenu) return
    const close = () => setCtxMenu(null)
    document.addEventListener('click', close)
    document.addEventListener('contextmenu', close)
    return () => { document.removeEventListener('click', close); document.removeEventListener('contextmenu', close) }
  }, [ctxMenu])

  const toggle = (id: string) => setCollapsed(prev => ({ ...prev, [id]: !prev[id] }))

  const submitCreate = () => {
    if (!newName.trim() || !creating) return
    // __text__ et __voice__ sont des pseudo-IDs internes, pas de vraies catégories
    const realCategoryId = (creating.categoryId === '__text__' || creating.categoryId === '__voice__') ? undefined : creating.categoryId
    onCreateChannel?.(newName.trim(), creating.type, realCategoryId)
    setCreating(null)
    setNewName('')
  }

  // Filtrer les salons auxquels l'utilisateur n'a pas accès (canRead = false)
  const visibleChannels = canAccessChannel
    ? channels.filter(c => canAccessChannel(c.id))
    : channels

  const uncategorized = visibleChannels.filter(c => !c.categoryId)
  const textUncategorized = uncategorized.filter(c => c.type === 'text')
  const voiceUncategorized = uncategorized.filter(c => c.type === 'voice')

  const renderChannel = (channel: Channel) => {
    const unread = unreadByChannel[channel.id] || 0
    const isActive = currentChannel?.id === channel.id
    const voiceMembers = channel.type === 'voice' ? (voicePresence[channel.id] || []) : []
    return (
      <React.Fragment key={channel.id}>
        <div
          className={`cs-channel-item${isActive ? ' active' : ''}${unread > 0 ? ' has-unread' : ''}${draggingChannel?.id === channel.id ? ' dragging' : ''}${channel.id === activeVoiceChannelId ? ' cs-voice-active' : ''}`}
          onClick={() => setCurrentChannel(channel)}
          onContextMenu={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setCtxMenu({ x: e.clientX, y: e.clientY, channel })
          }}
          draggable={channel.type === 'text'}
          onDragStart={(e) => {
            if (channel.type !== 'text') return
            e.dataTransfer.setData('mesh/channel-id', channel.id)
            e.dataTransfer.effectAllowed = 'copy'
            setDraggingChannel(channel)
          }}
          onDragEnd={() => setDraggingChannel(null)}
          title={channel.name}
        >
          <span className="cs-channel-icon">
            {channel.type === 'voice' ? <IconVolume /> : <IconHash />}
          </span>
          <span className="cs-channel-name">{channel.name}</span>
          <div className="cs-channel-actions">
            {onOpenSettings && (
              <button
                className="cs-channel-btn"
                title="Paramètres du serveur → Invitations"
                onClick={e => { e.stopPropagation(); onOpenSettings() }}
              >
                <IconInvite />
              </button>
            )}
            {onEditChannel && (
              <button
                className="cs-channel-btn"
                title="Paramètres du salon"
                onClick={e => { e.stopPropagation(); onEditChannel(channel) }}
              >
                <IconSettings />
              </button>
            )}
            {onDeleteChannel && (
              <button
                className="cs-channel-btn danger"
                title="Supprimer"
                onClick={e => { e.stopPropagation(); if (confirm(`Supprimer #${channel.name} ?`)) onDeleteChannel(channel.id) }}
              >
                ✕
              </button>
            )}
          </div>
          {unread > 0 && channel.type === 'text' && (
            <span className="cs-unread-badge">{unread > 99 ? '99+' : unread}</span>
          )}
          {channel.type === 'voice' && (
            <span className="cs-voice-count">
              {voiceMembers.length}{channel.userLimit && channel.userLimit > 0 ? `/${channel.userLimit}` : ''}
            </span>
          )}
        </div>
        {/* Membres présents dans ce salon vocal */}
        {voiceMembers.length > 0 && (
          <div className="cs-voice-members">
            {voiceMembers.map(m => (
              <div key={m.username} className={`cs-voice-member${m.username === currentUsername ? ' cs-voice-member--self' : ''}`}>
                <div className="cs-voice-avatar">
                  {m.avatarImage
                    ? <img src={m.avatarImage} alt={m.username} />
                    : <span>{m.username.slice(0, 1).toUpperCase()}</span>}
                </div>
                <span className="cs-voice-member-name">{m.username}</span>
                <div className="cs-voice-member-icons">
                  {m.isMuted && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="cs-voice-icon muted" aria-label="Muet">
                      <line x1="1" y1="1" x2="23" y2="23"/>
                      <path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6"/>
                      <path d="M17 16.95A7 7 0 015 12v-2m14 0v2a7 7 0 01-.11 1.23"/>
                      <line x1="12" y1="19" x2="12" y2="23"/>
                      <line x1="8" y1="23" x2="16" y2="23"/>
                    </svg>
                  )}
                  {m.isDeafened && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="cs-voice-icon deafened" aria-label="Sourd">
                      <path d="M11 5a3 3 0 014.53 2.59"/>
                      <path d="M17.7 13.3A8 8 0 004 9m0 0v3m17 0v-3a8 8 0 00-.3-2.2"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </React.Fragment>
    )
  }

  const renderCategory = (label: string, id: string, chans: Channel[], categoryId?: string) => {
    const isCollapsed = !!collapsed[id]
    return (
      <React.Fragment key={id}>
        <div className="cs-category-row">
          <button
            className="cs-category-btn"
            onClick={() => toggle(id)}
            aria-expanded={!isCollapsed}
          >
            <IconChevron collapsed={isCollapsed} />
            <span className="cs-category-label">{label.toUpperCase()}</span>
          </button>
          {onCreateChannel && (
            <button
              className="cs-category-add"
              title={`Créer un salon dans ${label}`}
              onClick={e => { e.stopPropagation(); setCreating({ categoryId, type: 'text' }); setNewName('') }}
            >
              <IconAdd />
            </button>
          )}
        </div>
        {!isCollapsed && (
          <>
            {chans.map(renderChannel)}
            {creating && creating.categoryId === categoryId && (
              <div className="cs-create-inline">
                <span className="cs-channel-icon"><IconHash /></span>
                <input
                  className="cs-create-input"
                  placeholder="Nom du salon…"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') submitCreate(); if (e.key === 'Escape') setCreating(null) }}
                  autoFocus
                />
              </div>
            )}
          </>
        )}
      </React.Fragment>
    )
  }

  return (
    <div className="cs-sidebar" onClick={() => setShowServerMenu(false)}>
      {/* Bannière serveur */}
      {(serverBannerUrl || serverBannerColor) && (
        <div
          className="cs-server-banner"
          style={{
            background: serverBannerUrl
              ? `url(${serverBannerUrl}) center/cover no-repeat`
              : serverBannerColor,
          }}
        />
      )}

      {/* Server Header */}
      <div
        className={`cs-server-header${showServerMenu ? ' open' : ''}`}
        onClick={e => { e.stopPropagation(); setShowServerMenu(v => !v) }}
        title={serverName}
      >
        <span className="cs-server-name">{serverName || 'Serveur'}</span>
        <span className="cs-header-chevron">
          {showServerMenu
            ? <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 15l-7-7-7 7"/></svg>
            : <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M5 9l7 7 7-7"/></svg>
          }
        </span>
      </div>

      {/* Server dropdown menu */}
      {showServerMenu && (
        <div className="cs-server-menu" onClick={e => e.stopPropagation()}>
          {onOpenSettings && (
            <button
              className="cs-server-menu-item"
              onClick={() => { onOpenSettings(); setShowServerMenu(false) }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7.94-2.36a7.93 7.93 0 0 0 .06-1 8 8 0 0 0-.06-.64l1.4-1.09a.33.33 0 0 0 .08-.43l-1.33-2.3a.33.33 0 0 0-.4-.14l-1.65.66a7.52 7.52 0 0 0-1.11-.64l-.25-1.76a.32.32 0 0 0-.32-.27H9.64a.32.32 0 0 0-.32.27l-.25 1.76a7.52 7.52 0 0 0-1.11.64L6.3 7.14a.33.33 0 0 0-.4.14L4.57 9.57a.33.33 0 0 0 .08.43l1.4 1.09A7.93 7.93 0 0 0 6 12a8 8 0 0 0 .05.64l-1.4 1.09a.33.33 0 0 0-.08.43l1.33 2.3c.08.14.25.2.4.14l1.65-.66c.35.24.72.44 1.11.64l.25 1.76c.04.16.18.27.32.27h2.66a.32.32 0 0 0 .32-.27l.25-1.76a7.52 7.52 0 0 0 1.11-.64l1.65.66c.15.05.32 0 .4-.14l1.33-2.3a.33.33 0 0 0-.08-.43l-1.4-1.09z"/></svg>
              Paramètres du serveur
            </button>
          )}
          {onCreateChannel && (
            <button
              className="cs-server-menu-item"
              onClick={() => { setCreating({ categoryId: undefined, type: 'text' }); setNewName(''); setShowServerMenu(false) }}
            >
              <IconAdd />
              Créer un salon
            </button>
          )}
        </div>
      )}

      <div className="cs-channel-list">
        {/* Catégories */}
        {categories.map(cat => {
          const catChannels = visibleChannels.filter(c => c.categoryId === cat.id)
          return renderCategory(cat.name, cat.id, catChannels, cat.id)
        })}

        {/* Salons sans catégorie — IDs stables pour isoler le creating */}
        {textUncategorized.length > 0 && renderCategory('Salons texte', '__text__', textUncategorized, '__text__')}
        {voiceUncategorized.length > 0 && renderCategory('Salons vocaux', '__voice__', voiceUncategorized, '__voice__')}

        {/* Formulaire création sans catégorie (menu serveur → Créer un salon) */}
        {creating && creating.categoryId === undefined && (
          <div className="cs-create-inline" style={{ marginTop: 8 }}>
            <span className="cs-channel-icon"><IconHash /></span>
            <input
              className="cs-create-input"
              placeholder="Nom du salon…"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submitCreate(); if (e.key === 'Escape') setCreating(null) }}
              autoFocus
            />
          </div>
        )}

        {channels.length === 0 && (
          <div className="cs-empty">Aucun salon pour l'instant</div>
        )}
      </div>

      {footer}

      {/* Context menu clic droit (tous canaux) */}
      {ctxMenu && (
        <div
          ref={ctxRef}
          className="cs-ctx-menu"
          style={{ top: Math.min(ctxMenu.y, window.innerHeight - 200), left: Math.min(ctxMenu.x, window.innerWidth - 240) }}
          onClick={e => e.stopPropagation()}
        >
          {/* Ouvrir / rejoindre */}
          <button
            className="cs-ctx-item"
            onClick={() => { setCurrentChannel(ctxMenu.channel); setCtxMenu(null) }}
          >
            {ctxMenu.channel.type === 'voice'
              ? <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M11.553 3.064A.75.75 0 0 1 12 3.75v16.5a.75.75 0 0 1-1.255.555L5.46 16H3a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1h2.46l5.285-4.805a.75.75 0 0 1 .808-.131z"/></svg>
              : <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M10.73 2.73a1 1 0 0 0-1.46-1.46L6.23 4.31A1 1 0 0 0 6.1 4.5H3a1 1 0 0 0 0 2h2.68l-.93 4H2a1 1 0 0 0 0 2h2.34l-1.07 4.27a1 1 0 0 0 1.94.48L6.54 13h3.87l-1.07 4.27a1 1 0 0 0 1.94.48L12.6 13H16a1 1 0 0 0 0-2h-3.8l.93-4H16a1 1 0 0 0 0-2h-2.46l1.19-1.19a1 1 0 0 0-1.46-1.46L11.13 4.5H8.46l2.27-1.77z"/></svg>
            }
            {ctxMenu.channel.type === 'voice' ? 'Rejoindre le salon' : 'Ouvrir le salon'}
          </button>

          {/* Ouvrir dans panneau droit (texte uniquement) */}
          {ctxMenu.channel.type === 'text' && onSplitRight && (
            <button
              className="cs-ctx-item"
              onClick={() => { onSplitRight(ctxMenu.channel); setCtxMenu(null) }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M13 3h8v18h-8V3zM3 3h8v18H3V3z"/></svg>
              Ouvrir dans le panneau droit
            </button>
          )}

          {/* Scinder vue (canal vocal) */}
          {ctxMenu.channel.type === 'voice' && onSplitView && (
            <button
              className={`cs-ctx-item${isSplitView ? ' active' : ''}`}
              onClick={() => { onSplitView(ctxMenu.channel); setCtxMenu(null) }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h8v18H3zM13 3h8v18h-8z"/></svg>
              {isSplitView ? 'Désactiver la vue scindée' : 'Scinder la vue'}
            </button>
          )}

          <div className="cs-ctx-separator" />

          {/* Paramètres */}
          {onEditChannel && (
            <button
              className="cs-ctx-item"
              onClick={() => { onEditChannel(ctxMenu.channel); setCtxMenu(null) }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7.94-2.36a7.93 7.93 0 0 0 .06-1 8 8 0 0 0-.06-.64l1.4-1.09a.33.33 0 0 0 .08-.43l-1.33-2.3a.33.33 0 0 0-.4-.14l-1.65.66a7.52 7.52 0 0 0-1.11-.64l-.25-1.76a.32.32 0 0 0-.32-.27H9.64a.32.32 0 0 0-.32.27l-.25 1.76a7.52 7.52 0 0 0-1.11.64L6.3 7.14a.33.33 0 0 0-.4.14L4.57 9.57a.33.33 0 0 0 .08.43l1.4 1.09A7.93 7.93 0 0 0 6 12a8 8 0 0 0 .05.64l-1.4 1.09a.33.33 0 0 0-.08.43l1.33 2.3c.08.14.25.2.4.14l1.65-.66c.35.24.72.44 1.11.64l.25 1.76c.04.16.18.27.32.27h2.66a.32.32 0 0 0 .32-.27l.25-1.76a7.52 7.52 0 0 0 1.11-.64l1.65.66c.15.05.32 0 .4-.14l1.33-2.3a.33.33 0 0 0-.08-.43l-1.4-1.09z"/></svg>
              Paramètres du salon
            </button>
          )}
          {onDeleteChannel && (
            <button
              className="cs-ctx-item danger"
              onClick={() => { if (confirm(`Supprimer #${ctxMenu.channel.name} ?`)) onDeleteChannel(ctxMenu.channel.id); setCtxMenu(null) }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
              Supprimer le salon
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default ChannelSidebar
