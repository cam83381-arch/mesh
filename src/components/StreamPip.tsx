/**
 * StreamPip.tsx — Vignette flottante stream (local ou pair)
 *
 * Mode "local"  : preview de son propre écran pendant un stream (audio muté)
 * Mode "remote" : stream d'un ami détaché en PIP pendant qu'on fait autre chose
 *
 * Draggable, masquable, redimensionnable via resize handle CSS.
 */

import { useEffect, useRef, useState } from 'react'

interface Props {
  // Mode local (mon stream)
  screenStream: React.MutableRefObject<MediaStream | null>
  isStreaming: boolean
  onStopStream: () => void

  // Mode remote (stream d'un ami — PIP détaché)
  remoteVideoRef?: React.RefObject<HTMLVideoElement | null>
  watchingStream?: string | null      // username du streamer
  onStopWatching?: () => void
  pipActive?: boolean                 // true = PIP remote activé
  onTogglePip?: (active: boolean) => void
}

function StreamPip({
  screenStream, isStreaming, onStopStream,
  remoteVideoRef, watchingStream, onStopWatching,
  pipActive, onTogglePip,
}: Props) {
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteCloneRef = useRef<HTMLVideoElement>(null)
  const pipRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(true)
  const [pos, setPos] = useState({ x: 20, y: 80 })
  const dragging = useRef(false)
  const dragOffset = useRef({ x: 0, y: 0 })

  // ── Mode local : brancher le flux d'écran (sans audio) ──
  useEffect(() => {
    if (!localVideoRef.current || !isStreaming) return
    const stream = screenStream.current
    if (!stream) return
    const videoTracks = stream.getVideoTracks()
    if (videoTracks.length === 0) return
    const previewStream = new MediaStream(videoTracks)
    localVideoRef.current.srcObject = previewStream
    localVideoRef.current.muted = true
    localVideoRef.current.play().catch(() => {})
    return () => {
      if (localVideoRef.current) localVideoRef.current.srcObject = null
    }
  }, [isStreaming, screenStream])

  // ── Mode remote : cloner le srcObject du videoRef principal ──
  useEffect(() => {
    if (!pipActive || !remoteVideoRef?.current || !remoteCloneRef.current) return
    const src = remoteVideoRef.current.srcObject
    if (!src) return
    remoteCloneRef.current.srcObject = src
    remoteCloneRef.current.play().catch(() => {})
    return () => {
      if (remoteCloneRef.current) remoteCloneRef.current.srcObject = null
    }
  }, [pipActive, remoteVideoRef, watchingStream])

  // Réinitialiser visibilité quand un nouveau stream démarre
  useEffect(() => {
    if (isStreaming || pipActive) setVisible(true)
  }, [isStreaming, pipActive])

  const isActive = isStreaming || pipActive
  if (!isActive) return null

  // ── Drag ──
  const onMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return
    dragging.current = true
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y }
    const onMove = (ev: MouseEvent) => {
      if (!dragging.current || !pipRef.current) return
      const maxX = window.innerWidth - pipRef.current.offsetWidth - 8
      const maxY = window.innerHeight - pipRef.current.offsetHeight - 8
      setPos({
        x: Math.max(8, Math.min(maxX, ev.clientX - dragOffset.current.x)),
        y: Math.max(8, Math.min(maxY, ev.clientY - dragOffset.current.y)),
      })
    }
    const onUp = () => {
      dragging.current = false
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const label = isStreaming ? '📡 Mon écran' : `👁️ ${watchingStream || 'Stream'}`

  return (
    <div
      ref={pipRef}
      className={`stream-pip${visible ? '' : ' stream-pip--hidden'}`}
      style={{ left: pos.x, top: pos.y }}
      onMouseDown={onMouseDown}
    >
      {visible ? (
        <>
          {/* Vidéo locale (mon stream) */}
          {isStreaming && (
            <video ref={localVideoRef} className="stream-pip-video" muted autoPlay playsInline />
          )}

          {/* Vidéo distante (stream d'un ami en PIP) */}
          {pipActive && !isStreaming && (
            <video ref={remoteCloneRef} className="stream-pip-video" autoPlay playsInline />
          )}

          <div className="stream-pip-controls">
            <button className="stream-pip-btn" title="Masquer" onClick={() => setVisible(false)}>🔲</button>
            {isStreaming && (
              <button className="stream-pip-btn stream-pip-btn--stop" title="Arrêter le stream" onClick={onStopStream}>
                ⏹ Stop
              </button>
            )}
            {pipActive && !isStreaming && (
              <button className="stream-pip-btn stream-pip-btn--stop" title="Fermer le PIP" onClick={() => {
                onTogglePip?.(false)
              }}>
                ✕ Fermer
              </button>
            )}
            {pipActive && !isStreaming && onStopWatching && (
              <button className="stream-pip-btn" title="Arrêter de regarder" onClick={onStopWatching}>
                ⏹ Quitter
              </button>
            )}
          </div>

          <div className="stream-pip-label">{label}</div>
        </>
      ) : (
        <button className="stream-pip-restore" title="Afficher" onClick={() => setVisible(true)}>
          {isStreaming ? '📡' : '👁️'}
          <span>{isStreaming ? 'Preview' : watchingStream}</span>
        </button>
      )}
    </div>
  )
}

export default StreamPip
