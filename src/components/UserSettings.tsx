import React, { useState, useEffect, useRef, useCallback } from 'react'
import Gun from 'gun'
import 'gun/sea'
import type { UserProfile } from '../types'
import type { AppSettings } from '../useSettings'
import { AVATAR_DECORATIONS, PROFILE_EFFECTS } from './MemberTooltip'
import { resizeImage } from '../utils/imageResize'
import ImageCropper from './ImageCropper'

import { readLocal, writeLocal } from '../localStore'

const sea = (Gun as any).SEA

// ── Constantes ──
const AVATAR_COLORS = ['#5865f2', '#23a559', '#f0b232', '#f23f43', '#f47fff', '#00b0f4', '#eb459e', '#faa61a']
const BANNER_COLORS = ['#5865f2', '#23a559', '#f0b232', '#f23f43', '#f47fff', '#00b0f4', '#111214', '#2b2d31']
const ACCENT_COLORS = ['#5865f2', '#23a559', '#f0b232', '#f23f43', '#00b0f4', '#eb459e']


// ── Sections de la sidebar ──

interface Props {
  username: string
  profile: UserProfile
  settings: AppSettings
  onUpdateSettings: (partial: Partial<AppSettings>) => void
  onSaveProfile?: (updates: Partial<UserProfile>) => void
  onClose: () => void
  onLogout: () => void
}

function UserSettings({ username, profile, settings, onUpdateSettings, onSaveProfile, onClose, onLogout }: Props) {
  const [tab, setTab] = useState('account')

  // Mon compte — priorité à profile (source de vérité GunDB) sur settings
  const [localDisplayName, setLocalDisplayName] = useState(profile.displayName || settings.displayName || username)
  const [localBio, setLocalBio] = useState(profile.bio || settings.bio || '')
  const [localAvatarColor, setLocalAvatarColor] = useState(profile.avatarColor || '#5865f2')
  const [localBannerColor, setLocalBannerColor] = useState(profile.bannerColor || settings.bannerColor || '#5865f2')
  const [localDecoration, setLocalDecoration] = useState(profile.avatarDecoration || 'none')
  const [localEffect, setLocalEffect] = useState(profile.profileEffect || 'none')
  const [localAvatarImage, setLocalAvatarImage] = useState<string | undefined>(profile.avatarImage)
  const [localBannerImage, setLocalBannerImage] = useState<string | undefined>(profile.bannerImage)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [_bannerUploading, setBannerUploading] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const bannerInputRef = useRef<HTMLInputElement>(null)
  // Cropper
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const [cropTarget, setCropTarget] = useState<'avatar' | 'banner' | null>(null)
  const [accountSaved, setAccountSaved] = useState(false)

  // Mot de passe
  const [oldPwd, setOldPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [pwdMsg, setPwdMsg] = useState<{ text: string; ok: boolean } | null>(null)

  // Voix & Vidéo
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([])
  const [videoInputs, setVideoInputs] = useState<MediaDeviceInfo[]>([])
  const [selectedMic, setSelectedMic] = useState(settings.micDeviceId || '')
  const [selectedCam, setSelectedCam] = useState(settings.camDeviceId || '')
  const [inputVolume, setInputVolume] = useState(settings.inputVolume ?? 100)
  const [outputVolume, setOutputVolume] = useState(settings.outputVolume ?? 100)
  const [testingMic, setTestingMic] = useState(false)
  const [micLevel, setMicLevel] = useState(0)

  // ── Avancés : URL serveur custom ──
  const [customServerUrl, setCustomServerUrl] = useState(() => {
    try { return localStorage.getItem('mesh_server_url') || '' } catch { return '' }
  })
  const [serverUrlSaved, setServerUrlSaved] = useState(false)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number>(0)

  // Charger les périphériques audio/vidéo
  useEffect(() => {
    if (tab !== 'voice') return
    navigator.mediaDevices?.enumerateDevices().then(devices => {
      setAudioInputs(devices.filter(d => d.kind === 'audioinput'))
      setVideoInputs(devices.filter(d => d.kind === 'videoinput'))
    }).catch(() => {})
  }, [tab])

  // Nettoyer le test micro au démontage
  useEffect(() => () => { stopMicTest() }, []) // eslint-disable-line

  // ── Upload photo avatar — ouvre le cropper ──
  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      setCropSrc(ev.target?.result as string)
      setCropTarget('avatar')
    }
    reader.readAsDataURL(file)
    if (avatarInputRef.current) avatarInputRef.current.value = ''
  }

  // ── Confirmation crop avatar ──
  const handleCropAvatarConfirm = async (dataUrl: string) => {
    setCropSrc(null); setCropTarget(null)
    setAvatarUploading(true)
    try {
      // Redimensionner au bon format final
      const blob = await fetch(dataUrl).then(r => r.blob())
      const file = new File([blob], 'avatar.jpg', { type: blob.type })
      const resized = await resizeImage(file, 256, 256, 0.85)
      setLocalAvatarImage(resized)
      if (onSaveProfile) onSaveProfile({ avatarImage: resized })
    } catch (err) {
      console.error('Erreur crop avatar:', err)
    } finally {
      setAvatarUploading(false)
    }
  }

  // ── Supprimer photo avatar ──
  const handleAvatarRemove = () => {
    setLocalAvatarImage(undefined)
    if (onSaveProfile) onSaveProfile({ avatarImage: null as any })
  }

  // ── Upload photo bannière — ouvre le cropper ──
  const handleBannerUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      setCropSrc(ev.target?.result as string)
      setCropTarget('banner')
    }
    reader.readAsDataURL(file)
    if (bannerInputRef.current) bannerInputRef.current.value = ''
  }

  // ── Confirmation crop bannière ──
  const handleCropBannerConfirm = async (dataUrl: string) => {
    setCropSrc(null); setCropTarget(null)
    setBannerUploading(true)
    try {
      const blob = await fetch(dataUrl).then(r => r.blob())
      const file = new File([blob], 'banner.jpg', { type: blob.type })
      const resized = await resizeImage(file, 600, 200, 0.82)
      setLocalBannerImage(resized)
      if (onSaveProfile) onSaveProfile({ bannerImage: resized })
    } catch (err) {
      console.error('Erreur crop bannière:', err)
    } finally {
      setBannerUploading(false)
    }
  }

  // ── Supprimer photo bannière ──
  const handleBannerRemove = () => {
    setLocalBannerImage(undefined)
    if (onSaveProfile) onSaveProfile({ bannerImage: null as any })
  }

  // ── Sauvegarde compte ──
  const handleSaveAccount = () => {
    onSaveProfile?.({
      avatarColor: localAvatarColor,
      bannerColor: localBannerColor,
      displayName: localDisplayName,
      bio: localBio,
      avatarDecoration: localDecoration === 'none' ? undefined : localDecoration,
      profileEffect: localEffect === 'none' ? undefined : localEffect,
      avatarImage: localAvatarImage,
      bannerImage: localBannerImage,
    })
    onUpdateSettings({
      displayName: localDisplayName,
      bio: localBio,
      bannerColor: localBannerColor,
    })
    setAccountSaved(true)
    setTimeout(() => setAccountSaved(false), 2000)
  }

  // ── Changement de mot de passe ──
  const handleChangePassword = async () => {
    setPwdMsg(null)
    if (!oldPwd || !newPwd || !confirmPwd) { setPwdMsg({ text: 'Remplis tous les champs.', ok: false }); return }
    if (newPwd.length < 6) { setPwdMsg({ text: 'Mot de passe trop court (min 6 caractères).', ok: false }); return }
    if (newPwd !== confirmPwd) { setPwdMsg({ text: 'Les mots de passe ne correspondent pas.', ok: false }); return }

    const users = await readLocal<Record<string, any>>('users.json') || {}
    const user = users[username]
    if (!user) { setPwdMsg({ text: 'Utilisateur introuvable.', ok: false }); return }
    const oldHash = await sea.work(oldPwd, username)
    if (oldHash !== user.password) { setPwdMsg({ text: 'Ancien mot de passe incorrect.', ok: false }); return }
    const newHash = await sea.work(newPwd, username)
    users[username] = { ...user, password: newHash }
    await writeLocal('users.json', users)
    setPwdMsg({ text: 'Mot de passe modifié avec succès !', ok: true })
    setOldPwd(''); setNewPwd(''); setConfirmPwd('')
  }

  // ── Test micro ──
  const startMicTest = useCallback(async () => {
    try {
      const constraints: MediaStreamConstraints = { audio: selectedMic ? { deviceId: selectedMic } : true }
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      streamRef.current = stream
      const ctx = new AudioContext()
      audioContextRef.current = ctx
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      analyserRef.current = analyser
      setTestingMic(true)

      const tick = () => {
        const data = new Uint8Array(analyser.frequencyBinCount)
        analyser.getByteFrequencyData(data)
        const avg = data.reduce((a, b) => a + b, 0) / data.length
        setMicLevel(Math.min(100, avg * 2))
        rafRef.current = requestAnimationFrame(tick)
      }
      tick()

      // Refresh device list with labels
      const devices = await navigator.mediaDevices.enumerateDevices()
      setAudioInputs(devices.filter(d => d.kind === 'audioinput'))
      setVideoInputs(devices.filter(d => d.kind === 'videoinput'))
    } catch {
      alert('Impossible d\'accéder au microphone.')
    }
  }, [selectedMic])

  const stopMicTest = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    audioContextRef.current?.close()
    streamRef.current = null
    audioContextRef.current = null
    analyserRef.current = null
    setTestingMic(false)
    setMicLevel(0)
  }, [])

  // ── Fermeture avec Échap ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // ── Rendu sections ──
  const renderContent = () => {
    switch (tab) {

      // ─────────────────────────── MON COMPTE ───────────────────────────
      case 'account':
        return (
          <div className="us-content">
            <h2 className="us-title">Mon compte</h2>

            {/* Bannière + avatar */}
            <div className="us-profile-preview">
              {/* Bannière cliquable */}
              <div
                className="us-banner us-banner-upload"
                style={{
                  backgroundColor: localBannerColor,
                  backgroundImage: localBannerImage ? `url(${localBannerImage})` : 'none',
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  backgroundRepeat: 'no-repeat',
                }}
                onClick={() => bannerInputRef.current?.click()}
                title="Changer la photo de bannière"
              >
                <div className="us-banner-overlay">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M3 4V1h2v3h3v2H5v3H3V6H0V4h3zm3 6V7h3V4h7l1.83 2H21c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H5c-1.1 0-2-.9-2-2V10h3zm7 9c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm-3.2-5c0 1.77 1.43 3.2 3.2 3.2 1.77 0 3.2-1.43 3.2-3.2 0-1.77-1.43-3.2-3.2-3.2-1.77 0-3.2 1.43-3.2 3.2z"/></svg>
                  Changer la bannière
                </div>
              </div>
              <input
                ref={bannerInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleBannerUpload}
              />

              {/* Avatar cliquable */}
              <div className="us-avatar-wrapper">
                <div
                  className="us-avatar us-avatar-upload"
                  style={{
                    background: localAvatarImage ? undefined : localAvatarColor,
                    backgroundImage: localAvatarImage ? `url(${localAvatarImage})` : undefined,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }}
                  onClick={() => avatarInputRef.current?.click()}
                  title="Changer la photo de profil"
                >
                  {!localAvatarImage && username[0].toUpperCase()}
                  <div className="us-avatar-overlay">
                    {avatarUploading ? '…' : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 4V1h2v3h3v2H5v3H3V6H0V4h3zm3 6V7h3V4h7l1.83 2H21c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H5c-1.1 0-2-.9-2-2V10h3zm7 9c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm-3.2-5c0 1.77 1.43 3.2 3.2 3.2 1.77 0 3.2-1.43 3.2-3.2 0-1.77-1.43-3.2-3.2-3.2-1.77 0-3.2 1.43-3.2 3.2z"/></svg>
                    )}
                  </div>
                </div>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handleAvatarUpload}
                />
              </div>
              <div className="us-preview-username">{localDisplayName || username}</div>

              {/* Boutons supprimer photo */}
              <div className="us-photo-actions">
                {localAvatarImage && (
                  <button className="us-btn-ghost danger" onClick={handleAvatarRemove}>
                    Supprimer la photo de profil
                  </button>
                )}
                {localBannerImage && (
                  <button className="us-btn-ghost danger" onClick={handleBannerRemove}>
                    Supprimer la photo de bannière
                  </button>
                )}
              </div>
            </div>

            <div className="us-section">
              <div className="us-section-label">Couleur de l'avatar <span className="us-hint-inline">(si pas de photo)</span></div>
              <div className="us-color-grid">
                {AVATAR_COLORS.map(c => (
                  <button
                    key={c}
                    className={`us-color-swatch ${localAvatarColor === c ? 'selected' : ''}`}
                    style={{ background: c }}
                    onClick={() => setLocalAvatarColor(c)}
                  />
                ))}
              </div>
            </div>

            <div className="us-section">
              <div className="us-section-label">Couleur de bannière <span className="us-hint-inline">(si pas de photo)</span></div>
              <div className="us-color-grid">
                {BANNER_COLORS.map(c => (
                  <button
                    key={c}
                    className={`us-color-swatch ${localBannerColor === c ? 'selected' : ''}`}
                    style={{ background: c, border: c === '#2b2d31' ? '1px solid #4e5058' : undefined }}
                    onClick={() => setLocalBannerColor(c)}
                  />
                ))}
              </div>
            </div>

            <div className="us-section">
              <div className="us-section-label">Nom d'affichage</div>
              <input
                className="us-input"
                value={localDisplayName}
                onChange={e => setLocalDisplayName(e.target.value)}
                placeholder={username}
                maxLength={32}
              />
              <div className="us-hint">{localDisplayName.length}/32</div>
            </div>

            <div className="us-section">
              <div className="us-section-label">Bio</div>
              <textarea
                className="us-textarea"
                value={localBio}
                onChange={e => setLocalBio(e.target.value)}
                placeholder="Parle un peu de toi…"
                maxLength={190}
                rows={3}
              />
              <div className="us-hint">{localBio.length}/190</div>
            </div>

            <button className={`us-btn primary ${accountSaved ? 'saved' : ''}`} onClick={handleSaveAccount}>
              {accountSaved ? '✓ Sauvegardé !' : 'Sauvegarder les changements'}
            </button>

            <div className="us-divider" />

            <h3 className="us-subtitle">Changer le mot de passe</h3>

            <div className="us-section">
              <div className="us-section-label">Ancien mot de passe</div>
              <input className="us-input" type="password" value={oldPwd} onChange={e => setOldPwd(e.target.value)} placeholder="••••••••" />
            </div>
            <div className="us-section">
              <div className="us-section-label">Nouveau mot de passe</div>
              <input className="us-input" type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} placeholder="Min. 6 caractères" />
            </div>
            <div className="us-section">
              <div className="us-section-label">Confirmer le nouveau mot de passe</div>
              <input className="us-input" type="password" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} placeholder="••••••••" />
            </div>
            {pwdMsg && <div className={`us-msg ${pwdMsg.ok ? 'ok' : 'err'}`}>{pwdMsg.text}</div>}
            <button className="us-btn secondary" onClick={handleChangePassword}>Modifier le mot de passe</button>
          </div>
        )

      // ─────────────────────────── PROFIL ───────────────────────────
      case 'profile':
        return (
          <div className="us-content">
            <h2 className="us-title">Aperçu du profil</h2>
            <p className="us-desc">Voici comment les autres membres te voient.</p>

            {/* Aperçu de la carte */}
            <div className="us-profile-card">
              <div className="us-card-banner" style={{
                backgroundColor: localBannerColor,
                backgroundImage: localBannerImage ? `url(${localBannerImage})` : 'none',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat',
              }} />
              <div className="us-card-body">
                <div
                  className={`us-card-avatar${localDecoration !== 'none' ? ` ${AVATAR_DECORATIONS[localDecoration]?.css || ''}` : ''}`}
                  style={{
                    background: localAvatarImage ? undefined : localAvatarColor,
                    backgroundImage: localAvatarImage ? `url(${localAvatarImage})` : undefined,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }}
                >
                  {!localAvatarImage && username[0].toUpperCase()}
                  <div className="us-card-status" style={{ background: profile.status === 'online' ? '#23a559' : profile.status === 'idle' ? '#f0b232' : profile.status === 'dnd' ? '#f23f43' : '#80848e' }} />
                </div>
                <div className="us-card-username">{localDisplayName || username}</div>
                {localBio && <div className="us-card-bio">{localBio}</div>}
                <div className="us-card-divider" />
                <div className="us-card-section-label">MEMBRE DEPUIS</div>
                <div className="us-card-date">{new Date().toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
              </div>
            </div>

            {/* Décoration d'avatar */}
            <div className="us-section">
              <div className="us-section-label">Décoration d'avatar</div>
              <p className="us-desc" style={{ marginBottom: 12 }}>Un cadre animé autour de ton avatar, visible par tous.</p>
              <div className="us-deco-grid">
                {Object.entries(AVATAR_DECORATIONS).map(([key, val]) => (
                  <button
                    key={key}
                    className={`us-deco-btn${localDecoration === key ? ' selected' : ''}`}
                    onClick={() => setLocalDecoration(key)}
                    title={val.label}
                  >
                    <div className={`us-deco-preview-avatar${val.css ? ` ${val.css}` : ''}`} style={{ background: localAvatarColor }}>
                      {username[0].toUpperCase()}
                    </div>
                    <span className="us-deco-label">{val.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Effet de profil */}
            <div className="us-section">
              <div className="us-section-label">Effet de profil</div>
              <p className="us-desc" style={{ marginBottom: 12 }}>Une animation sur la bannière de ta carte de profil.</p>
              <div className="us-deco-grid">
                {Object.entries(PROFILE_EFFECTS).map(([key, val]) => (
                  <button
                    key={key}
                    className={`us-deco-btn${localEffect === key ? ' selected' : ''}`}
                    onClick={() => setLocalEffect(key)}
                    title={val.label}
                  >
                    <div className={`us-effect-preview${val.css ? ` ${val.css}` : ''}`} />
                    <span className="us-deco-label">{val.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <button className="us-btn primary" onClick={handleSaveAccount} style={{ marginTop: 8 }}>
              {accountSaved ? '✓ Sauvegardé !' : 'Enregistrer les changements'}
            </button>
          </div>
        )

      // ─────────────────────────── CONFIDENTIALITÉ ───────────────────────────
      case 'privacy':
        return (
          <div className="us-content">
            <h2 className="us-title">Confidentialité</h2>
            <div className="us-section">
              <div className="us-section-label">Qui peut m'envoyer des messages privés</div>
              <div className="us-radio-group">
                {[
                  { value: 'everyone', label: 'Tout le monde', desc: 'N\'importe quel membre peut t\'envoyer un MP.' },
                  { value: 'friends', label: 'Amis seulement', desc: 'Seuls tes amis peuvent t\'envoyer des MP.' },
                ].map(opt => (
                  <label key={opt.value} className={`us-radio-item ${settings.dmPrivacy === opt.value ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="dmPrivacy"
                      value={opt.value}
                      checked={settings.dmPrivacy === opt.value}
                      onChange={() => onUpdateSettings({ dmPrivacy: opt.value as 'everyone' | 'friends' })}
                    />
                    <div>
                      <div className="us-radio-label">{opt.label}</div>
                      <div className="us-radio-desc">{opt.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )

      // ─────────────────────────── APPARENCE ───────────────────────────
      case 'appearance':
        return (
          <div className="us-content">
            <h2 className="us-title">Apparence</h2>

            <div className="us-section">
              <div className="us-section-label">Thème</div>
              <div className="us-theme-grid">
                {[
                  { value: 'dark', label: '🌙 Sombre', preview: '#313338' },
                  { value: 'light', label: '☀️ Clair', preview: '#ffffff' },
                  { value: 'auto', label: '🖥️ Auto', preview: 'linear-gradient(135deg,#313338 50%,#ffffff 50%)' },
                ].map(t => (
                  <button
                    key={t.value}
                    className={`us-theme-btn ${settings.theme === t.value ? 'selected' : ''}`}
                    onClick={() => onUpdateSettings({ theme: t.value as AppSettings['theme'] })}
                  >
                    <div className="us-theme-preview" style={{ background: t.preview }} />
                    <span>{t.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="us-section">
              <div className="us-section-label">
                Taille de police — <span style={{ color: 'var(--accent, #5865f2)' }}>{settings.fontSize}px</span>
              </div>
              <div className="us-slider-row">
                <span className="us-slider-label">A</span>
                <input
                  type="range" min={12} max={20} step={1}
                  value={settings.fontSize}
                  onChange={e => onUpdateSettings({ fontSize: Number(e.target.value) })}
                  className="us-slider"
                />
                <span className="us-slider-label" style={{ fontSize: '20px' }}>A</span>
              </div>
              <div className="us-font-preview" style={{ fontSize: settings.fontSize }}>
                L'aperçu de ta taille de police.
              </div>
            </div>

            <div className="us-section">
              <div className="us-section-label">Affichage des messages</div>
              <div className="us-display-grid">
                {[
                  { value: 'cozy', label: '🛋️ Confortable', desc: 'Avatars visibles, plus d\'espace.' },
                  { value: 'compact', label: '📋 Compact', desc: 'Plus de messages visibles à l\'écran.' },
                ].map(d => (
                  <button
                    key={d.value}
                    className={`us-display-btn ${settings.messageDisplay === d.value ? 'selected' : ''}`}
                    onClick={() => onUpdateSettings({ messageDisplay: d.value as 'compact' | 'cozy' })}
                  >
                    <div className="us-display-icon">{d.label.split(' ')[0]}</div>
                    <div className="us-display-label">{d.label.split(' ').slice(1).join(' ')}</div>
                    <div className="us-display-desc">{d.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="us-section">
              <div className="us-section-label">Couleur d'accent</div>
              <div className="us-accent-grid">
                {ACCENT_COLORS.map(c => (
                  <button
                    key={c}
                    className={`us-accent-swatch ${settings.accentColor === c ? 'selected' : ''}`}
                    style={{ background: c }}
                    onClick={() => onUpdateSettings({ accentColor: c })}
                    title={c}
                  />
                ))}
              </div>
            </div>
          </div>
        )

      // ─────────────────────────── NOTIFICATIONS ───────────────────────────
      case 'notifications':
        return (
          <div className="us-content">
            <h2 className="us-title">Notifications</h2>

            {[
              { key: 'soundEnabled' as const, label: '🔔 Sons activés', desc: 'Joue un son lors de la réception d\'un message.' },
              { key: 'desktopNotifications' as const, label: '🖥️ Notifications bureau', desc: 'Affiche une notification système pour les nouveaux messages.' },
              { key: 'mentionsOnly' as const, label: '@️ Mentions uniquement', desc: 'Ne notifie que lorsque tu es mentionné(e).' },
            ].map(item => (
              <div key={item.key} className="us-toggle-row">
                <div className="us-toggle-info">
                  <div className="us-toggle-label">{item.label}</div>
                  <div className="us-toggle-desc">{item.desc}</div>
                </div>
                <button
                  className={`us-toggle ${settings[item.key] ? 'on' : 'off'}`}
                  onClick={async () => {
                    if (item.key === 'desktopNotifications' && !settings.desktopNotifications) {
                      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
                        const perm = await Notification.requestPermission()
                        if (perm !== 'granted') return
                      }
                    }
                    onUpdateSettings({ [item.key]: !settings[item.key] })
                  }}
                >
                  {settings[item.key] ? 'ON' : 'OFF'}
                </button>
              </div>
            ))}
          </div>
        )

      // ─────────────────────────── VOIX & VIDÉO ───────────────────────────
      case 'voice':
        return (
          <div className="us-content">
            <h2 className="us-title">Voix &amp; Vidéo</h2>

            <div className="us-section">
              <div className="us-section-label">Microphone</div>
              <select
                className="us-select"
                value={selectedMic}
                onChange={e => { setSelectedMic(e.target.value); onUpdateSettings({ micDeviceId: e.target.value }) }}
              >
                <option value="">Micro par défaut</option>
                {audioInputs.map(d => (
                  <option key={d.deviceId} value={d.deviceId}>{d.label || `Micro ${d.deviceId.slice(0,8)}`}</option>
                ))}
              </select>
            </div>

            <div className="us-section">
              <div className="us-section-label">Caméra</div>
              <select
                className="us-select"
                value={selectedCam}
                onChange={e => { setSelectedCam(e.target.value); onUpdateSettings({ camDeviceId: e.target.value }) }}
              >
                <option value="">Caméra par défaut</option>
                {videoInputs.map(d => (
                  <option key={d.deviceId} value={d.deviceId}>{d.label || `Caméra ${d.deviceId.slice(0,8)}`}</option>
                ))}
              </select>
            </div>

            <div className="us-section">
              <div className="us-section-label">Volume d'entrée (micro) — {inputVolume}%</div>
              <input
                type="range" min="0" max="200" value={inputVolume}
                onChange={e => { const v = Number(e.target.value); setInputVolume(v); onUpdateSettings({ inputVolume: v }) }}
                className="us-slider"
              />
            </div>

            <div className="us-section">
              <div className="us-section-label">Volume de sortie — {outputVolume}%</div>
              <input
                type="range" min="0" max="200" value={outputVolume}
                onChange={e => { const v = Number(e.target.value); setOutputVolume(v); onUpdateSettings({ outputVolume: v }) }}
                className="us-slider"
              />
            </div>

            <div className="us-section">
              <div className="us-section-label">Test du microphone</div>
              {testingMic ? (
                <div>
                  <div className="us-mic-bar-wrap">
                    <div className="us-mic-bar" style={{ width: `${micLevel}%` }} />
                  </div>
                  <button className="us-btn secondary" onClick={stopMicTest} style={{ marginTop: 8 }}>Arrêter le test</button>
                </div>
              ) : (
                <button className="us-btn secondary" onClick={startMicTest}>Tester le micro</button>
              )}
            </div>
          </div>
        )

      // ─────────────────────────── AVANCÉ ───────────────────────────
      case 'advanced':
        return (
          <div className="us-content">
            <h2 className="us-title">Avancé</h2>

            <div className="us-section">
              <div className="us-section-label">URL du serveur GunDB</div>
              <div className="us-hint">Laisse vide pour utiliser le réseau P2P par défaut.</div>
              <input
                className="us-input"
                type="text"
                placeholder="wss://monserveur.example.com/gun"
                value={customServerUrl}
                onChange={e => setCustomServerUrl(e.target.value)}
              />
              <button
                className="us-btn primary"
                style={{ marginTop: 10 }}
                onClick={() => {
                  try { localStorage.setItem('mesh_server_url', customServerUrl) } catch {}
                  setServerUrlSaved(true)
                  setTimeout(() => setServerUrlSaved(false), 2000)
                }}
              >
                {serverUrlSaved ? '✓ Sauvegardé' : 'Sauvegarder'}
              </button>
            </div>

            <div className="us-section">
              <div className="us-section-label">Informations</div>
              <div className="us-hint">
                Mesh — version P2P basée sur GunDB + WebRTC.<br/>
                Aucun serveur central requis.
              </div>
            </div>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <>
      {/* Modale de recadrage photo */}
      {cropSrc && cropTarget && (
        <ImageCropper
          src={cropSrc}
          aspect={cropTarget === 'avatar' ? 1 : 3}
          outputW={cropTarget === 'avatar' ? 256 : 600}
          outputH={cropTarget === 'avatar' ? 256 : 200}
          quality={cropTarget === 'avatar' ? 0.85 : 0.82}
          onConfirm={cropTarget === 'avatar' ? handleCropAvatarConfirm : handleCropBannerConfirm}
          onCancel={() => { setCropSrc(null); setCropTarget(null) }}
        />
      )}

      <div className="us-overlay" onClick={onClose}>
        <div className="us-modal" onClick={e => e.stopPropagation()}>
          <nav className="us-nav">
            <div className="us-nav-section-label">Paramètres utilisateur</div>
            {[
              { id: 'account',       icon: '👤', label: 'Mon compte' },
              { id: 'profile',       icon: '🎨', label: 'Profil' },
              { id: 'voice',         icon: '🎤', label: 'Voix & Vidéo' },
              { id: 'appearance',    icon: '🖌️', label: 'Apparence' },
              { id: 'notifications', icon: '🔔', label: 'Notifications' },
              { id: 'advanced',      icon: '⚙️', label: 'Avancé' },
            ].map(item => (
              <button
                key={item.id}
                className={`us-nav-btn ${tab === item.id ? 'active' : ''}`}
                onClick={() => setTab(item.id)}
              >
                <span className="us-nav-icon">{item.icon}</span>
                {item.label}
              </button>
            ))}
            <div className="us-nav-divider" />
            <button className="us-nav-btn danger" onClick={onLogout}>
              <span className="us-nav-icon">🚪</span>
              Se déconnecter
            </button>
          </nav>

          <div className="us-panel">
            {renderContent()}
          </div>

          <button className="us-close" onClick={onClose}>✕</button>
        </div>
      </div>
    </>
  )
}

export default UserSettings
