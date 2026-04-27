import { useState, useMemo } from 'react'

// Stickers animés CSS — pas besoin d'URLs externes
// Chaque "GIF" est un emoji + texte envoyé dans le chat
const STICKER_LIBRARY: Record<string, Array<{ id: string; title: string; emoji: string; text: string }>> = {
  'Tendance': [
    { id: 'ok1',       title: 'OK',        emoji: '👌', text: '👌 OK!' },
    { id: 'yes1',      title: 'Oui !',     emoji: '✅', text: '✅ OUI !' },
    { id: 'no1',       title: 'Non !',     emoji: '❌', text: '❌ NON !' },
    { id: 'wave1',     title: 'Salut !',   emoji: '👋', text: '👋 Salut !' },
    { id: 'bye1',      title: 'Ciao !',    emoji: '🤙', text: '🤙 Ciao !' },
    { id: 'clap1',     title: 'Bravo !',   emoji: '👏', text: '👏 Bravo !' },
    { id: 'think1',    title: 'Hmm...',    emoji: '🤔', text: '🤔 Hmm...' },
    { id: 'omg1',      title: 'OMG !',     emoji: '😱', text: '😱 OMG !' },
    { id: 'lol1',      title: 'LOL',       emoji: '😂', text: '😂 LOL' },
  ],
  'Réactions': [
    { id: 'love1',      title: 'Amour',    emoji: '❤️',  text: '❤️ ' },
    { id: 'fire1',      title: 'Fire !',   emoji: '🔥',  text: '🔥 FIRE !' },
    { id: 'gg1',        title: 'GG !',     emoji: '🏆',  text: '🏆 GG !' },
    { id: 'facepalm1',  title: 'Facepalm', emoji: '🤦',  text: '🤦 Facepalm...' },
    { id: 'sus1',       title: 'Sus',      emoji: '👀',  text: '👀 Sus...' },
    { id: 'party1',     title: 'Fête !',   emoji: '🎉',  text: '🎉 Let\'s go !' },
    { id: 'pog1',       title: 'POG !',    emoji: '😮',  text: '😮 POG !' },
    { id: 'sad1',       title: 'Triste',   emoji: '😢',  text: '😢 ...' },
    { id: 'angry1',     title: 'Noooon',   emoji: '😤',  text: '😤 NOOOON' },
  ],
  'Gaming': [
    { id: 'win1',     title: 'Win !',      emoji: '🥇', text: '🥇 WIN !' },
    { id: 'lose1',    title: 'Lose...',    emoji: '💀', text: '💀 rip...' },
    { id: 'rage1',    title: 'Rage quit',  emoji: '🎮', text: '🎮💢 RAGE QUIT' },
    { id: 'letsgo1',  title: "Let's go !", emoji: '⚡', text: '⚡ LET\'S GOOO !' },
    { id: 'noob1',    title: 'Noob',       emoji: '🐣', text: '🐣 noob...' },
    { id: 'pro1',     title: 'Pro move',   emoji: '😎', text: '😎 PRO MOVE' },
    { id: 'rekt1',    title: 'Rekt !',     emoji: '💥', text: '💥 REKT !' },
    { id: 'afk1',     title: 'AFK',        emoji: '🚶', text: '🚶 AFK' },
  ],
  'Memes': [
    { id: 'nyan1',   title: 'Nyan Cat',      emoji: '🌈', text: '🌈🐱 NYAN CAT !' },
    { id: 'fine1',   title: 'This is fine',  emoji: '🐶', text: '🐶🔥 This is fine.' },
    { id: 'deal1',   title: 'Deal with it',  emoji: '😎', text: '😎 Deal with it.' },
    { id: 'doge1',   title: 'Wow doge',      emoji: '🐕', text: '🐕 wow. such amaze.' },
    { id: 'brain1',  title: 'Big brain',     emoji: '🧠', text: '🧠 BIG BRAIN' },
    { id: 'roll1',   title: 'Rickroll',      emoji: '🎵', text: '🎵 Never gonna give you up~' },
    { id: 'stonks1', title: 'Stonks',        emoji: '📈', text: '📈 STONKS' },
    { id: 'flip1',   title: 'Table flip',    emoji: '😤', text: '(╯°□°）╯︵ ┻━┻' },
  ],
}

const ALL_STICKERS = Object.values(STICKER_LIBRARY).flat()

interface Props {
  onSelect: (text: string) => void
  onClose: () => void
}

function GifPicker({ onSelect, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState<string>('Tendance')

  const displayStickers = useMemo(() => {
    if (query.trim()) {
      const q = query.toLowerCase()
      return ALL_STICKERS.filter(s => s.title.toLowerCase().includes(q) || s.text.toLowerCase().includes(q))
    }
    return STICKER_LIBRARY[activeCategory] || []
  }, [query, activeCategory])

  return (
    <div className="gif-picker">
      <div className="gif-picker-header">
        <input
          className="gif-search-input"
          placeholder="🔍 Rechercher un sticker…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          autoFocus
        />
        <button className="gif-close-btn" onClick={onClose} title="Fermer">✕</button>
      </div>

      {/* Catégories */}
      {!query && (
        <div style={{
          display: 'flex', gap: '4px', padding: '6px 8px',
          borderBottom: '1px solid #1e1f22', overflowX: 'auto', flexShrink: 0
        }}>
          {Object.keys(STICKER_LIBRARY).map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              style={{
                padding: '4px 10px', borderRadius: '12px', border: 'none',
                background: activeCategory === cat ? '#6354ff' : '#404249',
                color: activeCategory === cat ? '#fff' : '#8884c4',
                fontSize: '12px', fontWeight: 500, cursor: 'pointer',
                whiteSpace: 'nowrap', transition: 'background 0.15s'
              }}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      <div className="gif-body">
        {displayStickers.length === 0 ? (
          <div className="gif-status">Aucun sticker trouvé{query ? ` pour "${query}"` : ''}</div>
        ) : (
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '6px', padding: '8px'
          }}>
            {displayStickers.map(sticker => (
              <button
                key={sticker.id}
                onClick={() => { onSelect(sticker.text); onClose() }}
                title={sticker.title}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  gap: '4px', padding: '12px 6px',
                  background: '#141428', border: '1px solid #1e1f22',
                  borderRadius: '8px', cursor: 'pointer',
                  transition: 'background 0.15s, border-color 0.15s',
                  minHeight: '70px',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLButtonElement).style.background = '#404249'
                  ;(e.currentTarget as HTMLButtonElement).style.borderColor = '#6354ff'
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.background = '#141428'
                  ;(e.currentTarget as HTMLButtonElement).style.borderColor = '#0b0b18'
                }}
              >
                <span style={{ fontSize: '28px', lineHeight: 1 }}>{sticker.emoji}</span>
                <span style={{ fontSize: '10px', color: '#8884c4', textAlign: 'center', lineHeight: 1.2 }}>
                  {sticker.title}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="gif-footer">
        <span>✨ Stickers intégrés</span>
      </div>
    </div>
  )
}

export default GifPicker
