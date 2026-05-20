export interface Server {
  id: string
  label: string
  color: string
  name: string
  ownerId: string
  // Champs extra (stockes dans GunDB, charges depuis ServerSettings)
  iconUrl?: string
  bannerColor?: string
  bannerUrl?: string    // image uploadée (base64 ou URL)
  description?: string
  tags?: string         // virgule-séparé, max 5
}

export interface Category {
  id: string
  name: string
  serverId: string
  position: number
}

// Override de permission par salon pour un rôle ou un utilisateur spécifique
export interface ChannelPermOverride {
  targetId: string         // roleId ou username
  targetType: 'role' | 'user'
  allow: {
    canRead?: boolean      // voir le salon dans la liste + lire les messages
    canWrite?: boolean     // envoyer des messages
    canManage?: boolean    // modifier/supprimer messages d'autres
  }
  deny: {
    canRead?: boolean
    canWrite?: boolean
    canManage?: boolean
  }
}

export interface Channel {
  id: string
  name: string
  type: 'text' | 'voice'
  serverId: string
  categoryId?: string
  userLimit?: number
  topic?: string           // description/sujet du salon
}

export interface StreamConstraints {
  width: number
  height: number
  frameRate: number
  sourceId?: string  // Electron desktopCapturer source ID
}

export interface DesktopSource {
  id: string
  name: string
  thumbnailDataURL: string
  type: 'screen' | 'window'
}

export interface User {
  id: string
  username: string
  email: string
  avatar?: string
  profile: UserProfile
}

export interface Message {
  id: string
  channelId?: string      // optionnel (DMs ont, canaux via GunDB n'ont pas forcément)
  author?: string         // utilisé par useSocket (messages canaux)
  authorId?: string       // utilisé par useDMs
  authorName?: string     // utilisé par useDMs
  content: string
  color: string
  time: string
  timestamp: number
  replyTo?: {
    id: string
    author: string
    content: string
  }
  // Champs plats pour GunDB (DMs)
  replyToId?: string
  replyToAuthor?: string
  replyToContent?: string
  fileUrl?: string
  fileName?: string
  fileType?: string
  fileSize?: number
  // P2P via WebTorrent
  magnetUri?: string
  torrentExpiry?: number    // timestamp expiration seeding
  // DMs P2P (Trystero)
  convId?: string
  participants?: string[]
  // Edition
  edited?: boolean
  // Chiffrement E2E canal (AES-GCM)
  encrypted?: boolean
  payload?: { iv: string; ciphertext: string }
}

export type Role = 'owner' | 'admin' | 'moderator' | 'member' | 'banned'

export interface Permissions {
  canSendMessages: boolean
  canDeleteMessages: boolean
  canManageChannels: boolean
  canKickMembers: boolean
  canBanMembers: boolean
  canManageRoles: boolean
  canMuteMembers: boolean
}

export interface CustomRole {
  id: string
  name: string
  color: string
  permissions: Permissions
  serverId: string
  position: number
}

export interface Member {
  username: string
  role: Role
  customRoleId?: string
  joinedAt: number
}

export type Status = 'online' | 'idle' | 'dnd' | 'invisible'

export interface UserProfile {
  username: string
  status: Status
  customStatus?: string
  avatarColor: string
  displayName?: string
  bio?: string
  bannerColor?: string
  avatarDecoration?: string   // clé de AVATAR_DECORATIONS (ex: 'gold', 'rainbow', ...)
  profileEffect?: string      // clé de PROFILE_EFFECTS (ex: 'particles', 'aurora', ...)
  avatarImage?: string        // data:image/... base64
  bannerImage?: string        // data:image/... base64
  updatedAt?: number
}

export const DEFAULT_PERMISSIONS: Record<Role, Permissions> = {
  owner: {
    canSendMessages: true,
    canDeleteMessages: true,
    canManageChannels: true,
    canKickMembers: true,
    canBanMembers: true,
    canManageRoles: true,
    canMuteMembers: true,
  },
  admin: {
    canSendMessages: true,
    canDeleteMessages: true,
    canManageChannels: true,
    canKickMembers: true,
    canBanMembers: true,
    canManageRoles: false,
    canMuteMembers: true,
  },
  moderator: {
    canSendMessages: true,
    canDeleteMessages: true,
    canManageChannels: false,
    canKickMembers: true,
    canBanMembers: false,
    canManageRoles: false,
    canMuteMembers: true,
  },
  member: {
    canSendMessages: true,
    canDeleteMessages: false,
    canManageChannels: false,
    canKickMembers: false,
    canBanMembers: false,
    canManageRoles: false,
    canMuteMembers: false,
  },
  banned: {
    canSendMessages: false,
    canDeleteMessages: false,
    canManageChannels: false,
    canKickMembers: false,
    canBanMembers: false,
    canManageRoles: false,
    canMuteMembers: false,
  },
}
