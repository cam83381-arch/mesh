import { useState, useEffect } from 'react'
import type { Message } from './types'
import gun from './gun'

function usePins(channelKey: string) {
  const [pins, setPins] = useState<Message[]>([])

  useEffect(() => {
    if (!channelKey) { setPins([]); return }

    const pinsRef: Record<string, Message> = {}

    const ref = gun.get('pins').get(channelKey)
    ref.map().on((msg: Message, id: string) => {
      if (!msg || !msg.id) {
        delete pinsRef[id]
      } else {
        pinsRef[id] = { ...msg, id }
      }
      setPins(
        Object.values(pinsRef).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
      )
    })

    return () => {
      ref.map().off()
    }
  }, [channelKey])

  const pinMessage = (message: Message) => {
    if (!channelKey || !message.id) return
    gun.get('pins').get(channelKey).get(message.id).put(message)
  }

  const unpinMessage = (messageId: string) => {
    if (!channelKey) return
    gun.get('pins').get(channelKey).get(messageId).put(null)
  }

  return { pins, pinMessage, unpinMessage }
}

export default usePins
