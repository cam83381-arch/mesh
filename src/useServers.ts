import { useState, useEffect } from 'react'
import type { Server } from './types'
import gun from './gun'

const COLORS = [
  '#5865f2', '#23a559', '#f0b232',
  '#f23f43', '#f47fff', '#00b0f4'
]

function useServers(username: string) {
  const [servers, setServers] = useState<Server[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!username) return

    let active = true
    const serversRef: Record<string, Server> = {}
    const serverListeners: Record<string, boolean> = {}

    const updateServer_cb = (serverId: string) => {
      if (serverListeners[serverId]) return
      serverListeners[serverId] = true
      gun.get('servers').get(serverId).once((server: Server) => {
        if (!active) return
        if (server && server.name) {
          serversRef[serverId] = { ...server, id: serverId }
          setServers(Object.values(serversRef))
          setLoading(false)
        }
      })
      gun.get('servers').get(serverId).on((server: Server) => {
        if (!active) return
        if (!server || !server.name) {
          delete serversRef[serverId]
        } else {
          serversRef[serverId] = { ...server, id: serverId }
        }
        setServers(Object.values(serversRef))
        setLoading(false)
      })
    }

    gun.get('userServers').get(username).map().on((serverId: string, key: string) => {
      if (!active) return
      if (!serverId || serverId === null || typeof serverId !== 'string') {
        delete serversRef[key]
        setServers(Object.values(serversRef))
        return
      }
      updateServer_cb(serverId)
    })

    setLoading(false)
    return () => {
      active = false
      // Nettoyer tous les listeners de serveurs individuels
      Object.keys(serverListeners).forEach(serverId => {
        gun.get('servers').get(serverId).off()
      })
      // Nettoyer le listener de la liste de serveurs
      gun.get('userServers').get(username).map().off()
    }
  }, [username])

  const createServer = (name: string) => {
    const id = Date.now().toString()
    const color = COLORS[Math.floor(Math.random() * COLORS.length)]
    const label = name.slice(0, 2).toUpperCase()

    const server: Server = { id, name, label, color, ownerId: username }

    gun.get('servers').get(id).put(server)
    gun.get('userServers').get(username).get(id).put(id)
    // Ajouter le créateur comme membre owner
    gun.get('members').get(id).get(username).put({ username, role: 'owner', joinedAt: Date.now() })

    const defaultChannels = [
      { id: `${id}_1`, name: 'général', type: 'text', serverId: id },
      { id: `${id}_2`, name: 'annonces', type: 'text', serverId: id },
      { id: `${id}_3`, name: 'off-topic', type: 'text', serverId: id },
      { id: `${id}_4`, name: 'Général', type: 'voice', serverId: id },
      { id: `${id}_5`, name: 'Gaming', type: 'voice', serverId: id },
      { id: `${id}_6`, name: 'Stream', type: 'voice', serverId: id },
    ]

    defaultChannels.forEach(channel => {
      gun.get('channels').get(id).get(channel.id).put(channel)
    })

    setServers(prev => [...prev, server])
    return server
  }

  const joinServer = (id: string): Promise<Server | null> => {
    const trimmedId = id.trim()
    return new Promise((resolve) => {
      let resolved = false
      const timeout = setTimeout(() => {
        if (!resolved) { resolved = true; resolve(null) }
      }, 6000)

      gun.get('servers').get(trimmedId).on(function (this: any, server: any) {
        if (!server || !server.name || resolved) return
        clearTimeout(timeout)
        resolved = true
        try { this.off() } catch { /* ignore */ }
        gun.get('userServers').get(username).get(trimmedId).put(trimmedId)
        gun.get('members').get(trimmedId).get(username).put({ username, role: 'member', joinedAt: Date.now() })
        setServers(prev => {
          if (prev.find(s => s.id === trimmedId)) return prev
          return [...prev, { ...server, id: trimmedId }]
        })
        resolve({ ...server, id: trimmedId })
      })
    })
  }

  const joinByInvite = (code: string): Promise<Server | null> => {
    const trimmed = code.trim().toUpperCase()
    return new Promise((resolve) => {
      let resolved = false
      const timeout = setTimeout(() => {
        if (!resolved) { resolved = true; resolve(null) }
      }, 5000)

      gun.get('invites').get(trimmed).on(function (this: any, invite: any) {
        if (resolved) return
        // GunDB can return a node reference object without serverId
        if (!invite || typeof invite !== 'object' || !invite.serverId) return
        clearTimeout(timeout)
        resolved = true
        try { this.off() } catch { /* ignore */ }
        if (invite.expiresAt > 0 && Date.now() > invite.expiresAt) { resolve(null); return }
        if (invite.maxUses > 0 && (invite.uses || 0) >= invite.maxUses) { resolve(null); return }
        // Incrémenter le compteur d'utilisations une seule fois (index global)
        gun.get('invites').get(trimmed).get('uses').put((invite.uses || 0) + 1)
        joinServer(invite.serverId).then(resolve)
      })
    })
  }

  const updateServer = (id: string, name: string) => {
    const label = name.slice(0, 2).toUpperCase()
    gun.get('servers').get(id).get('name').put(name)
    gun.get('servers').get(id).get('label').put(label)
    setServers(prev => prev.map(s => s.id === id ? { ...s, name, label } : s))
  }

  const deleteServer = (id: string) => {
    // Supprimer le lien utilisateur → serveur
    gun.get('userServers').get(username).get(id).put(null)
    // Supprimer le serveur uniquement si on est le propriétaire
    gun.get('servers').get(id).once((server: Server) => {
      if (server && server.ownerId === username) {
        gun.get('servers').get(id).put(null)
        // Supprimer les salons
        gun.get('channels').get(id).map().once((_: any, channelId: string) => {
          gun.get('channels').get(id).get(channelId).put(null)
        })
      }
    })
    setServers(prev => prev.filter(s => s.id !== id))
  }

  const leaveServer = (id: string) => {
    gun.get('userServers').get(username).get(id).put(null)
    setServers(prev => prev.filter(s => s.id !== id))
  }

  return { servers, loading, createServer, joinServer, joinByInvite, updateServer, deleteServer, leaveServer }
}

export default useServers
