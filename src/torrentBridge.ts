/**
 * torrentBridge.ts — Pont vers WebTorrent dans le main process Electron
 * Utilise les méthodes exposées par le preload (contextBridge).
 */

const el = (window as any).electron

function elInvoke<T>(method: string, ...args: any[]): Promise<T> {
  if (!el || typeof el[method] !== 'function') {
    throw new Error('IPC non disponible (hors Electron)')
  }
  return el[method](...args)
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
  path?: string
}

export async function seedFile(filePath: string, expiryMs = 24 * 60 * 60 * 1000): Promise<TorrentSeedResult> {
  return elInvoke<TorrentSeedResult>('torrentSeed', filePath, expiryMs)
}

export async function downloadTorrent(magnetUri: string): Promise<TorrentProgress> {
  return elInvoke<TorrentProgress>('torrentDownload', magnetUri)
}

export async function getTorrentProgress(infoHash: string): Promise<TorrentProgress | null> {
  return elInvoke<TorrentProgress | null>('torrentProgress', infoHash)
}

export async function stopTorrent(infoHash: string): Promise<void> {
  return elInvoke<void>('torrentStop', infoHash)
}

export async function stopAllTorrents(): Promise<void> {
  return elInvoke<void>('torrentStopAll')
}

/**
 * Seed un File (browser File object) depuis le renderer.
 */
export async function seedBrowserFile(
  file: File,
  expiryMs = 24 * 60 * 60 * 1000
): Promise<TorrentSeedResult> {
  const buffer = await file.arrayBuffer()
  const uint8 = new Uint8Array(buffer)
  return elInvoke<TorrentSeedResult>('torrentSeedBuffer', {
    name: file.name,
    size: file.size,
    type: file.type,
    buffer: Array.from(uint8),
    expiryMs,
  })
}
