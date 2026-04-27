/**
 * VoicePip — Vignette vocale flottante (Picture-in-Picture)
 *
 * Apparaît quand on est en appel vocal mais qu'on consulte un canal texte.
 * Draggable, affiche les participants, halo vert pour celui qui parle,
 * contrôles essentiels au clic, bouton ↗ pour revenir en plein écran.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react'
import { getAvatarGradient } from '../utils/avatarGradient'

interface VoiceUser {
  id: string
  username: string
}

interface Props {
  voiceUsers: VoiceUser[]
  isMuted: boolean
  isDeafened: boolean
  onToggleMute: () => void
  onToggleDeafen: () => void
  onLeaveVoice: () => void
  onExpand: () => void                              // revenir au plein écran
  remoteAudios: React.MutableRefObject<Record<string, HTMLAudioElement>>
  localAudioStream: React.MutableRefObject<MediaStream | null>
  currentUsername: string
}

// ── Analyse audio → niveau 0–100 ──────────────────────────────────
function useAudioLevel(
  audioRef: HTMLAudioElement | MediaStream | null,
  active: boolean
): number {
  const [level, setLevel] = useState(0)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animRef = useRef<number>(0)
  const ctxRef = useRef<AudioContext | null>(null)

  useEffect(() => {
    if (!active || !audioRef) {
      setLevel(0)
      return
    }
    try {
      if (!ctxRef.current || ctxRef.current.state === 'closed') {
        ctxRef.current = new AudioContext()
      }
      const ctx = ctxRef.current
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      analyserRef.current = analyser

      let source: MediaStreamAudioSourceNode
      if (audioRef instanceof HTMLAudioElement && audioRef.srcObject) {
        source = ctx.createMediaStreamSource(audioRef.srcObject as MediaStream)
      } else if (audioRef instanceof MediaStream) {
        source = ctx.createMediaStreamSource(audioRef)
      } else {
        return
      }
      source.connect(analyser)

      const data = new Uint8Array(analyser.frequencyBinCount)
      const tick = () => {
        analyser.getByteFrequencyData(data)
        const avg = data.reduce((a, b) => a + b, 0) / data.length
        setLevel(Math.min(100, (avg / 128) * 100))
        animRef.current = requestAnimationFrame(tick)
      }
      animRef.current = requestAnimationFrame(tick)
    } catch {
      // AudioContext non dispo
    }
    return () => {
      cancelAnimationFrame(animRef.current)
      analyserRef.current = null
    }
  }, [active, audioRef])

  return level
}

// ── Tuile participant ──────────────────────────────────────────────
function ParticipantTile({
  user,
  audioEl,
  isSelf,
  isMuted,
}: {
  user: VoiceUser
  audioEl: HTMLAudioElement | MediaStream | null
  isSelf: boolean
  isMuted: boolean
}) {
  const level = useAudioLevel(audioEl, !isMuted || !isSelf)
  const isSpeaking = level > 8

  return (
    <div
      className="pip-tile"
      style={{
        boxShadow: isSpeaking
          ? `0 0 0 2px #43e179, 0 0 12px 4px rgba(67,225,121,0.45)`
          : '0 0 0 2px transparent',
        transition: 'box-shadow 0.12s ease',
      }}
    >
      <div
        className="pip-avatar"
        style={{ background: getAvatarGradient(user.username, undefined) }}
      >
        {user.username[0].toUpperCase()}
      </div>
      <span className="pip-name">{user.username}</span>
      {isSpeaking && <div className="pip-speaking-dot" />}
    </div>
  )
}

// ── Composant principal ────────────────────────────────────────────
export default function VoicePip({
  voiceUsers,
  isMuted,
  isDeafened,
  onToggleMute,
  onToggleDeafen,
  onLeaveVoice,
  onExpand,
  remoteAudios,
  localAudioStream,
  currentUsername,
}: Props) {
  // Position draggable
  const [pos, setPos] = useState({ x: window.innerWidth - 280, y: window.innerHeight - 260 })
  const dragging = useRef(false)
  const dragOffset = useRef({ x: 0, y: 0 })
  const pipRef = useRef<HTMLDivElement>(null)

  // Contrôles visibles
  const [showControls, setShowControls] = useState(false)

  // ── Drag ──────────────────────────────────────────────────────────
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    // Ignorer les clics sur les boutons
    if ((e.target as HTMLElement).closest('button')) return
    dragging.current = true
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y }
    e.preventDefault()
  }, [pos])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return
      const newX = Math.max(0, Math.min(window.innerWidth - 260, e.clientX - dragOffset.current.x))
      const newY = Math.max(40, Math.min(window.innerHeight - 200, e.clientY - dragOffset.current.y))
      setPos({ x: newX, y: newY })
    }
    const onUp = () => { dragging.current = false }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  // ── Afficher les participants (soi + les autres) ──────────────────
  const allUsers = [
    { id: 'self', username: currentUsername },
    ...voiceUsers.filter(u => u.username !== currentUsername),
  ]

  return (
    <div
      ref={pipRef}
      className={`voice-pip${showControls ? ' pip-open' : ''}`}
      style={{ left: pos.x, top: pos.y }}
      onMouseDown={onMouseDown}
      onClick={() => setShowControls(v => !v)}
    >
      {/* Header barre */}
      <div className="pip-header">
        <span className="pip-title">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <path d="M11.553 3.064A.75.75 0 0 1 12 3.75v16.5a.75.75 0 0 1-1.255.555L5.46 16H3a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1h2.46l5.285-4.805a.75.75 0 0 1 .808-.131z"/>
          </svg>
          Appel en cours
        </span>
        <button
          className="pip-expand-btn"
          title="Agrandir l'appel"
          onClick={e => { e.stopPropagation(); onExpand() }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <path d="M15 3h6v6l-2.293-2.293-4 4-1.414-1.414 4-4L15 3zM9 21H3v-6l2.293 2.293 4-4 1.414 1.414-4 4L9 21z"/>
          </svg>
        </button>
      </div>

      {/* Grille participants */}
      <div className="pip-tiles">
        {allUsers.slice(0, 4).map(user => (
          <ParticipantTile
            key={user.id}
            user={user}
            audioEl={
              user.username === currentUsername
                ? (localAudioStream.current ?? null)
                : (remoteAudios.current[user.id] ?? null)
            }
            isSelf={user.username === currentUsername}
            isMuted={isMuted && user.username === currentUsername}
          />
        ))}
        {allUsers.length > 4 && (
          <div className="pip-tile pip-more">+{allUsers.length - 4}</div>
        )}
      </div>

      {/* Contrôles (visibles au clic) */}
      {showControls && (
        <div
          className="pip-controls"
          onClick={e => e.stopPropagation()}
        >
          {/* Micro */}
          <button
            className={`pip-ctrl-btn${isMuted ? ' danger' : ''}`}
            title={isMuted ? 'Réactiver le micro' : 'Couper le micro'}
            onClick={onToggleMute}
          >
            {isMuted ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 11a7 7 0 0 1-7 7m0 0a7 7 0 0 1-7-7m7 7v3m-3 0h6M12 1a3 3 0 0 1 3 3v4a3 3 0 0 1-6 0V4a3 3 0 0 1 3-3z"/>
                <line x1="2" y1="2" x2="22" y2="22" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8"/>
              </svg>
            )}
          </button>

          {/* Son */}
          <button
            className={`pip-ctrl-btn${isDeafened ? ' danger' : ''}`}
            title={isDeafened ? 'Réactiver le son' : 'Couper le son'}
            onClick={onToggleDeafen}
          >
            {isDeafened ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 9a9 9 0 0 1 9-9 9 9 0 0 1 9 9v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/>
                <line x1="2" y1="2" x2="22" y2="22" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 9a9 9 0 0 1 18 0v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zm9-7a7 7 0 0 0-7 7v6h14v-6a7 7 0 0 0-7-7z"/>
              </svg>
            )}
          </button>

          {/* Raccrocher */}
          <button
            className="pip-ctrl-btn pip-leave"
            title="Quitter l'appel"
            onClick={onLeaveVoice}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/>
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}
