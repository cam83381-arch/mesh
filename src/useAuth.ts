/**
 * useAuth.ts — Auth locale (AppData) + annuaire public GunDB
 *
 * Séparation claire :
 *   - users.json (AppData)  → credentials { username, passwordHash } — jamais partagé
 *   - gun.get('userIndex')  → annuaire public { exists: true }       — pseudo seulement
 */

import { useState } from 'react'
import Gun from 'gun'
import { readLocal, writeLocal } from './localStore'
import gun from './gun'

const sea: any = (Gun as any).SEA

interface StoredUser {
  username: string
  passwordHash: string
  createdAt: number
}

type UsersDB = Record<string, StoredUser>

function persistSession(username: string) {
  try {
    localStorage.setItem('mesh_session_user', JSON.stringify({
      id: username, username, email: '',
      profile: { username, status: 'online', avatarColor: '#5865f2' }
    }))
  } catch {}
}

function useAuth() {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const register = async (username: string, password: string): Promise<string | null> => {
    setLoading(true)
    setError('')

    // 1. Vérifier localement (même machine)
    const users: UsersDB = (await readLocal<UsersDB>('users.json')) || {}
    if (users[username.toLowerCase()]) {
      setError('Ce pseudo est déjà pris !')
      setLoading(false)
      return null
    }

    // 2. Vérifier dans l'annuaire GunDB public (autres machines)
    const alreadyInIndex = await new Promise<boolean>((resolve) => {
      const tid = setTimeout(() => resolve(false), 3000)
      gun.get('userIndex').get(username.toLowerCase()).once((data: any) => {
        clearTimeout(tid)
        resolve(!!(data && data.exists))
      })
    })

    if (alreadyInIndex) {
      setError('Ce pseudo est déjà pris sur le réseau !')
      setLoading(false)
      return null
    }

    // 3. Créer le compte localement
    const passwordHash = await sea.work(password, username)
    users[username.toLowerCase()] = { username, passwordHash, createdAt: Date.now() }

    const ok = await writeLocal('users.json', users)
    if (!ok) {
      try { localStorage.setItem('mesh_users', JSON.stringify(users)) } catch {}
    }

    // 4. Publier le pseudo dans l'annuaire GunDB (pas le mot de passe)
    gun.get('userIndex').get(username.toLowerCase()).put({
      exists: true,
      username,          // casse d'origine pour affichage
      createdAt: Date.now()
    })

    persistSession(username)
    setLoading(false)
    return username
  }

  const login = async (username: string, password: string): Promise<string | null> => {
    setLoading(true)
    setError('')

    let users: UsersDB = (await readLocal<UsersDB>('users.json')) || {}

    // Fallback localStorage
    if (Object.keys(users).length === 0) {
      try {
        const raw = localStorage.getItem('mesh_users')
        if (raw) users = JSON.parse(raw)
      } catch {}
    }

    const stored = users[username.toLowerCase()]

    if (!stored) {
      setError('Utilisateur introuvable sur cette machine. Vérifie ton pseudo ou crée un compte.')
      setLoading(false)
      return null
    }

    const passwordHash = await sea.work(password, username)

    if (passwordHash === stored.passwordHash) {
      // Re-publier dans l'annuaire au cas où (nouveau pair, nouvelle install)
      gun.get('userIndex').get(username.toLowerCase()).put({
        exists: true,
        username: stored.username,
        createdAt: stored.createdAt
      })
      persistSession(stored.username)
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
