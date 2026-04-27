/**
 * useWebhooks
 * Gère les webhooks entrants d'un salon (via API REST du serveur).
 */
import { useState, useCallback, useEffect } from 'react'

import { SERVER_URL } from './config'

export interface Webhook {
  name: string
  token: string
  url: string
}

function useWebhooks(serverId: string, channelId: string) {
  const [webhooks, setWebhooks] = useState<Webhook[]>([])
  const [loading, setLoading] = useState(false)

  const fetchWebhooks = useCallback(async () => {
    if (!serverId || !channelId) return
    setLoading(true)
    try {
      const res = await fetch(`${SERVER_URL}/api/webhooks/${serverId}/${channelId}`)
      const data: { name: string; token: string }[] = await res.json()
      setWebhooks(data.map(w => ({
        name: w.name,
        token: w.token,
        url: `${SERVER_URL}/webhook/${w.token}`,
      })))
    } catch {
      // serveur non dispo
    } finally {
      setLoading(false)
    }
  }, [serverId, channelId])

  useEffect(() => {
    fetchWebhooks()
  }, [fetchWebhooks])

  const createWebhook = useCallback(async (name: string) => {
    if (!serverId || !channelId || !name.trim()) return
    try {
      const res = await fetch(`${SERVER_URL}/api/webhooks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverId, channelId, name: name.trim() }),
      })
      const data = await res.json()
      if (data.token) {
        setWebhooks(prev => [...prev, { name: data.name, token: data.token, url: `${SERVER_URL}/webhook/${data.token}` }])
      }
    } catch { /* ignore */ }
  }, [serverId, channelId])

  const deleteWebhook = useCallback(async (token: string) => {
    try {
      await fetch(`${SERVER_URL}/api/webhooks/${token}`, { method: 'DELETE' })
      setWebhooks(prev => prev.filter(w => w.token !== token))
    } catch { /* ignore */ }
  }, [])

  return { webhooks, loading, createWebhook, deleteWebhook, refetch: fetchWebhooks }
}

export default useWebhooks
