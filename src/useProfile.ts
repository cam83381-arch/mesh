import { useState, useEffect } from 'react'
import type { UserProfile, Status } from './types'
import gun from './gun'

const AVATAR_COLORS = [
  '#5865f2', '#23a559', '#f0b232',
  '#f23f43', '#f47fff', '#00b0f4',
  '#eb459e', '#faa61a'
]

function useProfile(username: string) {
  const [profile, setProfile] = useState<UserProfile>({
    username,
    status: 'online',
    customStatus: '',
    avatarColor: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]
  })

  useEffect(() => {
    if (!username) return

    const ref = gun.get('profiles').get(username)

    // ── Lecture immédiate depuis radisk (cache local) ──
    // Premier .once() lit le cache sans attendre le réseau → UI instantanée
    ref.once((existing: any) => {
      if (existing && existing.username) {
        setProfile(prev => ({
          ...prev,
          username: existing.username || username,
          status: existing.status || prev.status,
          customStatus: existing.customStatus ?? prev.customStatus,
          avatarColor: existing.avatarColor || prev.avatarColor,
          displayName: existing.displayName || prev.displayName,
          bio: existing.bio || prev.bio,
          bannerColor: existing.bannerColor || prev.bannerColor,
          avatarDecoration: existing.avatarDecoration ?? prev.avatarDecoration,
          profileEffect: existing.profileEffect ?? prev.profileEffect,
          avatarImage: existing.avatarImage ?? prev.avatarImage,
          bannerImage: existing.bannerImage ?? prev.bannerImage,
        }))
      }
    })

    // ── Listeners par champ pour les mises à jour partielles en temps réel ──
    const fields = ['avatarColor', 'displayName', 'bio', 'bannerColor', 'status', 'customStatus', 'avatarDecoration', 'profileEffect', 'avatarImage', 'bannerImage', 'updatedAt'] as const
    fields.forEach(field => {
      ref.get(field).on((val: any) => {
        if (val !== null && val !== undefined) {
          setProfile(prev => ({ ...prev, [field]: val }))
        }
      })
    })

    // ── Chargement complet + création si nouveau profil ──
    ref.once((existing: any) => {
      if (!existing || !existing.username) {
        const newProfile: UserProfile = {
          username,
          status: 'online',
          customStatus: '',
          avatarColor: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]
        }
        ref.get('username').put(username)
        ref.get('status').put(newProfile.status)
        ref.get('customStatus').put('')
        ref.get('avatarColor').put(newProfile.avatarColor)
        setProfile(newProfile)
      } else {
        const loaded: UserProfile = {
          username: existing.username || username,
          status: existing.status || 'online',
          customStatus: existing.customStatus || '',
          avatarColor: existing.avatarColor || AVATAR_COLORS[0],
          displayName: existing.displayName || '',
          bio: existing.bio || '',
          bannerColor: existing.bannerColor || '',
          avatarDecoration: existing.avatarDecoration || undefined,
          profileEffect: existing.profileEffect || undefined,
          avatarImage: existing.avatarImage || undefined,
          bannerImage: existing.bannerImage || undefined,
        }
        setProfile(loaded)
      }
    })

    return () => {
      const fields2 = ['avatarColor', 'displayName', 'bio', 'bannerColor', 'status', 'customStatus', 'avatarDecoration', 'profileEffect', 'avatarImage', 'bannerImage', 'updatedAt']
      fields2.forEach(field => { ref.get(field).off() })
    }
  }, [username])

  const updateStatus = (status: Status) => {
    gun.get('profiles').get(username).get('status').put(status)
    setProfile(prev => ({ ...prev, status }))
  }

  const updateCustomStatus = (customStatus: string) => {
    gun.get('profiles').get(username).get('customStatus').put(customStatus)
    setProfile(prev => ({ ...prev, customStatus }))
  }

  const saveProfile = (updates: Partial<UserProfile>) => {
    const ref = gun.get('profiles').get(username)
    const allowed = ['avatarColor', 'bannerColor', 'displayName', 'bio', 'status', 'customStatus', 'avatarDecoration', 'profileEffect', 'avatarImage', 'bannerImage'] as const
    allowed.forEach(field => {
      if (field in updates) {
        const val = updates[field]
        ref.get(field).put(val != null ? (val as string) : null)
      }
    })
    ref.get('updatedAt').put(Date.now())
    setProfile(prev => ({ ...prev, ...updates }))
  }

  const getProfile = (targetUsername: string): Promise<UserProfile | null> => {
    return new Promise((resolve) => {
      gun.get('profiles').get(targetUsername).once((p: UserProfile) => {
        resolve(p || null)
      })
    })
  }

  return { profile, updateStatus, updateCustomStatus, saveProfile, getProfile }
}

export default useProfile
