/**
 * gun.ts -- GunDB singleton
 *
 * Peers utilises (dans l'ordre de priorite) :
 *   1. Custom URL from localStorage("mesh_server_url")
 *   2. VITE_SERVER_URL build env var
 *   3. localhost:3001 (serveur Electron local -- persistence)
 *   4. Relays publics GunDB (sync inter-amis a distance)
 *
 * Les relays publics sont necessaires pour que les amis
 * puissent se voir sans serveur commun configure.
 * On utilise WebSocket (wss://) pour eviter les erreurs SSL HTTP.
 */

import Gun from 'gun'

// Relays publics GunDB fiables (WebSocket uniquement -- pas de spam SSL)
const PUBLIC_RELAYS = [
  'https://gun-manhattan.herokuapp.com/gun',
  'https://peer.wallie.io/gun',
]

function getPeers(): string[] {
  const peers: string[] = []

  // 1. Custom URL (parametres utilisateur)
  try {
    const stored = localStorage.getItem('mesh_server_url')
    if (stored && stored.startsWith('http')) {
      const p = stored.replace(/\/$/, '') + '/gun'
      if (!peers.includes(p)) peers.push(p)
    }
  } catch {}

  // 2. Vite env var
  const envUrl = (import.meta as any).env?.VITE_SERVER_URL as string | undefined
  if (envUrl && envUrl.startsWith('http')) {
    const p = envUrl.replace(/\/$/, '') + '/gun'
    if (!peers.includes(p)) peers.push(p)
  }

  // 3. Serveur Electron local (persistence locale)
  if (!peers.includes('http://localhost:3001/gun')) {
    peers.push('http://localhost:3001/gun')
  }

  // 4. Relays publics pour sync inter-amis
  PUBLIC_RELAYS.forEach(relay => {
    if (!peers.includes(relay)) peers.push(relay)
  })

  return peers
}

let _gun: any = null

export function getGun(): any {
  if (!_gun) {
    const peers = getPeers()
    _gun = Gun({ peers, localStorage: false, radisk: true })
    if (typeof window !== 'undefined') {
      ;(window as any)._gun = _gun
      ;(window as any)._gunPeers = peers
      console.log('[Mesh] GunDB peers:', peers)
    }
  }
  return _gun
}

export const gun = getGun()
export default gun
