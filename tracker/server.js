/**
 * Mesh Tracker — BitTorrent tracker léger pour la découverte de pairs WebRTC
 * Déployable gratuitement sur Render.com
 *
 * Ce serveur ne voit jamais les données des utilisateurs.
 * Il sert uniquement de point de rendez-vous pour que les pairs se trouvent.
 */

const Server = require('bittorrent-tracker').Server

const PORT = parseInt(process.env.PORT) || 8000

const server = new Server({
  udp: false,   // Pas d'UDP sur Render
  http: true,   // Announce HTTP
  ws: true,     // WebSocket (utilisé par Trystero)
  stats: true,  // Page de stats sur /stats
})

server.on('error', (err) => {
  console.error('[tracker] Erreur :', err.message)
})

server.on('warning', (warn) => {
  console.warn('[tracker] Avertissement :', warn.message)
})

server.on('listening', () => {
  console.log(`[tracker] Démarré sur le port ${PORT}`)
  console.log(`[tracker] HTTP  : http://localhost:${PORT}/announce`)
  console.log(`[tracker] WS    : ws://localhost:${PORT}`)
})

server.on('start', (addr) => {
  console.log(`[tracker] Pair connecté : ${addr}`)
})

server.on('complete', (addr) => {})
server.on('update', (addr) => {})
server.on('stop', (addr) => {
  console.log(`[tracker] Pair déconnecté : ${addr}`)
})

server.listen(PORT)
