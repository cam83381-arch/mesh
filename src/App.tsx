import './App.css'
import { useCallback, useEffect } from 'react'

import TitleBar from './components/TitleBar'
import ServerBar from './components/ServerBar'
import ChannelSidebar from './components/ChannelSidebar'
import ChatArea from './components/ChatArea'
import StreamArea from './components/StreamArea'
import Auth from './components/Auth'
import ServerModal from './components/ServerModal'
import ServerSettings from './components/ServerSettings'
import ChannelSettingsModal from './components/ChannelSettingsModal'
import MembersPanel from './components/MembersPanel'
import DMSidebar from './components/DMSidebar'
import DMArea from './components/DMArea'
import FriendsPage from './components/FriendsPage'
import WelcomePage from './components/WelcomePage'
import UserPanel from './components/UserPanel'
import UserSettings from './components/UserSettings'
import BotEditor from './components/BotEditor'
import VoicePip from './components/VoicePip'
import UpdateBanner from './components/UpdateBanner'

import { useApp } from './context/AppContext'
import { useAppUI } from './hooks/useAppUI'
import useServers from './useServers'
import useChannels from './useChannels'
import useMembers from './useMembers'
import useRoles from './useRoles'
import useSocket from './useSocket'
import useDMs from './useDMs'
import useProfile from './useProfile'
import useStream from './useStream'
import useSettings from './useSettings'
import useFriends from './useFriends'
import useCategories from './useCategories'
import useUnread from './useUnread'
import useDMTyping from './useDMTyping'
import { useBotEngine } from './useBotEngine'
import useAllChannelPerms from './useAllChannelPerms'
import useVoicePresence from './useVoicePresence'

function App() {
  const { user, setUser } = useApp()
  const username = user?.username || ''

  // ── État UI centralisé ──
  const {
    activeServerId, setActiveServerId,
    isDMMode, setIsDMMode,
    showFriendsPage, setShowFriendsPage,
    showServerModal, setShowServerModal,
    showServerSettings, setShowServerSettings,
    showUserSettings, setShowUserSettings,
    showBotEditor, setShowBotEditor,
    activeBotId, setActiveBotId,
    editingChannel, setEditingChannel,
    sidebarCollapsed, setSidebarCollapsed,
    membersCollapsed, setMembersCollapsed,
    splitView, setSplitView,
    rightChannel, setRightChannel,
    dropTarget, setDropTarget,
    activeVoiceChannel, setActiveVoiceChannel,
    prevMsgCountRef,
    selectServer,
    openDMs,
  } = useAppUI()

  // ── Hooks de données (tous AVANT tout return conditionnel) ──
  const { servers, createServer, joinServer, joinByInvite, updateServer, deleteServer, leaveServer } = useServers(username)
  const { channels, currentChannel, setCurrentChannel, updateChannel, createChannel, deleteChannel } = useChannels(activeServerId)
  const { members, updateRole, kickMember, isKicked, assignCustomRole } = useMembers(activeServerId, username)
  const { customRoles, createRole, updateRole: updateCustomRole, updatePermission, deleteRole } = useRoles(activeServerId)

  const { profile, updateStatus, updateCustomStatus, saveProfile } = useProfile(username)

  // Socket canal principal
  const {
    messages, reactions, typingUsers,
    sendMessage, editMessage, deleteMessage, addReaction, removeReaction, sendTyping
  } = useSocket(currentChannel?.id || '', username, activeServerId, profile)

  // Socket volet droit (split-view)
  const {
    messages: rightMessages, reactions: rightReactions, typingUsers: rightTypingUsers,
    sendMessage: sendRightMessage,
    editMessage: editRightMessage,
    deleteMessage: deleteRightMessage,
    addReaction: addRightReaction,
    removeReaction: removeRightReaction,
    sendTyping: sendRightTyping,
  } = useSocket(rightChannel?.id || '', username, rightChannel ? activeServerId : '', profile)
  const { settings, updateSettings } = useSettings(username)
  const {
    isStreaming, streamers, watchingStream, videoRef, startStream, stopStream, watchStream, stopWatching,
    isCameraOn, cameraVideoRef, toggleCamera, voiceUsers, voiceFull, joinVoice, leaveVoice,
    isMuted, isDeafened, toggleMute, toggleDeafen,
    remoteAudios, localAudioStream,
  } = useStream(username, {
    micDeviceId: settings.micDeviceId,
    camDeviceId: settings.camDeviceId,
    inputVolume: settings.inputVolume,
    outputVolume: settings.outputVolume,
  })
  const { friends, pendingIncoming, pendingSent, sendRequest, acceptRequest, declineRequest, removeFriend } = useFriends(username)
  // Liste des usernames amis (pour dmPrivacy enforcement)
  const friendUsernames = friends.map(f => f.otherUser).filter(Boolean)
  const { conversations, messages: dmMessages, activeConv, setActiveConv, openConversation, sendDM, getOtherUser, unreadDMs } = useDMs(username, settings.dmPrivacy, friendUsernames)
  const { categories } = useCategories(activeServerId)
  const { unreadByChannel, totalUnread } = useUnread(activeServerId, channels, currentChannel?.id || '', username)
  const { typingUser: dmTypingUser, sendTyping: sendDMTyping } = useDMTyping(activeConv, username)
  const { canAccessChannel: _canAccess } = useAllChannelPerms(activeServerId)
  const voicePresence = useVoicePresence(channels, activeServerId)

  // ── Bot Engine ──
  const { dispatchBotEvent } = useBotEngine({
    serverId: activeServerId,
    username,
    channels: channels.map(c => ({ id: c.id, name: c.name })),
    members: members.map(m => ({ username: m.username, roles: m.customRoleId ? [m.customRoleId] : [] })),
    onSendBotMessage: (channelId, content) => {
      if (channelId) sendMessage(content, undefined, undefined, undefined, undefined, undefined)
    },
    onSendBotDM: (_targetUsername, _content) => { /* DM bot — non implémenté */ },
    onAddReaction: (messageId, emoji) => addReaction(messageId, emoji, `bot_${activeServerId}`),
    onDeleteMessage: deleteMessage,
    onKickMember: (u) => kickMember(u),
    onAssignRole: (u, role) => assignCustomRole(u, role),
    onRemoveRole: (_u, _role) => { /* TODO: removeCustomRole */ },
  })

  // ── Effets ──
  useEffect(() => {
    if (isKicked && activeServerId) {
      setActiveServerId('')
      setShowServerSettings(false)
    }
  }, [isKicked, activeServerId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Bot engine : dispatcher sur nouveaux messages
  useEffect(() => {
    if (!activeServerId || !currentChannel) return
    const newMessages = messages.slice(prevMsgCountRef.current)
    for (const msg of newMessages) {
      if ((msg.author || msg.authorName) === username) continue
      dispatchBotEvent({
        type: 'message',
        serverId: activeServerId,
        channelId: currentChannel.id,
        channelName: currentChannel.name,
        authorId: msg.author || msg.authorName || '',
        authorName: msg.author || msg.authorName || '',
        content: msg.content || '',
        messageId: msg.id,
      })
    }
    prevMsgCountRef.current = messages.length
  }, [messages.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Rejoindre salon vocal automatiquement à la navigation
  useEffect(() => {
    if (currentChannel?.type !== 'voice') return
    if (activeVoiceChannel?.id === currentChannel.id) return
    if (activeVoiceChannel) leaveVoice(activeVoiceChannel.id)
    setActiveVoiceChannel(currentChannel)
    joinVoice(currentChannel.id, currentChannel.userLimit)
  }, [currentChannel?.id, currentChannel?.type]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers vocal ──
  const handleLeaveVoice = useCallback(() => {
    if (activeVoiceChannel) leaveVoice(activeVoiceChannel.id)
    setActiveVoiceChannel(null)
    if (currentChannel?.type === 'voice') {
      const firstText = channels.find(c => c.type === 'text')
      if (firstText) setCurrentChannel(firstText)
    }
  }, [activeVoiceChannel, currentChannel, channels, leaveVoice, setCurrentChannel]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers split-view ──
  const handleSplitRight = useCallback((channel: import('./types').Channel) => {
    if (channel.type !== 'text') return
    if (activeVoiceChannel) {
      if (!splitView) {
        setRightChannel(channel); setSplitView(true)
      } else {
        const firstText = channels.find(c => c.type === 'text') || null
        if (firstText) setCurrentChannel(firstText)
        setRightChannel(channel); setSplitView(true)
      }
    } else {
      setRightChannel(channel); setSplitView(true)
    }
  }, [activeVoiceChannel, splitView, channels, setCurrentChannel]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSplitView = useCallback((voiceChannel: import('./types').Channel) => {
    if (voiceChannel.type !== 'voice') return
    setCurrentChannel(voiceChannel)
    const firstText = channels.find(c => c.type === 'text') || null
    setRightChannel(rch => rch ?? firstText)
    setSplitView(true)
  }, [channels, setCurrentChannel]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers messages ──
  const handleSendMessage = useCallback((
    content: string,
    replyTo?: { id: string; author: string; content: string },
    fileUrl?: string, fileName?: string, fileType?: string, fileSize?: number
  ) => {
    if (!user) return
    sendMessage(content, replyTo, fileUrl, fileName, fileType, fileSize)
  }, [user, sendMessage])

  const handleEditMessage = useCallback((id: string, content: string) => editMessage(id, content), [editMessage])
  const handleDeleteMessage = useCallback((id: string) => deleteMessage(id), [deleteMessage])
  const handleAddReaction = useCallback((messageId: string, reaction: string) => addReaction(messageId, reaction, username), [addReaction, username])
  const handleRemoveReaction = useCallback((messageId: string, reaction: string) => removeReaction(messageId, reaction, username), [removeReaction, username])

  // ── Handlers amis / DMs ──
  const handleOpenDM = useCallback((targetUsername: string) => {
    openConversation(targetUsername)
    setIsDMMode(true)
    setActiveServerId('')
  }, [openConversation]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleAddFriend = useCallback((targetUsername: string) => sendRequest(targetUsername), [sendRequest])
  const handleRemoveFriend = useCallback((pairId: string) => removeFriend(pairId), [removeFriend])

  // ── Handlers auth ──
  const handleLogin = (loggedUsername: string) => {
    setUser({ id: loggedUsername, username: loggedUsername, email: '', profile: { username: loggedUsername, status: 'online', avatarColor: '#5865f2' } })
  }

  const handleLogout = () => {
    setUser(null)
    selectServer('')
    setIsDMMode(false)
  }

  const handleDeepLink = useCallback((url: string) => {
    const match = url.match(/mesh:\/\/invite\/([A-Za-z0-9]+)/)
    if (match) joinByInvite(match[1])
  }, [joinByInvite])

  // ── Return conditionnel (APRÈS tous les hooks) ──
  if (!user) return <Auth onLogin={handleLogin} />

  // ── Valeurs dérivées ──
  const activeServer = servers.find(s => s.id === activeServerId) || null
  const activeConvObj = conversations.find(c => c.id === activeConv) || null
  const dmOtherUser = activeConvObj ? getOtherUser(activeConvObj) : ''

  // Props communes ChatArea (évite répétition)
  const notifSettings = {
    soundEnabled: settings.soundEnabled,
    desktopNotifications: settings.desktopNotifications,
    mentionsOnly: settings.mentionsOnly,
  }
  const chatAreaCommonProps = {
    members, customRoles, friends, serverId: activeServerId,
    notifSettings,
    onOpenDM: handleOpenDM,
    onAddFriend: handleAddFriend,
    onRemoveFriend: handleRemoveFriend,
  }

  return (
    <div className="app">
      <TitleBar onDeepLink={handleDeepLink} />
      <UpdateBanner />

      <div className="app-content">

        {/* ── ServerBar ── */}
        <ServerBar
          servers={servers}
          activeServer={activeServerId}
          onSelectServer={selectServer}
          onAddServer={() => setShowServerModal(true)}
          onOpenDMs={openDMs}
          isDMMode={isDMMode}
          unreadDMs={unreadDMs}
          friendRequestCount={pendingIncoming.length}
          unreadServers={activeServerId ? { [activeServerId]: totalUnread } : {}}
        />

        {/* ── Mode DM ── */}
        {isDMMode ? (
          <>
            <DMSidebar
              conversations={conversations}
              activeConv={activeConv}
              onSelectConv={(convId) => { setActiveConv(convId); setShowFriendsPage(false) }}
              onNewDM={(targetUser) => openConversation(targetUser)}
              getOtherUser={getOtherUser}
              friends={friends}
              pendingIncoming={pendingIncoming}
              pendingSent={pendingSent}
              onAcceptFriend={acceptRequest}
              onDeclineFriend={declineRequest}
              onRemoveFriend={removeFriend}
              onOpenFriendDM={handleOpenDM}
              onSendFriendRequest={handleAddFriend}
              onShowFriends={() => { setShowFriendsPage(true); setActiveConv('') }}
              isFriendsPage={showFriendsPage}
            />
            {showFriendsPage ? (
              <FriendsPage
                friends={friends}
                pendingIncoming={pendingIncoming}
                pendingSent={pendingSent}
                onAcceptFriend={acceptRequest}
                onDeclineFriend={declineRequest}
                onRemoveFriend={removeFriend}
                onOpenFriendDM={(u) => { handleOpenDM(u); setShowFriendsPage(false) }}
                onSendFriendRequest={handleAddFriend}
              />
            ) : activeConvObj ? (
              <DMArea
                notifSettings={notifSettings}
                messages={dmMessages}
                currentUsername={username}
                otherUser={dmOtherUser}
                onSendMessage={sendDM}
                onTyping={sendDMTyping}
                typingUser={dmTypingUser}
              />
            ) : (
              <div className="chat-area" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#80848e', gap: 12 }}>
                <div style={{ fontSize: 48 }}>👥</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: '#dbdee1' }}>Tes amis sont là !</div>
                <div style={{ fontSize: 14 }}>Sélectionne une conversation ou démarre-en une nouvelle.</div>
              </div>
            )}
          </>

        /* ── Pas de serveur sélectionné ── */
        ) : !activeServerId ? (
          <>
            <div className="channel-bar"><div style={{ flex: 1 }} /></div>
            <WelcomePage username={username} onAddServer={() => setShowServerModal(true)} />
          </>

        /* ── Vue serveur ── */
        ) : (
          <>
            {/* Sidebar salons */}
            <div key={activeServerId} className={`channel-bar-wrapper${sidebarCollapsed ? ' collapsed' : ''}`}>
              <div className="channel-bar-inner">
              <ChannelSidebar
                channels={channels}
                categories={categories}
                currentChannel={currentChannel}
                setCurrentChannel={setCurrentChannel}
                serverName={activeServer?.name}
                onOpenSettings={() => setShowServerSettings(true)}
                onEditChannel={ch => setEditingChannel(ch)}
                onCreateChannel={createChannel}
                onDeleteChannel={deleteChannel}
                unreadByChannel={unreadByChannel}
                onSplitView={handleSplitView}
                onSplitRight={handleSplitRight}
                isSplitView={splitView}
                canAccessChannel={(chId) => {
                  const myMember = members.find(m => m.username === username)
                  return _canAccess(chId, username, myMember, customRoles)
                }}
                voicePresence={voicePresence}
                activeVoiceChannelId={activeVoiceChannel?.id}
                currentUsername={username}
              />
              {/* UserPanel dans la sidebar — suit le collapse naturellement */}
              <UserPanel
                profile={profile}
                onUpdateStatus={updateStatus}
                onUpdateCustomStatus={updateCustomStatus}
                onLogout={handleLogout}
                onOpenSettings={() => setShowUserSettings(true)}
                isMuted={isMuted}
                isDeafened={isDeafened}
                onToggleMute={toggleMute}
                onToggleDeafen={toggleDeafen}
              />
              </div>{/* end channel-bar-inner */}
              <button
                className="sidebar-collapse-btn"
                onClick={() => setSidebarCollapsed(v => !v)}
                title={sidebarCollapsed ? 'Afficher les salons' : 'Réduire les salons'}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  {sidebarCollapsed ? <path d="M8 5l7 7-7 7"/> : <path d="M16 5l-7 7 7 7"/>}
                </svg>
              </button>
            </div>

            {/* Zone principale */}
            {splitView ? (
              <div className="split-view-container">
                {/* Volet gauche */}
                <div
                  className={`split-chat-pane${dropTarget === 'left' ? ' drop-target' : ''}${activeVoiceChannel && currentChannel?.type === 'voice' ? ' split-pane-voice' : ''}`}
                  onDragOver={e => {
                    if (activeVoiceChannel && currentChannel?.type === 'voice') return
                    e.preventDefault(); setDropTarget('left')
                  }}
                  onDragLeave={() => setDropTarget(null)}
                  onDrop={e => {
                    e.preventDefault(); setDropTarget(null)
                    if (activeVoiceChannel && currentChannel?.type === 'voice') return
                    const ch = channels.find(c => c.id === e.dataTransfer.getData('mesh/channel-id'))
                    if (ch?.type === 'text') setCurrentChannel(ch)
                  }}
                >
                  {activeVoiceChannel && currentChannel?.type === 'voice' ? (
                    <StreamArea
                      isStreaming={isStreaming} streamers={streamers}
                      watchingStream={watchingStream} videoRef={videoRef}
                      onStartStream={startStream} onStopStream={stopStream}
                      onWatchStream={watchStream} onStopWatching={stopWatching}
                      isCameraOn={isCameraOn} cameraVideoRef={cameraVideoRef}
                      onToggleCamera={toggleCamera} voiceUsers={voiceUsers}
                      voiceFull={voiceFull} onLeaveVoice={handleLeaveVoice}
                      isMuted={isMuted} isDeafened={isDeafened}
                      onToggleMute={toggleMute} onToggleDeafen={toggleDeafen}
                    />
                  ) : (
                    <ChatArea
                      key={currentChannel?.id}
                      channel={currentChannel?.type === 'text' ? currentChannel : channels.find(c => c.type === 'text') || null}
                      messages={messages} reactions={reactions} typingUsers={typingUsers}
                      onSendMessage={handleSendMessage} onEditMessage={handleEditMessage}
                      onDeleteMessage={handleDeleteMessage} onAddReaction={handleAddReaction}
                      onRemoveReaction={handleRemoveReaction} onTyping={sendTyping}
                      {...chatAreaCommonProps}
                    />
                  )}
                </div>

                <div className="split-divider">
                  <button className="split-close-btn" title="Fermer la vue partagée" onClick={() => setSplitView(false)}>×</button>
                </div>

                {/* Volet droit */}
                <div
                  className={`split-chat-pane${dropTarget === 'right' ? ' drop-target' : ''}`}
                  onDragOver={e => { e.preventDefault(); setDropTarget('right') }}
                  onDragLeave={() => setDropTarget(null)}
                  onDrop={e => {
                    e.preventDefault(); setDropTarget(null)
                    const ch = channels.find(c => c.id === e.dataTransfer.getData('mesh/channel-id'))
                    if (ch?.type === 'text') setRightChannel(ch)
                  }}
                >
                  <ChatArea
                    key={rightChannel?.id}
                    channel={rightChannel}
                    messages={rightMessages} reactions={rightReactions} typingUsers={rightTypingUsers}
                    onSendMessage={(content, replyTo, fileUrl, fileName, fileType, fileSize) => {
                      if (!user) return
                      sendRightMessage(content, replyTo, fileUrl, fileName, fileType, fileSize)
                    }}
                    onEditMessage={editRightMessage} onDeleteMessage={deleteRightMessage}
                    onAddReaction={(msgId, emoji) => addRightReaction(msgId, emoji, username)}
                    onRemoveReaction={(msgId, emoji) => removeRightReaction(msgId, emoji, username)}
                    onTyping={sendRightTyping}
                    {...chatAreaCommonProps}
                  />
                </div>
              </div>

            ) : currentChannel?.type === 'voice' ? (
              <StreamArea
                isStreaming={isStreaming} streamers={streamers}
                watchingStream={watchingStream} videoRef={videoRef}
                onStartStream={startStream} onStopStream={stopStream}
                onWatchStream={watchStream} onStopWatching={stopWatching}
                isCameraOn={isCameraOn} cameraVideoRef={cameraVideoRef}
                onToggleCamera={toggleCamera} voiceUsers={voiceUsers}
                voiceFull={voiceFull} onLeaveVoice={handleLeaveVoice}
                isMuted={isMuted} isDeafened={isDeafened}
                onToggleMute={toggleMute} onToggleDeafen={toggleDeafen}
              />
            ) : (
              <ChatArea
                key={currentChannel?.id}
                channel={currentChannel}
                messages={messages} reactions={reactions} typingUsers={typingUsers}
                onSendMessage={handleSendMessage} onEditMessage={handleEditMessage}
                onDeleteMessage={handleDeleteMessage} onAddReaction={handleAddReaction}
                onRemoveReaction={handleRemoveReaction} onTyping={sendTyping}
                {...chatAreaCommonProps}
              />
            )}

            {/* VoicePip */}
            {activeVoiceChannel && currentChannel?.type !== 'voice' && (
              <VoicePip
                voiceUsers={voiceUsers} isMuted={isMuted} isDeafened={isDeafened}
                onToggleMute={toggleMute} onToggleDeafen={toggleDeafen}
                onLeaveVoice={handleLeaveVoice}
                onExpand={() => { if (activeVoiceChannel) setCurrentChannel(activeVoiceChannel); setSplitView(false) }}
                remoteAudios={remoteAudios} localAudioStream={localAudioStream}
                currentUsername={username}
              />
            )}

            {/* Panneau membres */}
            <div className={`members-panel-wrapper${membersCollapsed ? ' collapsed' : ''}`}>
              <button
                className="members-collapse-btn"
                onClick={() => setMembersCollapsed(v => !v)}
                title={membersCollapsed ? 'Afficher les membres' : 'Réduire les membres'}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  {membersCollapsed ? <path d="M16 5l-7 7 7 7"/> : <path d="M8 5l7 7-7 7"/>}
                </svg>
              </button>
              <MembersPanel
                members={members} serverId={activeServerId} customRoles={customRoles}
                friends={friends} onOpenDM={handleOpenDM}
                onAddFriend={handleAddFriend} onRemoveFriend={handleRemoveFriend}
              />
            </div>
          </>
        )}

        {/* ── Modales ── */}
        {showServerModal && (
          <ServerModal
            onCreateServer={(name) => {
              const server = createServer(name)
              setActiveServerId(server.id); setIsDMMode(false); setShowServerModal(false)
            }}
            onJoinServer={async (input) => {
              let server = await joinByInvite(input)
              if (!server) server = await joinServer(input)
              if (server) { setActiveServerId(server.id); setIsDMMode(false) }
              setShowServerModal(false)
            }}
            onClose={() => setShowServerModal(false)}
          />
        )}

        {showUserSettings && (
          <UserSettings
            username={username} profile={profile} settings={settings}
            onUpdateSettings={updateSettings} onSaveProfile={saveProfile}
            onClose={() => setShowUserSettings(false)} onLogout={handleLogout}
          />
        )}

        {editingChannel && (
          <ChannelSettingsModal
            channel={editingChannel}
            onSave={(channelId, updates) => updateChannel(channelId, updates)}
            onClose={() => setEditingChannel(null)}
            members={members} customRoles={customRoles} serverId={activeServerId}
          />
        )}

        {showServerSettings && activeServer && (
          <ServerSettings
            server={activeServer} username={username} members={members} customRoles={customRoles}
            onClose={() => setShowServerSettings(false)}
            onUpdateServer={(id, name) => updateServer(id, name)}
            onDeleteServer={(id) => { deleteServer(id); setActiveServerId(''); setShowServerSettings(false) }}
            onLeaveServer={(id) => { leaveServer(id); setActiveServerId(''); setShowServerSettings(false) }}
            onUpdateRole={(u, role) => updateRole(u, role)}
            onKickMember={(u) => kickMember(u)}
            onAssignCustomRole={(u, roleId) => assignCustomRole(u, roleId)}
            onCreateRole={(name) => createRole(name)}
            onUpdateCustomRole={(roleId, updates) => updateCustomRole(roleId, updates)}
            onUpdatePermission={(roleId, perm, val) => updatePermission(roleId, perm, val)}
            onDeleteRole={(roleId) => deleteRole(roleId)}
            onOpenBotEditor={(botId) => { setActiveBotId(botId); setShowBotEditor(true); setShowServerSettings(false) }}
          />
        )}

      </div>

      {/* BotEditor en dehors de app-content — overlay full-screen sur toute la fenêtre */}
      {showBotEditor && activeServerId && (
        <div className="bot-editor-overlay">
          <BotEditor
            serverId={activeServerId}
            botId={activeBotId}
            onBack={() => { setShowBotEditor(false); setActiveBotId(null) }}
          />
        </div>
      )}

    </div>
  )
}

export default App
