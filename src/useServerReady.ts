import { useState, useEffect } from 'react'

// Verifie si le reseau GunDB est accessible (local ou relays publics)
// Retourne ready=true des qu'un peer repond, ou apres timeout
function useServerReady(timeoutMs = 8000): { ready: boolean } {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    let intervalId: ReturnType<typeof setInterval> | null = null
    let resolved = false

    const PEERS_TO_CHECK = [
      'http://localhost:3001/',
      'https://gun-manhattan.herokuapp.com/',
      'https://peer.wallie.io/',
    ]

    const checkPeer = async (url: string) => {
      if (resolved || cancelled) return
      try {
        const res = await fetch(url, {
          method: 'HEAD',
          signal: AbortSignal.timeout(2000)
        })
        if ((res.ok || res.status < 500) && !resolved && !cancelled) {
          resolved = true
          if (intervalId) clearInterval(intervalId)
          setReady(true)
        }
      } catch {
        // Ce peer n'est pas accessible
      }
    }

    const checkAll = () => {
      PEERS_TO_CHECK.forEach(url => checkPeer(url))
    }

    // Premiere tentative immediate
    checkAll()
    // Puis toutes les 600ms
    intervalId = setInterval(checkAll, 600)

    // Timeout global -- on laisse passer de toute facon
    // (l'utilisateur deja en cache peut se connecter sans reseau)
    const timeoutId = setTimeout(() => {
      if (!cancelled && !resolved) {
        if (intervalId) clearInterval(intervalId)
        setReady(true)
      }
    }, timeoutMs)

    return () => {
      cancelled = true
      if (intervalId) clearInterval(intervalId)
      clearTimeout(timeoutId)
    }
  }, [timeoutMs])

  return { ready }
}

export default useServerReady
