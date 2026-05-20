import { useEffect, useRef } from 'react'
import type { Message } from './types'

// ── Demander la permission de notification une seule fois ──
let permissionRequested = false
function requestNotifPermission() {
  if (permissionRequested) return
  permissionRequested = true
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission()
  }
}

// ── Afficher une notification desktop (Electron natif en priorité) ──
function showDesktopNotification(title: string, body: string) {
  // Electron natif via preload (window.electron)
  if ((window as any).electron?.showNotification) {
    ;(window as any).electron.showNotification(title, body)
    return
  }
  // Web Notifications API fallback
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      const n = new Notification(title, { body, silent: true, icon: '/icon.png' })
      setTimeout(() => n.close(), 5000)
    } catch (_e) {}
  }
}

// ── Badge non-lu sur l'icône tray ──
function setBadgeCount(count: number) {
  if ((window as any).electron?.setBadgeCount) {
    ;(window as any).electron.setBadgeCount(count)
  }
}

// ── Son de notification avec double ton Discord-like ──
let audioCtx: AudioContext | null = null
function playNotificationSound(volume = 0.35) {
  try {
    if (!audioCtx || audioCtx.state === 'closed') {
      audioCtx = new AudioContext()
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume()
    }
    const ctx = audioCtx
    const now = ctx.currentTime

    // Ton 1
    const osc1 = ctx.createOscillator()
    const gain1 = ctx.createGain()
    osc1.connect(gain1)
    gain1.connect(ctx.destination)
    osc1.type = 'sine'
    osc1.frequency.setValueAtTime(1000, now)
    osc1.frequency.exponentialRampToValueAtTime(750, now + 0.12)
    gain1.gain.setValueAtTime(volume, now)
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.18)
    osc1.start(now)
    osc1.stop(now + 0.18)

    // Ton 2 (légèrement décalé)
    const osc2 = ctx.createOscillator()
    const gain2 = ctx.createGain()
    osc2.connect(gain2)
    gain2.connect(ctx.destination)
    osc2.type = 'sine'
    osc2.frequency.setValueAtTime(1250, now + 0.16)
    osc2.frequency.exponentialRampToValueAtTime(950, now + 0.30)
    gain2.gain.setValueAtTime(0, now + 0.16)
    gain2.gain.setValueAtTime(volume * 0.8, now + 0.17)
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.35)
    osc2.start(now + 0.16)
    osc2.stop(now + 0.35)
  } catch (_e) {
    // AudioContext non disponible ou bloqué
  }
}

// ── Son de mention (plus marquant) ──
function playMentionSound() {
  playNotificationSound(0.5)
}

interface NotifSettings {
  soundEnabled?: boolean
  desktopNotifications?: boolean
  mentionsOnly?: boolean
}

function useNotifications(
  messages: Message[],
  currentUsername: string,
  channelName: string,
  isDM = false,
  notifSettings: NotifSettings = {},
) {
  const joinedAtRef = useRef(Date.now())
  const prevCountRef = useRef(0)
  const unreadCountRef = useRef(0)

  // Demander permission à la première utilisation
  useEffect(() => {
    requestNotifPermission()
  }, [])

  // Reset quand on change de salon
  useEffect(() => {
    joinedAtRef.current = Date.now()
    prevCountRef.current = 0
    unreadCountRef.current = 0
  }, [channelName])

  useEffect(() => {
    if (messages.length <= prevCountRef.current) {
      prevCountRef.current = messages.length
      return
    }

    const newMsgs = messages.slice(prevCountRef.current)
    prevCountRef.current = messages.length

    const relevant = newMsgs.filter(msg =>
      (msg.timestamp || 0) > joinedAtRef.current &&
      (msg.author || msg.authorName) !== currentUsername &&
      msg.content // pas de messages système vides
    )

    if (relevant.length === 0) return

    const isFocused = document.hasFocus && document.hasFocus()
    const isVisible = !document.hidden

    relevant.forEach(msg => {
      const author = msg.author || msg.authorName || 'Quelqu\'un'
      const preview = (msg.content || '').slice(0, 100)
      const isMention = (msg.content || '').toLowerCase().includes(`@${currentUsername.toLowerCase()}`) ||
                        (msg.content || '').includes('@everyone') ||
                        (msg.content || '').includes('@here')

      if (isDM) {
        // DMs — toujours notifier
        if (notifSettings.soundEnabled !== false) {
          if (!isVisible || !isFocused) playNotificationSound()
        }
        if (notifSettings.desktopNotifications !== false && (!isVisible || !isFocused)) {
          showDesktopNotification(`💬 ${author}`, preview)
        }
        if (!isVisible) {
          document.title = `(DM) ${author} — Mesh`
        }
      } else if (isMention) {
        // Mention — notifier même si la fenêtre est visible
        if (notifSettings.soundEnabled !== false) {
          playMentionSound()
        }
        if (notifSettings.desktopNotifications !== false) {
          showDesktopNotification(`🔔 @${currentUsername} dans #${channelName}`, `${author}: ${preview}`)
        }
        if (!isVisible) {
          document.title = `(@) #${channelName} — Mesh`
        }
      } else if (!notifSettings.mentionsOnly) {
        // Message normal — seulement si fenêtre non visible
        if (!isVisible || !isFocused) {
          if (notifSettings.soundEnabled !== false) playNotificationSound()
          if (notifSettings.desktopNotifications !== false && !isVisible) {
            showDesktopNotification(`#${channelName}`, `${author}: ${preview}`)
          }
        }
        if (!isVisible) {
          unreadCountRef.current += relevant.length
          document.title = `(${unreadCountRef.current}) #${channelName} — Mesh`
        }
      }
    })

    // Badge tray
    if (!isVisible) {
      setBadgeCount(unreadCountRef.current + relevant.length)
    }
  }, [messages.length, currentUsername, channelName, isDM]) // eslint-disable-line react-hooks/exhaustive-deps

  // Réinitialiser titre + badge quand la fenêtre reprend le focus
  useEffect(() => {
    const onFocus = () => {
      document.title = 'Mesh'
      unreadCountRef.current = 0
      setBadgeCount(0)
    }
    const onVisible = () => {
      if (!document.hidden) {
        document.title = 'Mesh'
        unreadCountRef.current = 0
        setBadgeCount(0)
      }
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])
}

export default useNotifications
