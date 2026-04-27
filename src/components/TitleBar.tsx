import React, { useEffect, useState } from 'react'

declare global {
  interface Window {
    electron?: {
      minimize: () => void
      maximize: () => void
      close: () => void
      showNotification: (title: string, body: string) => void
      onDeepLink: (callback: (url: string) => void) => void
      onUpdateAvailable: (callback: () => void) => void
      onUpdateDownloaded: (callback: () => void) => void
      installUpdate: () => void
      isElectron: boolean
    }
  }
}

interface TitleBarProps {
  onDeepLink?: (url: string) => void
}

const TitleBar: React.FC<TitleBarProps> = ({ onDeepLink }) => {
  const [updateReady, setUpdateReady] = useState(false)

  useEffect(() => {
    if (!window.electron) return

    window.electron.onUpdateAvailable(() => {
      // On pourrait afficher une bannière "Mise à jour disponible"
      console.log('[Electron] Mise à jour disponible')
    })
    window.electron.onUpdateDownloaded(() => {
      setUpdateReady(true)
    })
    if (onDeepLink) {
      window.electron.onDeepLink(onDeepLink)
    }
  }, [onDeepLink])

  // Ne rien afficher si pas dans Electron
  if (!window.electron) return null

  return (
    <>
      <div className="titlebar">
        <div className="titlebar-drag-region">
          {/* Logo + nom Mesh */}
          <div className="titlebar-brand">
            {/* Logo Mesh — Nebula Dark v3 */}
            <svg className="titlebar-logo" viewBox="0 0 36 36" width="18" height="18" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="tb-g1" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#6dd6d0"/>
                  <stop offset="100%" stopColor="#00c9b1"/>
                </linearGradient>
                <linearGradient id="tb-g2" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#7c5aff"/>
                  <stop offset="100%" stopColor="#00c9b1"/>
                </linearGradient>
                <filter id="tb-glow">
                  <feGaussianBlur stdDeviation="1.2" result="blur"/>
                  <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
                </filter>
              </defs>
              {/* Nœuds du maillage */}
              <circle cx="18" cy="18" r="4.5" fill="url(#tb-g1)" filter="url(#tb-glow)"/>
              <circle cx="7"  cy="9"  r="2.8" fill="#7c5aff" opacity="0.95"/>
              <circle cx="29" cy="9"  r="2.8" fill="#7c5aff" opacity="0.95"/>
              <circle cx="7"  cy="27" r="2.8" fill="#00c9b1" opacity="0.95"/>
              <circle cx="29" cy="27" r="2.8" fill="#00c9b1" opacity="0.95"/>
              {/* Connexions principales (hub→nœuds) */}
              <line x1="18" y1="18" x2="7"  y2="9"  stroke="url(#tb-g2)" strokeWidth="1.4" opacity="0.75"/>
              <line x1="18" y1="18" x2="29" y2="9"  stroke="url(#tb-g2)" strokeWidth="1.4" opacity="0.75"/>
              <line x1="18" y1="18" x2="7"  y2="27" stroke="url(#tb-g1)" strokeWidth="1.4" opacity="0.75"/>
              <line x1="18" y1="18" x2="29" y2="27" stroke="url(#tb-g1)" strokeWidth="1.4" opacity="0.75"/>
              {/* Connexions périphériques (le "maillage") */}
              <line x1="7"  y1="9"  x2="29" y2="9"  stroke="#7c5aff" strokeWidth="0.9" opacity="0.3"/>
              <line x1="7"  y1="27" x2="29" y2="27" stroke="#00c9b1" strokeWidth="0.9" opacity="0.3"/>
              <line x1="7"  y1="9"  x2="7"  y2="27" stroke="url(#tb-g2)" strokeWidth="0.9" opacity="0.3"/>
              <line x1="29" y1="9"  x2="29" y2="27" stroke="url(#tb-g2)" strokeWidth="0.9" opacity="0.3"/>
              {/* Diagonales de maillage */}
              <line x1="7"  y1="9"  x2="29" y2="27" stroke="url(#tb-g2)" strokeWidth="0.6" opacity="0.18"/>
              <line x1="29" y1="9"  x2="7"  y2="27" stroke="url(#tb-g2)" strokeWidth="0.6" opacity="0.18"/>
            </svg>
            <span className="titlebar-title">Mesh</span>
          </div>
        </div>
        <div className="titlebar-controls">
          {updateReady && (
            <button
              className="titlebar-update-btn"
              onClick={() => window.electron?.installUpdate()}
              title="Redémarrer pour installer la mise à jour"
            >
              ↺ Mise à jour
            </button>
          )}
          <button
            className="titlebar-btn titlebar-minimize"
            onClick={() => window.electron?.minimize()}
            title="Réduire"
          >
            <svg width="10" height="1" viewBox="0 0 10 1"><rect width="10" height="1" fill="currentColor"/></svg>
          </button>
          <button
            className="titlebar-btn titlebar-maximize"
            onClick={() => window.electron?.maximize()}
            title="Agrandir"
          >
            <svg width="10" height="10" viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1"/></svg>
          </button>
          <button
            className="titlebar-btn titlebar-close"
            onClick={() => window.electron?.close()}
            title="Fermer (continue dans la barre système)"
          >
            <svg width="10" height="10" viewBox="0 0 10 10"><line x1="0" y1="0" x2="10" y2="10" stroke="currentColor" strokeWidth="1.2"/><line x1="10" y1="0" x2="0" y2="10" stroke="currentColor" strokeWidth="1.2"/></svg>
          </button>
        </div>
      </div>
    </>
  )
}

export default TitleBar

// ── Hook utilitaire pour les notifications natives ──
export function useElectronNotification() {
  return (title: string, body: string) => {
    if (window.electron) {
      window.electron.showNotification(title, body)
    } else if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body })
    }
  }
}
