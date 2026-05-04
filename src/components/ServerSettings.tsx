import React, { useState, useEffect, useRef } from 'react'
import type { Server, Member, Role, CustomRole, Permissions } from '../types'
import BotList from './BotList'
import useServerEmojis from '../useServerEmojis'

import { readLocal, writeLocal } from '../localStore'
import { joinMeshRoom } from '../mesh'

// ── Types locaux ──
interface Invite {
  code: string
  duration: number   // ms, 0 = permanent
  maxUses: number    // 0 = illimité
  uses: number
  createdAt: number
  createdBy: string
}

interface LogEntry {
  id: string
  action: string
  by: string
  target: string
  timestamp: number
}

interface AutoMod {
  words: string       // virgule-séparé
  action: 'delete' | 'warn' | 'both' | 'tempban'
  enabled: boolean
  banDuration: number // minutes (pour tempban)
}

// ── Helpers localStore ──
type InvitesFile = Record<string, Record<string, Invite>>
type LogsFile    = Record<string, LogEntry[]>

async function loadInvites(serverId: string): Promise<Record<string, Invite>> {
  const data = await readLocal<InvitesFile>('invites.json') || {}
  return data[serverId] || {}
}

async function saveInvite(serverId: string, code: string, invite: Invite | null) {
  const data = await readLocal<InvitesFile>('invites.json') || {}
  if (!data[serverId]) data[serverId] = {}
  if (invite === null) delete data[serverId][code]
  else data[serverId][code] = invite
  await writeLocal('invites.json', data)
}

async function addLog(serverId: string, action: string, by: string, target = '') {
  const data = await readLocal<LogsFile>('logs.json') || {}
  if (!data[serverId]) data[serverId] = []
  const entry: LogEntry = { id: Date.now().toString(), action, by, target, timestamp: Date.now() }
  data[serverId] = [entry, ...data[serverId]].slice(0, 100)
  await writeLocal('logs.json', data)
}

function broadcastSettingsUpdate(serverId: string, type: string, payload?: Record<string, any>) {
  const room = joinMeshRoom(`settings_${serverId}`)
  if (room) {
    const [send] = (room.makeAction as any)('settings_update') as [any, any]
    try { send({ type, ...(payload || {}) }) } catch {}
  }
}

// ── Constantes ──
const BANNER_COLORS = ['#5865f2', '#23a559', '#f0b232', '#f23f43', '#f47fff', '#00b0f4', '#111214', '#2b2d31']
const ROLE_COLORS   = ['#f47fff', '#f23f43', '#23a559', '#5865f2', '#faa61a', '#eb459e', '#57f287', '#00b0f4']

const ROLE_OPTIONS: Role[] = ['admin', 'moderator', 'member']
const ROLE_LABELS: Record<Role, string> = {
  owner: 'Propriétaire', admin: 'Admin',
  moderator: 'Modérateur', member: 'Membre', banned: 'Banni'
}

const DURATION_OPTIONS = [
  { label: '30 minutes', value: 30 * 60 * 1000 },
  { label: '1 heure',    value: 60 * 60 * 1000 },
  { label: '6 heures',   value: 6 * 60 * 60 * 1000 },
  { label: '24 heures',  value: 24 * 60 * 60 * 1000 },
  { label: '7 jours',    value: 7 * 24 * 60 * 60 * 1000 },
  { label: 'Permanent',  value: 0 },
]

const MAX_USES_OPTIONS = [
  { label: 'Illimité', value: 0 },
  { label: '1 utilisation', value: 1 },
  { label: '5 utilisations', value: 5 },
  { label: '10 utilisations', value: 10 },
  { label: '25 utilisations', value: 25 },
  { label: '50 utilisations', value: 50 },
  { label: '100 utilisations', value: 100 },
]

const PERM_LABELS: Record<keyof Permissions, string> = {
  canSendMessages:   '💬 Envoyer des messages',
  canDeleteMessages: '🗑️ Supprimer des messages',
  canManageChannels: '📁 Gérer les salons',
  canKickMembers:    '👢 Expulser des membres',
  canBanMembers:     '🔨 Bannir des membres',
  canManageRoles:    '🎭 Gérer les rôles',
  canMuteMembers:    '🔇 Rendre muet',
}

const SECTIONS = [
  { id: 'profile',  label: 'Profil du serveur', group: 'GESTION DU SERVEUR' },
  { id: 'invites',  label: 'Invitations',        group: null },
  { id: 'members',  label: 'Membres',            group: 'PERSONNES' },
  { id: 'roles',    label: 'Rôles',              group: null },
  { id: 'bans',     label: 'Bannissements',      group: null },
  { id: 'logs',     label: "Logs d'activité",    group: 'MODÉRATION' },
  { id: 'automod',  label: 'AutoMod',            group: null },
  { id: 'emojis',   label: 'Émojis',             group: 'PERSONNALISATION' },
  { id: 'bots',     label: 'Bots installés',     group: 'APPLICATIONS' },
]

// ── Props ──
interface Props {
  server: Server
  username: string
  members: Member[]
  customRoles: CustomRole[]
  onClose: () => void
  onUpdateServer: (id: string, name: string) => void
  onDeleteServer: (id: string) => void
  onLeaveServer: (id: string) => void
  onUpdateRole: (targetUsername: string, role: Role) => void
  onKickMember: (targetUsername: string) => void
  onAssignCustomRole: (targetUsername: string, roleId: string | undefined) => void
  onCreateRole: (name: string) => void
  onUpdateCustomRole: (roleId: string, updates: Partial<Omit<CustomRole, 'id' | 'serverId'>>) => void
  onUpdatePermission: (roleId: string, permission: keyof Permissions, value: boolean) => void
  onDeleteRole: (roleId: string) => void
  onOpenBotEditor: (botId: string | null) => void
}

// ══════════════════════════════════════════════════════════
function ServerSettings({
  server, username, members, customRoles,
  onClose, onUpdateServer, onDeleteServer, onLeaveServer,
  onUpdateRole, onKickMember, onAssignCustomRole,
  onCreateRole, onUpdateCustomRole, onUpdatePermission, onDeleteRole,
  onOpenBotEditor,
}: Props) {
  const isOwner = server.ownerId === username
  const [tab, setTab] = useState('profile')

  // ── Profil serveur ──
  const [serverName, setServerName]         = useState(server.name)
  const [description, setDescription]       = useState('')
  const [bannerColor, setBannerColor]       = useState('#5865f2')
  const [bannerUrl, setBannerUrl]           = useState('')
  const [iconUrl, setIconUrl]               = useState('')
  const [tags, setTags]                     = useState('')
  const [tagInput, setTagInput]             = useState('')
  const [profileSaved, setProfileSaved]     = useState(false)
  const [uploadingIcon, setUploadingIcon]   = useState(false)
  const [uploadingBanner, setUploadingBanner] = useState(false)
  const iconInputRef   = useRef<HTMLInputElement>(null)
  const bannerInputRef = useRef<HTMLInputElement>(null)

  // ── Invitations ──
  const [invites, setInvites]             = useState<Record<string, Invite>>({})
  const [invDuration, setInvDuration]     = useState(24 * 60 * 60 * 1000)
  const [invMaxUses, setInvMaxUses]       = useState(0)
  const [copiedCode, setCopiedCode]       = useState('')

  // ── Membres ──
  const [memberSearch, setMemberSearch]   = useState('')

  // ── Rôles ──
  const [selectedRole, setSelectedRole]   = useState<CustomRole | null>(null)
  const [newRoleName, setNewRoleName]     = useState('')
  const [editRoleName, setEditRoleName]   = useState('')

  // ── Logs ──
  const [logs, setLogs]                   = useState<LogEntry[]>([])

  // ── AutoMod ──
  const [automod, setAutomod]             = useState<AutoMod>({ words: '', action: 'delete', enabled: false, banDuration: 10 })
  const [automodSaved, setAutomodSaved]   = useState(false)
  const [automodTagInput, setAutomodTagInput] = useState('')

  // ── Modale de confirmation ──
  const [confirmModal, setConfirmModal]   = useState<{
    message: string
    onConfirm: () => void
  } | null>(null)
  const askConfirm = (message: string, onConfirm: () => void) => {
    setConfirmModal({ message, onConfirm })
  }

  // ── Émojis personnalisés ──
  const { emojis: serverEmojis, addEmoji, removeEmoji } = useServerEmojis(server.id, username)
  const [newEmojiName, setNewEmojiName]   = useState('')
  const [newEmojiFile, setNewEmojiFile]   = useState<File | null>(null)
  const [newEmojiPreview, setNewEmojiPreview] = useState<string>('')
  const [emojiError, setEmojiError]       = useState('')
  const emojiInputRef = useRef<HTMLInputElement>(null)

  // ── Charger données depuis localStore ──
  const refreshLogs = async () => {
    const data = await readLocal<LogsFile>('logs.json') || {}
    setLogs((data[server.id] || []).slice(0, 100))
  }

  useEffect(() => {
    if (!server.id) return
    let active = true

    // Profil serveur étendu
    readLocal<Record<string, any>>('servers.json').then(servers => {
      if (!active) return
      const s = (servers || {})[server.id]
      if (!s) return
      if (s.description) setDescription(s.description)
      if (s.bannerColor) setBannerColor(s.bannerColor)
      if (s.bannerUrl)   setBannerUrl(s.bannerUrl)
      if (s.iconUrl)     setIconUrl(s.iconUrl)
      if (s.tags)        setTags(s.tags)
    })
    // Invitations
    loadInvites(server.id).then(invs => { if (active) setInvites(invs) })
    // Logs
    refreshLogs()
    // AutoMod
    readLocal<Record<string, any>>('automod.json').then(data => {
      if (!active) return
      const am = (data || {})[server.id]
      if (am) setAutomod({ words: am.words || '', action: am.action || 'delete', enabled: !!am.enabled, banDuration: am.banDuration || 10 })
    })

    // Écouter mises à jour P2P
    const room = joinMeshRoom(`settings_${server.id}`)
    if (room) {
      const [, getUpdate] = (room.makeAction as any)('settings_update') as [any, any]
      getUpdate(async (data: any) => {
        if (!active) return
        if (data?.type === 'invite') {
          const invs = await loadInvites(server.id)
          if (active) setInvites(invs)
        }
        if (data?.type === 'log') refreshLogs()
        if (data?.type === 'profile') {
          // Mettre à jour le profil du serveur reçu d'un pair
          const servers = await readLocal<Record<string, any>>('servers.json') || {}
          const merged = {
            ...(servers[server.id] || {}),
            ...(data.description !== undefined ? { description: data.description } : {}),
            ...(data.bannerColor  !== undefined ? { bannerColor:  data.bannerColor  } : {}),
            ...(data.bannerUrl    !== undefined ? { bannerUrl:    data.bannerUrl    } : {}),
            ...(data.iconUrl      !== undefined ? { iconUrl:      data.iconUrl      } : {}),
            ...(data.tags         !== undefined ? { tags:         data.tags         } : {}),
            ...(data.name         !== undefined ? { name:         data.name         } : {}),
          }
          servers[server.id] = merged
          await writeLocal('servers.json', servers)
          // Mettre à jour les états locaux si le panneau est ouvert
          if (active) {
            if (data.description !== undefined) setDescription(data.description)
            if (data.bannerColor  !== undefined) setBannerColor(data.bannerColor)
            if (data.bannerUrl    !== undefined) setBannerUrl(data.bannerUrl)
            if (data.iconUrl      !== undefined) setIconUrl(data.iconUrl)
            if (data.tags         !== undefined) setTags(data.tags)
          }
        }
      })
    }

    return () => { active = false }
  }, [server.id]) // eslint-disable-line

  // Fermeture Échap
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  // ── Sauvegarder profil serveur ──
  const handleSaveProfile = async () => {
    if (!serverName.trim()) return
    onUpdateServer(server.id, serverName)
    // Sauvegarder les extras dans servers.json
    const servers = await readLocal<Record<string, any>>('servers.json') || {}
    servers[server.id] = { ...(servers[server.id] || {}), description, bannerColor, bannerUrl, iconUrl, tags }
    await writeLocal('servers.json', servers)
    await addLog(server.id, 'Profil serveur modifié', username)
    await refreshLogs()
    broadcastSettingsUpdate(server.id, 'profile', { description, bannerColor, bannerUrl, iconUrl, tags, name: serverName })
    setProfileSaved(true)
    setTimeout(() => setProfileSaved(false), 2000)
  }

  // ── Upload icône (base64, 100% P2P — pas de serveur requis) ──
  const handleIconUpload = async (file: File) => {
    setUploadingIcon(true)
    try {
      // Redimensionner à 64x64 max et convertir en base64
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const img = new Image()
        const url = URL.createObjectURL(file)
        img.onload = () => {
          const size = 64
          const canvas = document.createElement('canvas')
          canvas.width = size; canvas.height = size
          const ctx = canvas.getContext('2d')!
          ctx.drawImage(img, 0, 0, size, size)
          URL.revokeObjectURL(url)
          resolve(canvas.toDataURL('image/jpeg', 0.85))
        }
        img.onerror = reject
        img.src = url
      })
      setIconUrl(dataUrl)
    } catch { alert("Impossible de traiter l'icone.") }
    finally { setUploadingIcon(false) }
  }

  // ── Upload bannière (base64, redimensionné 1200x480) ──
  const handleBannerUpload = async (file: File) => {
    setUploadingBanner(true)
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const img = new Image()
        const url = URL.createObjectURL(file)
        img.onload = () => {
          const W = 1200, H = 480
          const canvas = document.createElement('canvas')
          canvas.width = W; canvas.height = H
          const ctx = canvas.getContext('2d')!
          // Cover crop
          const ratio = Math.max(W / img.width, H / img.height)
          const w = img.width * ratio, h = img.height * ratio
          ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h)
          URL.revokeObjectURL(url)
          resolve(canvas.toDataURL('image/jpeg', 0.82))
        }
        img.onerror = reject
        img.src = url
      })
      setBannerUrl(dataUrl)
    } catch { alert("Impossible de traiter la bannière.") }
    finally { setUploadingBanner(false) }
  }

  // ── Créer une invitation ──
  const handleCreateInvite = async () => {
    const code = Math.random().toString(36).slice(2, 8).toUpperCase()
    const invite: Invite = {
      code,
      duration: invDuration,
      maxUses: invMaxUses,
      uses: 0,
      createdAt: Date.now(),
      createdBy: username,
    }
    await saveInvite(server.id, code, invite)
    const invs = await loadInvites(server.id)
    setInvites(invs)
    broadcastSettingsUpdate(server.id, 'invite')
    await addLog(server.id, `Invitation créée (code ${code})`, username)
    await refreshLogs()
  }

  const handleDeleteInvite = async (code: string) => {
    await saveInvite(server.id, code, null)
    const invs = await loadInvites(server.id)
    setInvites(invs)
    broadcastSettingsUpdate(server.id, 'invite')
    await addLog(server.id, `Invitation supprimée (code ${code})`, username)
    await refreshLogs()
  }

  const handleCopyInvite = (code: string) => {
    navigator.clipboard.writeText(code)
    setCopiedCode(code)
    setTimeout(() => setCopiedCode(''), 2000)
  }

  const inviteUrl = (code: string) => `mesh://invite/${code}`

  const isInviteExpired = (inv: Invite): boolean => {
    if (inv.duration === 0) return false
    return Date.now() > inv.createdAt + inv.duration
  }

  const isInviteExhausted = (inv: Invite): boolean => {
    if (inv.maxUses === 0) return false
    return inv.uses >= inv.maxUses
  }

  // ── Kick / Ban ──
  const handleKick = (target: string) => {
    askConfirm(`Expulser ${target} du serveur ?`, () => {
      onKickMember(target)
      addLog(server.id, 'Membre expulsé', username, target)
    })
  }

  const handleBan = (target: string) => {
    askConfirm(`Bannir ${target} définitivement ?`, () => {
      onUpdateRole(target, 'banned')
      addLog(server.id, 'Membre banni', username, target)
    })
  }

  const handleUnban = (target: string) => {
    onUpdateRole(target, 'member')
    addLog(server.id, 'Membre débanni', username, target)
  }

  // ── Rôle personnalisé ──
  const handleCreateRole = () => {
    if (!newRoleName.trim()) return
    onCreateRole(newRoleName.trim())
    addLog(server.id, `Rôle créé : ${newRoleName}`, username)
    setNewRoleName('')
  }

  const handleDeleteRole = (role: CustomRole) => {
    askConfirm(`Supprimer le rôle "${role.name}" ?`, () => {
      onDeleteRole(role.id)
      addLog(server.id, `Rôle supprimé : ${role.name}`, username)
      if (selectedRole?.id === role.id) setSelectedRole(null)
    })
  }

  // ── Sauvegarder AutoMod ──
  const handleSaveAutoMod = async () => {
    const data = await readLocal<Record<string, any>>('automod.json') || {}
    data[server.id] = automod
    await writeLocal('automod.json', data)
    await addLog(server.id, `AutoMod ${automod.enabled ? 'activé' : 'désactivé'}`, username)
    await refreshLogs()
    broadcastSettingsUpdate(server.id, 'automod')
    setAutomodSaved(true)
    setTimeout(() => setAutomodSaved(false), 2000)
  }

  // ── Données membres filtrés ──
  const visibleMembers = members
    .filter(m => m.role !== 'banned')
    .filter(m => !memberSearch || m.username.toLowerCase().includes(memberSearch.toLowerCase()))
  const bannedMembers = members.filter(m => m.role === 'banned')

  // ── Render ──
  const renderContent = () => {
    switch (tab) {

      // ───────────────────────── PROFIL SERVEUR ─────────────────────────
      case 'profile':
        return (
          <div className="us-content">
            <h2 className="us-title">Profil du serveur</h2>

            {/* Aperçu bannière + icône */}
            <div className="ss-server-preview">
              {/* Bannière cliquable */}
              <div
                className="ss-server-banner"
                style={{
                  background: bannerUrl ? `url(${bannerUrl}) center/cover no-repeat` : bannerColor,
                  cursor: isOwner ? 'pointer' : 'default',
                }}
                onClick={() => isOwner && bannerInputRef.current?.click()}
                title={isOwner ? 'Cliquer pour changer la bannière' : undefined}
              >
                {isOwner && (
                  <div className="ss-banner-edit-hint">
                    {uploadingBanner ? '⏳ Upload…' : '🖼️ Modifier la bannière'}
                  </div>
                )}
              </div>

              <div className="ss-server-icon-wrapper">
                {iconUrl
                  ? <img src={iconUrl} alt="icon" className="ss-server-icon-img" />
                  : <div className="ss-server-icon-placeholder" style={{ background: server.color }}>{server.label}</div>
                }
                {isOwner && (
                  <button className="ss-icon-edit-btn" onClick={() => iconInputRef.current?.click()} title="Modifier l'icône">
                    {uploadingIcon ? '…' : '📷'}
                  </button>
                )}
              </div>
              <div className="ss-server-name-preview">{serverName || server.name}</div>
            </div>

            {/* Inputs fichiers cachés */}
            <input ref={iconInputRef} type="file" accept="image/*" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleIconUpload(f); e.target.value = '' }} />
            <input ref={bannerInputRef} type="file" accept="image/*" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleBannerUpload(f); e.target.value = '' }} />

            {isOwner && (
              <>
                {/* Couleur de bannière (si pas d'image) */}
                {!bannerUrl && (
                  <div className="us-section">
                    <div className="us-section-label">Couleur de bannière</div>
                    <div className="us-color-grid">
                      {BANNER_COLORS.map(c => (
                        <button key={c} className={`us-color-swatch ${bannerColor === c ? 'selected' : ''}`}
                          style={{ background: c, border: c === '#2b2d31' || c === '#111214' ? '1px solid #4e5058' : undefined }}
                          onClick={() => setBannerColor(c)} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Bouton retirer l'image de bannière */}
                {bannerUrl && (
                  <div className="us-section">
                    <button className="us-btn secondary" style={{ fontSize: 12 }} onClick={() => setBannerUrl('')}>
                      🗑️ Retirer l'image de bannière
                    </button>
                  </div>
                )}

                <div className="us-section">
                  <div className="us-section-label">Nom du serveur</div>
                  <input className="us-input" value={serverName} onChange={e => setServerName(e.target.value)} maxLength={100} />
                </div>

                <div className="us-section">
                  <div className="us-section-label">Description</div>
                  <textarea className="us-textarea" value={description}
                    onChange={e => setDescription(e.target.value)} placeholder="Décris ton serveur…" maxLength={500} rows={3} />
                  <div className="us-hint">{description.length}/500</div>
                </div>

                {/* Tags en chips */}
                <div className="us-section">
                  <div className="us-section-label">
                    Tags
                    <span className="us-section-label-sub"> — max 5, pour être trouvé par les autres</span>
                  </div>
                  <div className="ss-tags-chips">
                    {tags.split(',').map(t => t.trim()).filter(Boolean).map(tag => (
                      <span key={tag} className="ss-tag-chip">
                        #{tag}
                        <button className="ss-tag-chip-remove" onClick={() => {
                          const updated = tags.split(',').map(t => t.trim()).filter(t => t && t !== tag).join(', ')
                          setTags(updated)
                        }}>✕</button>
                      </span>
                    ))}
                    {tags.split(',').filter(t => t.trim()).length < 5 && (
                      <div className="ss-tags-add-row">
                        <input
                          className="ss-tags-input"
                          placeholder="Ajouter un tag…"
                          value={tagInput}
                          onChange={e => setTagInput(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' || e.key === ',') {
                              e.preventDefault()
                              const word = tagInput.trim().replace(/,/g, '').toLowerCase()
                              if (!word) return
                              const existing = tags.split(',').map(t => t.trim()).filter(Boolean)
                              if (!existing.includes(word) && existing.length < 5) {
                                setTags([...existing, word].join(', '))
                              }
                              setTagInput('')
                            }
                          }}
                          maxLength={20}
                        />
                      </div>
                    )}
                  </div>
                  <div className="us-hint">{tags.split(',').filter(t => t.trim()).length}/5 tags</div>
                </div>

                <button className={`us-btn primary ${profileSaved ? 'saved' : ''}`} onClick={handleSaveProfile}>
                  {profileSaved ? '✓ Sauvegardé !' : 'Sauvegarder les changements'}
                </button>
              </>
            )}

            {!isOwner && (
              <div className="us-info-box">Tu dois être propriétaire pour modifier le profil du serveur.</div>
            )}

            <div className="us-divider" />
            <div className="us-section">
              <div className="us-section-label">ID du serveur</div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <code className="us-code" style={{ flex: 1, wordBreak: 'break-all' }}>{server.id}</code>
                <button className="us-btn secondary" style={{ flexShrink: 0 }}
                  onClick={() => { navigator.clipboard.writeText(server.id) }}>
                  📋 Copier
                </button>
              </div>
            </div>
          </div>
        )

      // ───────────────────────── INVITATIONS ─────────────────────────
      case 'invites': {
        const activeInvites = Object.values(invites).filter(inv => !isInviteExpired(inv) && !isInviteExhausted(inv))
        const expiredInvites = Object.values(invites).filter(inv => isInviteExpired(inv) || isInviteExhausted(inv))
        return (
          <div className="us-content">
            <h2 className="us-title">Invitations</h2>

            <div className="ss-invite-create">
              <h3 className="us-subtitle">Créer une invitation</h3>
              <div className="ss-invite-options">
                <div className="us-section">
                  <div className="us-section-label">Durée</div>
                  <select className="us-select" value={invDuration} onChange={e => setInvDuration(Number(e.target.value))}>
                    {DURATION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="us-section">
                  <div className="us-section-label">Nombre max d'utilisations</div>
                  <select className="us-select" value={invMaxUses} onChange={e => setInvMaxUses(Number(e.target.value))}>
                    {MAX_USES_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>
              <button className="us-btn primary" onClick={handleCreateInvite}>✨ Générer une invitation</button>
            </div>

            {activeInvites.length > 0 && (
              <>
                <div className="us-divider" />
                <h3 className="us-subtitle">Invitations actives ({activeInvites.length})</h3>
                <div className="ss-invite-list">
                  {activeInvites.map(inv => (
                    <div key={inv.code} className="ss-invite-row">
                      <div>
                        <div className="ss-invite-code">{inv.code}</div>
                        <div className="ss-invite-url">{inviteUrl(inv.code)}</div>
                      </div>
                      <div className="ss-invite-meta">
                        <span>{inv.duration === 0 ? 'Permanent' : `Expire ${new Date(inv.createdAt + inv.duration).toLocaleDateString('fr-FR')}`}</span>
                        <span>{inv.uses}/{inv.maxUses === 0 ? '∞' : inv.maxUses} utilisations</span>
                        <span>Par {inv.createdBy}</span>
                      </div>
                      <div className="ss-invite-actions">
                        <button className="us-btn secondary" onClick={() => handleCopyInvite(inv.code)}>
                          {copiedCode === inv.code ? '✓ Copié' : '📋 Copier'}
                        </button>
                        <button className="us-btn danger" onClick={() => handleDeleteInvite(inv.code)}>🗑️</button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {expiredInvites.length > 0 && (
              <>
                <div className="us-divider" />
                <h3 className="us-subtitle" style={{ color: '#949ba4' }}>Expirées / Épuisées ({expiredInvites.length})</h3>
                <div className="ss-invite-list" style={{ opacity: 0.5 }}>
                  {expiredInvites.map(inv => (
                    <div key={inv.code} className="ss-invite-row">
                      <div className="ss-invite-code">{inv.code}</div>
                      <div className="ss-invite-meta">
                        <span>{isInviteExpired(inv) ? 'Expirée' : 'Épuisée'}</span>
                      </div>
                      <button className="us-btn danger" onClick={() => handleDeleteInvite(inv.code)}>🗑️</button>
                    </div>
                  ))}
                </div>
              </>
            )}

            {Object.keys(invites).length === 0 && (
              <div className="us-info-box" style={{ marginTop: '16px' }}>Aucune invitation pour ce serveur.</div>
            )}
          </div>
        )
      }

      // ───────────────────────── MEMBRES ─────────────────────────
      case 'members':
        return (
          <div className="us-content">
            <h2 className="us-title">Membres</h2>
            <div style={{ color: '#949ba4', fontSize: '13px', marginBottom: '16px' }}>
              {visibleMembers.length} membre{visibleMembers.length !== 1 ? 's' : ''} actif{visibleMembers.length !== 1 ? 's' : ''}
            </div>

            <input className="us-input" placeholder="🔍 Rechercher un membre…" value={memberSearch}
              onChange={e => setMemberSearch(e.target.value)} style={{ marginBottom: '16px' }} />

            <div className="ss-member-list">
              {visibleMembers.map(member => {
                const isSelf = member.username === username
                const isServerOwner = member.role === 'owner'
                return (
                  <div key={member.username} className="ss-member-row">
                    <div className="ss-member-avatar" style={{ background: '#5865f2' }}>
                      {member.username[0].toUpperCase()}
                    </div>
                    <div className="ss-member-info">
                      <div className="ss-member-name">
                        {member.username}
                        {isSelf && <span className="ss-badge self">Vous</span>}
                        {isServerOwner && <span className="ss-badge owner">👑</span>}
                      </div>
                      <div className="ss-member-role">
                        {member.customRoleId
                          ? customRoles.find(r => r.id === member.customRoleId)?.name || ROLE_LABELS[member.role]
                          : ROLE_LABELS[member.role]
                        }
                      </div>
                    </div>

                    {isOwner && !isSelf && !isServerOwner && (
                      <div className="ss-member-actions">
                        <select
                          value={member.customRoleId || member.role}
                          className="us-select" style={{ width: 'auto', fontSize: '13px', padding: '4px 8px' }}
                          onChange={e => {
                            const val = e.target.value
                            const isCustom = customRoles.find(r => r.id === val)
                            if (isCustom) {
                              onAssignCustomRole(member.username, val)
                            } else {
                              onAssignCustomRole(member.username, undefined)
                              onUpdateRole(member.username, val as Role)
                              addLog(server.id, `Rôle changé → ${ROLE_LABELS[val as Role]}`, username, member.username)
                            }
                          }}
                        >
                          {ROLE_OPTIONS.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                          {customRoles.map(r => <option key={r.id} value={r.id}>🎭 {r.name}</option>)}
                        </select>
                        <button className="ss-action-btn kick" onClick={() => handleKick(member.username)} title="Expulser">👢</button>
                        <button className="ss-action-btn ban"  onClick={() => handleBan(member.username)}  title="Bannir">🔨</button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {visibleMembers.length === 0 && memberSearch && (
              <div className="us-info-box">Aucun membre ne correspond à ta recherche.</div>
            )}
          </div>
        )

      // ───────────────────────── RÔLES ─────────────────────────
      case 'roles':
        return (
          <div className="us-content">
            <h2 className="us-title">Rôles personnalisés</h2>

            <div className="ss-roles-layout">
              {/* Liste des rôles */}
              <div className="ss-roles-list">
                {customRoles.map(role => (
                  <div
                    key={role.id}
                    className={`ss-role-item ${selectedRole?.id === role.id ? 'selected' : ''}`}
                    onClick={() => { setSelectedRole(role); setEditRoleName(role.name) }}
                  >
                    <div className="ss-role-dot" style={{ background: role.color }} />
                    <span className="ss-role-name">{role.name}</span>
                    {isOwner && (
                      <button className="ss-role-delete" onClick={e => { e.stopPropagation(); handleDeleteRole(role) }} title="Supprimer">✕</button>
                    )}
                  </div>
                ))}

                {customRoles.length === 0 && (
                  <div style={{ color: '#949ba4', fontSize: '13px', padding: '8px' }}>Aucun rôle personnalisé.</div>
                )}

                {isOwner && (
                  <div className="ss-role-create">
                    <input className="us-input" placeholder="Nouveau rôle…" value={newRoleName}
                      onChange={e => setNewRoleName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleCreateRole()} />
                    <button className="us-btn primary" onClick={handleCreateRole} style={{ marginTop: '8px', width: '100%' }}>+ Créer</button>
                  </div>
                )}
              </div>

              {/* Détail du rôle sélectionné */}
              {selectedRole && (
                <div className="ss-role-detail">
                  <h3 className="us-subtitle" style={{ margin: '0 0 16px' }}>
                    <span style={{ color: selectedRole.color }}>●</span> {selectedRole.name}
                  </h3>

                  {isOwner && (
                    <>
                      <div className="us-section">
                        <div className="us-section-label">Nom du rôle</div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <input className="us-input" value={editRoleName} onChange={e => setEditRoleName(e.target.value)} />
                          <button className="us-btn primary" onClick={() => {
                            if (!editRoleName.trim()) return
                            onUpdateCustomRole(selectedRole.id, { name: editRoleName.trim() })
                            setSelectedRole(prev => prev ? { ...prev, name: editRoleName.trim() } : prev)
                          }}>✓</button>
                        </div>
                      </div>

                      <div className="us-section">
                        <div className="us-section-label">Couleur</div>
                        <div className="us-color-grid">
                          {ROLE_COLORS.map(c => (
                            <button key={c} className={`us-color-swatch ${selectedRole.color === c ? 'selected' : ''}`}
                              style={{ background: c }}
                              onClick={() => {
                                onUpdateCustomRole(selectedRole.id, { color: c })
                                setSelectedRole(prev => prev ? { ...prev, color: c } : prev)
                              }} />
                          ))}
                        </div>
                      </div>

                      <div className="us-section">
                        <div className="us-section-label">Permissions</div>
                        <div className="ss-permissions">
                          {(Object.keys(PERM_LABELS) as (keyof Permissions)[]).map(perm => (
                            <div key={perm} className="ss-perm-row">
                              <span className="ss-perm-label">{PERM_LABELS[perm]}</span>
                              <button
                                className={`us-toggle ${selectedRole.permissions?.[perm] ? 'on' : 'off'}`}
                                onClick={() => {
                                  const newVal = !selectedRole.permissions?.[perm]
                                  onUpdatePermission(selectedRole.id, perm, newVal)
                                  setSelectedRole(prev => prev ? {
                                    ...prev,
                                    permissions: { ...prev.permissions, [perm]: newVal }
                                  } : prev)
                                }}
                              >
                                <div className="us-toggle-thumb" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  {!isOwner && (
                    <div className="ss-permissions" style={{ opacity: 0.7 }}>
                      {(Object.keys(PERM_LABELS) as (keyof Permissions)[]).map(perm => (
                        <div key={perm} className="ss-perm-row">
                          <span className="ss-perm-label">{PERM_LABELS[perm]}</span>
                          <span style={{ color: selectedRole.permissions?.[perm] ? '#23a559' : '#f23f43', fontSize: '16px' }}>
                            {selectedRole.permissions?.[perm] ? '✓' : '✗'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )

      // ───────────────────────── BANNISSEMENTS ─────────────────────────
      case 'bans':
        return (
          <div className="us-content">
            <h2 className="us-title">Bannissements</h2>
            {bannedMembers.length === 0 ? (
              <div className="us-info-box">Aucun membre banni sur ce serveur.</div>
            ) : (
              <div className="ss-member-list">
                {bannedMembers.map(member => (
                  <div key={member.username} className="ss-member-row">
                    <div className="ss-member-avatar" style={{ background: '#4e5058', opacity: 0.7 }}>
                      {member.username[0].toUpperCase()}
                    </div>
                    <div className="ss-member-info">
                      <div className="ss-member-name">{member.username}</div>
                      <div className="ss-member-role" style={{ color: '#f23f43' }}>Banni</div>
                    </div>
                    {isOwner && (
                      <button className="us-btn secondary" style={{ fontSize: '13px' }} onClick={() => handleUnban(member.username)}>
                        ✓ Débannir
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )

      // ───────────────────────── LOGS ─────────────────────────
      case 'logs':
        return (
          <div className="us-content">
            <h2 className="us-title">Logs d'activité</h2>
            <div style={{ color: '#949ba4', fontSize: '13px', marginBottom: '16px' }}>
              Dernières actions — {logs.length} entrée{logs.length !== 1 ? 's' : ''}
            </div>
            {logs.length === 0 ? (
              <div className="us-info-box">Aucune action enregistrée pour ce serveur.</div>
            ) : (
              <div className="ss-log-list">
                {logs.map(entry => (
                  <div key={entry.id} className="ss-log-row">
                    <div className="ss-log-dot" />
                    <div className="ss-log-content">
                      <span className="ss-log-action">{entry.action}</span>
                      {entry.target && <span className="ss-log-target"> → {entry.target}</span>}
                      <span className="ss-log-by"> par {entry.by}</span>
                    </div>
                    <div className="ss-log-time">
                      {new Date(entry.timestamp).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )

      // ───────────────────────── AUTOMOD ─────────────────────────
      case 'automod':
        return (
          <div className="us-content">
            <h2 className="us-title">AutoMod</h2>
            <p className="us-desc">Filtre automatiquement les messages contenant des mots interdits.</p>

            <div className="us-toggle-row">
              <div className="us-toggle-info">
                <div className="us-toggle-label">🛡️ AutoMod activé</div>
                <div className="us-toggle-desc">Active le filtrage automatique des messages.</div>
              </div>
              <button className={`us-toggle ${automod.enabled ? 'on' : 'off'}`}
                onClick={() => setAutomod(p => ({ ...p, enabled: !p.enabled }))}>
                <div className="us-toggle-thumb" />
              </button>
            </div>

            <div className="us-section" style={{ marginTop: '20px' }}>
              <div className="us-section-label">Mots interdits</div>

              {/* Tags existants */}
              <div className="us-automod-tags">
                {automod.words.split(',').map(w => w.trim()).filter(Boolean).map(word => (
                  <span key={word} className="us-automod-tag">
                    {word}
                    {isOwner && (
                      <button
                        className="us-automod-tag-remove"
                        onClick={() => {
                          const updated = automod.words.split(',').map(w => w.trim()).filter(w => w && w !== word).join(', ')
                          setAutomod(p => ({ ...p, words: updated }))
                        }}
                        title="Supprimer"
                      >✕</button>
                    )}
                  </span>
                ))}
                {automod.words.split(',').filter(w => w.trim()).length === 0 && (
                  <span className="us-automod-empty">Aucun mot interdit</span>
                )}
              </div>

              {/* Input pour ajouter un mot */}
              {isOwner && (
                <div className="us-automod-add-row">
                  <input
                    className="us-automod-input"
                    placeholder="Ajouter un mot…"
                    value={automodTagInput}
                    onChange={e => setAutomodTagInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ',') {
                        e.preventDefault()
                        const word = automodTagInput.trim().replace(/,/g, '')
                        if (!word) return
                        const existing = automod.words.split(',').map(w => w.trim()).filter(Boolean)
                        if (!existing.includes(word)) {
                          setAutomod(p => ({ ...p, words: [...existing, word].join(', ') }))
                        }
                        setAutomodTagInput('')
                      }
                      if (e.key === 'Escape') setAutomodTagInput('')
                    }}
                  />
                  <button
                    className="us-automod-add-btn"
                    onClick={() => {
                      const word = automodTagInput.trim().replace(/,/g, '')
                      if (!word) return
                      const existing = automod.words.split(',').map(w => w.trim()).filter(Boolean)
                      if (!existing.includes(word)) {
                        setAutomod(p => ({ ...p, words: [...existing, word].join(', ') }))
                      }
                      setAutomodTagInput('')
                    }}
                    disabled={!automodTagInput.trim()}
                  >Ajouter</button>
                </div>
              )}
              <div className="us-hint">
                {automod.words.split(',').filter(w => w.trim()).length} mot{automod.words.split(',').filter(w => w.trim()).length !== 1 ? 's' : ''} interdit{automod.words.split(',').filter(w => w.trim()).length !== 1 ? 's' : ''}
              </div>
            </div>

            <div className="us-section">
              <div className="us-section-label">Action automatique</div>
              <div className="us-radio-group">
                {[
                  { value: 'delete',  label: '🗑️ Supprimer le message',   desc: 'Le message est supprimé silencieusement.' },
                  { value: 'warn',    label: '⚠️ Avertir l\'auteur',       desc: 'Un avertissement est envoyé à l\'auteur.' },
                  { value: 'both',    label: '🛡️ Supprimer + Avertir',    desc: 'Le message est supprimé et l\'auteur est averti.' },
                  { value: 'tempban', label: '⏱️ Ban temporaire',          desc: 'L\'auteur est banni automatiquement pour une durée définie.' },
                ].map(opt => (
                  <label key={opt.value} className={`us-radio-item ${automod.action === opt.value ? 'selected' : ''}`}>
                    <input type="radio" name="automodAction" value={opt.value}
                      checked={automod.action === opt.value}
                      onChange={() => setAutomod(p => ({ ...p, action: opt.value as AutoMod['action'] }))}
                      disabled={!isOwner} />
                    <div>
                      <div className="us-radio-label">{opt.label}</div>
                      <div className="us-radio-desc">{opt.desc}</div>
                    </div>
                  </label>
                ))}
              </div>

              {/* Durée du ban temporaire */}
              {automod.action === 'tempban' && (
                <div className="us-automod-duration-row">
                  <span className="us-automod-duration-label">Durée du ban :</span>
                  <div className="us-automod-duration-options">
                    {[5, 10, 30, 60, 180, 1440].map(min => (
                      <button
                        key={min}
                        className={`us-automod-dur-btn${automod.banDuration === min ? ' active' : ''}`}
                        onClick={() => isOwner && setAutomod(p => ({ ...p, banDuration: min }))}
                        disabled={!isOwner}
                      >
                        {min < 60 ? `${min}min` : min === 1440 ? '24h' : `${min / 60}h`}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {isOwner && (
              <button className={`us-btn primary ${automodSaved ? 'saved' : ''}`} onClick={handleSaveAutoMod}>
                {automodSaved ? '✓ Sauvegardé !' : 'Sauvegarder'}
              </button>
            )}
          </div>
        )

      // ───────────────────────── ÉMOJIS ─────────────────────────
      case 'emojis':
        return (
          <div className="us-content">
            <h2 className="us-title">Émojis personnalisés</h2>
            <p style={{ color: '#80848e', fontSize: '14px', marginBottom: '20px' }}>
              Ajoutez vos propres émojis pour ce serveur. Formats : PNG, GIF, WEBP — max 256 Ko — nom en minuscules (lettres, chiffres, _, -).
            </p>

            {/* Formulaire d'ajout */}
            <div className="us-section" style={{ background: '#2b2d31', borderRadius: '8px', padding: '16px' }}>
              <div className="us-section-label">Ajouter un emoji</div>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                {/* Preview */}
                <div
                  onClick={() => emojiInputRef.current?.click()}
                  style={{
                    width: '64px', height: '64px', borderRadius: '8px',
                    background: '#1e1f22', border: '2px dashed #404249',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', overflow: 'hidden', flexShrink: 0
                  }}
                >
                  {newEmojiPreview
                    ? <img src={newEmojiPreview} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    : <span style={{ fontSize: '24px', color: '#404249' }}>+</span>
                  }
                </div>
                <input
                  ref={emojiInputRef}
                  type="file"
                  accept="image/png,image/gif,image/webp"
                  style={{ display: 'none' }}
                  onChange={e => {
                    const f = e.target.files?.[0]
                    if (!f) return
                    if (f.size > 256 * 1024) { setEmojiError('Fichier trop lourd (max 256 Ko)'); return }
                    setNewEmojiFile(f)
                    setEmojiError('')
                    const reader = new FileReader()
                    reader.onload = () => setNewEmojiPreview(reader.result as string)
                    reader.readAsDataURL(f)
                  }}
                />

                {/* Nom */}
                <div style={{ flex: 1, minWidth: '150px' }}>
                  <label style={{ fontSize: '12px', color: '#b5bac1', display: 'block', marginBottom: '6px' }}>
                    Nom de l'emoji
                  </label>
                  <input
                    className="us-input"
                    placeholder="ex: pepe_cool"
                    value={newEmojiName}
                    onChange={e => setNewEmojiName(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                    maxLength={32}
                  />
                </div>

                <button
                  className="us-save-btn"
                  disabled={!newEmojiFile || !newEmojiName}
                  onClick={async () => {
                    if (!newEmojiFile || !newEmojiName) return
                    setEmojiError('')
                    const ok = await addEmoji(newEmojiName, newEmojiFile)
                    if (ok) {
                      setNewEmojiName('')
                      setNewEmojiFile(null)
                      setNewEmojiPreview('')
                      if (emojiInputRef.current) emojiInputRef.current.value = ''
                    } else {
                      setEmojiError('Nom déjà utilisé ou invalide.')
                    }
                  }}
                >
                  Ajouter
                </button>
              </div>
              {emojiError && <p style={{ color: '#f23f43', fontSize: '13px', marginTop: '8px' }}>{emojiError}</p>}
            </div>

            {/* Liste des émojis existants */}
            <div style={{ marginTop: '20px' }}>
              <div className="us-section-label" style={{ marginBottom: '12px' }}>
                Émojis du serveur ({serverEmojis.length})
              </div>
              {serverEmojis.length === 0 ? (
                <div style={{ color: '#80848e', fontSize: '14px', textAlign: 'center', padding: '24px' }}>
                  Aucun emoji personnalisé pour ce serveur.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {serverEmojis.map(emoji => (
                    <div
                      key={emoji.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '16px',
                        padding: '10px 14px', background: '#2b2d31',
                        borderRadius: '8px', border: '1px solid #1e1f22'
                      }}
                    >
                      <img src={emoji.url} alt={emoji.name} style={{ width: '40px', height: '40px', objectFit: 'contain', borderRadius: '4px' }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ color: '#dcddde', fontWeight: 600 }}>:{emoji.name}:</div>
                        <div style={{ color: '#80848e', fontSize: '12px' }}>Ajouté par {emoji.addedBy}</div>
                      </div>
                      {isOwner && (
                        <button
                          onClick={() => removeEmoji(emoji.id)}
                          style={{
                            background: 'none', border: 'none', color: '#80848e',
                            cursor: 'pointer', fontSize: '18px', padding: '4px 8px',
                            borderRadius: '4px'
                          }}
                          onMouseEnter={e => (e.currentTarget.style.color = '#f23f43')}
                          onMouseLeave={e => (e.currentTarget.style.color = '#80848e')}
                          title="Supprimer l'emoji"
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )

      // ───────────────────────── BOTS ─────────────────────────
      case 'bots':
        return (
          <div className="us-content">
            <BotList serverId={server.id} onEditBot={onOpenBotEditor} />
          </div>
        )

      default:
        return null
    }
  }

  const isOwnerOrAdmin = isOwner || members.find(m => m.username === username)?.role === 'admin'
  let lastGroup = ''

  return (
    <div className="us-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="us-container">

        {/* Sidebar */}
        <div className="us-sidebar">
          {SECTIONS.map(s => {
            // Cacher certaines sections aux non-admins
            if (['members', 'roles', 'bans', 'logs', 'automod'].includes(s.id) && !isOwnerOrAdmin) return null

            const showGroup = s.group && s.group !== lastGroup
            if (s.group) lastGroup = s.group
            return (
              <React.Fragment key={s.id}>
                {showGroup && <div className="us-group-label">{s.group}</div>}
                <button className={`us-tab ${tab === s.id ? 'active' : ''}`} onClick={() => setTab(s.id)}>
                  {s.label}
                </button>
              </React.Fragment>
            )
          })}

          <div className="us-sidebar-divider" />

          {isOwner ? (
            <button className="us-tab danger" onClick={() => {
              askConfirm(`Supprimer définitivement "${server.name}" ?`, () => {
                onDeleteServer(server.id)
                onClose()
              })
            }}>
              🗑️ Supprimer le serveur
            </button>
          ) : (
            <button className="us-tab danger" onClick={() => {
              askConfirm(`Quitter "${server.name}" ?`, () => {
                onLeaveServer(server.id)
                onClose()
              })
            }}>
              🚪 Quitter le serveur
            </button>
          )}
        </div>

        {/* Contenu */}
        <div className="us-main">
          {renderContent()}
        </div>

        {/* Bouton fermer */}
        <button className="us-close-btn" onClick={onClose} title="Fermer (Échap)">✕</button>
      </div>

      {/* ── Modale de confirmation ── */}
      {confirmModal && (
        <div className="confirm-overlay" onClick={() => setConfirmModal(null)}>
          <div className="confirm-dialog" onClick={e => e.stopPropagation()}>
            <p className="confirm-message">{confirmModal.message}</p>
            <div className="confirm-actions">
              <button className="confirm-btn cancel" onClick={() => setConfirmModal(null)}>
                Annuler
              </button>
              <button className="confirm-btn danger" onClick={() => {
                confirmModal.onConfirm()
                setConfirmModal(null)
              }}>
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ServerSettings
              onClose()
              })
            }}>
              🗑️ Supprimer le serveur
            </button>
          ) : (
            <button className="us-tab danger" onClick={() => {
              askConfirm(`Quitter "${server.name}" ?`, () => {
                onLeaveServer(server.id)
                onClose()
              })
            }}>
              🚪 Quitter le serveur
            </button>
          )}
        </div>

        {/* Contenu */}
        <div className="us-main">
          {renderContent()}
        </div>

        {/* Bouton fermer */}
        <button className="us-close-btn" onClick={onClose} title="Fermer (Échap)">✕</button>
      </div>

      {/* ── Modale de confirmation ── */}
      {confirmModal && (
        <div className="confirm-overlay" onClick={() => setConfirmModal(null)}>
          <div className="confirm-dialog" onClick={e => e.stopPropagation()}>
            <p className="confirm-message">{confirmModal.message}</p>
            <div className="confirm-actions">
              <button className="confirm-btn cancel" onClick={() => setConfirmModal(null)}>
                Annuler
              </button>
              <button className="confirm-btn danger" onClick={() => {
                confirmModal.onConfirm()
                setConfirmModal(null)
              }}>
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ServerSettings

export default ServerSettings
