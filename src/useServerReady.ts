/**
 * useServerReady.ts — L'auth est maintenant 100% locale,
 * donc l'app est "prête" immédiatement sans attendre un peer réseau.
 * On attend juste 300ms pour que le renderer soit monté proprement.
 */
import { useState, useEffect } from 'react'

function useServerReady(_timeoutMs = 4000): { ready: boolean } {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const tid = setTimeout(() => setReady(true), 300)
    return () => clearTimeout(tid)
  }, [])

  return { ready }
}

export default useServerReady
