/**
 * localStore.ts — Lecture/écriture de fichiers JSON dans AppData via Electron IPC.
 * Fallback localStorage si on est hors Electron (dev browser).
 *
 * Fichiers :
 *   profile.json   → { username, passwordHash, avatarColor, avatarImage, ... }
 *   servers.json   → [ { id, name, channels, ... }, ... ]
 */

const el = (window as any).electron

// Lecture
export async function readLocal<T>(filename: string): Promise<T | null> {
  if (el?.readLocalFile) {
    return el.readLocalFile(filename) as Promise<T | null>
  }
  // Fallback navigateur
  try {
    const raw = localStorage.getItem(`mesh_local_${filename}`)
    return raw ? JSON.parse(raw) : null
  } catch (_e) { return null }
}

// Écriture
export async function writeLocal(filename: string, data: unknown): Promise<boolean> {
  if (el?.writeLocalFile) {
    return el.writeLocalFile(filename, data) as Promise<boolean>
  }
  try {
    localStorage.setItem(`mesh_local_${filename}`, JSON.stringify(data))
    return true
  } catch (_e) { return false }
}

// Suppression
export async function deleteLocal(filename: string): Promise<boolean> {
  if (el?.deleteLocalFile) {
    return el.deleteLocalFile(filename) as Promise<boolean>
  }
  try {
    localStorage.removeItem(`mesh_local_${filename}`)
    return true
  } catch (_e) { return false }
}
