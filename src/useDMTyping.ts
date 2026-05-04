/**
 * useDMTyping.ts — Indicateur de frappe pour les DMs, via Trystero P2P
 *
 * joinMeshRoom('dm_typing_{pairId}') → action 'typing' → { user, active }
 */

import { useEffect, useState, useRef } from 'react'
import { joinMeshRoom } from './mesh'

function useDMTyping(pairId: string | null, username: string) {
  const [typingUser, setTypingUser] = useState<string | null>(null)
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sendTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sendTypingP2P = useRef<((t: object) => void) | null>(null)

  useEffect(() => {
    if (!pairId) return
    let active = true

    const room = joinMeshRoom(`dm_typing_${pairId}`)
    if (room) {
      const [sendTypingFn, getTyping] = (room.makeAction as any)('typing') as [any, any]
      sendTypingP2P.current = (t: object) => { try { sendTypingFn(t) } catch {} }

      getTyping((data: any) => {
        if (!active || !data?.user || data.user === username) return
        const isActive = data.active === true
        if (isActive) {
          setTypingUser(data.user)
          if (stopTimer.current) clearTimeout(stopTimer.current)
          stopTimer.current = setTimeout(() => setTypingUser(null), 4000)
        } else {
          setTypingUser(prev => (prev === data.user ? null : prev))
        }
      })
    }

    return () => {
      active = false
      sendTypingP2P.current = null
      if (stopTimer.current) clearTimeout(stopTimer.current)
      if (sendTimer.current) clearTimeout(sendTimer.current)
      setTypingUser(null)
    }
  }, [pairId, username])

  const sendTyping = () => {
    if (!pairId || !username) return
    sendTypingP2P.current?.({ user: username, active: true })
    if (sendTimer.current) clearTimeout(sendTimer.current)
    sendTimer.current = setTimeout(() => {
      sendTypingP2P.current?.({ user: username, active: false })
    }, 2500)
  }

  return { typingUser, sendTyping }
}

export default useDMTyping
