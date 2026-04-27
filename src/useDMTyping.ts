/**
 * useDMTyping.ts — Indicateur de frappe pour les DMs, via GunDB (P2P)
 *
 * gun.get('dm_typing').get(pairId).get(username) → { active, ts }
 */

import { useEffect, useState, useRef } from 'react'
import gun from './gun'

function useDMTyping(pairId: string | null, username: string) {
  const [typingUser, setTypingUser] = useState<string | null>(null)
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sendTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!pairId) return

    const node = gun.get('dm_typing').get(pairId)

    const handler = (data: any, user: string) => {
      if (!user || user === username) return
      const isActive = data && data.active === true && (Date.now() - (data.ts || 0)) < 5000
      if (isActive) {
        setTypingUser(user)
        if (stopTimer.current) clearTimeout(stopTimer.current)
        stopTimer.current = setTimeout(() => setTypingUser(null), 4000)
      } else {
        setTypingUser(prev => (prev === user ? null : prev))
      }
    }

    node.map().on(handler)

    return () => {
      node.map().off()
      if (stopTimer.current) clearTimeout(stopTimer.current)
      if (sendTimer.current) clearTimeout(sendTimer.current)
      setTypingUser(null)
    }
  }, [pairId, username])

  const sendTyping = () => {
    if (!pairId || !username) return
    gun.get('dm_typing').get(pairId).get(username).put({ active: true, ts: Date.now() })
    if (sendTimer.current) clearTimeout(sendTimer.current)
    sendTimer.current = setTimeout(() => {
      gun.get('dm_typing').get(pairId).get(username).put({ active: false, ts: Date.now() })
    }, 2500)
  }

  return { typingUser, sendTyping }
}

export default useDMTyping
