import { useState, useEffect, useRef } from 'react'
import gun from './gun'

export interface ServerEmoji {
  id: string
  name: string       // ex: "pepe"
  url: string        // base64 data URL ou URL serveur
  serverId: string
  addedBy: string
  createdAt: number
}

function useServerEmojis(serverId: string, username: string) {
  const [emojis, setEmojis] = useState<ServerEmoji[]>([])
  const emojisRef = useRef<Record<string, ServerEmoji>>({})

  useEffect(() => {
    if (!serverId) {
      setEmojis([])
      return
    }

    emojisRef.current = {}
    setEmojis([])

    const ref = gun.get('emojis').get(serverId)
    ref.map().on((emoji: ServerEmoji, id: string) => {
      if (!emoji || !emoji.name) {
        delete emojisRef.current[id]
      } else {
        emojisRef.current[id] = { ...emoji, id }
      }
      setEmojis(Object.values(emojisRef.current)
        .filter(e => e && e.name)
        .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)))
    })

    return () => {
      ref.map().off()
    }
  }, [serverId])

  const addEmoji = async (name: string, file: File): Promise<boolean> => {
    if (!serverId || !name.trim() || !file) return false

    // Valider le nom (lettres, chiffres, underscores, tirets — max 32 chars)
    const cleanName = name.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '')
    if (!cleanName || cleanName.length > 32) return false

    // Vérifier les doublons
    const exists = Object.values(emojisRef.current).some(e => e.name === cleanName)
    if (exists) return false

    // Valider type + taille (max 256KB, images seulement)
    if (!file.type.startsWith('image/')) return false
    if (file.size > 256 * 1024) return false

    // Convertir en base64 data URL
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })

    const id = Date.now().toString()
    const emoji: ServerEmoji = {
      id,
      name: cleanName,
      url: dataUrl,
      serverId,
      addedBy: username,
      createdAt: Date.now()
    }

    gun.get('emojis').get(serverId).get(id).put(emoji)
    return true
  }

  const removeEmoji = (emojiId: string) => {
    if (!serverId) return
    gun.get('emojis').get(serverId).get(emojiId).put(null)
  }

  return { emojis, addEmoji, removeEmoji }
}

export default useServerEmojis
