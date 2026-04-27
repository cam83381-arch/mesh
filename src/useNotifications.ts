import { useEffect, useRef } from 'react'
import type { Message } from './types'

// ── Afficher une notification desktop (Web API + Electron fallback) ──
function showDesktopNotification(title: string, body: string) {
  // Electron natif via preload (window.electron)
  if ((window as any).electron?.showNotification) {
    ;(window as any).electron.showNotification(title, body)
    return
  }
  // Web Notifications API
  if ('Notification' in window && Notification.permission === 'granted') {
    const n = new Notification(title, { body, silent: true, icon: '/icon.png' })
    setTimeout(() => n.close(), 5000)
  }
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
  const audioRef = useRef<AudioContext | null>(null)

  // Reset quand on change de salon
  useEffect(() => {
    joinedAtRef.current = Date.now()
    prevCountRef.current = 0
  }, [channelName])

  const playNotificationSound = () => {
    try {
      if (!audioRef.current || audioRef.current.state === 'closed') {
        audioRef.current = new AudioContext()
      }
      const ctx = audioRef.current
      const oscillator = ctx.createOscillator()
      const gainNode = ctx.createGain()

      oscillator.connect(gainNode)
      gainNode.connect(ctx.destination)

      oscillator.frequency.setValueAtTime(880, ctx.currentTime)
      oscillator.frequency.setValueAtTime(660, ctx.currentTime + 0.1)
      gainNode.gain.setValueAtTime(0.3, ctx.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3)

      oscillator.start(ctx.currentTime)
      oscillator.stop(ctx.currentTime + 0.3)
    } catch {
      // AudioContext non disponible
    }
  }

  useEffect(() => {
    if (messages.length > prevCountRef.current) {
      const newMsgs = messages.slice(prevCountRef.current)
      const relevant = newMsgs.filter(msg =>
        (msg.timestamp || 0) > joinedAtRef.current &&
        (msg.author || msg.authorName) !== currentUsername
      )
      if (relevant.length > 0) {
        if (notifSettings.soundEnabled !== false) playNotificationSound()
        if (document.hidden) {
          document.title = `(${relevant.length}) #${channelName} — Mesh`
        }

        // ── Notifications desktop ──
        if (notifSettings.desktopNotifications !== false) {
          for (const msg of relevant) {
            const author = msg.author || msg.authorName || 'Quelqu\'un'
            const preview = (msg.content || '').slice(0, 80)
            const isMention = (msg.content || '').includes(`@${currentUsername}`)
            if (isDM) {
              if (document.hidden) {
                showDesktopNotification(`Message de ${author}`, preview)
                break
              }
            } else if (isMention) {
              showDesktopNotification(`@${currentUsername} dans #${channelName}`, `${author}: ${preview}`)
            } else if (!notifSettings.mentionsOnly && document.hidden) {
              showDesktopNotification(`#${channelName}`, `${author}: ${preview}`)
            }
          }
        }
      }
    }
    prevCountRef.current = messages.length
  }, [messages.length, currentUsername, channelName, isDM]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const resetTitle = () => { document.title = 'Mesh' }
    document.addEventListener('visibilitychange', resetTitle)
    return () => document.removeEventListener('visibilitychange', resetTitle)
  }, [])
}

export default useNotifications
