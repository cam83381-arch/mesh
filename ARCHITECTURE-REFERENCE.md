# MESH — RÉFÉRENCE ARCHITECTURE RÉSEAU v1.4.x
## Document de référence — à consulter avant toute modification

---

## 1. PRINCIPE FONDAMENTAL

Mesh est une application **desktop P2P pure**. Zéro serveur central, zéro coût.

```
TRANSPORT TEMPS RÉEL  →  Trystero (trackers BitTorrent publics) + WebRTC DataChannels
PERSISTANCE LOCALE    →  localStore.ts  (IPC Electron → AppData JSON)
CACHE MESSAGES        →  GunDB radisk   (local uniquement, peers: [])
SIGNALING VOCAL       →  GunDB radisk   (local + cross-machine AUTORISÉ pour webrtc_signal)
```

**Règle absolue :** Si la donnée doit survivre au redémarrage → `localStore`. Si c'est un message de chat → `GunDB`. Si c'est du temps réel entre pairs → `Trystero/makeAction()`.

---

## 2. CE QUI EST CORRECT ET NE DOIT PAS CHANGER

### ✅ mesh.ts — Trystero
- `peers: []` dans GunDB → correct, intentionnel
- `relayRedundancy: 3` → bon équilibre
- `broadcastProfile()` et `onPeerJoin → sendProfile()` → correct
- Trackers actifs : openwebtorrent, webtorrent.dev, btorrent.xyz, files.fm

### ✅ gun.ts — GunDB local
- `peers: []` → GunDB ne se connecte à AUCUN pair réseau → correct
- `radisk: true` → cache local sur disque → correct
- `localStorage: false` → évite les conflits avec Electron → correct

### ✅ useSocket.ts — Messages
- Double écriture `makeAction('msg')` + `gun.get('messages')` → correct
- Historique chargé depuis radisk au montage → correct
- AutoMod entièrement client-side → correct

### ✅ useStream.ts — Vocal/Vidéo
- Signaling via `gun.get('webrtc_signal')` → AUTORISÉ (cross-machine nécessaire)
- Présence via `gun.get('voice_presence')` → AUTORISÉ (temps réel cross-machine)
- Reconnexion backoff exponentiel → correct
- STUN Google + Mozilla → correct

### ✅ GifPicker.tsx
- Clé Tenor API publique intégrée → correct pour dev/prod léger
- Pas de dépendance serveur → correct

---

## 3. BUGS IDENTIFIÉS — CE QUI DOIT ÊTRE CORRIGÉ

### 🔴 BUG CRITIQUE — config.ts : localhost fantôme
**Fichier :** `src/config.ts`  
**Problème :** `SERVER_URL` se résout en `http://localhost:3001` par défaut. `UPLOAD_URL = SERVER_URL + '/upload'` existe encore dans le code.  
**Impact :** Toute feature qui utiliserait `UPLOAD_URL` ou `SERVER_URL` tenterait de contacter un serveur inexistant → erreur réseau silencieuse.  
**Correction :**
```typescript
// Supprimer getServerUrl() et remplacer par :
export const SERVER_URL = ''   // inutilisé, conservé pour compatibilité
export const UPLOAD_URL = ''   // inutilisé — upload = WebTorrent P2P
```

---

### 🔴 BUG CRITIQUE — 80 écritures GunDB hors périmètre autorisé
**Ces hooks/composants écrivent dans GunDB des données qui doivent être dans localStore :**

| Fichier | Clés GunDB interdites | Migration requise |
|---|---|---|
| `useChannels.ts` | `channels` | `localStore channels.json` |
| `useCategories.ts` | `categories` | `localStore categories.json` |
| `useDMs.ts` | `dms`, `dmConversations`, `dmMessages` | `localStore dms.json` |
| `useFriends.ts` | `friendships`, `userFriends` | `localStore friends.json` |
| `BotEditor.tsx` | `bots`, `bot_events` | `localStore bots.json` |
| `BotList.tsx` | `bots` | `localStore bots.json` |
| `useRoles.ts` | `roles` | `localStore roles.json` |
| `DMSidebar.tsx` | `profiles` | `localStore profiles.json` via useProfile |
| `UserSettings.tsx` | `users` (mot de passe) | `localStore users.json` |
| `usePins.ts` | `pins` | `localStore pins.json` |
| `useServerEmojis.ts` | `emojis` | `localStore emojis.json` |
| `useSettings.ts` | `settings` | `localStore settings.json` |
| `useMembers.ts` | `members`, `kicked` | `localStore members.json` |

**Pourquoi c'est un bug :** GunDB avec `peers:[]` ne synchronise pas entre machines. Ces données semblent s'enregistrer mais sont perdues ou inaccessibles sur un autre PC. C'est la cause principale des "données qui disparaissent".

---

### 🟡 BUG MODÉRÉ — useStream.ts : signaling GunDB non nettoyé
**Fichier :** `src/useStream.ts`  
**Problème :** Les signaux `webrtc_signal` sont nettoyés avec `put(null)` après 5s, mais en cas de crash ou fermeture brutale, des signaux orphelins restent dans radisk et peuvent déclencher des reconnexions fantômes au redémarrage.  
**Correction :** Au montage de useStream, purger les signaux de plus de 60s :
```typescript
// Dans useEffect au montage :
gun.get('webrtc_signal').get(username).map().once((data: any, signalId: string) => {
  if (!data) return
  if (Date.now() - (data.ts || 0) > 60000) {
    gun.get('webrtc_signal').get(username).get(signalId).put(null)
  }
})
```

---

### 🟡 BUG MODÉRÉ — useSocket.ts : AutoMod lit GunDB au lieu de localStore
**Fichier :** `src/useSocket.ts` ligne ~80  
**Problème :** `gun.get('automod').get(serverId).on(...)` lit la config AutoMod depuis GunDB. Mais ServerSettings.tsx la sauvegarde dans `localStore automod.json`. Incohérence : useSocket ne verra jamais la config sauvegardée.  
**Correction dans useSocket.ts :**
```typescript
// Remplacer :
gun.get('automod').get(serverId).on((data: AutoModConfig) => { ... })

// Par :
import { readLocal } from './localStore'
const automodData = await readLocal<Record<string, AutoModConfig>>('automod.json')
if (automodData?.[serverId]) automodRef.current = automodData[serverId]
```

---

### 🟡 BUG MODÉRÉ — GIFs : clé Tenor demo rate-limitée
**Fichier :** `src/components/GifPicker.tsx`  
**Problème :** La clé `AIzaSyAyimkuYQYF_FXVALexPuGQctUWRURdCDY` est une clé demo publique Google. Elle est partagée par des milliers de projets open-source et peut être rate-limitée ou révoquée sans préavis → GIFs qui ne chargent plus.  
**Correction :** Obtenir une vraie clé gratuite sur https://developers.google.com/tenor/guides/quickstart et la stocker dans `.env` :
```
VITE_TENOR_KEY=ta_vraie_cle_ici
```
```typescript
// Dans GifPicker.tsx :
const TENOR_KEY = import.meta.env.VITE_TENOR_KEY || 'LIVDSRZULELA'  // fallback Tenor officiel
```

---

### 🟡 BUG MODÉRÉ — Appels vocaux : présence non cross-machine
**Fichier :** `src/useStream.ts` — `joinVoice()`  
**Problème :** `gun.get('voice_presence')` fonctionne en cross-machine car GunDB peut propager via les peers BitTorrent… mais avec `peers: []` dans gun.ts, ça ne se propage PAS. La présence vocale n'est visible que localement.  
**Correction :** La présence vocale doit passer par Trystero. Dans `joinVoice()` :
```typescript
// Broadcaster la présence via Trystero :
const voiceRoom = joinMeshRoom(`voice_${channelId}`, myProfile)
const [sendPresence, getPresence] = (voiceRoom.makeAction as any)('voice_presence')

sendPresence({ username, active: true, ts: Date.now() })

getPresence((data: any, peerId: string) => {
  if (data?.active) {
    setVoiceUsers(prev => prev.find(u => u.id === data.username) ? prev 
      : [...prev, { id: data.username, username: data.username }])
  } else {
    setVoiceUsers(prev => prev.filter(u => u.id !== data?.username))
  }
})
```

---

## 4. RÈGLES STRICTES — NE JAMAIS VIOLER

```
❌ JAMAIS   gun.get() pour profils, serveurs, membres, canaux, rôles, bots, DMs, amis
❌ JAMAIS   SERVER_URL / UPLOAD_URL dans du nouveau code
❌ JAMAIS   fetch('http://localhost:...') ou axios vers localhost
❌ JAMAIS   gun avec peers: ['http://...'] ou peers: ['ws://...'] (casse le mode local)
❌ JAMAIS   WebSocket custom vers un serveur

✅ TOUJOURS localStore (readLocal/writeLocal) pour toute persistance
✅ TOUJOURS Trystero makeAction() pour le temps réel entre pairs
✅ TOUJOURS gun.get() UNIQUEMENT pour : messages, reactions, userIndex, servers/{id}, 
            invites, webrtc_signal, voice_presence (signaling uniquement)
```

---

## 5. PATTERN STANDARD — RÉFÉRENCE RAPIDE

### Lire/écrire des données persistantes
```typescript
import { readLocal, writeLocal } from '../localStore'

// Lire
const data = await readLocal<MonType>('fichier.json') || {}

// Écrire
await writeLocal('fichier.json', { ...data, [key]: value })
```

### Envoyer un message temps réel entre pairs
```typescript
import { joinMeshRoom } from '../mesh'

const room = joinMeshRoom(`${serverId}_${channelId}`, myProfile)
const [sendAction, getAction] = (room.makeAction as any)('nom_action')

sendAction(payload)          // broadcast à tous
sendAction(payload, [peerId]) // envoyer à un pair spécifique

getAction((data: any, peerId: string) => {
  // traiter la donnée reçue
})
```

### Signaling WebRTC (seul cas gun cross-machine autorisé)
```typescript
gun.get('webrtc_signal').get(targetUsername).get(signalId).put({ from: username, ts: Date.now(), ...payload })
gun.get('webrtc_signal').get(myUsername).map().on((data, signalId) => { /* traiter */ })
```

---

## 6. ORDRE DE PRIORITÉ DES CORRECTIONS

| Priorité | Correction | Fichier(s) |
|---|---|---|
| 🔴 1 | Supprimer SERVER_URL/UPLOAD_URL actif | `config.ts` |
| 🔴 2 | Migrer useDMs.ts → localStore | `useDMs.ts` |
| 🔴 3 | Migrer useFriends.ts → localStore | `useFriends.ts` |
| 🔴 4 | Migrer useChannels.ts → localStore | `useChannels.ts` |
| 🔴 5 | Migrer BotEditor/BotList → localStore | `BotEditor.tsx`, `BotList.tsx` |
| 🟡 6 | Fix AutoMod : useSocket lit localStore | `useSocket.ts` |
| 🟡 7 | Fix présence vocale → Trystero | `useStream.ts` |
| 🟡 8 | Fix signaux GunDB orphelins | `useStream.ts` |
| 🟡 9 | Vraie clé Tenor API | `GifPicker.tsx`, `.env` |
| ⚪ 10 | Migrer useCategories, usePins, useServerEmojis | hooks divers |

