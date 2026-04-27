/**
 * avatarGradient.ts — Neon Architect design system
 * Génère un gradient riche pour les avatars utilisateurs à partir du username.
 * Utilisé partout (ChatArea, MembersPanel, VoiceTile, FriendsPage, etc.)
 */

const GRADIENTS = [
  'linear-gradient(135deg, #6354ff 0%, #b347e8 100%)',   // violet→magenta
  'linear-gradient(135deg, #eb459e 0%, #f77b5a 100%)',   // rose→orange
  'linear-gradient(135deg, #23a559 0%, #43e179 100%)',   // vert profond→neon
  'linear-gradient(135deg, #f0b232 0%, #eb459e 100%)',   // or→rose
  'linear-gradient(135deg, #ed4245 0%, #f0b232 100%)',   // rouge→or
  'linear-gradient(135deg, #0099da 0%, #5865f2 100%)',   // cyan→blurple
  'linear-gradient(135deg, #5865f2 0%, #b347e8 100%)',   // blurple→violet
  'linear-gradient(135deg, #00b0f4 0%, #43e179 100%)',   // bleu ciel→neon vert
  'linear-gradient(135deg, #f47fff 0%, #5865f2 100%)',   // fuchsia→blurple
  'linear-gradient(135deg, #f0b232 0%, #5865f2 100%)',   // or→blurple
]

/**
 * Retourne un gradient CSS basé sur le username.
 * Si un `avatarColor` plat est fourni, on le wrappe dans un gradient subtil.
 */
export function getAvatarGradient(username: string, avatarColor?: string): string {
  if (avatarColor && avatarColor !== '#6354ff') {
    // Couleur personnalisée : gradient léger à partir de cette couleur
    return `linear-gradient(135deg, ${avatarColor} 0%, ${shiftHue(avatarColor, 30)} 100%)`
  }
  // Couleur par défaut : utiliser la palette de gradients
  const hash = username.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
  return GRADIENTS[hash % GRADIENTS.length]
}

/**
 * Décale la teinte d'une couleur hex de `deg` degrés.
 * Simplifiée — fonctionne bien pour des couleurs vives.
 */
function shiftHue(hex: string, deg: number): string {
  const n = parseInt(hex.replace('#', ''), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  // Rotation simple — suffisante pour créer un contraste gradient
  const nr = Math.min(255, Math.max(0, r + Math.round(deg * 0.5)))
  const ng = Math.min(255, Math.max(0, g - Math.round(deg * 0.2)))
  const nb = Math.min(255, Math.max(0, b + Math.round(deg * 0.8)))
  return `#${nr.toString(16).padStart(2,'0')}${ng.toString(16).padStart(2,'0')}${nb.toString(16).padStart(2,'0')}`
}
