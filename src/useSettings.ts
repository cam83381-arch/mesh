import { useState, useEffect, useCallback } from 'react'
import gun from './gun'

export interface AppSettings {
  // Apparence
  theme: 'dark' | 'light' | 'auto'
  fontSize: number          // 12–20
  messageDisplay: 'compact' | 'cozy'
  accentColor: string
  // Notifications
  soundEnabled: boolean
  desktopNotifications: boolean
  mentionsOnly: boolean
  // Confidentialité
  dmPrivacy: 'everyone' | 'friends'
  // Profil
  displayName: string
  bio: string
  bannerColor: string
  // Voix & Vidéo
  micDeviceId: string
  camDeviceId: string
  inputVolume: number   // 0–200
  outputVolume: number  // 0–200
  // Avancés
  developerMode: boolean
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
}

export function applySettings(s: AppSettings) {
  const root = document.documentElement
  root.style.setProperty('--accent', s.accentColor)
  root.style.setProperty('--font-size-base', `${s.fontSize}px`)
  root.style.setProperty('--msg-gap', s.messageDisplay === 'compact' ? '0px' : '4px')

  // Mode compact : attribut sur <html>
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

  // Mode développeur : attribut global pour afficher les IDs
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
    gun.get('settings').get(username).once((data: any) => {
      if (data) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { _, ...rest } = data
        const merged: AppSettings = { ...DEFAULT_SETTINGS, ...rest }
        setSettings(merged)
        applySettings(merged)
      }
    })
  }, [username])

  const updateSettings = useCallback((partial: Partial<AppSettings>) => {
    setSettings(prev => {
      const next: AppSettings = { ...prev, ...partial }
      applySettings(next)
      if (username) gun.get('settings').get(username).put(next)
      return next
    })
  }, [username])

  return { settings, updateSettings }
}

export default useSettings
