import { useState, useEffect, useRef } from 'react'
import type { Message } from './types'
import { readLocal, writeLocal } from './localStore'
import { joinMeshRoom } from './mesh'

const FILE = 'pins.json'

async function loadPins(channelKey: string): Promise<Record<string, Message>> {
  const data = await readLocal<Record<string, Record<string, Message>>>(FILE) || {}
  return data[channelKey] || {}
}

async function savePins(channelKey: string, pins: Record<string, Message>) {
  const data = await readLocal<Record<string, Record<string, Message>>>(FILE) || {}
  data[channelKey] = pins
  await writeLocal(FILE, data)
}

function sortPins(pins: Record<string, Message>): Message[] {
  return Object.values(pins).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
}

function usePins(channelKey: string) {
  const [pins, setPins] = useState<Message[]>([])
  const sendPinFn = useRef<((data: any) => void) | null>(null)

  useEffect(() => {
    if (!channelKey) { setPins([]); return }
    let active = true

    loadPins(channelKey).then(p => {
      if (!active) return
      setPins(sortPins(p))
    })

    // Trystero room pour sync cross-machine — une room par canal
    const room = joinMeshRoom(`pins_${channelKey}`)
    if (room) {
      const [sendPin, getPin] = (room.makeAction as any)('pin_update') as [any, any]
      sendPinFn.current = sendPin

      // Recevoir une épingle ajoutée / supprimée
      getPin(async (payload: any) => {
        if (!active || !payload?.id) return
        const p = await loadPins(channelKey)
        if (payload._deleted) {
          delete p[payload.id]
        } else {
          const { _deleted: _, ...msg } = payload
          p[msg.id] = msg as Message
        }
        await savePins(channelKey, p)
        setPins(sortPins(p))
      })

      // Envoyer toutes nos épingles au nouveau pair
      room.onPeerJoin(async () => {
        const p = await loadPins(channelKey)
        Object.values(p).forEach(msg => {
          try { sendPin(msg) } catch {}
        })
      })
    }

    return () => { active = false }
  }, [channelKey])

  const pinMessage = async (message: Message) => {
    if (!channelKey || !message.id) return
    const p = await loadPins(channelKey)
    p[message.id] = message
    await savePins(channelKey, p)
    setPins(sortPins(p))
    try { sendPinFn.current?.(message) } catch {}
  }

  const unpinMessage = async (messageId: string) => {
    if (!channelKey) return
    const p = await loadPins(channelKey)
    const deleted = p[messageId]
    delete p[messageId]
    await savePins(channelKey, p)
    setPins(sortPins(p))
    if (deleted) {
      try { sendPinFn.current?.({ ...deleted, _deleted: true }) } catch {}
    }
  }

  return { pins, pinMessage, unpinMessage }
}

export default usePins
