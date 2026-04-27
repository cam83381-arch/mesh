import { useState } from 'react'
import useAuth from '../useAuth'
import useServerReady from '../useServerReady'

interface Props {
  onLogin: (username: string) => void
}

function Auth({ onLogin }: Props) {
  const [isLogin, setIsLogin] = useState(true)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const { login, register, error, loading } = useAuth()
  const { ready: serverReady } = useServerReady(10000)

  const handleSubmit = async () => {
    if (!username.trim() || !password.trim()) return
    if (password.length < 6) return

    if (isLogin) {
      const user = await login(username, password)
      if (user) onLogin(user)
    } else {
      const user = await register(username, password)
      if (user) onLogin(user)
    }
  }

  // Ecran de démarrage pendant que le backend local s'initialise
  if (!serverReady) {
    return (
      <div className="auth-container">
        <div className="auth-grid-bg" aria-hidden="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className={`auth-grid-node auth-grid-node-${i}`}/>
          ))}
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className={`auth-grid-line auth-grid-line-${i}`}/>
          ))}
        </div>
        <div className="auth-box" style={{ textAlign: 'center', gap: '16px' }}>
          <div className="auth-logo-wrap">
            <svg viewBox="0 0 60 60" width="56" height="56" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="ag1b" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#6dd6d0"/>
                  <stop offset="100%" stopColor="#00c9b1"/>
                </linearGradient>
                <linearGradient id="ag2b" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#7c5aff"/>
                  <stop offset="100%" stopColor="#00c9b1"/>
                </linearGradient>
                <filter id="aglowb">
                  <feGaussianBlur stdDeviation="2" result="blur"/>
                  <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
                </filter>
              </defs>
              <circle cx="30" cy="30" r="7" fill="url(#ag1b)" filter="url(#aglowb)"/>
              <circle cx="10" cy="16" r="4.5" fill="#7c5aff" opacity="0.92"/>
              <circle cx="50" cy="16" r="4.5" fill="#7c5aff" opacity="0.92"/>
              <circle cx="10" cy="44" r="4.5" fill="#00c9b1" opacity="0.92"/>
              <circle cx="50" cy="44" r="4.5" fill="#00c9b1" opacity="0.92"/>
              <line x1="30" y1="30" x2="10" y2="16" stroke="url(#ag2b)" strokeWidth="1.8" opacity="0.75"/>
              <line x1="30" y1="30" x2="50" y2="16" stroke="url(#ag2b)" strokeWidth="1.8" opacity="0.75"/>
              <line x1="30" y1="30" x2="10" y2="44" stroke="url(#ag1b)" strokeWidth="1.8" opacity="0.75"/>
              <line x1="30" y1="30" x2="50" y2="44" stroke="url(#ag1b)" strokeWidth="1.8" opacity="0.75"/>
            </svg>
          </div>
          <h1 className="auth-title" style={{ fontSize: '1.3rem' }}>Démarrage de Mesh…</h1>
          <p className="auth-subtitle">Initialisation du réseau local</p>
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '8px' }}>
            <span className="auth-spinner" style={{ width: '28px', height: '28px', borderWidth: '3px' }}/>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-container">
      {/* Grille de fond animée */}
      <div className="auth-grid-bg" aria-hidden="true">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className={`auth-grid-node auth-grid-node-${i}`}/>
        ))}
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className={`auth-grid-line auth-grid-line-${i}`}/>
        ))}
      </div>

      <div className="auth-box">
        {/* Logo Mesh — Nebula Dark v3 */}
        <div className="auth-logo-wrap">
          <svg viewBox="0 0 60 60" width="56" height="56" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="ag1" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#6dd6d0"/>
                <stop offset="100%" stopColor="#00c9b1"/>
              </linearGradient>
              <linearGradient id="ag2" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#7c5aff"/>
                <stop offset="100%" stopColor="#00c9b1"/>
              </linearGradient>
              <filter id="aglow">
                <feGaussianBlur stdDeviation="2" result="blur"/>
                <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
              <filter id="aglow2">
                <feGaussianBlur stdDeviation="1" result="blur"/>
                <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
            </defs>
            {/* Hub central */}
            <circle cx="30" cy="30" r="7" fill="url(#ag1)" filter="url(#aglow)"/>
            {/* Nœuds primaires */}
            <circle cx="10" cy="16" r="4.5" fill="#7c5aff" opacity="0.92" filter="url(#aglow2)"/>
            <circle cx="50" cy="16" r="4.5" fill="#7c5aff" opacity="0.92" filter="url(#aglow2)"/>
            <circle cx="10" cy="44" r="4.5" fill="#00c9b1" opacity="0.92" filter="url(#aglow2)"/>
            <circle cx="50" cy="44" r="4.5" fill="#00c9b1" opacity="0.92" filter="url(#aglow2)"/>
            {/* Nœuds secondaires */}
            <circle cx="30" cy="6"  r="3" fill="#e040fb" opacity="0.8"/>
            <circle cx="30" cy="54" r="3" fill="#2de08c" opacity="0.8"/>
            {/* Connexions hub */}
            <line x1="30" y1="30" x2="10" y2="16" stroke="url(#ag2)" strokeWidth="1.8" opacity="0.75"/>
            <line x1="30" y1="30" x2="50" y2="16" stroke="url(#ag2)" strokeWidth="1.8" opacity="0.75"/>
            <line x1="30" y1="30" x2="10" y2="44" stroke="url(#ag1)" strokeWidth="1.8" opacity="0.75"/>
            <line x1="30" y1="30" x2="50" y2="44" stroke="url(#ag1)" strokeWidth="1.8" opacity="0.75"/>
            <line x1="30" y1="30" x2="30" y2="6"  stroke="url(#ag2)" strokeWidth="1.5" opacity="0.6"/>
            <line x1="30" y1="30" x2="30" y2="54" stroke="url(#ag1)" strokeWidth="1.5" opacity="0.6"/>
            {/* Connexions périphériques (le maillage) */}
            <line x1="10" y1="16" x2="30" y2="6"  stroke="#7c5aff" strokeWidth="1" opacity="0.32"/>
            <line x1="50" y1="16" x2="30" y2="6"  stroke="#7c5aff" strokeWidth="1" opacity="0.32"/>
            <line x1="10" y1="44" x2="30" y2="54" stroke="#00c9b1" strokeWidth="1" opacity="0.32"/>
            <line x1="50" y1="44" x2="30" y2="54" stroke="#00c9b1" strokeWidth="1" opacity="0.32"/>
            <line x1="10" y1="16" x2="10" y2="44" stroke="url(#ag2)" strokeWidth="1" opacity="0.28"/>
            <line x1="50" y1="16" x2="50" y2="44" stroke="url(#ag2)" strokeWidth="1" opacity="0.28"/>
            <line x1="10" y1="16" x2="50" y2="44" stroke="url(#ag2)" strokeWidth="0.7" opacity="0.14"/>
            <line x1="50" y1="16" x2="10" y2="44" stroke="url(#ag2)" strokeWidth="0.7" opacity="0.14"/>
          </svg>
        </div>

        <h1 className="auth-title">
          {isLogin ? 'Content de te revoir' : 'Rejoins le réseau'}
        </h1>
        <p className="auth-subtitle">
          {isLogin
            ? 'Connecte-toi à ton réseau Mesh'
            : 'Crée un compte — tes données t\'appartiennent'}
        </p>

        {error && (
          <div className="auth-error">
            <span className="auth-error-icon">⚠</span> {error}
          </div>
        )}

        <div className="auth-field">
          <label>Nom d'utilisateur</label>
          <input
            type="text"
            placeholder="Ton pseudo"
            value={username}
            onChange={e => setUsername(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            disabled={loading}
            autoFocus
            autoComplete="username"
          />
        </div>

        <div className="auth-field">
          <label>Mot de passe</label>
          <input
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            disabled={loading}
            autoComplete={isLogin ? 'current-password' : 'new-password'}
          />
          {!isLogin && (
            <span className="auth-field-hint">6 caractères minimum</span>
          )}
        </div>

        <button
          className="auth-btn"
          onClick={handleSubmit}
          disabled={loading || !username.trim() || password.length < 1}
        >
          {loading
            ? <><span className="auth-spinner"/> {isLogin ? 'Connexion…' : 'Création…'}</>
            : isLogin ? 'Se connecter' : "Créer le compte"}
        </button>

        <p className="auth-switch">
          {isLogin ? 'Pas encore de compte ? ' : 'Déjà un compte ? '}
          <span onClick={() => setIsLogin(!isLogin)}>
            {isLogin ? "S'inscrire" : 'Se connecter'}
          </span>
        </p>

        <p className="auth-p2p-note">
          🔒 P2P — aucune donnée envoyée à des serveurs tiers
        </p>
      </div>
    </div>
  )
}

export default Auth
