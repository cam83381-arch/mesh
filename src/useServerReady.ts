import { useState, useEffect } from 'react'
import gun from './gun'

/**
 * useServerReady — détecte si GunDB est connecté à au moins un peer.
 * Utilise l'événement natif GunDB "hi" (peer connecté) au lieu de fetch HTTP.
 * Après timeoutMs, on laisse passer de toute façon (données en cache radisk).
 */
function useServerReady(timeoutMs = 5000): { ready: boolean } {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let done = false

    const resolve = () => {
      if (!done) {
        done = true
        setReady(true)
      }
    }

    // GunDB émet "hi" quand un peer WebSocket se connecte
    try {
      const mesh = (gun as any)._.messy || (gun as any)._
      if (mesh && mesh.on) {
        mesh.on('hi', resolve)
      }
    } catch {}

    // Aussi écouter via gun.on si disponible
    try {
      gun.on('hi', resolve)
    } catch {}

    // Timeout de sécurité : on laisse toujours passer après timeoutMs
    // (l'utilisateur peut avoir ses données en cache radisk local)
    const tid = setTimeout(resolve, timeoutMs)

    return () => {
      done = true
      clearTimeout(tid)
    }
  }, [timeoutMs])

  return { ready }
}

export default useServerReady
