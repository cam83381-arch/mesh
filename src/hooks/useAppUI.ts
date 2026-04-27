import { useState, useCallback, useRef, useEffect } from 'react'
import type { Channel } from '../types'
import { leaveAllMeshRooms } from '../mesh'

/**
 * Centralise tout l'état UI de l'application (modales, panneaux, split-view, etc.)
 * Extrait d'App.tsx pour alléger le composant racine.
 */
export function useAppUI() {
  // ── Serveur & navigation ──
  const [activeServerId, setActiveServerId] = useState<string>('')
  const [isDMMode, setIsDMMode] = useState(false)
  const [showFriendsPage, setShowFriendsPage] = useState(false)

  // ── Modales ──
  const [showServerModal, setShowServerModal] = useState(false)
  const [showServerSettings, setShowServerSettings] = useState(false)
  const [showUserSettings, setShowUserSettings] = useState(false)
  const [showBotEditor, setShowBotEditor] = useState(false)
  const [activeBotId, setActiveBotId] = useState<string | null>(null)
  const [editingBotId, setEditingBotId] = useState<string | null>(null)
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null)

  // ── Panneaux rétractables ──
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [membersCollapsed, setMembersCollapsed] = useState(false)

  // ── Split-view ──
  const [splitView, setSplitView] = useState(false)
  const [rightChannel, setRightChannel] = useState<Channel | null>(null)
  const [dropTarget, setDropTarget] = useState<'left' | 'right' | null>(null)

  // ── Vocal ──
  const [activeVoiceChannel, setActiveVoiceChannel] = useState<Channel | null>(null)

  // ── Bot count ref (pour tracker les nouveaux messages) ──
  const prevMsgCountRef = useRef(0)

  // ── Ajouter is-electron au body ──
  useEffect(() => {
    if ((window as any).electron) {
      document.body.classList.add('is-electron')
    }
  }, [])

  // ── Navigation ──
  const selectServer = useCallback((id: string) => {
    setActiveServerId(id)
    setIsDMMode(false)
    setShowServerSettings(false)
  }, [])

  const openDMs = useCallback(() => {
    setIsDMMode(true)
    setActiveServerId('')
  }, [])

  const logout = useCallback(() => {
    leaveAllMeshRooms()
    setActiveServerId('')
    setIsDMMode(false)
    setShowServerSettings(false)
    setShowUserSettings(false)
  }, [])

  // ── Split-view handlers ──
  const openSplitRight = useCallback((
    channel: Channel,
    activeVoice: Channel | null,
    channels: Channel[],
    setCurrentChannel: (c: Channel) => void
  ) => {
    if (channel.type !== 'text') return
    if (activeVoice) {
      if (!splitView) {
        setRightChannel(channel)
        setSplitView(true)
      } else {
        const firstText = channels.find(c => c.type === 'text') || null
        if (firstText) setCurrentChannel(firstText)
        setRightChannel(channel)
        setSplitView(true)
      }
    } else {
      setRightChannel(channel)
      setSplitView(true)
    }
  }, [splitView])

  const openSplitVoice = useCallback((
    voiceChannel: Channel,
    channels: Channel[],
    setCurrentChannel: (c: Channel) => void
  ) => {
    if (voiceChannel.type !== 'voice') return
    setCurrentChannel(voiceChannel)
    const firstText = channels.find(c => c.type === 'text') || null
    setRightChannel(rch => rch ?? firstText)
    setSplitView(true)
  }, [])

  const closeSplit = useCallback(() => {
    setSplitView(false)
    setRightChannel(null)
  }, [])

  return {
    // État serveur
    activeServerId, setActiveServerId,
    isDMMode, setIsDMMode,
    showFriendsPage, setShowFriendsPage,

    // Modales
    showServerModal, setShowServerModal,
    showServerSettings, setShowServerSettings,
    showUserSettings, setShowUserSettings,
    showBotEditor, setShowBotEditor,
    activeBotId, setActiveBotId,
    editingBotId, setEditingBotId,
    editingChannel, setEditingChannel,

    // Panneaux
    sidebarCollapsed, setSidebarCollapsed,
    membersCollapsed, setMembersCollapsed,

    // Split-view
    splitView, setSplitView,
    rightChannel, setRightChannel,
    dropTarget, setDropTarget,

    // Vocal
    activeVoiceChannel, setActiveVoiceChannel,

    // Ref
    prevMsgCountRef,

    // Actions
    selectServer,
    openDMs,
    logout,
    openSplitRight,
    openSplitVoice,
    closeSplit,
  }
}