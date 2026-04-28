import { useState, useEffect } from 'react'
import type React from 'react'
import type { StreamConstraints, DesktopSource } from '../types'

const RESOLUTIONS = [
  { label: '720p', width: 1280, height: 720 },
  { label: '1080p', width: 1920, height: 1080 },
  { label: '1440p', width: 2560, height: 1440 },
]
const FPS_OPTIONS = [30, 60]

// ── SVG icons ──
const IconMic = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
    <line x1="12" y1="19" x2="12" y2="23"/>
    <line x1="8" y1="23" x2="16" y2="23"/>
  </svg>
)
const IconMicOff = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="1" y1="1" x2="23" y2="23"/>
    <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
    <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/>
    <line x1="12" y1="19" x2="12" y2="23"/>
    <line x1="8" y1="23" x2="16" y2="23"/>
  </svg>
)
const IconHeadphone = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 18v-6a9 9 0 0 1 18 0v6"/>
    <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>
  </svg>
)
const IconDeafened = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="1" y1="1" x2="23" y2="23"/>
    <path d="M3 18v-6a9 9 0 0 1 9-9 9 9 0 0 1 5.72 2.06"/>
    <path d="M21 12.06V18"/>
    <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3z"/>
    <path d="M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>
  </svg>
)
const IconScreen = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
    <line x1="8" y1="21" x2="16" y2="21"/>
    <line x1="12" y1="17" x2="12" y2="21"/>
  </svg>
)
const IconPhoneOff = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.45-3.45"/>
    <path d="M3.07 7.37A19.79 19.79 0 0 0 5.07 14 2 2 0 0 0 5 16v.09"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
)
const IconCamera = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 7l-7 5 7 5V7z"/>
    <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
  </svg>
)
const IconCameraOff = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
)

interface Props {
  isStreaming: boolean
  streamers: { id: string; username: string }[]
  watchingStream: string | null
  videoRef: React.RefObject<HTMLVideoElement | null>
  onStartStream: (constraints: StreamConstraints) => void
  onStopStream: () => void
  onWatchStream: (id: string) => void
  onStopWatching: () => void
  onTogglePip?: (active: boolean) => void
  isCameraOn: boolean
  cameraVideoRef: React.RefObject<HTMLVideoElement | null>
  onToggleCamera: () => void
  voiceUsers: { id: string; username: string }[]
  voiceFull: boolean
  onLeaveVoice?: () => void
  isMuted?: boolean
  isDeafened?: boolean
  onToggleMute?: () => void
  onToggleDeafen?: () => void
}

// Tuile membre vocal Nebula Premium
function VoiceTile({ user, isStreamer, isSelf, cameraRef }: {
  user: { id: string; username: string }
  isStreamer: boolean
  isSelf?: boolean
  cameraRef?: React.RefObject<HTMLVideoElement | null>
}) {
  // Gradients riches — donnent du volume et de la profondeur aux avatars
  const gradients = [
    'linear-gradient(135deg, #6354ff 0%, #b347e8 100%)',
    'linear-gradient(135deg, #eb459e 0%, #f77b5a 100%)',
    'linear-gradient(135deg, #23a559 0%, #43e179 100%)',
    'linear-gradient(135deg, #f0b232 0%, #f77b5a 100%)',
    'linear-gradient(135deg, #ed4245 0%, #eb459e 100%)',
    'linear-gradient(135deg, #0099da 0%, #5865f2 100%)',
    'linear-gradient(135deg, #5865f2 0%, #b347e8 100%)',
    'linear-gradient(135deg, #1e8449 0%, #00b0f4 100%)',
  ]
  const gradient = gradients[user.username.charCodeAt(0) % gradients.length]

  return (
    <div className="voice-tile">
      <div className="voice-tile-inner">
        {/* Si propre tuile + caméra active → afficher le flux vidéo */}
        {isSelf && cameraRef ? (
          <div className="voice-tile-cam-container">
            <video ref={cameraRef} className="voice-tile-cam" autoPlay playsInline muted />
          </div>
        ) : (
          <div className="voice-tile-avatar" style={{ background: gradient }}>
            {user.username.slice(0, 2).toUpperCase()}
            <div className="voice-tile-speaking-ring" />
          </div>
        )}
        <div className="voice-tile-name">
          {user.username}
          {isSelf && <span className="voice-tile-self-badge"> (toi)</span>}
        </div>
        <div className="voice-tile-icons">
          {isStreamer && (
            <span title="Partage son écran">
              <IconScreen />
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// Modal de sélection de source de capture d'écran
function ScreenPickerModal({
  onSelect,
  onCancel
}: {
  onSelect: (sourceId: string) => void
  onCancel: () => void
}) {
  const [sources, setSources] = useState<DesktopSource[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'screen' | 'window'>('screen')
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const electron = (window as any).electron
        if (electron?.getDesktopSources) {
          const srcs: DesktopSource[] = await electron.getDesktopSources({ types: ['screen', 'window'] })
          setSources(srcs)
        } else {
          // Navigateur standard — pas de liste de sources disponible
          setSources([])
        }
      } catch (e) {
        console.error('Erreur desktopCapturer:', e)
        setSources([])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const filtered = sources.filter(s => s.type === activeTab)

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-box screen-picker-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="screen-picker-header">
          <div className="screen-picker-title">
            <IconScreen />
            <span>Partager mon écran</span>
          </div>
          <button className="modal-close-btn" onClick={onCancel}>✕</button>
        </div>

        {/* Tabs */}
        <div className="screen-picker-tabs">
          <button
            className={`screen-picker-tab ${activeTab === 'screen' ? 'active' : ''}`}
            onClick={() => setActiveTab('screen')}
          >
            Écrans
          </button>
          <button
            className={`screen-picker-tab ${activeTab === 'window' ? 'active' : ''}`}
            onClick={() => setActiveTab('window')}
          >
            Fenêtres
          </button>
        </div>

        {/* Grid des sources */}
        <div className="screen-picker-grid">
          {loading && (
            <div className="screen-picker-loading">Chargement des sources...</div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="screen-picker-empty">
              {sources.length === 0
                ? 'Sources non disponibles dans ce mode (web). Lance l\'app Electron.'
                : `Aucun ${activeTab === 'screen' ? 'écran' : 'fenêtre'} disponible.`}
            </div>
          )}
          {filtered.map(src => (
            <div
              key={src.id}
              className={`screen-picker-item ${selected === src.id ? 'selected' : ''}`}
              onClick={() => setSelected(src.id)}
              onDoubleClick={() => onSelect(src.id)}
            >
              <div className="screen-picker-thumb">
                {src.thumbnailDataURL
                  ? <img src={src.thumbnailDataURL} alt={src.name} />
                  : <div className="screen-picker-no-thumb"><IconScreen /></div>
                }
              </div>
              <div className="screen-picker-name" title={src.name}>{src.name}</div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="screen-picker-footer">
          <button className="chan-settings-cancel" onClick={onCancel}>Annuler</button>
          <button
            className="chan-settings-save"
            disabled={!selected}
            onClick={() => selected && onSelect(selected)}
          >
            Partager
          </button>
        </div>
      </div>
    </div>
  )
}

// Modal qualité stream (résolution + fps)
function StreamQualityModal({
  onConfirm,
  onCancel,
  sourceId
}: {
  onConfirm: (constraints: StreamConstraints) => void
  onCancel: () => void
  sourceId?: string
}) {
  const [resolution, setResolution] = useState(1)
  const [fps, setFps] = useState(60)

  const handleConfirm = () => {
    const r = RESOLUTIONS[resolution]
    onConfirm({ width: r.width, height: r.height, frameRate: fps, sourceId })
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-box stream-quality-modal" onClick={e => e.stopPropagation()}>
        <div className="chan-settings-header">
          <span>Qualité du stream</span>
          <button className="modal-close-btn" onClick={onCancel}>✕</button>
        </div>
        <div className="chan-settings-body">
          <label className="chan-settings-label">Résolution</label>
          <div className="stream-quality-options">
            {RESOLUTIONS.map((r, i) => (
              <button
                key={r.label}
                className={`quality-option-btn ${resolution === i ? 'active' : ''}`}
                onClick={() => setResolution(i)}
              >
                {r.label}
                <span className="quality-sub">{r.width}×{r.height}</span>
              </button>
            ))}
          </div>
          <label className="chan-settings-label" style={{ marginTop: '16px' }}>FPS</label>
          <div className="stream-quality-options">
            {FPS_OPTIONS.map(f => (
              <button
                key={f}
                className={`quality-option-btn ${fps === f ? 'active' : ''}`}
                onClick={() => setFps(f)}
              >
                {f} FPS
              </button>
            ))}
          </div>
        </div>
        <div className="chan-settings-footer">
          <button className="chan-settings-cancel" onClick={onCancel}>Annuler</button>
          <button className="chan-settings-save" onClick={handleConfirm}>Démarrer</button>
        </div>
      </div>
    </div>
  )
}

// Icône PIP
const IconPip = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="16" rx="2"/>
    <rect x="12" y="12" width="8" height="6" rx="1" fill="currentColor" stroke="none"/>
  </svg>
)
const IconDots = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>
  </svg>
)

function StreamArea({
  isStreaming, streamers, watchingStream,
  videoRef, onStartStream, onStopStream, onWatchStream, onStopWatching, onTogglePip,
  isCameraOn, cameraVideoRef, onToggleCamera,
  voiceUsers, voiceFull, onLeaveVoice,
  isMuted = false, isDeafened = false, onToggleMute, onToggleDeafen
}: Props) {
  // États modaux — étape 1 : sélecteur de source, étape 2 : qualité
  const [showSourcePicker, setShowSourcePicker] = useState(false)
  const [showQualityModal, setShowQualityModal] = useState(false)
  const [pendingSourceId, setPendingSourceId] = useState<string | undefined>(undefined)
  const [showDotsMenu, setShowDotsMenu] = useState(false)

  const isElectron = !!(window as any).electron?.getDesktopSources

  const streamerIds = new Set(streamers.map(s => s.id))
  const selfUser = voiceUsers.find(u => u.id === '__self__')
  const otherUsers = voiceUsers.filter(u => u.id !== '__self__')
  const isInCall = voiceUsers.length > 0

  // Lancer le flux : sur Electron → ouvrir le sélecteur de source
  // Sur web → directement getDisplayMedia (qualité seulement)
  const handleStartStreamClick = () => {
    if (isElectron) {
      setShowSourcePicker(true)
    } else {
      setPendingSourceId(undefined)
      setShowQualityModal(true)
    }
  }

  // Après sélection de source → passer à la qualité
  const handleSourceSelected = (sourceId: string) => {
    setPendingSourceId(sourceId)
    setShowSourcePicker(false)
    setShowQualityModal(true)
  }

  const handleQualityConfirm = (constraints: StreamConstraints) => {
    setShowQualityModal(false)
    onStartStream({ ...constraints, sourceId: pendingSourceId })
  }

  return (
    <div className="voice-area">
      {/* Bannière salon plein */}
      {voiceFull && (
        <div className="voice-full-banner">🔒 Salon vocal plein</div>
      )}

      {/* Zone vidéo stream active */}
      {(isStreaming || watchingStream) && (
        <div className="voice-stream-container">
          <video ref={videoRef} className="voice-stream-video" autoPlay playsInline muted={isStreaming} />
          <div className="voice-stream-label">
            {isStreaming
              ? '🔴 Live — Tu partages ton écran'
              : `👁️ Stream de ${streamers.find(s => s.id === watchingStream)?.username || '...'}`}
          </div>
        </div>
      )}

      {/* Streams disponibles à regarder */}
      {!isStreaming && !watchingStream && streamers.length > 0 && (
        <div className="voice-stream-available">
          {streamers.map(s => (
            <div key={s.id} className="voice-stream-card" onClick={() => onWatchStream(s.id)}>
              <div className="voice-stream-card-icon">
                <IconScreen />
              </div>
              <div className="voice-stream-card-info">
                <div className="voice-stream-card-name">{s.username}</div>
                <div className="voice-stream-card-sub">Partage son écran — Cliquer pour regarder</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Grille membres */}
      <div className="voice-members-section">
        <div className="voice-members-header">
          MEMBRES — {voiceUsers.length}
        </div>
        <div className="voice-tiles-grid">
          {selfUser && (
            <VoiceTile
              key="__self__"
              user={selfUser}
              isStreamer={isStreaming}
              isSelf
              cameraRef={isCameraOn ? cameraVideoRef : undefined}
            />
          )}
          {otherUsers.map(u => (
            <VoiceTile key={u.id} user={u} isStreamer={streamerIds.has(u.id)} />
          ))}
          {voiceUsers.length === 0 && (
            <div className="voice-empty">
              <div style={{ fontSize: 36, marginBottom: 8, opacity: 0.4 }}>
                <IconHeadphone />
              </div>
              <div style={{ fontWeight: 600, color: 'var(--nb-text)' }}>Personne ici pour l'instant</div>
              <div style={{ fontSize: 12, color: 'var(--nb-text-mute)', marginTop: 4 }}>
                Clique sur un salon vocal pour rejoindre
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Barre de contrôles bas */}
      <div className="voice-controls-bar">
        {/* Gauche : statut connexion */}
        <div className="voice-controls-left">
          <div className="voice-status-dot" style={{ background: isInCall ? 'var(--nb-green)' : 'var(--nb-text-mute)' }} />
          <div className="voice-controls-left-info">
            <span className="voice-status-text">{isInCall ? 'Vocal connecté' : 'Vocal'}</span>
            {isInCall && <span className="voice-status-sub">Salon vocal</span>}
          </div>
        </div>

        {/* Centre : boutons actions */}
        <div className="voice-controls-center">
          {/* Micro */}
          <button
            className={`voice-ctrl-btn ${isMuted ? 'voice-ctrl-active' : ''}`}
            onClick={onToggleMute}
            title={isMuted ? 'Activer le micro' : 'Couper le micro'}
          >
            {isMuted ? <IconMicOff /> : <IconMic />}
          </button>

          {/* Casque */}
          <button
            className={`voice-ctrl-btn ${isDeafened ? 'voice-ctrl-active' : ''}`}
            onClick={onToggleDeafen}
            title={isDeafened ? 'Réactiver le son' : 'Couper le son'}
          >
            {isDeafened ? <IconDeafened /> : <IconHeadphone />}
          </button>

          {/* Caméra */}
          <button
            className={`voice-ctrl-btn ${isCameraOn ? 'voice-ctrl-cam-on' : ''}`}
            onClick={onToggleCamera}
            title={isCameraOn ? 'Désactiver la caméra' : 'Activer la caméra'}
          >
            {isCameraOn ? <IconCamera /> : <IconCameraOff />}
          </button>

          {/* Partage d'écran */}
          {isStreaming ? (
            <button className="voice-ctrl-btn voice-ctrl-stream-on" onClick={onStopStream} title="Arrêter le partage">
              <IconScreen />
            </button>
          ) : (
            <button
              className="voice-ctrl-btn"
              onClick={handleStartStreamClick}
              title="Partager mon écran"
            >
              <IconScreen />
            </button>
          )}

          {/* PIP — visible uniquement quand on regarde un stream */}
          {watchingStream && onTogglePip && (
            <button
              className="voice-ctrl-btn voice-ctrl-pip"
              onClick={() => onTogglePip(true)}
              title="Mini-lecteur (PIP)"
            >
              <IconPip />
            </button>
          )}

          {/* ⋯ Options — visible quand on regarde */}
          {watchingStream && (
            <div className="voice-dots-wrapper">
              <button
                className="voice-ctrl-btn"
                onClick={() => setShowDotsMenu(v => !v)}
                title="Plus d'options"
              >
                <IconDots />
              </button>
              {showDotsMenu && (
                <div className="voice-dots-menu" onMouseLeave={() => setShowDotsMenu(false)}>
                  <button
                    className="voice-dots-item voice-dots-item--danger"
                    onClick={() => { setShowDotsMenu(false); onStopWatching() }}
                  >
                    ⏹ Arrêter de regarder
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Droite : bouton raccrocher */}
        {isInCall && onLeaveVoice && (
          <button
            className="voice-leave-btn"
            onClick={onLeaveVoice}
            title="Quitter le salon vocal"
          >
            <IconPhoneOff />
          </button>
        )}
      </div>

      {/* Modal sélecteur de source */}
      {showSourcePicker && (
        <ScreenPickerModal
          onSelect={handleSourceSelected}
          onCancel={() => setShowSourcePicker(false)}
        />
      )}

      {/* Modal qualité */}
      {showQualityModal && (
        <StreamQualityModal
          sourceId={pendingSourceId}
          onConfirm={handleQualityConfirm}
          onCancel={() => setShowQualityModal(false)}
        />
      )}
    </div>
  )
}

export default StreamArea
