/**
 * UpdateBanner
 * Bandeau de notification de mise à jour Mesh (electron-updater).
 * S'affiche en bas de l'écran quand une MAJ est disponible/téléchargée.
 */
import { useEffect, useState } from 'react'

type UpdateState = 'idle' | 'available' | 'downloading' | 'ready'

interface UpdateInfo {
  version?: string
  percent?: number
}

function UpdateBanner() {
  const [state, setState] = useState<UpdateState>('idle')
  const [info, setInfo] = useState<UpdateInfo>({})

  useEffect(() => {
    const el = (window as any).electron
    if (!el) return

    el.onUpdateAvailable?.((i: UpdateInfo) => {
      setState('available')
      setInfo(i || {})
    })

    el.onUpdateProgress?.((i: UpdateInfo) => {
      setState('downloading')
      setInfo(i || {})
    })

    el.onUpdateDownloaded?.((i: UpdateInfo) => {
      setState('ready')
      setInfo(i || {})
    })
  }, [])

  if (state === 'idle') return null

  return (
    <div className="update-banner">
      {state === 'available' && (
        <>
          <span className="update-banner-icon">🔄</span>
          <span className="update-banner-text">
            Mesh {info.version} est disponible — téléchargement en cours…
          </span>
        </>
      )}
      {state === 'downloading' && (
        <>
          <span className="update-banner-icon">⬇️</span>
          <span className="update-banner-text">
            Téléchargement de la mise à jour… {info.percent ?? 0}%
          </span>
          <div className="update-progress-bar">
            <div
              className="update-progress-fill"
              style={{ width: `${info.percent ?? 0}%` }}
            />
          </div>
        </>
      )}
      {state === 'ready' && (
        <>
          <span className="update-banner-icon">✅</span>
          <span className="update-banner-text">
            Mesh {info.version} est prêt — redémarrez pour mettre à jour.
          </span>
          <button
            className="update-install-btn"
            onClick={() => (window as any).electron?.installUpdate?.()}
          >
            Redémarrer maintenant
          </button>
          <button
            className="update-dismiss-btn"
            onClick={() => setState('idle')}
            title="Plus tard"
          >
            ✕
          </button>
        </>
      )}
    </div>
  )
}

export default UpdateBanner
