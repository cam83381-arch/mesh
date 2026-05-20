import { useState, useEffect, useRef } from 'react'
import { readLocal, writeLocal } from './localStore'
import { joinMeshRoom } from './mesh'

const FILE = 'emojis.json'

export interface ServerEmoji {
  id: string
  name: string
  url: string        // base64 data URL
  serverId: string
  addedBy: string
  createdAt: number
}

async function loadEmojis(serverId: string): Promise<Record<string, ServerEmoji>> {
  const data = await readLocal<Record<string, Record<string, ServerEmoji>>>(FILE) || {}
  return data[serverId] || {}
}

async function saveEmojis(serverId: string, emojis: Record<string, ServerEmoji>) {
  const data = await readLocal<Record<string, Record<string, ServerEmoji>>>(FILE) || {}
  data[serverId] = emojis
  await writeLocal(FILE, data)
}

function sortEmojis(emojis: Record<string, ServerEmoji>): ServerEmoji[] {
  return Object.values(emojis).filter(e => e?.name).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
}

function useServerEmojis(serverId: string, username: string) {
  const [emojis, setEmojis] = useState<ServerEmoji[]>([])
  const emojisRef = useRef<Record<string, ServerEmoji>>({})
  const sendEmojiFn = useRef<((data: any) => void) | null>(null)

  useEffect(() => {
    if (!serverId) { setEmojis([]); return }
    let active = true
    emojisRef.current = {}
    setEmojis([])

    loadEmojis(serverId).then(data => {
      if (!active) return
      emojisRef.current = data
      setEmojis(sortEmojis(data))
    })

    // Trystero room pour sync cross-machine
    const room = joinMeshRoom(`emojis_${serverId}`)
    if (room) {
      const [sendEmoji, getEmoji] = (room.makeAction as any)('emoji_update') as [any, any]
      sendEmojiFn.current = sendEmoji

      // Recevoir un emoji ajouté / supprimé
      getEmoji(async (payload: any) => {
        if (!active || !payload?.id) return
        const data = await loadEmojis(serverId)
        if (payload._deleted) {
          delete data[payload.id]
        } else {
          const { _deleted: _, ...emoji } = payload
          data[emoji.id] = emoji as ServerEmoji
        }
        emojisRef.current = data
        await saveEmojis(serverId, data)
        setEmojis(sortEmojis(data))
      })

      // Envoyer tous nos emojis au nouveau pair
      room.onPeerJoin(async () => {
        const data = await loadEmojis(serverId)
        Object.values(data).forEach(e => {
          try { sendEmoji(e) } catch (_e) {}
        })
      })
    }

    return () => { active = false }
  }, [serverId])

  const addEmoji = async (name: string, file: File): Promise<boolean> => {
    if (!serverId || !name.trim() || !file) return false
    const cleanName = name.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '')
    if (!cleanName || cleanName.length > 32) return false
    const exists = Object.values(emojisRef.current).some(e => e.name === cleanName)
    if (exists) return false
    if (!file.type.startsWith('image/')) return false
    if (file.size > 256 * 1024) return false

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })

    const id = Date.now().toString()
    const emoji: ServerEmoji = { id, name: cleanName, url: dataUrl, serverId, addedBy: username, createdAt: Date.now() }
    emojisRef.current[id] = emoji
    await saveEmojis(serverId, emojisRef.current)
    setEmojis(sortEmojis(emojisRef.current))
    try { sendEmojiFn.current?.(emoji) } catch (_e) {}
    return true
  }

  const removeEmoji = async (emojiId: string) => {
    if (!serverId) return
    const deleted = emojisRef.current[emojiId]
    delete emojisRef.current[emojiId]
    await saveEmojis(serverId, emojisRef.current)
    setEmojis(sortEmojis(emojisRef.current))
    if (deleted) {
      try { sendEmojiFn.current?.({ ...deleted, _deleted: true }) } catch (_e) {}
    }
  }

  return { emojis, addEmoji, removeEmoji }
}

export default useServerEmojis
