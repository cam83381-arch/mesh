import React, { useState } from 'react'
import type { ServerEmoji } from '../useServerEmojis'

// Émojis système organisés par catégorie
const SYSTEM_EMOJIS: Record<string, string[]> = {
  'Smileys': ['😀','😁','😂','🤣','😃','😄','😅','😆','😉','😊','😋','😎','😍','🥰','😘','😗','😙','😚','🙂','🤗','🤔','🤨','😐','😑','😶','🙄','😏','😣','😥','😮','🤐','😯','😪','😫','🥱','😴','😌','😛','😜','😝','🤤','😒','😓','😔','😕','🙃','🤑','😲','😷','🤒','🤕','🤢','🤮','🤧','🥵','🥶','🥴','😵','🤯'],
  'Gestes': ['👍','👎','👌','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','👇','☝️','✋','🤚','🖐','🖖','👋','🤜','🤛','🙌','👏','🤲','🤝','🙏','✍️','💪','🦾','🦿'],
  'Animaux': ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐔','🐧','🐦','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🐛','🦋','🐌','🐞','🐜','🦟','🦗','🦂'],
  'Nourriture': ['🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🥑','🍆','🥔','🥕','🌽','🌶','🧄','🧅','🥜','🌰','🍞','🥐','🥖','🧀','🥚','🍳','🧈','🥞','🧇','🥓','🍔','🍟','🍕','🌭','🥪','🌮','🌯','🥙','🧆','🥗','🥘','🍜','🍝','🍠','🍣','🍱','🍛','🍲','🍥','🥟','🦪','🍙','🍚','🍘','🍢','🥠','🥡','🍧','🍨','🍦','🥧','🍡','🍮','🍭','🍬','🍫','🍿','🍩','🍪','🌰','🥜','🍯','🍼','🥛','☕','🍵','🧃','🥤','🍶','🍺','🍻','🥂','🍷','🥃','🍸','🍹','🧉'],
  'Objets': ['⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱','🏓','🏸','🥅','⛳','🏹','🎣','🤿','🥊','🥋','🎽','🛹','🛷','⛸','🥌','🎿','⛷','🏂','🪂','🏋️','🤸','🤺','🤾','⛹','🏇','🤼','🤽','🤾','🏌','🧘','🚵','🚴'],
  'Symboles': ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','☮️','✝️','☪️','🕉','✡️','🔯','🕎','☯️','☦️','🛐','⛎','♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓','🆔','⚛️','🉑','☢️','☣️','📴','📳','🈶','🈚','🈸','🈺','🈷️','✴️','🆚','💮','🉐','㊙️','㊗️','🈴','🈵','🈹','🈲','🅰️','🅱️','🆎','🆑','🅾️','🆘','❌','⭕','🛑','⛔','📛','🚫'],
}

interface Props {
  serverEmojis?: ServerEmoji[]
  onSelect: (emoji: string) => void
  onClose: () => void
}

const EmojiPicker: React.FC<Props> = ({ serverEmojis = [], onSelect, onClose }) => {
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<'server' | 'system'>('system')

  // Filtrage (les émojis système n'ont pas de nom textuel — on filtre sur la catégorie si search)
  const filteredSystem: Record<string, string[]> = {}
  for (const [cat, list] of Object.entries(SYSTEM_EMOJIS)) {
    if (!search || cat.toLowerCase().includes(search.toLowerCase())) {
      filteredSystem[cat] = list
    }
  }

  const filteredServerEmojis = search
    ? serverEmojis.filter(e => e.name.includes(search.toLowerCase()))
    : serverEmojis

  return (
    <div
      style={{
        position: 'relative',
        width: '360px', maxHeight: '420px',
        background: '#141428', border: '1px solid #1e1f22',
        borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        display: 'flex', flexDirection: 'column', zIndex: 1000, overflow: 'hidden'
      }}
      onMouseDown={e => e.stopPropagation()}
    >
      {/* Recherche */}
      <div style={{ padding: '8px', borderBottom: '1px solid #1e1f22' }}>
        <input
          autoFocus
          placeholder="Chercher un emoji..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: '100%', background: '#0b0b18', border: 'none',
            borderRadius: '4px', padding: '6px 10px', color: '#c9c8e8',
            fontSize: '14px', outline: 'none', boxSizing: 'border-box'
          }}
        />
      </div>

      {/* Tabs (si des emojis de serveur existent) */}
      {serverEmojis.length > 0 && (
        <div style={{ display: 'flex', borderBottom: '1px solid #1e1f22' }}>
          {(['server', 'system'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                flex: 1, padding: '6px', background: 'none', border: 'none',
                color: activeTab === tab ? '#fff' : '#56527e',
                fontSize: '12px', fontWeight: activeTab === tab ? 600 : 400,
                borderBottom: activeTab === tab ? '2px solid #5865f2' : 'none',
                cursor: 'pointer'
              }}
            >
              {tab === 'server' ? `✨ Serveur (${serverEmojis.length})` : '🌐 Standard'}
            </button>
          ))}
        </div>
      )}

      {/* Corps scrollable */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '8px' }}>
        {/* Émojis personnalisés du serveur */}
        {(activeTab === 'server' || search) && filteredServerEmojis.length > 0 && (
          <div>
            <div style={{ fontSize: '11px', color: '#56527e', fontWeight: 600, padding: '4px 2px 6px', textTransform: 'uppercase' }}>
              Émojis du serveur
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px' }}>
              {filteredServerEmojis.map(emoji => (
                <button
                  key={emoji.id}
                  title={`:${emoji.name}:`}
                  onClick={() => { onSelect(`:${emoji.name}:`); onClose() }}
                  style={{
                    width: '36px', height: '36px', padding: '2px',
                    background: 'none', border: 'none', borderRadius: '4px',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#404249')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                >
                  <img src={emoji.url} alt={emoji.name} style={{ width: '28px', height: '28px', objectFit: 'contain', borderRadius: '4px' }} />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Émojis système */}
        {(activeTab === 'system' || search) && Object.entries(filteredSystem).map(([cat, list]) => (
          <div key={cat}>
            <div style={{ fontSize: '11px', color: '#56527e', fontWeight: 600, padding: '4px 2px 6px', textTransform: 'uppercase' }}>
              {cat}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px' }}>
              {list.map(emoji => (
                <button
                  key={emoji}
                  onClick={() => { onSelect(emoji); onClose() }}
                  style={{
                    width: '36px', height: '36px',
                    background: 'none', border: 'none', borderRadius: '4px',
                    fontSize: '22px', cursor: 'pointer', lineHeight: 1
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#404249')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default EmojiPicker
