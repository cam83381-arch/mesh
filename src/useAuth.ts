import { useState } from 'react'
import Gun from 'gun'
import 'gun/sea'
import gun from './gun'

const sea: any = (Gun as any).SEA

const PEERS_TO_CHECK = [
  'http://localhost:3001/',
  'https://gun-manhattan.herokuapp.com/',
  'https://peer.wallie.io/',
]

// Attendre qu'au moins un peer GunDB soit accessible (max timeoutMs)
function waitForAnyPeer(timeoutMs = 8000): Promise<boolean> {
  return new Promise((resolve) => {
    let resolved = false
    let intervalId: ReturnType<typeof setInterval> | null = null

    const done = (ok: boolean) => {
      if (!resolved) {
        resolved = true
        if (intervalId) clearInterval(intervalId)
        resolve(ok)
      }
    }

    const checkPeer = async (url: string) => {
      if (resolved) return
      try {
        const res = await fetch(url, {
          method: 'HEAD',
          signal: AbortSignal.timeout(2000)
        })
        if (res.ok || res.status < 500) done(true)
      } catch {}
    }

    const checkAll = () => PEERS_TO_CHECK.forEach(url => checkPeer(url))

    checkAll()
    intervalId = setInterval(checkAll, 600)
    setTimeout(() => done(false), timeoutMs)
  })
}

// Lire un noeud GunDB avec retries (GunDB peut retourner undefined
// si pas encore sync -- on retente plusieurs fois)
function readWithRetry(ref: any, maxAttempts = 5, delayMs = 800): Promise<any> {
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
    // Timeout de securite
    setTimeout(() => done(undefined), maxAttempts * delayMs + 2000)
  })
}

function useAuth() {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const register = async (username: string, password: string): Promise<string | null> => {
    setLoading(true)
    setError('')

    // Attendre qu'au moins un peer soit accessible
    const connected = await waitForAnyPeer(8000)
    if (!connected) {
      setError('Aucun serveur accessible. Verifie ta connexion internet.')
      setLoading(false)
      return null
    }

    // Verifier si le pseudo existe deja (avec retries)
    const existing = await readWithRetry(gun.get('users').get(username))

    if (existing && existing.username) {
      setError('Ce pseudo est deja pris !')
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

    // Attendre qu'au moins un peer soit accessible
    const connected = await waitForAnyPeer(8000)
    if (!connected) {
      setError('Aucun serveur accessible. Verifie ta connexion internet.')
      setLoading(false)
      return null
    }

    const user = await readWithRetry(gun.get('users').get(username))

    if (!user || !user.username) {
      setError('Utilisateur introuvable !')
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
