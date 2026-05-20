import { useState } from 'react'
import { readLocal, writeLocal } from './localStore'
import gun from './gun'

// Hash de mot de passe via Web Crypto API (PBKDF2) -- pas de dependance Gun/SEA
async function hashPassword(password: string, salt: string): Promise<string> {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-256' },
    keyMaterial, 256
  )
  return Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('')
}

interface StoredUser {
  username: string
  passwordHash: string
  createdAt: number
}

type UsersDB = Record<string, StoredUser>

async function persistSession(username: string) {
  const sessionData = {
    id: username, username, email: '',
    profile: { username, status: 'online', avatarColor: '#5865f2' }
  }
  await writeLocal('session.json', sessionData)
  try { localStorage.setItem('mesh_session_user', JSON.stringify(sessionData)) } catch (e) {}
}

function useAuth() {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const register = async (username: string, password: string): Promise<string | null> => {
    setLoading(true)
    setError('')

    const users: UsersDB = (await readLocal<UsersDB>('users.json')) || {}
    if (users[username.toLowerCase()]) {
      setError('Ce pseudo est deja pris !')
      setLoading(false)
      return null
    }

    const alreadyInIndex = await new Promise<boolean>((resolve) => {
      const tid = setTimeout(() => resolve(false), 3000)
      gun.get('userIndex').get(username.toLowerCase()).once((data: any) => {
        clearTimeout(tid)
        resolve(!!(data && data.exists))
      })
    })

    if (alreadyInIndex) {
      setError('Ce pseudo est deja pris sur le reseau !')
      setLoading(false)
      return null
    }

    const passwordHash = await hashPassword(password, username.toLowerCase())
    users[username.toLowerCase()] = { username, passwordHash, createdAt: Date.now() }

    const ok = await writeLocal('users.json', users)
    if (!ok) {
      try { localStorage.setItem('mesh_users', JSON.stringify(users)) } catch (e) {}
    }

    gun.get('userIndex').get(username.toLowerCase()).put({
      exists: true,
      username,
      createdAt: Date.now()
    })

    await persistSession(username)
    setLoading(false)
    return username
  }

  const login = async (username: string, password: string): Promise<string | null> => {
    setLoading(true)
    setError('')

    let users: UsersDB = (await readLocal<UsersDB>('users.json')) || {}

    if (Object.keys(users).length === 0) {
      try {
        const raw = localStorage.getItem('mesh_users')
        if (raw) users = JSON.parse(raw)
      } catch (e) {}
    }

    const stored = users[username.toLowerCase()]

    if (!stored) {
      setError('Utilisateur introuvable sur cette machine.')
      setLoading(false)
      return null
    }

    const passwordHash = await hashPassword(password, username.toLowerCase())

    if (passwordHash === stored.passwordHash) {
      gun.get('userIndex').get(username.toLowerCase()).put({
        exists: true,
        username: stored.username,
        createdAt: stored.createdAt
      })
      await persistSession(stored.username)
      setLoading(false)
      return stored.username
    } else {
      setError('Mot de passe incorrect !')
      setLoading(false)
      return null
    }
  }

  return { login, register, error, loading }
}

export default useAuth
