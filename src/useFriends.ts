/**
 * useFriends.ts — Gestion des amis P2P
 *
 * Persistance : localStore friends.json
 * Transport temps réel : Trystero makeAction('friend_event') via joinMeshRoom
 * GunDB : ZÉRO utilisation — supprimé
 */

import { useState, useEffect } from 'react'
import { readLocal, writeLocal } from './localStore'
import { joinMeshRoom } from './mesh'

// ── Types ────────────────────────────────────────────────────────
export type FriendStatus = 'pending' | 'accepted' | 'blocked'

export interface Friendship {
  pairId: string       // "alice_bob" (trié alphabétiquement)
  otherUser: string
  status: FriendStatus
  initiator: string
  timestamp: number
}

interface FriendEntry {
  user1: string
  user2: string
  status: FriendStatus
  initiator: string
  timestamp: number
}

// ── Helpers localStore ────────────────────────────────────────────
async function loadFriends(username: string): Promise<Record<string, FriendEntry>> {
  const data = await readLocal<Record<string, Record<string, FriendEntry>>>('friends.json')
  return data?.[username] || {}
}

async function saveFriends(username: string, store: Record<string, FriendEntry>): Promise<void> {
  const data = await readLocal<Record<string, Record<string, FriendEntry>>>('friends.json') || {}
  data[username] = store
  await writeLocal('friends.json', data)
}

// ── Hook principal ───────────────────────────────────────────────
function useFriends(username: string) {
  const [friendships, setFriendships] = useState<Record<string, Friendship>>({})

  useEffect(() => {
    if (!username) return
    let active = true

    // 1. Charger depuis localStore
    const load = async () => {
      const store = await loadFriends(username)
      if (!active) return
      const parsed: Record<string, Friendship> = {}
      Object.entries(store).forEach(([pairId, data]) => {
        const otherUser = data.user1 === username ? data.user2 : data.user1
        parsed[pairId] = { pairId, otherUser, status: data.status, initiator: data.initiator, timestamp: data.timestamp }
      })
      setFriendships(parsed)
    }
    load()

    // 2. Écouter les événements amis entrants via Trystero
    const friendRoom = joinMeshRoom(`friend_inbox_${username}`)
    if (friendRoom) {
      const [, getFriendEvent] = (friendRoom.makeAction as any)('friend_event') as [any, any]

      getFriendEvent(async (event: any) => {
        if (!active || !event?.pairId || !event?.type) return
        const store = await loadFriends(username)

        if (event.type === 'request') {
          if (!store[event.pairId]) {
            store[event.pairId] = {
              user1: event.user1, user2: event.user2,
              status: 'pending', initiator: event.initiator,
              timestamp: event.timestamp || Date.now()
            }
            await saveFriends(username, store)
            const otherUser = event.user1 === username ? event.user2 : event.user1
            setFriendships(prev => ({
              ...prev,
              [event.pairId]: { pairId: event.pairId, otherUser, status: 'pending', initiator: event.initiator, timestamp: event.timestamp || Date.now() }
            }))
          }
        } else if (event.type === 'accepted') {
          if (store[event.pairId]) {
            store[event.pairId].status = 'accepted'
            await saveFriends(username, store)
            setFriendships(prev => ({ ...prev, [event.pairId]: { ...prev[event.pairId], status: 'accepted' } }))
          }
        } else if (event.type === 'removed') {
          delete store[event.pairId]
          await saveFriends(username, store)
          setFriendships(prev => { const n = { ...prev }; delete n[event.pairId]; return n })
        }
      })
    }

    return () => { active = false }
  }, [username])

  const sendRequest = async (targetUsername: string) => {
    if (!username || !targetUsername || targetUsername === username) return
    const pairId = [username, targetUsername].sort().join('_')
    const store = await loadFriends(username)
    if (store[pairId] && store[pairId].status !== 'blocked') return
    const sorted = [username, targetUsername].sort()
    const entry: FriendEntry = { user1: sorted[0], user2: sorted[1], status: 'pending', initiator: username, timestamp: Date.now() }
    store[pairId] = entry
    await saveFriends(username, store)
    setFriendships(prev => ({ ...prev, [pairId]: { pairId, otherUser: targetUsername, status: 'pending', initiator: username, timestamp: entry.timestamp } }))

    const theirRoom = joinMeshRoom(`friend_inbox_${targetUsername}`)
    if (theirRoom) {
      const [sendEvent] = (theirRoom.makeAction as any)('friend_event') as [any, any]
      try { sendEvent({ type: 'request', pairId, user1: sorted[0], user2: sorted[1], initiator: username, timestamp: entry.timestamp }) } catch (_e) {}
    }
  }

  const acceptRequest = async (pairId: string) => {
    const store = await loadFriends(username)
    if (!store[pairId]) return
    store[pairId].status = 'accepted'
    await saveFriends(username, store)
    setFriendships(prev => ({ ...prev, [pairId]: { ...prev[pairId], status: 'accepted' } }))
    const other = friendships[pairId]?.otherUser
    if (other) {
      const theirRoom = joinMeshRoom(`friend_inbox_${other}`)
      if (theirRoom) {
        const [sendEvent] = (theirRoom.makeAction as any)('friend_event') as [any, any]
        try { sendEvent({ type: 'accepted', pairId }) } catch (_e) {}
      }
    }
  }

  const declineRequest = async (pairId: string) => {
    const store = await loadFriends(username)
    const other = friendships[pairId]?.otherUser
    delete store[pairId]
    await saveFriends(username, store)
    setFriendships(prev => { const n = { ...prev }; delete n[pairId]; return n })
    if (other) {
      const theirRoom = joinMeshRoom(`friend_inbox_${other}`)
      if (theirRoom) {
        const [sendEvent] = (theirRoom.makeAction as any)('friend_event') as [any, any]
        try { sendEvent({ type: 'removed', pairId }) } catch (_e) {}
      }
    }
  }

  const removeFriend = declineRequest

  const blockUser = async (targetUsername: string) => {
    const pairId = [username, targetUsername].sort().join('_')
    const store = await loadFriends(username)
    const sorted = [username, targetUsername].sort()
    store[pairId] = { user1: sorted[0], user2: sorted[1], status: 'blocked', initiator: username, timestamp: Date.now() }
    await saveFriends(username, store)
    setFriendships(prev => ({ ...prev, [pairId]: { pairId, otherUser: targetUsername, status: 'blocked', initiator: username, timestamp: Date.now() } }))
  }

  const getFriendStatus = (targetUsername: string): FriendStatus | null => {
    const pairId = [username, targetUsername].sort().join('_')
    return friendships[pairId]?.status || null
  }

  const all = Object.values(friendships)
  const friends = all.filter(f => f.status === 'accepted')
  const pendingIncoming = all.filter(f => f.status === 'pending' && f.initiator !== username)
  const pendingSent = all.filter(f => f.status === 'pending' && f.initiator === username)

  return { friends, pendingIncoming, pendingSent, sendRequest, acceptRequest, declineRequest, removeFriend, blockUser, getFriendStatus }
}

export default useFriends
