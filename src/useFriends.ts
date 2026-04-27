import { useState, useEffect } from 'react'
import gun from './gun'

export type FriendStatus = 'pending' | 'accepted' | 'blocked'

export interface Friendship {
  pairId: string       // "alice_bob" (trié alphabétiquement)
  otherUser: string
  status: FriendStatus
  initiator: string    // qui a envoyé la demande
  timestamp: number
}

function useFriends(username: string) {
  const [friendships, setFriendships] = useState<Record<string, Friendship>>({})

  useEffect(() => {
    if (!username) return

    const ref: Record<string, Friendship> = {}

    gun.get('userFriends').get(username).map().on((pairId: string, key: string) => {
      if (!pairId) {
        delete ref[key]
        setFriendships({ ...ref })
        return
      }

      gun.get('friendships').get(pairId).on((data: any) => {
        if (!data || !data.status || !data.user1) {
          delete ref[pairId]
        } else {
          const otherUser = data.user1 === username ? data.user2 : data.user1
          ref[pairId] = {
            pairId,
            otherUser,
            status: data.status as FriendStatus,
            initiator: data.initiator,
            timestamp: data.timestamp || 0
          }
        }
        setFriendships({ ...ref })
      })
    })

    return () => {
      gun.get('userFriends').get(username).map().off()
    }
  }, [username])

  const sendRequest = (targetUsername: string) => {
    if (!username || !targetUsername || targetUsername === username) return
    const pairId = [username, targetUsername].sort().join('_')

    // Ne pas renvoyeer si déjà une relation
    gun.get('friendships').get(pairId).once((existing: any) => {
      if (existing && existing.status && existing.status !== 'blocked') return

      const sorted = [username, targetUsername].sort()
      gun.get('friendships').get(pairId).put({
        user1: sorted[0],
        user2: sorted[1],
        status: 'pending',
        initiator: username,
        timestamp: Date.now()
      })
      gun.get('userFriends').get(username).get(pairId).put(pairId)
      gun.get('userFriends').get(targetUsername).get(pairId).put(pairId)
    })
  }

  const acceptRequest = (pairId: string) => {
    gun.get('friendships').get(pairId).get('status').put('accepted')
  }

  const declineRequest = (pairId: string) => {
    // On met null pour signaler la suppression côté GunDB
    gun.get('friendships').get(pairId).put(null)
    gun.get('userFriends').get(username).get(pairId).put(null)
  }

  const removeFriend = (pairId: string) => {
    gun.get('friendships').get(pairId).put(null)
    gun.get('userFriends').get(username).get(pairId).put(null)
  }

  const blockUser = (targetUsername: string) => {
    const pairId = [username, targetUsername].sort().join('_')
    gun.get('friendships').get(pairId).get('status').put('blocked')
    gun.get('userFriends').get(username).get(pairId).put(pairId)
  }

  const getFriendStatus = (targetUsername: string): FriendStatus | null => {
    const pairId = [username, targetUsername].sort().join('_')
    return friendships[pairId]?.status || null
  }

  const all = Object.values(friendships)
  const friends = all.filter(f => f.status === 'accepted')
  const pendingIncoming = all.filter(f => f.status === 'pending' && f.initiator !== username)
  const pendingSent = all.filter(f => f.status === 'pending' && f.initiator === username)

  return {
    friends,
    pendingIncoming,
    pendingSent,
    sendRequest,
    acceptRequest,
    declineRequest,
    removeFriend,
    blockUser,
    getFriendStatus,
  }
}

export default useFriends
