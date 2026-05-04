/**
 * gun.ts -- GunDB singleton (cache local uniquement, zéro peer réseau)
 *
 * GunDB = cache radisk local UNIQUEMENT pour l'historique des messages.
 * Aucun pair réseau — pas de localhost:3001, pas de relais publics.
 * Le transport temps réel passe par Trystero WebRTC (mesh.ts).
 * Les données persistantes (profils, serveurs, membres, bots) passent
 * par localStore.ts (IPC Electron → AppData JSON files).
 */

import Gun from 'gun'

let _gun: any = null

export function getGun(): any {
  if (!_gun) {
    // Zéro peer — GunDB en mode cache local pur (radisk uniquement)
    _gun = Gun({ peers: [], localStorage: false, radisk: true })

    if (typeof window !== 'undefined') {
      ;(window as any)._gun = _gun
      console.log('[Mesh] GunDB initialisé en mode local (radisk uniquement)')
    }
  }
  return _gun
}

export const gun = getGun()
export default gun
