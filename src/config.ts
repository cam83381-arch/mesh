/**
 * config.ts - Configuration centrale de Mesh
 *
 * Architecture P2P pure - ZERO serveur central.
 * - Messages/donnees : Trystero (WebRTC) + GunDB radisk local
 * - Signaling WebRTC : GunDB radisk (webrtc_signal cross-machine)
 * - STUN publics gratuits (Google, Mozilla)
 * - Upload fichiers : WebTorrent P2P (torrentBridge.ts)
 *
 * SERVER_URL et UPLOAD_URL sont vides - ne jamais les utiliser
 * dans du nouveau code. Upload = torrentBridge.seedBrowserFile().
 */

// Conserves vides pour ne pas casser les imports existants
export const SERVER_URL = ''
export const UPLOAD_URL = ''
