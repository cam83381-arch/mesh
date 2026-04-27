/**
 * gun.ts -- GunDB singleton (cache local uniquement)
 *
 * GunDB est utilisé uniquement comme cache radisk local
 * pour l'historique des messages. L'auth et les profils
 * sont maintenant dans AppData (localStore.ts).
 * Le transport temps réel passe par Trystero WebRTC (mesh.ts).
 *
 * On se connecte au serveur local Electron (localhost:3001)
 * pour la persistance. Pas de relais publics — plus nécessaire.
 */

import Gun from 'gun'

let _gun: any = null

export function getGun(): any {
  if (!_gun) {
    const peers: string[] = []

    // Serveur Electron local pour persistance radisk
    peers.push('http://localhost:3001/gun')

    // URL custom (paramètres utilisateur avancés)
    try {
      const stored = localStorage.getItem('mesh_server_url')
      if (stored && stored.startsWith('http')) {
        const p = stored.replace(/\/$/, '') + '/gun'
        if (!peers.includes(p)) peers.push(p)
      }
    } catch {}

    _gun = Gun({ peers, localStorage: false, radisk: true })

    if (typeof window !== 'undefined') {
      ;(window as any)._gun = _gun
      console.log('[Mesh] GunDB (cache local):', peers)
    }
  }
  return _gun
}

export const gun = getGun()
export default gun
