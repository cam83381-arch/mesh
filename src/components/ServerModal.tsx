import { useState } from 'react'

interface Props {
  onCreateServer: (name: string) => void
  onJoinServer: (id: string) => void
  onClose: () => void
}

function ServerModal({ onCreateServer, onJoinServer, onClose }: Props) {
  const [mode, setMode] = useState<'choice' | 'create' | 'join'>('choice')
  const [name, setName] = useState('')
  const [serverId, setServerId] = useState('')
  const [error, setError] = useState('')

  const handleCreate = () => {
    if (!name.trim()) { setError('Entre un nom !'); return }
    onCreateServer(name)
    onClose()
  }

  const handleJoin = () => {
    if (!serverId.trim()) { setError('Entre un ID !'); return }
    onJoinServer(serverId)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>

        {mode === 'choice' && (
          <>
            <h2 className="modal-title">Ajouter un serveur</h2>
            <p className="modal-subtitle">Crée le tien ou rejoins-en un existant</p>
            <button className="modal-btn primary" onClick={() => setMode('create')}>
              ✨ Créer un serveur
            </button>
            <button className="modal-btn secondary" onClick={() => setMode('join')}>
              🔗 Rejoindre un serveur
            </button>
          </>
        )}

        {mode === 'create' && (
          <>
            <h2 className="modal-title">Créer un serveur</h2>
            {error && <div className="auth-error">{error}</div>}
            <div className="auth-field">
              <label>Nom du serveur</label>
              <input
                type="text"
                placeholder="Mon super serveur"
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                autoFocus
              />
            </div>
            <button className="modal-btn primary" onClick={handleCreate}>
              Créer
            </button>
            <button className="modal-btn secondary" onClick={() => setMode('choice')}>
              Retour
            </button>
          </>
        )}

        {mode === 'join' && (
          <>
            <h2 className="modal-title">Rejoindre un serveur</h2>
            <p className="modal-subtitle">Entre un code d'invitation ou l'ID du serveur</p>
            {error && <div className="auth-error">{error}</div>}
            <div className="auth-field">
              <label>Code d'invitation ou ID</label>
              <input
                type="text"
                placeholder="ex: ABC123 ou 1743000000000"
                value={serverId}
                onChange={e => setServerId(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleJoin()}
                autoFocus
              />
            </div>
            <button className="modal-btn primary" onClick={handleJoin}>
              Rejoindre
            </button>
            <button className="modal-btn secondary" onClick={() => setMode('choice')}>
              Retour
            </button>
          </>
        )}

        <button className="modal-close" onClick={onClose}>✕</button>
      </div>
    </div>
  )
}

export default ServerModal