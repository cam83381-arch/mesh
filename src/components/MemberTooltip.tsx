import React, { useState, useRef, useEffect, useCallback } from 'react'
import type { Member, CustomRole, UserProfile } from '../types'
import type { Friendship } from '../useFriends'
import gun from '../gun'

const STATUS_LABELS: Record<string, string> = {
  online: 'En ligne',
  idle: 'Absent',
  dnd: 'Ne pas déranger',
  invisible: 'Hors ligne'
}
const STATUS_COLORS: Record<string, string> = {
  online: '#23a559',
  idle: '#f0b232',
  dnd: '#f23f43',
  invisible: '#56527e'
}

// Décorations d'avatar disponibles
export const AVATAR_DECORATIONS: Record<string, { label: string; css: string }> = {
  none:        { label: 'Aucune',        css: '' },
  gold:        { label: 'Couronne',      css: 'decoration-gold' },
  rainbow:     { label: 'Arc-en-ciel',   css: 'decoration-rainbow' },
  neon:        { label: 'Néon',          css: 'decoration-neon' },
  fire:        { label: 'Feu',           css: 'decoration-fire' },
  ice:         { label: 'Glace',         css: 'decoration-ice' },
  galaxy:      { label: 'Galaxie',       css: 'decoration-galaxy' },
  sakura:      { label: 'Sakura',        css: 'decoration-sakura' },
}

// Effets de profil disponibles
export const PROFILE_EFFECTS: Record<string, { label: string; css: string }> = {
  none:        { label: 'Aucun',         css: '' },
  particles:   { label: 'Particules',    css: 'effect-particles' },
  aurora:      { label: 'Aurore',        css: 'effect-aurora' },
  matrix:      { label: 'Matrix',        css: 'effect-matrix' },
  confetti:    { label: 'Confettis',     css: 'effect-confetti' },
  glitch:      { label: 'Glitch',        css: 'effect-glitch' },
  starfall:    { label: 'Étoiles',       css: 'effect-starfall' },
}

interface Props {
  username: string
  currentUsername: string
  members?: Member[]
  customRoles?: CustomRole[]
  friends?: Friendship[]
  onOpenDM: (username: string) => void
  onAddFriend?: (username: string) => void
  onRemoveFriend?: (pairId: string) => void
  children: React.ReactNode
}

function MemberTooltip({ username, currentUsername, members, customRoles, friends, onOpenDM, onAddFriend, onRemoveFriend, children }: Props) {
  const [visible, setVisible] = useState(false)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 })
  const wrapperRef = useRef<HTMLDivElement>(null)
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isSelf = username === currentUsername

  useEffect(() => {
    if (!username) return
    const ref = gun.get('profiles').get(username)
    let mounted = true

    // Fonction de chargement complet du profil
    const loadFull = () => {
      ref.once((p: any) => {
        if (!mounted || !p) return
        setProfile({
          username:         p.username         || username,
          status:           p.status           || 'online',
          customStatus:     p.customStatus      || '',
          avatarColor:      p.avatarColor       || '#6354ff',
          displayName:      p.displayName       || '',
          bio:              p.bio               || '',
          bannerColor:      p.bannerColor       || '',
          avatarDecoration: p.avatarDecoration  || undefined,
          profileEffect:    p.profileEffect     || undefined,
          avatarImage:      p.avatarImage       || undefined,
          bannerImage:      p.bannerImage       || undefined,
        })
      })
    }

    // Chargement initial
    loadFull()

    // Écoute champ par champ pour les changements légers (statut, couleur…)
    const FIELDS = ['avatarColor', 'displayName', 'bio', 'bannerColor', 'status',
                    'customStatus', 'avatarDecoration', 'profileEffect', 'avatarImage', 'bannerImage'] as const
    type Field = typeof FIELDS[number]
    const callbacks: Partial<Record<Field, (val: any) => void>> = {}

    FIELDS.forEach(field => {
      const cb = (val: any) => {
        if (!mounted) return
        setProfile(prev => {
          if (!prev) return prev
          return { ...prev, [field]: (val !== undefined && val !== null) ? val : undefined }
        })
      }
      callbacks[field] = cb
      ref.get(field).on(cb)
    })

    // Écouter updatedAt — quand il change, recharger tout le profil d'un coup
    // (garantit la synchro des photos même si les listeners individuels sont lents)
    const updatedAtCb = (_val: any) => {
      if (!mounted) return
      loadFull()
    }
    ref.get('updatedAt').on(updatedAtCb)

    return () => {
      mounted = false
      FIELDS.forEach(field => {
        const cb = callbacks[field]
        if (cb) ref.get(field).off(cb)
      })
      ref.get('updatedAt').off(updatedAtCb)
    }
  }, [username])

  const computePosition = useCallback(() => {
    if (!wrapperRef.current) return
    const target = (wrapperRef.current.firstElementChild as HTMLElement) ?? wrapperRef.current
    const rect = target.getBoundingClientRect()
    const tooltipWidth = 290
    const tooltipHeight = 380

    // Essayer à droite d'abord, puis à gauche
    let left = rect.right + 16
    let top = rect.top

    if (left + tooltipWidth > window.innerWidth - 8) {
      left = rect.left - tooltipWidth - 16
    }
    // Clamp pour ne jamais sortir du viewport
    if (left < 8) left = 8
    if (left + tooltipWidth > window.innerWidth - 8) left = window.innerWidth - tooltipWidth - 8

    if (top + tooltipHeight > window.innerHeight - 8) {
      top = window.innerHeight - tooltipHeight - 8
    }
    if (top < 8) top = 8

    setTooltipPos({ top, left })
  }, [])

  const cancelHide = () => {
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null }
  }

  const scheduleHide = () => {
    cancelHide()
    hideTimer.current = setTimeout(() => setVisible(false), 400)
  }

  const handleMouseEnter = () => {
    cancelHide()
    if (showTimer.current) clearTimeout(showTimer.current)
    showTimer.current = setTimeout(() => {
      computePosition()
      setVisible(true)
    }, 180)
  }

  const handleMouseLeave = () => {
    if (showTimer.current) { clearTimeout(showTimer.current); showTimer.current = null }
    scheduleHide()
  }

  const member = members?.find(m => m.username === username)
  const customRole = member?.customRoleId
    ? customRoles?.find(r => r.id === member.customRoleId)
    : null
  const roleName = customRole ? customRole.name : (member?.role || 'membre')
  const roleColor = customRole ? customRole.color
    : member?.role === 'owner' ? '#f47fff'
    : member?.role === 'admin' ? '#f23f43'
    : member?.role === 'moderator' ? '#23a559'
    : '#8884c4'

  const avatarColor = profile?.avatarColor || '#6354ff'
  const bannerColor = profile?.bannerColor || avatarColor
  const avatarImage = profile?.avatarImage
  const bannerImage = profile?.bannerImage
  const status = profile?.status || 'online'
  const decoration = profile?.avatarDecoration
  const profileEffect = profile?.profileEffect

  const decorClass = decoration && AVATAR_DECORATIONS[decoration]?.css ? AVATAR_DECORATIONS[decoration].css : ''
  const effectClass = profileEffect && PROFILE_EFFECTS[profileEffect]?.css ? PROFILE_EFFECTS[profileEffect].css : ''

  const friendship = friends?.find(f => f.otherUser === username)
  const friendStatus = friendship?.status ?? null
  const friendPairId = friendship?.pairId ?? null
  const isRequestSentByMe = friendship?.initiator === currentUsername

  return (
    <div
      ref={wrapperRef}
      style={{ display: 'contents' }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}

      {visible && (
        <div
          className={`mt-card${effectClass ? ` ${effectClass}` : ''}`}
          style={{ top: tooltipPos.top, left: tooltipPos.left }}
          onMouseEnter={cancelHide}
          onMouseLeave={scheduleHide}
        >
          {/* Bannière */}
          <div
            className="mt-banner"
            style={bannerImage
              ? { backgroundImage: `url(${bannerImage})`, backgroundSize: 'cover', backgroundPosition: 'center' }
              : { background: `linear-gradient(135deg, ${bannerColor}ee, ${bannerColor}44)` }
            }
          />

          {/* Effet de profil animé sur la bannière */}
          {effectClass && <div className={`mt-banner-effect ${effectClass}`} />}

          {/* Avatar qui chevauche la bannière */}
          <div className="mt-avatar-wrap">
            <div
              className={`mt-avatar${decorClass ? ` ${decorClass}` : ''}`}
              style={avatarImage
                ? { backgroundImage: `url(${avatarImage})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                : { background: avatarColor }
              }
            >
              {!avatarImage && username[0].toUpperCase()}
              <div className="mt-status-ring">
                <div className="mt-status-dot" style={{ background: STATUS_COLORS[status] }} />
              </div>
            </div>
          </div>

          <div className="mt-body">
            {/* Nom + pseudo */}
            <div className="mt-username">
              {profile?.displayName || username}
              {decorClass && <span className={`mt-deco-icon ${decorClass}`} />}
            </div>
            <div className="mt-handle">
              @{username.toLowerCase().replace(/\s/g, '_')}
            </div>

            <div className="mt-divider" />

            {/* Rôle */}
            {member && (
              <div className="mt-section">
                <div className="mt-section-label">RÔLE</div>
                <div className="mt-role-badge" style={{ borderColor: roleColor + '88', color: roleColor }}>
                  <span className="mt-role-dot" style={{ background: roleColor }} />
                  {roleName.charAt(0).toUpperCase() + roleName.slice(1)}
                </div>
              </div>
            )}

            {/* Bio */}
            {profile?.bio && (
              <div className="mt-section">
                <div className="mt-section-label">À PROPOS</div>
                <div className="mt-bio">{profile.bio}</div>
              </div>
            )}

            {/* Statut */}
            <div className="mt-section">
              <div className="mt-section-label">STATUT</div>
              <div className="mt-status-row">
                <span className="mt-status-indicator" style={{ background: STATUS_COLORS[status] }} />
                <span className="mt-status-label">
                  {STATUS_LABELS[status] || 'En ligne'}
                  {profile?.customStatus && (
                    <span className="mt-custom-status"> — {profile.customStatus}</span>
                  )}
                </span>
              </div>
            </div>

            <div className="mt-divider" />

            {/* Input MP rapide */}
            {!isSelf && (
              <div className="mt-quick-msg" onClick={() => { onOpenDM(username); setVisible(false) }}>
                💬 Envoyer un message à @{username}
              </div>
            )}

            {/* Actions */}
            {!isSelf && (
              <div className="mt-actions">
                <button
                  className="mt-btn primary"
                  onClick={() => { onOpenDM(username); setVisible(false) }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>
                  Message
                </button>
                {friendStatus === 'accepted' ? (
                  <button
                    className="mt-btn secondary"
                    onClick={() => {
                      if (friendPairId && confirm(`Retirer ${username} de tes amis ?`)) {
                        onRemoveFriend?.(friendPairId)
                        setVisible(false)
                      }
                    }}
                  >
                    ✓ Amis
                  </button>
                ) : friendStatus === 'pending' && !isRequestSentByMe ? (
                  <button
                    className="mt-btn secondary success"
                    onClick={() => { onAddFriend?.(username); setVisible(false) }}
                  >
                    ✓ Accepter
                  </button>
                ) : friendStatus === 'pending' && isRequestSentByMe ? (
                  <button className="mt-btn secondary" disabled>En attente…</button>
                ) : (
                  <button
                    className="mt-btn secondary"
                    onClick={() => { onAddFriend?.(username); setVisible(false) }}
                  >
                    + Ami
                  </button>
                )}
              </div>
            )}

            {isSelf && (
              <div className="mt-self-msg">C'est toi 👋</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default MemberTooltip
