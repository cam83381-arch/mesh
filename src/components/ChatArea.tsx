import React, { useEffect, useRef, useState, useCallback } from 'react'
import type { Message, Channel, Member, CustomRole } from '../types'
import type { Friendship } from '../useFriends'
import { useApp } from '../context/AppContext'
import MemberTooltip from './MemberTooltip'
import useNotifications from '../useNotifications'
import usePins from '../usePins'
import useChannelPermissions, { resolveChannelPerms } from '../useChannelPermissions'
import GifPicker from './GifPicker'
import EmojiPicker from './EmojiPicker'
import useServerEmojis from '../useServerEmojis'
import { getAvatarGradient } from '../utils/avatarGradient'
import { seedBrowserFile } from '../torrentBridge'

const ACCEPTED_TYPES = 'image/*,video/mp4,video/webm,application/pdf,text/plain,application/zip,.zip,.rar,.7z'
const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024 // 2 GB

interface Props {
  channel: Channel | null
  messages: Message[]
  reactions: Record<string, Record<string, string[]>>
  typingUsers: string[]
  members?: Member[]
  customRoles?: CustomRole[]
  onSendMessage: (
    msg: string,
    replyTo?: { id: string; author: string; content: string },
    fileUrl?: string,
    fileName?: string,
    fileType?: string,
    fileSize?: number
  ) => void
  onEditMessage: (id: string, msg: string) => void
  onDeleteMessage: (id: string) => void
  onAddReaction: (messageId: string, reaction: string) => void
  onRemoveReaction: (messageId: string, reaction: string) => void
  onTyping?: (isTyping: boolean) => void
  onOpenDM?: (username: string) => void
  onAddFriend?: (username: string) => void
  onRemoveFriend?: (pairId: string) => void
  friends?: Friendship[]
  serverId?: string
  isDM?: boolean
  notifSettings?: { soundEnabled?: boolean; desktopNotifications?: boolean; mentionsOnly?: boolean }
}

function ChatArea({
  channel, messages, reactions, typingUsers,
  members, customRoles, friends, serverId, isDM = false,
  notifSettings = {},
  onSendMessage, onEditMessage, onDeleteMessage,
  onAddReaction, onRemoveReaction, onTyping, onOpenDM, onAddFriend, onRemoveFriend
}: Props) {
  const { user } = useApp()
  const username = user?.username || ''
  const channelName = channel?.name || ''

  // ── Notifications sonores + titre onglet + desktop ──
  useNotifications(messages, username, channelName, isDM, notifSettings)

  // ── Pins ──
  const channelKey = channel ? `${(channel as any).serverId}_${channel.id}` : ''
  const { pins, pinMessage, unpinMessage } = usePins(channelKey)

  // ── Permissions du salon ──
  const { overrides: chanOverrides } = useChannelPermissions(serverId || '', channel?.id || '')
  const myMember = members?.find(m => m.username === username)
  const chanPerms = resolveChannelPerms(username, myMember, customRoles || [], chanOverrides)

  // ── Émojis personnalisés du serveur ──
  const { emojis: serverEmojis } = useServerEmojis(serverId || '', username)
  const [showEmojiInput, setShowEmojiInput] = useState(false)

  const [input, setInput] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editInput, setEditInput] = useState('')
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [showEmojiFor, setShowEmojiFor] = useState<string | null>(null)
  const [hoveredMsgId, setHoveredMsgId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [showGifs, setShowGifs] = useState(false)
  const [showPins, setShowPins] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [mentionFilter, setMentionFilter] = useState<string | null>(null)
  const [mentionIndex, setMentionIndex] = useState(0)

  const bottomRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [displayLimit, setDisplayLimit] = useState(50)
  const prevChannelRef = useRef<string>('')

  // Remettre à 50 quand on change de salon
  useEffect(() => {
    if (channel?.id !== prevChannelRef.current) {
      prevChannelRef.current = channel?.id || ''
      setDisplayLimit(50)
    }
  }, [channel?.id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [channel?.id])

  // Scroll vers le bas uniquement si on était déjà en bas
  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container) return
    const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100
    if (isAtBottom) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages.length])

  // ── Filtrage + pagination messages ──
  const filteredMessages = searchQuery
    ? messages.filter(m =>
        m.content?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (m.author || m.authorName || '').toLowerCase().includes(searchQuery.toLowerCase())
      )
    : messages

  const hasMore = !searchQuery && filteredMessages.length > displayLimit
  const displayMessages = searchQuery
    ? filteredMessages
    : filteredMessages.slice(-displayLimit)

  // ── Envoi fichier P2P via WebTorrent (seed → magnet link dans le chat) ──
  const uploadFile = useCallback(async (file: File) => {
    if (!channel) return
    if (file.size > MAX_FILE_SIZE) {
      alert(`Fichier trop volumineux (max 2 Go) : ${(file.size / 1024 / 1024).toFixed(1)} Mo`)
      return
    }
    setUploading(true)
    try {
      const result = await seedBrowserFile(file)
      // Envoyer le magnet comme message avec métadonnées
      onSendMessage('', undefined, result.magnetUri, file.name, file.type, file.size)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erreur lors du partage'
      alert('Impossible de partager le fichier : ' + msg)
    } finally {
      setUploading(false)
    }
  }, [channel, onSendMessage])

  // ── Envoi texte ──
  const handleSend = useCallback(() => {
    if (!input.trim()) return
    const replyToData = replyTo
      ? { id: replyTo.id, author: replyTo.author || replyTo.authorName || '', content: replyTo.content }
      : undefined
    onSendMessage(input.trim(), replyToData)
    setInput('')
    setReplyTo(null)
    if (onTyping) onTyping(false)
  }, [input, replyTo, onSendMessage, onTyping])

  // Membres filtrés pour les mentions — DOIT être avant handleKeyDown
  const mentionedMembers = mentionFilter !== null
    ? (members || [])
        .filter(m => m.username.toLowerCase().startsWith(mentionFilter.toLowerCase()))
        .slice(0, 8)
    : []

  const insertMention = (targetUsername: string) => {
    const atIdx = input.lastIndexOf('@')
    const newInput = input.slice(0, atIdx) + '@' + targetUsername + ' '
    setInput(newInput)
    setMentionFilter(null)
    setMentionIndex(0)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (mentionFilter !== null && mentionedMembers.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex(i => Math.min(i + 1, mentionedMembers.length - 1)); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIndex(i => Math.max(i - 1, 0)); return }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(mentionedMembers[mentionIndex].username); return }
      if (e.key === 'Escape') { setMentionFilter(null); return }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // ── Typing indicator + détection @ ──
  const handleInputChange = (value: string) => {
    setInput(value)
    // Detect @ mention: last word starts with @, no space after @
    const lastWord = value.split(/\s/).pop() || ''
    if (lastWord.startsWith('@')) {
      setMentionFilter(lastWord.slice(1))
      setMentionIndex(0)
    } else {
      setMentionFilter(null)
    }
    if (!onTyping) return
    onTyping(true)
    if (typingTimer.current) clearTimeout(typingTimer.current)
    typingTimer.current = setTimeout(() => onTyping(false), 2000)
  }

  // ── Sélection via bouton + ──
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) uploadFile(file)
    e.target.value = ''
  }

  // ── Glisser-déposer ──
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    if (channel) setIsDragging(true)
  }
  const handleDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false)
  }
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (!channel) return
    const file = e.dataTransfer.files[0]
    if (file) uploadFile(file)
  }

  // ── Coller image (Ctrl+V) ──
  const handlePaste = (e: React.ClipboardEvent) => {
    const file = e.clipboardData.files[0]
    if (file) {
      e.preventDefault()
      uploadFile(file)
    }
  }

  // ── Édition ──
  const startEdit = (msg: Message) => {
    setEditingId(msg.id)
    setEditInput(msg.content)
  }
  const submitEdit = () => {
    if (!editingId || !editInput.trim()) return
    onEditMessage(editingId, editInput.trim())
    setEditingId(null)
    setEditInput('')
  }

  // ── Rendu Markdown ──
  const renderMarkdown = (content: string): React.ReactNode[] => {
    const nodes: React.ReactNode[] = []
    let key = 0

    // Découpe d'abord les blocs de code fenced (``` ... ```)
    const codeBlockRegex = /```([\s\S]*?)```/g
    let lastIndex = 0
    let match: RegExpExecArray | null

    const segments: Array<{ type: 'code-block' | 'inline'; text: string }> = []
    codeBlockRegex.lastIndex = 0
    while ((match = codeBlockRegex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        segments.push({ type: 'inline', text: content.slice(lastIndex, match.index) })
      }
      segments.push({ type: 'code-block', text: match[1] })
      lastIndex = match.index + match[0].length
    }
    if (lastIndex < content.length) {
      segments.push({ type: 'inline', text: content.slice(lastIndex) })
    }

    for (const seg of segments) {
      if (seg.type === 'code-block') {
        nodes.push(
          <pre key={key++} className="msg-code-block"><code>{seg.text.trim()}</code></pre>
        )
        continue
      }

      // Inline: code, bold, italic, links, mentions
      const inlineRegex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|https?:\/\/\S+|@\w+)/g
      let iLast = 0
      let iMatch: RegExpExecArray | null
      inlineRegex.lastIndex = 0
      const text = seg.text

      while ((iMatch = inlineRegex.exec(text)) !== null) {
        if (iMatch.index > iLast) {
          nodes.push(<span key={key++}>{text.slice(iLast, iMatch.index)}</span>)
        }
        const token = iMatch[0]
        if (token.startsWith('`')) {
          nodes.push(<code key={key++} className="msg-code-inline">{token.slice(1, -1)}</code>)
        } else if (token.startsWith('**')) {
          nodes.push(<strong key={key++}>{token.slice(2, -2)}</strong>)
        } else if (token.startsWith('*')) {
          nodes.push(<em key={key++}>{token.slice(1, -1)}</em>)
        } else if (token.startsWith('http')) {
          nodes.push(
            <a key={key++} href={token} target="_blank" rel="noopener noreferrer" className="msg-link">
              {token}
            </a>
          )
        } else if (token.startsWith('@')) {
          nodes.push(
            <span key={key++} className="msg-mention">{token}</span>
          )
        }
        iLast = iMatch.index + token.length
      }
      if (iLast < text.length) {
        nodes.push(<span key={key++}>{text.slice(iLast)}</span>)
      }
    }

    return nodes
  }

  // ── Rendu pièce jointe (P2P WebTorrent ou ancienne URL) ──
  const renderAttachment = (msg: Message) => {
    if (!msg.fileUrl) return null

    const isMagnet = msg.fileUrl.startsWith('magnet:')

    // Fichier P2P via magnet link
    if (isMagnet) {
      const icon = msg.fileType?.startsWith('image/') ? '🖼️'
        : msg.fileType?.startsWith('video/') ? '🎬'
        : msg.fileType === 'application/pdf' ? '📄'
        : msg.fileType === 'application/zip' || msg.fileType?.includes('zip') ? '🗜️'
        : msg.fileType === 'text/plain' ? '📝'
        : '📎'
      const sizeLabel = msg.fileSize
        ? msg.fileSize > 1024 * 1024
          ? `${(msg.fileSize / 1024 / 1024).toFixed(1)} Mo`
          : `${(msg.fileSize / 1024).toFixed(0)} Ko`
        : ''
      return (
        <div className="msg-attachment-p2p">
          <div className="msg-attachment-p2p-icon">{icon}</div>
          <div className="msg-attachment-p2p-info">
            <div className="msg-attachment-p2p-name">{msg.fileName || 'Fichier'}</div>
            <div className="msg-attachment-p2p-meta">
              {sizeLabel && <span>{sizeLabel}</span>}
              <span className="msg-attachment-p2p-badge">🔗 P2P</span>
            </div>
          </div>
          <button
            className="msg-attachment-p2p-btn"
            title="Télécharger via P2P"
            onClick={async () => {
              try {
                const { downloadTorrent } = await import('../torrentBridge')
                await downloadTorrent(msg.fileUrl!)
              } catch (e: any) {
                alert('Erreur téléchargement : ' + (e?.message || e))
              }
            }}
          >⬇ Télécharger</button>
        </div>
      )
    }

    // Ancienne URL directe (rétro-compatibilité)
    if (msg.fileType?.startsWith('image/')) {
      return <img src={msg.fileUrl} alt={msg.fileName} className="msg-attachment-img" />
    }
    if (msg.fileType?.startsWith('video/')) {
      return <video src={msg.fileUrl} controls className="msg-attachment-video" />
    }
    const icon2 = msg.fileType === 'application/pdf' ? '📄'
      : msg.fileType === 'application/zip' ? '🗜️'
      : msg.fileType === 'text/plain' ? '📝'
      : '📎'
    return (
      <a href={msg.fileUrl} download={msg.fileName} target="_blank" rel="noopener noreferrer" className="msg-attachment-file">
        <span className="msg-attachment-icon">{icon2}</span>
        <span className="msg-attachment-name">{msg.fileName}</span>
        <span className="msg-attachment-size">{msg.fileSize ? `${(msg.fileSize / 1024).toFixed(0)} Ko` : ''}</span>
        <span className="msg-attachment-dl">⬇</span>
      </a>
    )
  }

  return (
    <div
      className="chat-area"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Header */}
      <div className="chat-header">
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#a09aff', flexShrink: 0 }}>
            <path d="M20.222 9.676l.464-2.464a.5.5 0 0 0-.491-.594h-2.531l.5-2.633a.5.5 0 0 0-.491-.597h-2a.5.5 0 0 0-.491.403l-.526 2.827H11.59l.5-2.633a.5.5 0 0 0-.491-.597h-2a.5.5 0 0 0-.491.403L8.582 6.618H5.56a.5.5 0 0 0-.491.403l-.464 2.464a.5.5 0 0 0 .491.597h2.64l-.67 3.578H3.998a.5.5 0 0 0-.491.403l-.464 2.464a.5.5 0 0 0 .491.597h2.531l-.5 2.633a.5.5 0 0 0 .491.597h2a.5.5 0 0 0 .491-.403l.526-2.827h3.064l-.5 2.633a.5.5 0 0 0 .491.597h2a.5.5 0 0 0 .491-.403l.526-2.827h3.017a.5.5 0 0 0 .491-.403l.464-2.464a.5.5 0 0 0-.491-.597h-2.64l.67-3.578h2.068a.5.5 0 0 0 .491-.403zM13.304 13.66h-3.064l.67-3.578h3.064l-.67 3.578z"/>
          </svg>
          {channelName}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '2px' }}>
          <button
            className="chat-header-btn"
            onClick={() => { setShowPins(p => !p); setShowSearch(false) }}
            title="Messages épinglés"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2a1 1 0 0 1 1 1v.17a6 6 0 0 1 3.83 3.83H17a1 1 0 0 1 0 2h-.17A6 6 0 0 1 13 12.83V19a1 1 0 0 1-2 0v-6.17a6 6 0 0 1-3.83-3.83H7a1 1 0 0 1 0-2h.17A6 6 0 0 1 11 3.17V3a1 1 0 0 1 1-1zm0 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"/>
            </svg>
          </button>
          <button
            className="chat-header-btn"
            onClick={() => { setShowSearch(s => !s); setShowPins(false); if (showSearch) setSearchQuery('') }}
            title="Rechercher"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M21.7 20.29l-4.54-4.54A8 8 0 1 0 3 11a8 8 0 0 0 13.75 5.17l4.54 4.54a1 1 0 0 0 1.41-1.42zM11 17a6 6 0 1 1 0-12 6 6 0 0 1 0 12z"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Panneau recherche */}
      {showSearch && (
        <div className="search-panel">
          <input
            className="search-input"
            placeholder={`Rechercher dans #${channelName}…`}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            autoFocus
          />
          <button className="search-close-btn" onClick={() => { setShowSearch(false); setSearchQuery('') }}>✕</button>
          {searchQuery && (
            <span className="search-count">{displayMessages.length} résultat{displayMessages.length !== 1 ? 's' : ''}</span>
          )}
        </div>
      )}

      {/* Zone messages + overlay drag + panneau épingles */}
      <div
        className="messages"
        style={{ position: 'relative' }}
        ref={messagesContainerRef}
      >
        {/* Bouton charger plus de messages */}
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
              ↑ Charger les messages précédents ({filteredMessages.length - displayLimit} restants)
            </button>
          </div>
        )}

        {isDragging && (
          <div className="drag-overlay">
            <div className="drag-overlay-inner">
              <div style={{ fontSize: '48px' }}>📂</div>
              <div>Déposer le fichier dans #{channelName}</div>
            </div>
          </div>
        )}

        {/* Panneau messages épinglés */}
        {showPins && (
          <div className="pins-panel">
            <div className="pins-panel-header">
              <span>Messages épinglés</span>
              <button onClick={() => setShowPins(false)}>✕</button>
            </div>
            <div className="pins-panel-body">
              {pins.length === 0 ? (
                <div className="pins-empty">Aucun message épinglé dans ce salon.</div>
              ) : (
                pins.map(p => (
                  <div key={p.id} className="pin-item">
                    <div className="pin-item-header">
                      <span className="pin-author">{p.author || p.authorName || 'Inconnu'}</span>
                      <span className="pin-time">{p.time}</span>
                    </div>
                    {p.fileUrl && p.fileType?.startsWith('image/') ? (
                      <img src={p.fileUrl} alt="pin" className="pin-image" />
                    ) : (
                      <div className="pin-content">{p.content}</div>
                    )}
                    <button className="pin-remove-btn" onClick={() => unpinMessage(p.id)} title="Désépingler">
                      Désépingler
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {displayMessages.length === 0 && !searchQuery && (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: '#56527e' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>👋</div>
            <div style={{ fontSize: '20px', fontWeight: 600, color: '#c9c8e8', marginBottom: '8px' }}>
              Bienvenue dans #{channelName} !
            </div>
            <div style={{ fontSize: '14px' }}>C'est le début du salon #{channelName}.</div>
          </div>
        )}

        {searchQuery && displayMessages.length === 0 && (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: '#56527e' }}>
            Aucun message trouvé pour "{searchQuery}"
          </div>
        )}

        {displayMessages.map((msg, idx) => {
          const displayName = msg.author || msg.authorName || 'Inconnu'
          const isOwn = (msg.author || msg.authorId) === username
          const msgReactions = reactions[msg.id] || {}
          // Groupage : même auteur, < 7 minutes d'intervalle
          const prev = displayMessages[idx - 1]
          const prevName = prev ? (prev.author || prev.authorName || '') : ''
          const isGrouped = !!prev && prevName === displayName &&
            (msg.timestamp || 0) - (prev.timestamp || 0) < 7 * 60 * 1000

          return (
            <div
              key={msg.id}
              className={`msg-group${isGrouped ? ' grouped' : ''}`}
              onMouseEnter={() => setHoveredMsgId(msg.id)}
              onMouseLeave={() => { setShowEmojiFor(null); setHoveredMsgId(null) }}
            >
              {isGrouped && <span className="msg-compact-time">{msg.time}</span>}
              {/* Réponse à */}
              {msg.replyTo && (
                <div className="reply-preview">
                  <div className="reply-line" />
                  <span className="reply-author">@{msg.replyTo.author}</span>
                  <span className="reply-content">{msg.replyTo.content}</span>
                </div>
              )}

              <div style={{ display: 'flex', gap: '16px' }}>
                {/* Avatar */}
                <MemberTooltip
                  username={displayName}
                  currentUsername={username}
                  members={members}
                  customRoles={customRoles}
                  onOpenDM={onOpenDM || (() => {})}
                  onAddFriend={onAddFriend || (() => {})}
                  onRemoveFriend={onRemoveFriend || (() => {})}
                  friends={friends}
                >
                  <div className="msg-avatar" style={{ background: getAvatarGradient(displayName, msg.color), cursor: 'pointer', flexShrink: 0 }}>
                    {displayName[0].toUpperCase()}
                  </div>
                </MemberTooltip>

                {/* Corps du message */}
                <div className="msg-body" style={{ flex: 1 }}>
                  <div className="msg-header">
                    <MemberTooltip
                      username={displayName}
                      currentUsername={username}
                      members={members}
                      customRoles={customRoles}
                      onOpenDM={onOpenDM || (() => {})}
                      onAddFriend={onAddFriend || (() => {})}
                      onRemoveFriend={onRemoveFriend || (() => {})}
                      friends={friends}
                    >
                      <span className="msg-author" style={{ color: isOwn ? '#6354ff' : '#e0deff', cursor: 'pointer' }}>
                        {displayName}
                      </span>
                    </MemberTooltip>
                    <span className="msg-time">Aujourd'hui à {msg.time}</span>
                  </div>

                  {/* Édition inline */}
                  {editingId === msg.id ? (
                    <div className="edit-input-box">
                      <input
                        value={editInput}
                        onChange={e => setEditInput(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') submitEdit()
                          if (e.key === 'Escape') setEditingId(null)
                        }}
                        autoFocus
                      />
                      <button onClick={submitEdit} title="Sauvegarder">✓</button>
                      <button onClick={() => setEditingId(null)} title="Annuler">✕</button>
                    </div>
                  ) : (
                    <div className="msg-content">
                      {renderAttachment(msg)}
                      {msg.content && renderMarkdown(msg.content)}
                    </div>
                  )}

                  {/* Réactions */}
                  {Object.keys(msgReactions).length > 0 && (
                    <div className="reactions-row">
                      {Object.entries(msgReactions).map(([emoji, users]) => {
                        if (users.length === 0) return null
                        const reacted = username ? users.includes(username) : false
                        return (
                          <button
                            key={emoji}
                            className={`reaction-pill ${reacted ? 'active' : ''}`}
                            onClick={() => reacted ? onRemoveReaction(msg.id, emoji) : onAddReaction(msg.id, emoji)}
                          >
                            {emoji} {users.length}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Actions au survol */}
              <div
                className="msg-actions"
                style={{ opacity: hoveredMsgId === msg.id ? 1 : 0 }}
              >
                <button className="msg-action-btn" title="Réagir" onClick={() => setShowEmojiFor(showEmojiFor === msg.id ? null : msg.id)}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"/></svg>
                </button>
                <button className="msg-action-btn" title="Répondre" onClick={() => setReplyTo(msg)}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"/></svg>
                </button>
                <button className="msg-action-btn" title="Épingler" onClick={() => pinMessage(msg)}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a1 1 0 0 1 1 1v.17a6 6 0 0 1 3.83 3.83H17a1 1 0 0 1 0 2h-.17A6 6 0 0 1 13 12.83V19a1 1 0 0 1-2 0v-6.17a6 6 0 0 1-3.83-3.83H7a1 1 0 0 1 0-2h.17A6 6 0 0 1 11 3.17V3a1 1 0 0 1 1-1zm0 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"/></svg>
                </button>
                {isOwn && <button className="msg-action-btn" title="Éditer" onClick={() => startEdit(msg)}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
                </button>}
                {isOwn && <button className="msg-action-btn danger" title="Supprimer" onClick={() => onDeleteMessage(msg.id)}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                </button>}
              </div>

              {/* Picker emoji (réactions) */}
              {showEmojiFor === msg.id && (
                <div style={{ position: 'relative' }}>
                  <EmojiPicker
                    serverEmojis={serverEmojis}
                    onSelect={(emoji) => {
                      const users = (reactions[msg.id] || {})[emoji] || []
                      const reacted = username ? users.includes(username) : false
                      reacted ? onRemoveReaction(msg.id, emoji) : onAddReaction(msg.id, emoji)
                    }}
                    onClose={() => setShowEmojiFor(null)}
                  />
                </div>
              )}
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Barre de réponse */}
      {replyTo && (
        <div className="reply-bar">
          <span>Réponse à <strong style={{ color: '#e0deff' }}>@{replyTo.author || replyTo.authorName}</strong> : {replyTo.content.slice(0, 60)}{replyTo.content.length > 60 ? '…' : ''}</span>
          <button onClick={() => setReplyTo(null)}>✕</button>
        </div>
      )}

      {/* Typing indicator */}
      {typingUsers.length > 0 && (
        <div className="typing-status" style={{ padding: '0 16px 4px', fontSize: '12px', color: '#56527e' }}>
          {typingUsers.length === 1
            ? `${typingUsers[0]} est en train d'écrire…`
            : `${typingUsers.join(', ')} sont en train d'écrire…`}
        </div>
      )}

      {/* GIF Picker */}
      {showGifs && (
        <GifPicker
          onSelect={(url) => {
            onSendMessage('', undefined, url, 'GIF', 'image/gif', 0)
            setShowGifs(false)
          }}
          onClose={() => setShowGifs(false)}
        />
      )}

      {/* Mention dropdown */}
      {mentionFilter !== null && mentionedMembers.length > 0 && (
        <div className="mention-dropdown">
          <div className="mention-dropdown-header">Membres — {mentionFilter ? `"${mentionFilter}"` : 'tous'}</div>
          {mentionedMembers.map((m, i) => (
            <div
              key={m.username}
              className={`mention-item ${i === mentionIndex ? 'active' : ''}`}
              onMouseDown={e => { e.preventDefault(); insertMention(m.username) }}
            >
              <span className="mention-avatar">{m.username[0].toUpperCase()}</span>
              <span className="mention-username">{m.username}</span>
              <span className="mention-role">{m.role}</span>
            </div>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="chat-input-area" style={{ position: 'relative' }}>
        {showEmojiInput && (
          <div style={{ position: 'absolute', bottom: '100%', right: '8px', zIndex: 200 }}>
            <EmojiPicker
              serverEmojis={serverEmojis}
              onSelect={(emoji) => {
                setInput(prev => prev + emoji)
                setShowEmojiInput(false)
              }}
              onClose={() => setShowEmojiInput(false)}
            />
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_TYPES}
          style={{ display: 'none' }}
          onChange={handleFileInputChange}
        />

        {/* Bandeau lecture seule si pas canWrite */}
        {channel && !chanPerms.canWrite && !isDM && (
          <div className="chan-readonly-banner">
            🔒 Tu n'as pas la permission d'écrire dans ce salon.
          </div>
        )}

        <div className={`chat-input-box${(!chanPerms.canWrite && !isDM) ? ' disabled' : ''}`}>
          <button
            className="upload-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={!channel || uploading || (!chanPerms.canWrite && !isDM)}
            title="Joindre un fichier"
          >
            {uploading ? '…' : '+'}
          </button>

          <button
            className="gif-toggle-btn"
            onClick={() => setShowGifs(g => !g)}
            disabled={!channel || uploading || (!chanPerms.canWrite && !isDM)}
            title="Envoyer un GIF"
          >
            GIF
          </button>

          <button
            className="gif-toggle-btn"
            onClick={() => setShowEmojiInput(e => !e)}
            disabled={!channel || (!chanPerms.canWrite && !isDM)}
            title="Insérer un emoji"
          >
            😊
          </button>

          <input
            className="chat-input"
            placeholder={
              (!chanPerms.canWrite && !isDM) ? '🔒 Salon en lecture seule'
              : uploading ? 'Upload en cours…'
              : channel ? `Message #${channelName}`
              : 'Sélectionne un salon'
            }
            value={input}
            onChange={e => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            disabled={!channel || uploading || (!chanPerms.canWrite && !isDM)}
          />
          <button className="send-btn" onClick={handleSend} disabled={!channel || uploading || (!chanPerms.canWrite && !isDM)}>➤</button>
        </div>
      </div>
    </div>
  )
}

export default ChatArea
