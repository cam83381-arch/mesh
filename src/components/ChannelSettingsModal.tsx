import { useState } from 'react'
import type { Channel, CustomRole, Member, ChannelPermOverride } from '../types'
import useChannelPermissions from '../useChannelPermissions'
import useWebhooks from '../useWebhooks'

interface Props {
  channel: Channel
  onSave: (channelId: string, updates: Partial<Channel>) => void
  onClose: () => void
  members?: Member[]
  customRoles?: CustomRole[]
  serverId?: string
}

type Tab = 'general' | 'permissions' | 'webhooks'

const PERM_KEYS: (keyof ChannelPermOverride['allow'])[] = ['canRead', 'canWrite', 'canManage']
const PERM_LABELS: Record<string, string> = {
  canRead: '👁️ Voir le salon',
  canWrite: '✏️ Envoyer des messages',
  canManage: '🛠️ Gérer les messages',
}

function ChannelSettingsModal({ channel, onSave, onClose, members: _members = [], customRoles = [], serverId = '' }: Props) {
  const [tab, setTab] = useState<Tab>('general')
  const [name, setName] = useState(channel.name)
  const [topic, setTopic] = useState(channel.topic || '')
  const [userLimit, setUserLimit] = useState(channel.userLimit ?? 0)

  // ── Permissions ──
  const { overrides, setOverride, removeOverride } = useChannelPermissions(serverId, channel.id)

  // ── Webhooks (texte seulement) ──
  const { webhooks, createWebhook, deleteWebhook } = useWebhooks(
    channel.type === 'text' ? serverId : '',
    channel.type === 'text' ? channel.id : '',
  )
  const [newWebhookName, setNewWebhookName] = useState('')
  const [copiedToken, setCopiedToken] = useState<string | null>(null)

  const handleCopyUrl = (url: string, token: string) => {
    navigator.clipboard.writeText(url).then(() => {
      setCopiedToken(token)
      setTimeout(() => setCopiedToken(null), 2000)
    })
  }
  const [addTargetType, setAddTargetType] = useState<'role' | 'user'>('role')
  const [addTargetId, setAddTargetId] = useState('')

  const handleSave = () => {
    onSave(channel.id, {
      name: name.trim() || channel.name,
      topic: topic.trim(),
      ...(channel.type === 'voice' ? { userLimit } : {}),
    })
    onClose()
  }

  // Obtenir ou créer l'override pour une cible
  const getOverride = (targetType: 'role' | 'user', targetId: string): ChannelPermOverride => {
    return overrides.find(o => o.targetType === targetType && o.targetId === targetId)
      ?? { targetId, targetType, allow: {}, deny: {} }
  }

  const handlePermToggle = (
    targetType: 'role' | 'user',
    targetId: string,
    perm: keyof ChannelPermOverride['allow'],
    value: 'allow' | 'deny' | 'inherit',
  ) => {
    const ov = { ...getOverride(targetType, targetId) }
    ov.allow = { ...ov.allow }
    ov.deny = { ...ov.deny }
    delete ov.allow[perm]
    delete ov.deny[perm]
    if (value === 'allow') ov.allow[perm] = true
    if (value === 'deny') ov.deny[perm] = true
    setOverride(ov)
  }

  const getPermValue = (
    targetType: 'role' | 'user',
    targetId: string,
    perm: keyof ChannelPermOverride['allow'],
  ): 'allow' | 'deny' | 'inherit' => {
    const ov = overrides.find(o => o.targetType === targetType && o.targetId === targetId)
    if (!ov) return 'inherit'
    if (ov.allow[perm]) return 'allow'
    if (ov.deny[perm]) return 'deny'
    return 'inherit'
  }

  const handleAddTarget = () => {
    if (!addTargetId.trim()) return
    setOverride(getOverride(addTargetType, addTargetId.trim()))
    setAddTargetId('')
  }

  // Cibles actives (rôles + users qui ont un override)
  const activeTargets = overrides.map(o => ({ type: o.targetType, id: o.targetId }))
  const hasOverride = activeTargets.length > 0

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box chan-settings-modal wide" onClick={e => e.stopPropagation()}>
        <div className="chan-settings-header">
          <span>{channel.type === 'voice' ? '🔊' : '#'} {channel.name} — Paramètres</span>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        {/* Onglets */}
        <div className="chan-settings-tabs">
          <button
            className={`chan-tab${tab === 'general' ? ' active' : ''}`}
            onClick={() => setTab('general')}
          >
            Général
          </button>
          <button
            className={`chan-tab${tab === 'permissions' ? ' active' : ''}`}
            onClick={() => setTab('permissions')}
          >
            Permissions
          </button>
          {channel.type === 'text' && (
            <button
              className={`chan-tab${tab === 'webhooks' ? ' active' : ''}`}
              onClick={() => setTab('webhooks')}
            >
              Webhooks
            </button>
          )}
        </div>

        <div className="chan-settings-body">

          {/* ── Onglet Webhooks ── */}
          {tab === 'webhooks' && (
            <div className="chan-webhooks-panel">
              <p className="chan-perms-hint">
                Les webhooks permettent à des services externes d'envoyer des messages dans ce salon via une URL unique.
              </p>

              {/* Créer un webhook */}
              <div className="chan-webhook-create-row">
                <input
                  className="chan-settings-input flex1"
                  placeholder="Nom du webhook…"
                  value={newWebhookName}
                  onChange={e => setNewWebhookName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && newWebhookName.trim()) {
                      createWebhook(newWebhookName.trim())
                      setNewWebhookName('')
                    }
                  }}
                  maxLength={64}
                />
                <button
                  className="chan-perms-add-btn"
                  disabled={!newWebhookName.trim()}
                  onClick={() => {
                    createWebhook(newWebhookName.trim())
                    setNewWebhookName('')
                  }}
                >
                  + Créer
                </button>
              </div>

              {/* Liste des webhooks */}
              {webhooks.length === 0 ? (
                <div className="chan-perms-empty">Aucun webhook créé pour ce salon.</div>
              ) : (
                <div className="chan-webhook-list">
                  {webhooks.map(wh => (
                    <div key={wh.token} className="chan-webhook-entry">
                      <div className="chan-webhook-name">🔗 {wh.name}</div>
                      <div className="chan-webhook-url-row">
                        <input
                          className="chan-webhook-url-input"
                          readOnly
                          value={wh.url}
                        />
                        <button
                          className={`chan-webhook-copy-btn${copiedToken === wh.token ? ' copied' : ''}`}
                          onClick={() => handleCopyUrl(wh.url, wh.token)}
                          title="Copier l'URL"
                        >
                          {copiedToken === wh.token ? '✓ Copié' : '📋 Copier'}
                        </button>
                        <button
                          className="chan-webhook-delete-btn"
                          onClick={() => deleteWebhook(wh.token)}
                          title="Supprimer ce webhook"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Onglet Général ── */}
          {tab === 'general' && (
            <>
              <label className="chan-settings-label">Nom du salon</label>
              <input
                className="chan-settings-input"
                value={name}
                onChange={e => setName(e.target.value)}
                maxLength={32}
                placeholder={channel.name}
              />

              {channel.type === 'text' && (
                <>
                  <label className="chan-settings-label" style={{ marginTop: 14 }}>
                    Sujet <span className="chan-settings-hint">(optionnel)</span>
                  </label>
                  <input
                    className="chan-settings-input"
                    value={topic}
                    onChange={e => setTopic(e.target.value)}
                    maxLength={128}
                    placeholder="Décris le sujet de ce salon…"
                  />
                </>
              )}

              {channel.type === 'voice' && (
                <>
                  <label className="chan-settings-label" style={{ marginTop: 14 }}>
                    Limite de membres <span className="chan-settings-hint">(0 = illimité)</span>
                  </label>
                  <div className="chan-limit-row">
                    <input
                      type="number"
                      className="chan-limit-input"
                      min={0} max={99}
                      value={userLimit}
                      onChange={e => setUserLimit(Math.max(0, parseInt(e.target.value) || 0))}
                    />
                    <span className="chan-limit-unit">membres max</span>
                  </div>
                  {userLimit > 0 && (
                    <div className="chan-limit-preview">
                      Le salon sera limité à {userLimit} membre{userLimit > 1 ? 's' : ''}.
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* ── Onglet Permissions ── */}
          {tab === 'permissions' && (
            <div className="chan-perms-panel">
              <p className="chan-perms-hint">
                Les overrides ci-dessous remplacent les permissions globales du serveur pour ce salon spécifique.
                <strong> Allow</strong> force l'accès, <strong>Deny</strong> le bloque,
                <strong> Hérité</strong> utilise les permissions du rôle serveur.
              </p>

              {/* Ajouter une cible */}
              <div className="chan-perms-add-row">
                <select
                  className="chan-perms-select"
                  value={addTargetType}
                  onChange={e => setAddTargetType(e.target.value as 'role' | 'user')}
                >
                  <option value="role">Rôle</option>
                  <option value="user">Utilisateur</option>
                </select>
                {addTargetType === 'role' ? (
                  <select
                    className="chan-perms-select flex1"
                    value={addTargetId}
                    onChange={e => setAddTargetId(e.target.value)}
                  >
                    <option value="">— Sélectionner un rôle —</option>
                    {customRoles.map(r => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    className="chan-settings-input flex1"
                    placeholder="Nom d'utilisateur…"
                    value={addTargetId}
                    onChange={e => setAddTargetId(e.target.value)}
                  />
                )}
                <button className="chan-perms-add-btn" onClick={handleAddTarget} disabled={!addTargetId.trim()}>
                  + Ajouter
                </button>
              </div>

              {/* Liste des overrides */}
              {!hasOverride && (
                <div className="chan-perms-empty">Aucun override — tout le monde suit les permissions du serveur.</div>
              )}

              {overrides.map(ov => {
                const label = ov.targetType === 'role'
                  ? (customRoles.find(r => r.id === ov.targetId)?.name ?? ov.targetId)
                  : ov.targetId
                const icon = ov.targetType === 'role' ? '🎭' : '👤'
                return (
                  <div key={`${ov.targetType}_${ov.targetId}`} className="chan-perms-entry">
                    <div className="chan-perms-entry-header">
                      <span>{icon} {label}</span>
                      <button
                        className="chan-perms-remove-btn"
                        onClick={() => removeOverride(ov.targetType, ov.targetId)}
                        title="Supprimer cet override"
                      >✕</button>
                    </div>
                    <div className="chan-perms-rows">
                      {PERM_KEYS.map(perm => {
                        const val = getPermValue(ov.targetType, ov.targetId, perm)
                        return (
                          <div key={perm} className="chan-perms-row">
                            <span className="chan-perms-row-label">{PERM_LABELS[perm]}</span>
                            <div className="chan-perms-btns">
                              {(['allow', 'inherit', 'deny'] as const).map(v => (
                                <button
                                  key={v}
                                  className={`chan-perm-btn ${v}${val === v ? ' active' : ''}`}
                                  onClick={() => handlePermToggle(ov.targetType, ov.targetId, perm, v)}
                                >
                                  {v === 'allow' ? '✓' : v === 'deny' ? '✗' : '—'}
                                </button>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="chan-settings-footer">
          <button className="chan-settings-cancel" onClick={onClose}>Annuler</button>
          <button className="chan-settings-save" onClick={handleSave}>Enregistrer</button>
        </div>
      </div>
    </div>
  )
}

export default ChannelSettingsModal
