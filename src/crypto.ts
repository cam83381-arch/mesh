/**
 * crypto.ts — Identité cryptographique et chiffrement E2E pour Mesh
 *
 * Deux couches :
 *
 * 1. IDENTITÉ — Ed25519 (signature)
 *    - Paire de clés par utilisateur, stockée dans identity.json
 *    - Signe les profils broadcastés via Trystero
 *    - Vérifie les signatures des pairs avant d'accepter leurs données
 *    - La clé privée ne quitte JAMAIS la machine locale
 *
 * 2. CHIFFREMENT DMs — ECDH P-256 + AES-GCM 256
 *    - Paire de clés ECDH par utilisateur, stockée dans ecdh_identity.json
 *    - Échange de clés publiques via Trystero (action dm_keyex)
 *    - Dérivation d'un secret partagé par paire (moi ↔ destinataire)
 *    - AES-GCM 256 pour chiffrer/déchiffrer le contenu des DMs
 *    - Secrets dérivés en mémoire uniquement (jamais sur disque)
 */

import { readLocal, writeLocal } from './localStore'

const IDENTITY_FILE = 'identity.json'
const ALGO = { name: 'Ed25519' }

interface StoredIdentity {
  publicKey: string   // base64 — partagé aux pairs
  privateKey: string  // base64 — jamais transmis
}

// Cache en mémoire de la paire de clés active
let _keyPair: CryptoKeyPair | null = null
let _publicKeyB64: string | null = null

// ── Helpers base64 ────────────────────────────────────────────────────────────

function bufToB64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
}

function b64ToBuf(b64: string): ArrayBuffer {
  const bin = atob(b64)
  const buf = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
  return buf.buffer
}

// ── Génération / chargement de la paire de clés ───────────────────────────────

/**
 * Initialise la paire de clés Ed25519 depuis le disque,
 * ou en génère une nouvelle si elle n'existe pas encore.
 * Doit être appelée une fois au démarrage (dans useProfile ou App).
 */
export async function initIdentity(): Promise<string> {
  // Déjà chargée en mémoire
  if (_keyPair && _publicKeyB64) return _publicKeyB64

  const stored = await readLocal<StoredIdentity>(IDENTITY_FILE)

  if (stored?.publicKey && stored?.privateKey) {
    // Réimporter depuis le disque
    try {
      const pubKey = await crypto.subtle.importKey(
        'raw',
        b64ToBuf(stored.publicKey),
        ALGO,
        true,
        ['verify']
      )
      const privKey = await crypto.subtle.importKey(
        'pkcs8',
        b64ToBuf(stored.privateKey),
        ALGO,
        true,
        ['sign']
      )
      _keyPair = { publicKey: pubKey, privateKey: privKey }
      _publicKeyB64 = stored.publicKey
      console.log('[Crypto] Identité chargée depuis disque')
      return _publicKeyB64
    } catch (e) {
      console.warn('[Crypto] Clé corrompue, régénération…', e)
    }
  }

  // Générer une nouvelle paire
  _keyPair = await crypto.subtle.generateKey(ALGO, true, ['sign', 'verify']) as CryptoKeyPair

  const pubRaw  = await crypto.subtle.exportKey('raw',   _keyPair.publicKey)
  const privRaw = await crypto.subtle.exportKey('pkcs8', _keyPair.privateKey)

  _publicKeyB64 = bufToB64(pubRaw)
  const privateKeyB64 = bufToB64(privRaw)

  await writeLocal(IDENTITY_FILE, {
    publicKey:  _publicKeyB64,
    privateKey: privateKeyB64,
  } satisfies StoredIdentity)

  console.log('[Crypto] Nouvelle identité générée et sauvegardée')
  return _publicKeyB64
}

/**
 * Retourne la clé publique locale (base64).
 * Retourne null si initIdentity() n'a pas encore été appelé.
 */
export function getPublicKey(): string | null {
  return _publicKeyB64
}

// ── Signature ─────────────────────────────────────────────────────────────────

/**
 * Signe un objet JSON avec la clé privée locale.
 * Retourne la signature en base64, ou null si la clé n'est pas prête.
 */
export async function signData(data: object): Promise<string | null> {
  if (!_keyPair) return null
  try {
    const encoded = new TextEncoder().encode(JSON.stringify(data))
    const sigBuf = await crypto.subtle.sign(ALGO, _keyPair.privateKey, encoded)
    return bufToB64(sigBuf)
  } catch (e) {
    console.warn('[Crypto] Échec signature:', e)
    return null
  }
}

// ── Vérification ──────────────────────────────────────────────────────────────

/**
 * Vérifie qu'une signature correspond bien aux données,
 * en utilisant la clé publique du pair (base64).
 * Retourne true si la signature est valide, false sinon.
 */
export async function verifyData(
  data: object,
  signatureB64: string,
  peerPublicKeyB64: string
): Promise<boolean> {
  try {
    const pubKey = await crypto.subtle.importKey(
      'raw',
      b64ToBuf(peerPublicKeyB64),
      ALGO,
      false,
      ['verify']
    )
    const encoded  = new TextEncoder().encode(JSON.stringify(data))
    const sigBuf   = b64ToBuf(signatureB64)
    return await crypto.subtle.verify(ALGO, pubKey, sigBuf, encoded)
  } catch (e) {
    console.warn('[Crypto] Échec vérification:', e)
    return false
  }
}

// ── Cache clés publiques des pairs (Ed25519 — identité/signature) ─────────────

// Associe peerId → clé publique vérifiée (reçue via Trystero)
const peerPublicKeys: Record<string, string> = {}

export function storePeerPublicKey(peerId: string, publicKeyB64: string): void {
  peerPublicKeys[peerId] = publicKeyB64
}

export function getPeerPublicKey(peerId: string): string | null {
  return peerPublicKeys[peerId] ?? null
}

export function removePeerPublicKey(peerId: string): void {
  delete peerPublicKeys[peerId]
}

// ═══════════════════════════════════════════════════════════════════════════════
// COUCHE 2 — CHIFFREMENT E2E DMs (ECDH P-256 + AES-GCM)
// ═══════════════════════════════════════════════════════════════════════════════

const ECDH_FILE = 'ecdh_identity.json'
const ECDH_ALGO = { name: 'ECDH', namedCurve: 'P-256' }
const AES_ALGO  = { name: 'AES-GCM', length: 256 }

interface StoredECDHIdentity {
  publicKey:  string  // base64 SPKI — partagé aux pairs
  privateKey: string  // base64 PKCS8 — jamais transmis
}

// Paire de clés ECDH locale
let _ecdhKeyPair: CryptoKeyPair | null = null
let _ecdhPublicKeyB64: string | null = null

// Cache des secrets AES dérivés : username → CryptoKey
const _sharedSecrets: Record<string, CryptoKey> = {}

// ── Init paire ECDH ───────────────────────────────────────────────────────────

/**
 * Initialise (ou charge depuis disque) la paire de clés ECDH.
 * Retourne la clé publique en base64 (format SPKI).
 */
export async function initECDH(): Promise<string> {
  if (_ecdhKeyPair && _ecdhPublicKeyB64) return _ecdhPublicKeyB64

  const stored = await readLocal<StoredECDHIdentity>(ECDH_FILE)

  if (stored?.publicKey && stored?.privateKey) {
    try {
      const pubKey = await crypto.subtle.importKey(
        'spki',
        b64ToBuf(stored.publicKey),
        ECDH_ALGO,
        true,
        []
      )
      const privKey = await crypto.subtle.importKey(
        'pkcs8',
        b64ToBuf(stored.privateKey),
        ECDH_ALGO,
        true,
        ['deriveKey']
      )
      _ecdhKeyPair = { publicKey: pubKey, privateKey: privKey }
      _ecdhPublicKeyB64 = stored.publicKey
      console.log('[Crypto E2E] Clé ECDH chargée depuis disque')
      return _ecdhPublicKeyB64
    } catch (e) {
      console.warn('[Crypto E2E] Clé ECDH corrompue, régénération…', e)
    }
  }

  _ecdhKeyPair = await crypto.subtle.generateKey(ECDH_ALGO, true, ['deriveKey'])

  const pubRaw  = await crypto.subtle.exportKey('spki',  _ecdhKeyPair.publicKey)
  const privRaw = await crypto.subtle.exportKey('pkcs8', _ecdhKeyPair.privateKey)

  _ecdhPublicKeyB64 = bufToB64(pubRaw)
  const privateKeyB64 = bufToB64(privRaw)

  await writeLocal(ECDH_FILE, {
    publicKey:  _ecdhPublicKeyB64,
    privateKey: privateKeyB64,
  } satisfies StoredECDHIdentity)

  console.log('[Crypto E2E] Nouvelle clé ECDH générée')
  return _ecdhPublicKeyB64
}

/**
 * Retourne la clé publique ECDH locale (base64 SPKI).
 * Null si initECDH() n'a pas encore été appelé.
 */
export function getECDHPublicKey(): string | null {
  return _ecdhPublicKeyB64
}

// ── Dérivation du secret partagé ──────────────────────────────────────────────

/**
 * Dérive (et met en cache) un secret AES-GCM partagé avec un pair,
 * à partir de sa clé publique ECDH (base64 SPKI).
 * Le secret est stocké en mémoire uniquement, associé au username.
 */
export async function deriveSharedSecret(
  peerUsername: string,
  peerECDHPublicKeyB64: string
): Promise<void> {
  if (!_ecdhKeyPair) {
    console.warn('[Crypto E2E] ECDH non initialisé')
    return
  }
  try {
    const peerPubKey = await crypto.subtle.importKey(
      'spki',
      b64ToBuf(peerECDHPublicKeyB64),
      ECDH_ALGO,
      false,
      []
    )
    const sharedKey = await crypto.subtle.deriveKey(
      { name: 'ECDH', public: peerPubKey },
      _ecdhKeyPair.privateKey,
      AES_ALGO,
      false,
      ['encrypt', 'decrypt']
    )
    _sharedSecrets[peerUsername] = sharedKey
    console.log('[Crypto E2E] Secret partagé dérivé avec', peerUsername)
  } catch (e) {
    console.warn('[Crypto E2E] Échec dérivation secret avec', peerUsername, e)
  }
}

/**
 * Vérifie si un secret partagé existe déjà pour ce pair.
 */
export function hasSharedSecret(peerUsername: string): boolean {
  return peerUsername in _sharedSecrets
}

// ── Chiffrement / Déchiffrement AES-GCM ──────────────────────────────────────

export interface EncryptedPayload {
  iv:         string  // base64 — nonce aléatoire 12 octets
  ciphertext: string  // base64 — contenu chiffré
}

/**
 * Chiffre un message texte pour un destinataire.
 * Retourne null si le secret partagé n'est pas encore disponible.
 */
export async function encryptDM(
  plaintext: string,
  recipientUsername: string
): Promise<EncryptedPayload | null> {
  const key = _sharedSecrets[recipientUsername]
  if (!key) {
    console.warn('[Crypto E2E] Pas de secret partagé avec', recipientUsername)
    return null
  }
  try {
    const iv       = crypto.getRandomValues(new Uint8Array(12))
    const encoded  = new TextEncoder().encode(plaintext)
    const cipher   = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded)
    return {
      iv:         bufToB64(iv.buffer),
      ciphertext: bufToB64(cipher),
    }
  } catch (e) {
    console.warn('[Crypto E2E] Échec chiffrement:', e)
    return null
  }
}

/**
 * Déchiffre un message reçu d'un pair.
 * Retourne null si le déchiffrement échoue.
 */
export async function decryptDM(
  payload: EncryptedPayload,
  senderUsername: string
): Promise<string | null> {
  const key = _sharedSecrets[senderUsername]
  if (!key) {
    console.warn('[Crypto E2E] Pas de secret partagé avec', senderUsername)
    return null
  }
  try {
    const iv      = new Uint8Array(b64ToBuf(payload.iv))
    const cipher  = b64ToBuf(payload.ciphertext)
    const plain   = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher)
    return new TextDecoder().decode(plain)
  } catch (e) {
    console.warn('[Crypto E2E] Échec déchiffrement:', e)
    return null
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// COUCHE 3 — CHIFFREMENT E2E SALONS (AES-GCM 256 par canal)
// ═══════════════════════════════════════════════════════════════════════════════

const CHANNEL_KEYS_FILE = 'channel_keys.json'
const _channelKeys: Record<string, CryptoKey> = {}

async function importAESKey(keyB64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', b64ToBuf(keyB64), AES_ALGO, true, ['encrypt', 'decrypt'])
}

async function exportAESKey(key: CryptoKey): Promise<string> {
  return bufToB64(await crypto.subtle.exportKey('raw', key))
}

export async function generateChannelKey(channelId: string): Promise<string> {
  const key = await crypto.subtle.generateKey(AES_ALGO, true, ['encrypt', 'decrypt'])
  const keyB64 = await exportAESKey(key)
  _channelKeys[channelId] = key
  const data = await readLocal<Record<string, string>>(CHANNEL_KEYS_FILE) || {}
  data[channelId] = keyB64
  await writeLocal(CHANNEL_KEYS_FILE, data)
  return keyB64
}

export async function loadChannelKeys(): Promise<void> {
  const data = await readLocal<Record<string, string>>(CHANNEL_KEYS_FILE) || {}
  for (const [channelId, keyB64] of Object.entries(data)) {
    try { _channelKeys[channelId] = await importAESKey(keyB64) } catch (_e) {}
  }
}

export function hasChannelKey(channelId: string): boolean {
  return channelId in _channelKeys
}

export async function getChannelKeyB64(channelId: string): Promise<string | null> {
  const key = _channelKeys[channelId]
  if (!key) return null
  try { return await exportAESKey(key) } catch (_e) { return null }
}

export async function storeChannelKey(channelId: string, keyB64: string): Promise<void> {
  try {
    _channelKeys[channelId] = await importAESKey(keyB64)
    const data = await readLocal<Record<string, string>>(CHANNEL_KEYS_FILE) || {}
    data[channelId] = keyB64
    await writeLocal(CHANNEL_KEYS_FILE, data)
  } catch (e) {
    console.warn('[Crypto Salon] Échec stockage clé canal', channelId, e)
  }
}

export async function encryptChannelKeyForPeer(
  channelId: string,
  recipientUsername: string
): Promise<EncryptedPayload | null> {
  const keyB64 = await getChannelKeyB64(channelId)
  if (!keyB64) return null
  return encryptDM(keyB64, recipientUsername)
}

export async function decryptAndStoreChannelKey(
  channelId: string,
  payload: EncryptedPayload,
  senderUsername: string
): Promise<boolean> {
  const keyB64 = await decryptDM(payload, senderUsername)
  if (!keyB64) return false
  await storeChannelKey(channelId, keyB64)
  return true
}

export async function encryptMessage(
  plaintext: string,
  channelId: string
): Promise<EncryptedPayload | null> {
  const key = _channelKeys[channelId]
  if (!key) return null
  try {
    const iv     = crypto.getRandomValues(new Uint8Array(12))
    const cipher = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode(plaintext)
    )
    return { iv: bufToB64(iv.buffer), ciphertext: bufToB64(cipher) }
  } catch (_e) { return null }
}

export async function decryptMessage(
  payload: EncryptedPayload,
  channelId: string
): Promise<string | null> {
  const key = _channelKeys[channelId]
  if (!key) return null
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(b64ToBuf(payload.iv)) },
      key,
      b64ToBuf(payload.ciphertext)
    )
    return new TextDecoder().decode(plain)
  } catch (_e) {
    return null
  }
}
