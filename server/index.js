const express = require('express')
const http = require('http')
const { Server } = require('socket.io')
const cors = require('cors')
const Gun = require('gun')
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const rateLimit = require('express-rate-limit')
const helmet = require('helmet')

const app = express()
const httpServer = http.createServer(app)

// ── Sécurité : Headers HTTP (CSP, HSTS, X-Frame, etc.) ──
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:', 'https://media.tenor.com', 'http://localhost:3001'],
      mediaSrc: ["'self'", 'blob:', 'http://localhost:3001'],
      connectSrc: ["'self'", 'http://localhost:3001', 'ws://localhost:3001'],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false
}))

const io = new Server(httpServer, {
  cors: {
    // Accepte Vite dev (5173), Electron prod (file:// → origin null), et localhost direct
    origin: (origin, callback) => {
      if (
        !origin ||                              // Electron prod (file://) ou même origine
        origin === 'http://localhost:5173' ||   // Vite dev server
        origin === 'http://localhost:3001' ||   // accès direct
        origin.startsWith('file://')            // Electron packagé sur certains OS
      ) {
        callback(null, true)
      } else {
        callback(new Error('Socket.io CORS: origine non autorisée'))
      }
    },
    methods: ['GET', 'POST']
  }
})

// ── Dossier uploads — supporte un chemin custom en prod Electron ──
const uploadsDir = process.env.UPLOADS_DIR || path.join(__dirname, 'uploads')
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true })

// ── Configuration multer ──
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}_${Math.random().toString(36).slice(2)}${path.extname(file.originalname)}`
    cb(null, uniqueName)
  }
})

const ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'video/mp4', 'video/webm',
  'application/pdf',
  'text/plain',
  'application/zip'
]

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_TYPES.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Type de fichier non autorisé'))
    }
  }
})

// CORS : accepte aussi Electron (file:// + app://) et localhost:5173
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3001',
  'file://',       // Electron production (build)
  null             // Electron dev charge depuis localhost, pas file://
]
app.use(cors({
  origin: (origin, callback) => {
    // Pas d'origin = même origine ou Electron en prod
    if (!origin || ALLOWED_ORIGINS.includes(origin) || origin.startsWith('file://')) {
      callback(null, true)
    } else {
      // En dev local on autorise tout — aucune donnée sensible n'est exposée publiquement
      // En prod, remplacer par: callback(new Error('CORS: origine non autorisée'), false)
      callback(null, true)
    }
  },
  credentials: true
}))
app.use(express.json({ limit: '1mb' }))
app.use(Gun.serve)

// ── Rate limiting global (100 req/min par IP) ──
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de requêtes, réessayez dans une minute.' }
})
app.use(globalLimiter)

// ── Rate limiting upload (10 uploads/min par IP) ──
const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Trop d\'uploads, réessayez dans une minute.' }
})

// ── Servir les fichiers uploadés ──
app.use('/uploads', express.static(uploadsDir))

// ── Route upload ──
app.post('/upload', uploadLimiter, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu' })
  const fileUrl = `http://localhost:3001/uploads/${req.file.filename}`
  res.json({
    url: fileUrl,
    name: req.file.originalname,
    type: req.file.mimetype,
    size: req.file.size
  })
})

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'Fichier trop lourd (max 25MB)' })
  }
  if (err) return res.status(400).json({ error: err.message })
  next()
})

// ── Proxy GIF Tenor (évite les CORS Electron + clé exposée côté client) ──
const https = require('https')
const TENOR_KEY = 'AIzaSyAyimkuYQYF_FXVALexPzpxWxBlTFWRRlM'

app.get('/api/gifs', (req, res) => {
  const q = req.query.q || ''
  const limit = Math.min(parseInt(req.query.limit) || 24, 50)
  const endpoint = q
    ? `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(q)}&key=${TENOR_KEY}&limit=${limit}&media_filter=gif,tinygif&contentfilter=medium`
    : `https://tenor.googleapis.com/v2/featured?key=${TENOR_KEY}&limit=${limit}&media_filter=gif,tinygif&contentfilter=medium`

  https.get(endpoint, (apiRes) => {
    let body = ''
    apiRes.on('data', chunk => { body += chunk })
    apiRes.on('end', () => {
      res.setHeader('Content-Type', 'application/json')
      res.status(apiRes.statusCode).send(body)
    })
  }).on('error', (err) => {
    res.status(500).json({ error: 'Tenor indisponible', details: err.message })
  })
})

const dataDir = process.env.DATA_DIR || path.join(__dirname)
const gun = Gun({ web: httpServer, file: path.join(dataDir, 'data') })

const voiceRooms = {}

// ── Helpers sanitisation ──
function sanitizeStr(val, maxLen = 500) {
  if (typeof val !== 'string') return ''
  return val
    .slice(0, maxLen)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

// ── Rate limiting Socket.io (messages) ──
// compteur simple par socket : max 20 messages / 10 secondes
const socketMessageCounts = new Map()
function isSocketRateLimited(socketId) {
  const now = Date.now()
  if (!socketMessageCounts.has(socketId)) {
    socketMessageCounts.set(socketId, { count: 1, start: now })
    return false
  }
  const entry = socketMessageCounts.get(socketId)
  if (now - entry.start > 10000) {
    socketMessageCounts.set(socketId, { count: 1, start: now })
    return false
  }
  entry.count++
  if (entry.count > 20) return true
  return false
}

io.on('connection', (socket) => {
  console.log('Utilisateur connecté :', socket.id)

  socket.on('join_channel', (channelId) => {
    // Quitter tous les anciens salons texte avant de rejoindre le nouveau
    const rooms = Array.from(socket.rooms).filter(r => r !== socket.id && !r.startsWith('voice_'))
    rooms.forEach(r => socket.leave(r))
    socket.join(channelId)
  })

  // ── Typing ──
  socket.on('typing', (data) => {
    if (!data || typeof data.channelId !== 'string') return
    const channelId = sanitizeStr(data.channelId, 100)
    const username = sanitizeStr(data.username, 50)
    socket.to(channelId).emit('user_typing', { channelId, username })
  })

  socket.on('stop_typing', (data) => {
    if (!data || typeof data.channelId !== 'string') return
    const channelId = sanitizeStr(data.channelId, 100)
    const username = sanitizeStr(data.username || '', 50)
    socket.to(channelId).emit('user_stop_typing', { channelId, username })
  })

  // ── DM Typing ──
  socket.on('join_dm', (pairId) => {
    if (typeof pairId !== 'string') return
    socket.join('dm_' + sanitizeStr(pairId, 100))
  })
  socket.on('leave_dm', (pairId) => {
    if (typeof pairId !== 'string') return
    socket.leave('dm_' + sanitizeStr(pairId, 100))
  })
  socket.on('dm_typing', (data) => {
    if (!data || typeof data.pairId !== 'string') return
    const pairId = sanitizeStr(data.pairId, 100)
    socket.to('dm_' + pairId).emit('dm_typing', { pairId, username: sanitizeStr(data.username, 50) })
  })
  socket.on('dm_stop_typing', (data) => {
    if (!data || typeof data.pairId !== 'string') return
    const pairId = sanitizeStr(data.pairId, 100)
    socket.to('dm_' + pairId).emit('dm_stop_typing', { pairId })
  })

  // ── Voice ──
  socket.on('join_voice', (data) => {
    if (!data || typeof data.roomId !== 'string') return
    const roomId = sanitizeStr(data.roomId, 100)
    const username = sanitizeStr(data.username, 50)
    const userLimit = typeof data.userLimit === 'number' ? data.userLimit : 0
    if (!voiceRooms[roomId]) voiceRooms[roomId] = []
    if (userLimit > 0 && voiceRooms[roomId].length >= userLimit) {
      socket.emit('voice_full')
      return
    }
    socket.emit('voice_users', voiceRooms[roomId])
    voiceRooms[roomId].push({ id: socket.id, username })
    socket.join('voice_' + roomId)
    socket.to('voice_' + roomId).emit('user_joined_voice', { id: socket.id, username })
  })

  socket.on('leave_voice', (roomId) => {
    if (typeof roomId !== 'string') return
    const safeRoomId = sanitizeStr(roomId, 100)
    if (voiceRooms[safeRoomId]) {
      voiceRooms[safeRoomId] = voiceRooms[safeRoomId].filter(u => u.id !== socket.id)
    }
    socket.to('voice_' + safeRoomId).emit('user_left_voice', socket.id)
    socket.leave('voice_' + safeRoomId)
  })

  // ── WebRTC ──
  socket.on('webrtc_offer', (data) => {
    if (!data || typeof data.to !== 'string') return
    socket.to(sanitizeStr(data.to, 100)).emit('webrtc_offer', { from: socket.id, offer: data.offer })
  })

  socket.on('webrtc_answer', (data) => {
    if (!data || typeof data.to !== 'string') return
    socket.to(sanitizeStr(data.to, 100)).emit('webrtc_answer', { from: socket.id, answer: data.answer })
  })

  socket.on('webrtc_ice', (data) => {
    if (!data || typeof data.to !== 'string') return
    socket.to(sanitizeStr(data.to, 100)).emit('webrtc_ice', { from: socket.id, candidate: data.candidate })
  })

  // ── Stream ──
  socket.on('start_stream', (data) => {
    if (!data) return
    socket.join('streamers')
    io.emit('stream_started', { id: socket.id, username: sanitizeStr(data.username || '', 50) })
  })

  socket.on('stop_stream', () => {
    socket.leave('streamers')
    io.emit('stream_stopped', socket.id)
  })

  socket.on('watch_stream', (data) => {
    if (!data || typeof data.streamerId !== 'string') return
    socket.to(sanitizeStr(data.streamerId, 100)).emit('viewer_joined', socket.id)
  })

  socket.on('stream_offer', (data) => {
    if (!data || typeof data.to !== 'string') return
    socket.to(sanitizeStr(data.to, 100)).emit('stream_offer', { from: socket.id, offer: data.offer })
  })

  socket.on('stream_answer', (data) => {
    if (!data || typeof data.to !== 'string') return
    socket.to(sanitizeStr(data.to, 100)).emit('stream_answer', { from: socket.id, answer: data.answer })
  })

  socket.on('stream_ice', (data) => {
    if (!data || typeof data.to !== 'string') return
    socket.to(sanitizeStr(data.to, 100)).emit('stream_ice', { from: socket.id, candidate: data.candidate })
  })

  socket.on('disconnect', () => {
    for (const roomId in voiceRooms) {
      voiceRooms[roomId] = voiceRooms[roomId].filter(u => u.id !== socket.id)
      io.to('voice_' + roomId).emit('user_left_voice', socket.id)
    }
    io.emit('stream_stopped', socket.id)
    socketMessageCounts.delete(socket.id)
    console.log('Utilisateur déconnecté :', socket.id)
  })
})

// ════════════════════════════════════════════════════════════════════
// WEBHOOKS ENTRANTS
// ════════════════════════════════════════════════════════════════════
// Stockage : webhooks.{token} → { serverId, channelId, name, token }
//
// Créer  : POST /api/webhooks       { serverId, channelId, name }
// Lister : GET  /api/webhooks/:serverId/:channelId
// Suppr  : DELETE /api/webhooks/:token
// Déclen.: POST  /webhook/:token    { content, username? }

const crypto = require('crypto')

app.post('/api/webhooks', (req, res) => {
  const { serverId, channelId, name } = req.body || {}
  if (!serverId || !channelId || !name) {
    return res.status(400).json({ error: 'serverId, channelId et name requis' })
  }
  const token = crypto.randomBytes(24).toString('hex')
  const webhook = { serverId, channelId, name: sanitizeStr(name, 64), token }
  gun.get('webhooks').get(token).put(webhook)
  console.log(`[Webhook] Créé : ${name} → ${serverId}/${channelId}`)
  res.json(webhook)
})

app.get('/api/webhooks/:serverId/:channelId', (req, res) => {
  const { serverId, channelId } = req.params
  const results = []
  gun.get('webhooks').map().once((data) => {
    if (data && data.serverId === serverId && data.channelId === channelId) {
      results.push({ name: data.name, token: data.token })
    }
  })
  // Attendre un peu que GunDB collecte les résultats
  setTimeout(() => res.json(results), 150)
})

app.delete('/api/webhooks/:token', (req, res) => {
  const { token } = req.params
  gun.get('webhooks').get(token).put(null)
  res.json({ ok: true })
})

// Point d'entrée webhook (appelé par services externes)
const webhookLimiter = rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false })

app.post('/webhook/:token', webhookLimiter, (req, res) => {
  const { token } = req.params
  const { content, username } = req.body || {}

  if (!content || typeof content !== 'string' || !content.trim()) {
    return res.status(400).json({ error: 'content requis' })
  }
  const safeContent = sanitizeStr(content, 2000)
  const safeName = sanitizeStr(username || 'Webhook', 32)

  gun.get('webhooks').get(token).once((data) => {
    if (!data || !data.serverId || !data.channelId) {
      return res.status(404).json({ error: 'Webhook introuvable' })
    }
    const { serverId, channelId, name } = data
    const roomKey = `${serverId}_${channelId}`
    const msgId = `wh_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const message = {
      id: msgId,
      author: safeName || name,
      content: safeContent,
      color: '#eb459e',
      time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      timestamp: Date.now(),
      isWebhook: true,
    }
    gun.get('messages').get(roomKey).get(msgId).put(message)
    io.to(roomKey).emit('new_message', message)
    console.log(`[Webhook] Message reçu → #${channelId} : ${safeContent.slice(0, 60)}`)
    res.json({ ok: true, messageId: msgId })
  })
})

httpServer.listen(3001, () => {
  console.log('Serveur démarré sur http://localhost:3001')
  console.log('GunDB actif — données sauvegardées dans ./data')
  console.log('Uploads disponibles dans ./uploads (max 25MB)')
})

// ── Bot Engine — partage la même instance Gun que le serveur principal ──
const initBotEngine = require('./botEngine')
initBotEngine(io, gun)

// ── Auto-suppression des fichiers uploadés après 30 min ──
const UPLOAD_DIR = path.join(__dirname, 'uploads')
const MAX_AGE_MS = 30 * 60 * 1000 // 30 minutes

setInterval(() => {
  fs.readdir(UPLOAD_DIR, (err, files) => {
    if (err) return
    const now = Date.now()
    files.forEach(file => {
      const fp = path.join(UPLOAD_DIR, file)
      fs.stat(fp, (statErr, stat) => {
        if (statErr) return
        if (now - stat.mtimeMs > MAX_AGE_MS) {
          fs.unlink(fp, () => {
            console.log('Fichier supprimé (expiration 30min) :', file)
          })
        }
      })
    })
  })
}, 5 * 60 * 1000) // vérifie toutes les 5 minutes