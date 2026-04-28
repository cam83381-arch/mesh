/**
 * torrentBridge.ts — Pont IPC vers WebTorrent dans le main process Electron
 *
 * Toutes les opérations torrent tournent dans electron/main.js (Node.js pur)
 * pour que le seeding continue même si on change de channel ou de serveur.
 *
 * API exposée :
 *   seedFile(filePath, expiryMs?)  → { magnetUri, infoHash, name, size }
 *   downloadTorrent(magnetUri, destDir?) → { infoHash, name, path, progress }
 *   getTorrentProgress(infoHash)  → { progress, downloadSpeed, uploadSpeed, peers }
 *   stopTorrent(infoHash)         → void
 *   stopAllTorrents()             → void
 */

const ipc = (window as any).electron?.ipcRenderer

async function ipcInvoke<T>(channel: string, ...args: any[]): Promise<T> {
  if (!ipc) throw new Error('IPC non disponible (hors Electron)')
  return ipc.invoke(channel, ...args)
}

export interface TorrentSeedResult {
  magnetUri: string
  infoHash: string
  name: string
  size: number
}

export interface TorrentProgress {
  progress: number       // 0–1
  downloadSpeed: number  // bytes/s
  uploadSpeed: number    // bytes/s
  peers: number
  done: boolean
  path?: string          // chemin local une fois terminé
}

/**
 * Seed un fichier local → retourne le lien magnet.
 * @param filePath  Chemin absolu vers le fichier (AppData ou chemin choisi par l'user)
 * @param expiryMs  Durée de seeding en ms (défaut : 24h). 0 = jusqu'à fermeture app.
 */
export async function seedFile(filePath: string, expiryMs = 24 * 60 * 60 * 1000): Promise<TorrentSeedResult> {
  return ipcInvoke<TorrentSeedResult>('torrent-seed', filePath, expiryMs)
}

/**
 * Télécharger un torrent via son magnet link.
 * Le fichier est sauvegardé dans le dossier Downloads de l'utilisateur.
 */
export async function downloadTorrent(magnetUri: string): Promise<TorrentProgress> {
  return ipcInvoke<TorrentProgress>('torrent-download', magnetUri)
}

/**
 * Obtenir la progression d'un torrent en cours (seed ou download).
 */
export async function getTorrentProgress(infoHash: string): Promise<TorrentProgress | null> {
  return ipcInvoke<TorrentProgress | null>('torrent-progress', infoHash)
}

/**
 * Arrêter un torrent (seed ou download) par son infoHash.
 */
export async function stopTorrent(infoHash: string): Promise<void> {
  return ipcInvoke<void>('torrent-stop', infoHash)
}

/**
 * Arrêter tous les torrents (appelé à la fermeture de l'app).
 */
export async function stopAllTorrents(): Promise<void> {
  return ipcInvoke<void>('torrent-stop-all')
}

/**
 * Seed un File (browser File object) depuis le renderer.
 * Écrit le fichier dans un dossier temp AppData puis seed via main process.
 */
export async function seedBrowserFile(
  file: File,
  expiryMs = 24 * 60 * 60 * 1000
): Promise<TorrentSeedResult> {
  // Lire le fichier comme ArrayBuffer et l'envoyer à main pour écriture + seed
  const buffer = await file.arrayBuffer()
  const uint8 = new Uint8Array(buffer)
  return ipcInvoke<TorrentSeedResult>('torrent-seed-buffer', {
    name: file.name,
    size: file.size,
    type: file.type,
    buffer: Array.from(uint8),
    expiryMs,
  })
}
