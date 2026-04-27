import { useState, useEffect, useCallback } from 'react'
import type { Server } from './types'
import { readLocal, writeLocal } from './localStore'
import gun from './gun'

const COLORS = ['#5865f2','#23a559','#f0b232','#f23f43','#f47fff','#00b0f4']

// Fichier local : { [username]: string[] } — liste des serverIds par user
const USERSERVERS_FILE = 'userServers.json'
// Fichier local : { [serverId]: Server }
const SERVERS_FILE = 'servers.json'

async function loadUserServerIds(username: string): Promise<string[]> {
  const data = await readLocal<Record<string, string[]>>(USERSERVERS_FILE) || {}
  return data[username] || []
}

async function saveUserServerIds(username: string, ids: string[]) {
  const data = await readLocal<Record<string, string[]>>(USERSERVERS_FILE) || {}
  data[username] = ids
  await writeLocal(USERSERVERS_FILE, data)
}

async function loadAllServers(): Promise<Record<string, Server>> {
  return await readLocal<Record<string, Server>>(SERVERS_FILE) || {}
}

async function saveServer(server: Server) {
  const all = await loadAllServers()
  all[server.id] = server
  await writeLocal(SERVERS_FILE, all)
}

async function removeServerFromFile(serverId: string) {
  const all = await loadAllServers()
  delete all[serverId]
  await writeLocal(SERVERS_FILE, all)
}

function useServers(username: string) {
  const [servers, setServers] = useState<Server[]>([])

  // Charger les serveurs depuis le fichier local au démarrage
  useEffect(() => {
    if (!username) return
    let active = true

    const load = async () => {
      const ids = await loadUserServerIds(username)
      const all = await loadAllServers()
      if (!active) return
      const myServers = ids
        .map(id => all[id])
        .filter(Boolean) as Server[]
      setServers(myServers)

      // Écouter les mises à jour GunDB pour les serveurs rejoints via code
      // (les serveurs créés par d'autres et partagés par invite)
      ids.forEach(id => {
        gun.get('servers').get(id).on(async (server: any) => {
          if (!active || !server?.name) return
          const updated: Server = { ...server, id }
          await saveServer(updated)
          setServers(prev => {
            const exists = prev.find(s => s.id === id)
            if (exists) return prev.map(s => s.id === id ? updated : s)
            return [...prev, updated]
          })
        })
      })
    }

    load()
    return () => { active = false }
  }, [username])

  const createServer = useCallback(async (name: string) => {
    const id = Date.now().toString()
    const color = COLORS[Math.floor(Math.random() * COLORS.length)]
    const label = name.slice(0, 2).toUpperCase()
    const server: Server = { id, name, label, color, ownerId: username }

    // Sauvegarder localement
    await saveServer(server)
    const ids = await loadUserServerIds(username)
    await saveUserServerIds(username, [...ids, id])

    // Publier sur GunDB pour que les amis puissent rejoindre via ID
    gun.get('servers').get(id).put(server)
    gun.get('userServers').get(username).get(id).put(id)
    gun.get('members').get(id).get(username).put({ username, role: 'owner', joinedAt: Date.now() })

    const defaultChannels = [
      { id: `${id}_1`, name: 'général',   type: 'text',  serverId: id },
      { id: `${id}_2`, name: 'annonces',  type: 'text',  serverId: id },
      { id: `${id}_3`, name: 'off-topic', type: 'text',  serverId: id },
      { id: `${id}_4`, name: 'Général',   type: 'voice', serverId: id },
      { id: `${id}_5`, name: 'Gaming',    type: 'voice', serverId: id },
      { id: `${id}_6`, name: 'Stream',    type: 'voice', serverId: id },
    ]
    defaultChannels.forEach(ch => gun.get('channels').get(id).get(ch.id).put(ch))

    // Sauvegarder les canaux localement
    const { readLocal: rl, writeLocal: wl } = await import('./localStore')
    const chData = await rl<Record<string, any[]>>('channels.json') || {}
    chData[id] = defaultChannels
    await wl('channels.json', chData)

    setServers(prev => [...prev, server])
    return server
  }, [username])

  const joinServer = useCallback((id: string): Promise<Server | null> => {
    const trimmedId = id.trim()
    return new Promise((resolve) => {
      let resolved = false
      const timeout = setTimeout(() => {
        if (!resolved) { resolved = true; resolve(null) }
      }, 6000)

      gun.get('servers').get(trimmedId).on(async function (this: any, server: any) {
        if (!server?.name || resolved) return
        clearTimeout(timeout)
        resolved = true
        try { this.off() } catch {}

        const joined: Server = { ...server, id: trimmedId }
        await saveServer(joined)
        const ids = await loadUserServerIds(username)
        if (!ids.includes(trimmedId)) {
          await saveUserServerIds(username, [...ids, trimmedId])
        }

        gun.get('userServers').get(username).get(trimmedId).put(trimmedId)
        gun.get('members').get(trimmedId).get(username).put({ username, role: 'member', joinedAt: Date.now() })

        setServers(prev => prev.find(s => s.id === trimmedId) ? prev : [...prev, joined])
        resolve(joined)
      })
    })
  }, [username])

  const joinByInvite = useCallback((code: string): Promise<Server | null> => {
    const trimmed = code.trim().toUpperCase()
    return new Promise((resolve) => {
      let resolved = false
      const timeout = setTimeout(() => { if (!resolved) { resolved = true; resolve(null) } }, 5000)

      gun.get('invites').get(trimmed).on(async function (this: any, invite: any) {
        if (resolved || !invite?.serverId) return
        clearTimeout(timeout)
        resolved = true
        try { this.off() } catch {}
        if (invite.expiresAt > 0 && Date.now() > invite.expiresAt) { resolve(null); return }
        if (invite.maxUses > 0 && (invite.uses || 0) >= invite.maxUses) { resolve(null); return }
        gun.get('invites').get(trimmed).get('uses').put((invite.uses || 0) + 1)
        joinServer(invite.serverId).then(resolve)
      })
    })
  }, [joinServer])

  const updateServer = useCallback(async (id: string, name: string) => {
    const label = name.slice(0, 2).toUpperCase()
    gun.get('servers').get(id).get('name').put(name)
    gun.get('servers').get(id).get('label').put(label)
    const all = await loadAllServers()
    if (all[id]) { all[id] = { ...all[id], name, label }; await writeLocal(SERVERS_FILE, all) }
    setServers(prev => prev.map(s => s.id === id ? { ...s, name, label } : s))
  }, [])

  const deleteServer = useCallback(async (id: string) => {
    const ids = await loadUserServerIds(username)
    await saveUserServerIds(username, ids.filter(i => i !== id))
    await removeServerFromFile(id)
    gun.get('userServers').get(username).get(id).put(null)
    gun.get('servers').get(id).once((server: Server) => {
      if (server?.ownerId === username) gun.get('servers').get(id).put(null)
    })
    setServers(prev => prev.filter(s => s.id !== id))
  }, [username])

  const leaveServer = useCallback(async (id: string) => {
    const ids = await loadUserServerIds(username)
    await saveUserServerIds(username, ids.filter(i => i !== id))
    gun.get('userServers').get(username).get(id).put(null)
    setServers(prev => prev.filter(s => s.id !== id))
  }, [username])

  return { servers, loading: false, createServer, joinServer, joinByInvite, updateServer, deleteServer, leaveServer }
}

export default useServers
