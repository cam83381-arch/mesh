/**
 * useAuth.ts — Authentification 100% locale (AppData/mesh-data/users.json)
 *
 * Les credentials ne quittent jamais la machine.
 * Le profil est partagé aux pairs en temps réel via Trystero (mesh.ts)
 * quand l'utilisateur rejoint une room — pas via un serveur central.
 */

import { useState } from 'react'
import Gun from 'gun'
import { readLocal, writeLocal } from './localStore'

const sea: any = (Gun as any).SEA

interface StoredUser {
  username: string
  passwordHash: string
  createdAt: number
}

type UsersDB = Record<string, StoredUser>

function useAuth() {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const register = async (username: string, password: string): Promise<string | null> => {
    setLoading(true)
    setError('')

    const users: UsersDB = (await readLocal<UsersDB>('users.json')) || {}

    if (users[username.toLowerCase()]) {
      setError('Ce pseudo est déjà pris !')
      setLoading(false)
      return null
    }

    const passwordHash = await sea.work(password, username)

    users[username.toLowerCase()] = {
      username,
      passwordHash,
      createdAt: Date.now(),
    }

    await writeLocal('users.json', users)
    setLoading(false)
    return username
  }

  const login = async (username: string, password: string): Promise<string | null> => {
    setLoading(true)
    setError('')

    const users: UsersDB = (await readLocal<UsersDB>('users.json')) || {}
    const stored = users[username.toLowerCase()]

    if (!stored) {
      setError('Utilisateur introuvable. Vérifie ton pseudo ou crée un compte.')
      setLoading(false)
      return null
    }

    const passwordHash = await sea.work(password, username)

    if (passwordHash === stored.passwordHash) {
      setLoading(false)
      return stored.username // retourne le username avec la casse d'origine
    } else {
      setError('Mot de passe incorrect !')
      setLoading(false)
      return null
    }
  }

  return { login, register, error, loading }
}

export default useAuth
