import { useState, useEffect, useCallback } from 'react'
import type { UserProfile, Status } from './types'
import { readLocal, writeLocal } from './localStore'
import { broadcastProfile, onPeerProfile } from './mesh'

const AVATAR_COLORS = [
  '#5865f2', '#23a559', '#f0b232',
  '#f23f43', '#f47fff', '#00b0f4',
  '#eb459e', '#faa61a'
]

const PROFILES_FILE = 'profiles.json'

type ProfilesDB = Record<string, UserProfile>

async function loadProfileFromDisk(username: string): Promise<UserProfile | null> {
  const db = await readLocal<ProfilesDB>(PROFILES_FILE) || {}
  return db[username] || null
}

async function saveProfileToDisk(profile: UserProfile): Promise<void> {
  const db = await readLocal<ProfilesDB>(PROFILES_FILE) || {}
  db[profile.username] = profile
  await writeLocal(PROFILES_FILE, db)
}

function useProfile(username: string) {
  const [profile, setProfile] = useState<UserProfile>({
    username,
    status: 'online',
    customStatus: '',
    avatarColor: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]
  })

  // ── Charger depuis disque au démarrage ──
  useEffect(() => {
    if (!username) return
    let active = true

    loadProfileFromDisk(username).then(existing => {
      if (!active) return
      if (existing) {
        setProfile(existing)
        // Re-broadcaster aux pairs
        broadcastProfile(existing)
      } else {
        // Nouveau profil — créer et sauvegarder
        const newProfile: UserProfile = {
          username,
          status: 'online',
          customStatus: '',
          avatarColor: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]
        }
        setProfile(newProfile)
        saveProfileToDisk(newProfile)
        broadcastProfile(newProfile)
      }
    })

    // ── Écouter les profils des pairs qui arrivent via Trystero ──
    const unsubscribe = onPeerProfile((_peerId, peerProfile) => {
      if (!active || !peerProfile?.username) return
      // Sauvegarder le profil du pair localement pour l'affichage
      saveProfileToDisk(peerProfile)
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [username])

  const updateStatus = useCallback((status: Status) => {
    setProfile(prev => {
      const updated = { ...prev, status }
      saveProfileToDisk(updated)
      broadcastProfile(updated)
      return updated
    })
  }, [])

  const updateCustomStatus = useCallback((customStatus: string) => {
    setProfile(prev => {
      const updated = { ...prev, customStatus }
      saveProfileToDisk(updated)
      broadcastProfile(updated)
      return updated
    })
  }, [])

  const saveProfile = useCallback((updates: Partial<UserProfile>) => {
    setProfile(prev => {
      const updated = { ...prev, ...updates, username }
      saveProfileToDisk(updated)
      broadcastProfile(updated)
      return updated
    })
  }, [username])

  const getProfile = useCallback(async (targetUsername: string): Promise<UserProfile | null> => {
    return loadProfileFromDisk(targetUsername)
  }, [])

  return { profile, updateStatus, updateCustomStatus, saveProfile, getProfile }
}

export default useProfile
