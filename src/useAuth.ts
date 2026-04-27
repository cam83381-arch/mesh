import { useState } from 'react'
import Gun from 'gun'
import 'gun/sea'
import gun from './gun'

const sea: any = (Gun as any).SEA

/**
 * Lire un noeud GunDB avec retries.
 * GunDB retourne undefined immédiatement si pas encore synchro —
 * on retente plusieurs fois avant de conclure que la donnée n'existe pas.
 */
function readWithRetry(ref: any, maxAttempts = 8, delayMs = 1000): Promise<any> {
  return new Promise((resolve) => {
    let attempt = 0
    let resolved = false

    const done = (data: any) => {
      if (!resolved) { resolved = true; resolve(data) }
    }

    const tryOnce = () => {
      if (resolved) return
      attempt++
      ref.once((data: any) => {
        if (resolved) return
        if (data !== undefined && data !== null) {
          done(data)
        } else if (attempt < maxAttempts) {
          setTimeout(tryOnce, delayMs)
        } else {
          done(undefined)
        }
      })
    }

    tryOnce()
    // Timeout de sécurité absolu
    setTimeout(() => done(undefined), maxAttempts * delayMs + 2000)
  })
}

function useAuth() {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const register = async (username: string, password: string): Promise<string | null> => {
    setLoading(true)
    setError('')

    // Vérifier si le pseudo existe déjà (avec retries)
    const existing = await readWithRetry(gun.get('users').get(username))

    if (existing && existing.username) {
      setError('Ce pseudo est déjà pris !')
      setLoading(false)
      return null
    }

    const hash = await sea.work(password, username)
    const user = {
      username,
      password: hash,
      createdAt: Date.now(),
      role: 'user'
    }
    gun.get('users').get(username).put(user)
    setLoading(false)
    return username
  }

  const login = async (username: string, password: string): Promise<string | null> => {
    setLoading(true)
    setError('')

    const user = await readWithRetry(gun.get('users').get(username))

    if (!user || !user.username) {
      setError('Utilisateur introuvable. Vérifie ton pseudo ou crée un compte.')
      setLoading(false)
      return null
    }

    const hash = await sea.work(password, username)
    if (hash === user.password) {
      setLoading(false)
      return username
    } else {
      setError('Mot de passe incorrect !')
      setLoading(false)
      return null
    }
  }

  return { login, register, error, loading }
}

export default useAuth
