import { useState, useEffect, useRef } from 'react'
import type { Message } from '../types'
import useNotifications from '../useNotifications'

interface Props {
  messages: Message[]
  currentUsername: string
  otherUser: string
  onSendMessage: (content: string, replyTo?: { id: string; author: string; content: string }) => void
  onTyping?: () => void
  typingUser?: string | null
  notifSettings?: { soundEnabled?: boolean; desktopNotifications?: boolean; mentionsOnly?: boolean }
}

function DMArea({ messages, currentUsername, otherUser, onSendMessage, onTyping, typingUser, notifSettings = {} }: Props) {
  const [input, setInput] = useState('')
  const [replyTo, setReplyTo] = useState<{ id: string; author: string; content: string } | null>(null)
  const [displayLimit, setDisplayLimit] = useState(50)
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const prevOtherUserRef = useRef('')

  // ── Notifications desktop pour les DMs ──
  useNotifications(messages, currentUsername, otherUser, true, notifSettings)

  // Reset pagination quand on change de conv
  useEffect(() => {
    if (otherUser !== prevOtherUserRef.current) {
      prevOtherUserRef.current = otherUser
      setDisplayLimit(50)
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'auto' }), 50)
    }
  }, [otherUser])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100
    if (isAtBottom) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages.length])

  const hasMore = messages.length > displayLimit
  const displayMessages = messages.slice(-displayLimit)

  // Focus l'input quand on répond
  useEffect(() => {
    if (replyTo) inputRef.current?.focus()
  }, [replyTo])

  const handleSend = () => {
    if (!input.trim()) return
    onSendMessage(input, replyTo || undefined)
    setInput('')
    setReplyTo(null)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
    if (e.key === 'Escape') setReplyTo(null)
  }

  const handleInputChange = (value: string) => {
    setInput(value)
    onTyping?.()
  }

  const renderContent = (content: string) => {
    const parts = content.split(/(@\w+)/g)
    return parts.map((part, i) => {
      if (part.startsWith('@')) {
        return (
          <span key={i} style={{ color: '#6354ff', background: 'rgba(99,84,255,0.1)', borderRadius: '3px', padding: '0 2px' }}>
            {part}
          </span>
        )
      }
      return <span key={i}>{part}</span>
    })
  }

  return (
    <div className="chat-area">
      <div className="chat-header">
        <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '28px', height: '28px', borderRadius: '50%',
            background: '#6354ff', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontWeight: 600, fontSize: '13px', color: 'white'
          }}>
            {otherUser[0]?.toUpperCase() || '?'}
          </div>
          {otherUser}
        </span>
      </div>

      <div className="messages" ref={containerRef}>
        {/* Bouton charger plus */}
        {hasMore && (
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <button
              onClick={() => setDisplayLimit(prev => prev + 50)}
              style={{
                background: '#141428', border: '1px solid #1e1f22',
                color: '#8884c4', borderRadius: '8px',
                padding: '6px 16px', fontSize: '13px', cursor: 'pointer'
              }}
            >
              ↑ Charger les messages précédents ({messages.length - displayLimit} restants)
            </button>
          </div>
        )}

        {messages.length === 0 && (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: '#56527e' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>💬</div>
            <div style={{ fontSize: '20px', fontWeight: 600, color: '#c9c8e8', marginBottom: '8px' }}>
              Début de ta conversation avec {otherUser}
            </div>
            <div style={{ fontSize: '14px' }}>
              C'est le début de votre historique de messages privés.
            </div>
          </div>
        )}

        {displayMessages.map((msg, i) => {
          const isOwn = (msg.authorId || msg.author || msg.authorName) === currentUsername
          return (
            <div
              key={msg.id || i}
              className="msg-group"
              style={{ position: 'relative' }}
              onMouseEnter={e => {
                const btn = (e.currentTarget as HTMLElement).querySelector('.dm-reply-btn') as HTMLElement
                if (btn) btn.style.opacity = '1'
              }}
              onMouseLeave={e => {
                const btn = (e.currentTarget as HTMLElement).querySelector('.dm-reply-btn') as HTMLElement
                if (btn) btn.style.opacity = '0'
              }}
            >
              {/* Citation de réponse */}
              {msg.replyToContent && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  marginLeft: '56px', marginBottom: '2px',
                  padding: '4px 8px',
                  background: 'rgba(0,0,0,0.2)',
                  borderLeft: '3px solid #5865f2',
                  borderRadius: '4px',
                  fontSize: '13px', color: '#56527e', maxWidth: '500px'
                }}>
                  <span style={{ color: '#6354ff', fontWeight: 600, fontSize: '12px' }}>
                    {msg.replyToAuthor}
                  </span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '350px' }}>
                    {msg.replyToContent}
                  </span>
                </div>
              )}

              <div style={{ display: 'flex', gap: '16px' }}>
                <div className="msg-avatar" style={{ background: msg.color }}>
                  {(msg.authorName || msg.author || '?')[0].toUpperCase()}
                </div>
                <div className="msg-body" style={{ flex: 1 }}>
                  <div className="msg-header">
                    <span className="msg-author" style={{ color: isOwn ? '#6354ff' : '#c9c8e8' }}>
                      {msg.authorName}
                    </span>
                    <span className="msg-time">Aujourd'hui à {msg.time}</span>
                  </div>
                  <div className="msg-content">{renderContent(msg.content)}</div>
                </div>
              </div>

              {/* Bouton répondre */}
              <button
                className="dm-reply-btn"
                title="Répondre"
                onClick={() => setReplyTo({ id: msg.id || '', author: msg.authorName || msg.author || '', content: msg.content })}
                style={{
                  position: 'absolute', top: '4px', right: '8px',
                  opacity: 0, transition: 'opacity 0.15s',
                  background: '#141428', border: '1px solid #1e1f22',
                  borderRadius: '4px', color: '#8884c4',
                  padding: '2px 8px', fontSize: '12px', cursor: 'pointer'
                }}
              >
                ↩ Répondre
              </button>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {typingUser && (
        <div className="typing-status" style={{ padding: '0 16px 4px', fontSize: '12px', color: '#56527e' }}>
          {typingUser} est en train d'écrire…
        </div>
      )}

      {/* Bandeau de réponse */}
      {replyTo && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '6px 16px',
          background: '#141428',
          borderTop: '1px solid #1e1f22',
          fontSize: '13px', color: '#8884c4'
        }}>
          <span>
            Répondre à <strong style={{ color: '#6354ff' }}>{replyTo.author}</strong>
            {' '}
            <span style={{ opacity: 0.7 }}>: {replyTo.content.slice(0, 60)}{replyTo.content.length > 60 ? '…' : ''}</span>
          </span>
          <button
            onClick={() => setReplyTo(null)}
            style={{ background: 'none', border: 'none', color: '#56527e', cursor: 'pointer', fontSize: '16px' }}
          >
            ✕
          </button>
        </div>
      )}

      <div className="chat-input-area">
        <div className="chat-input-box">
          <input
            ref={inputRef}
            className="chat-input"
            placeholder={replyTo ? `Répondre à ${replyTo.author}…` : `Message @${otherUser}`}
            value={input}
            onChange={e => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button className="send-btn" onClick={handleSend}>➤</button>
        </div>
      </div>
    </div>
  )
}

export default DMArea
