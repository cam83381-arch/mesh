/**
 * config.ts — Configuration centrale de Mesh
 *
 * Architecture P2P — pas de serveur central requis :
 * - Les messages/donnees transitent via GunDB mesh (voir src/gun.ts)
 * - Le signaling WebRTC est assure par GunDB (voir useStream.ts)
 * - STUN publics gratuits (Google, Mozilla) pour la decouverte d'IP
 *
 * SERVER_URL / UPLOAD_URL restent utiles uniquement pour :
 * - L'upload de fichiers (serveur local optionnel)
 * - Le relay GunDB local (peer additionnel, pas obligatoire)
 *
 * L'ordre de resolution de l'URL :
 * 1. localStorage "mesh_server_url" (Parametres utilisateur)
 * 2. Variable d'environnement VITE_SERVER_URL (build)
 * 3. Fallback : http://localhost:3001
 */

function getServerUrl(): string {
  try {
    const stored = localStorage.getItem('mesh_server_url')
    if (stored && stored.startsWith('http')) return stored.replace(/\/$/, '')
  } catch { /* SSR / pas de localStorage */ }

  const envUrl = import.meta.env.VITE_SERVER_URL as string | undefined
  if (envUrl && envUrl.startsWith('http')) return envUrl.replace(/\/$/, '')

  return 'http://localhost:3001'
}

export const SERVER_URL = getServerUrl()
export const UPLOAD_URL = SERVER_URL + '/upload'

// GUN_PEERS n'est plus exporte ici — gere dans src/gun.ts (instance singleton)
