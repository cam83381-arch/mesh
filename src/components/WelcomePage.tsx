interface Props {
  username: string
  onAddServer: () => void
}

function WelcomePage({ username, onAddServer }: Props) {
  return (
    <div className="welcome-container">
      <div className="welcome-box">
        <div className="welcome-icon">⚡</div>
        <h1 className="welcome-title">Bienvenue, {username} !</h1>
        <p className="welcome-subtitle">
          Tu n'as pas encore de serveur ou tu as été retiré d'un serveur.
        </p>
        <button className="modal-btn primary" onClick={onAddServer}>
          ✨ Créer ou rejoindre un serveur
        </button>
      </div>
    </div>
  )
}

export default WelcomePage