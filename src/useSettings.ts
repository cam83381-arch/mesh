import { useState, useEffect, useCallback } from 'react'
import { readLocal, writeLocal } from './localStore'

const FILE = 'settings.json'

export interface AppSettings {
  theme: 'dark' | 'light' | 'auto'
  fontSize: number
  messageDisplay: 'compact' | 'cozy'
  accentColor: string
  soundEnabled: boolean
  desktopNotifications: boolean
  mentionsOnly: boolean
  dmPrivacy: 'everyone' | 'friends'
  displayName: string
  bio: string
  bannerColor: string
  micDeviceId: string
  camDeviceId: string
  inputVolume: number
  outputVolume: number
  developerMode: boolean
  tenorKey: string
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  fontSize: 15,
  messageDisplay: 'cozy',
  accentColor: '#5865f2',
  soundEnabled: true,
  desktopNotifications: false,
  mentionsOnly: false,
  dmPrivacy: 'everyone',
  displayName: '',
  bio: '',
  bannerColor: '#5865f2',
  micDeviceId: '',
  camDeviceId: '',
  inputVolume: 100,
  outputVolume: 100,
  developerMode: false,
  tenorKey: '',
}

export function applySettings(s: AppSettings) {
  const root = document.documentElement
  root.style.setProperty('--accent', s.accentColor)
  root.style.setProperty('--font-size-base', `${s.fontSize}px`)
  root.style.setProperty('--msg-gap', s.messageDisplay === 'compact' ? '0px' : '4px')
  if (s.messageDisplay === 'compact') {
    root.setAttribute('data-compact', 'true')
  } else {
    root.removeAttribute('data-compact')
  }
  const resolvedTheme =
    s.theme === 'auto'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
      : s.theme
  root.setAttribute('data-theme', resolvedTheme)
  if (s.developerMode) {
    root.setAttribute('data-devmode', 'true')
  } else {
    root.removeAttribute('data-devmode')
  }
}

function useSettings(username: string) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)

  useEffect(() => {
    if (!username) return
    applySettings(DEFAULT_SETTINGS)

    readLocal<Record<string, AppSettings>>(FILE).then(data => {
      if (!data?.[username]) return
      const merged: AppSettings = { ...DEFAULT_SETTINGS, ...data[username] }
      setSettings(merged)
      applySettings(merged)
    })
  }, [username])

  const updateSettings = useCallback(async (partial: Partial<AppSettings>) => {
    setSettings(prev => {
      const next: AppSettings = { ...prev, ...partial }
      applySettings(next)
      // Persister de maniere asynchrone
      readLocal<Record<string, AppSettings>>(FILE).then(data => {
        const store = data || {}
        store[username] = next
        writeLocal(FILE, store)
      })
      return next
    })
  }, [username])

  return { settings, updateSettings }
}

export default useSettings
