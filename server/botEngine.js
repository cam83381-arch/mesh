/**
 * botEngine.js — Moteur d'exécution des bots visuels
 * Chargé depuis server/index.js via: const initBotEngine = require('./botEngine')
 */

const timers = {}  // botId → interval handles
const messageSubscriptions = {}  // roomKey → true
const serverSubscriptions = {}   // serverId → true
const processedMessages = new Set()
const MAX_PROCESSED = 5000  // Limiter la taille pour éviter la fuite mémoire

module.exports = function initBotEngine(io, gun) {
  console.log('[BotEngine] Initialisation du moteur de bots…')

  // ── Variable helpers ──────────────────────────────────────────────
  const getVar = (serverId, botId, name) =>
    new Promise(resolve => {
      gun.get('botVars').get(serverId).get(botId).get(name).once(v => resolve(v ?? null))
    })

  const setVar = (serverId, botId, name, value) => {
    gun.get('botVars').get(serverId).get(botId).get(name).put(String(value))
  }

  const getList = (serverId, botId, name) =>
    new Promise(resolve => {
      gun.get('botLists').get(serverId).get(botId).get(name).once(v => {
        try { resolve(JSON.parse(v || '[]')) } catch { resolve([]) }
      })
    })

  const setList = (serverId, botId, name, list) => {
    gun.get('botLists').get(serverId).get(botId).get(name).put(JSON.stringify(list))
  }

  // ── Cooldown tracking ─────────────────────────────────────────────
  const cooldowns = {}  // `${botId}_${nodeId}` → timestamp

  // ── Log helper ────────────────────────────────────────────────────
  const addLog = (serverId, botId, message) => {
    const id = Date.now().toString()
    gun.get('botLogs').get(serverId).get(botId).get(id).put({
      id, message, timestamp: Date.now()
    })
    gun.get('bots').get(serverId).get(botId).put({ lastRun: Date.now() })
    console.log(`[Bot:${botId}] ${message}`)
  }

  // ── Text interpolation ────────────────────────────────────────────
  const interpolate = async (text, ctx, serverId, botId) => {
    let result = text || ''
    result = result.replace(/\{username\}/g, ctx.username || '')
    result = result.replace(/\{message\}/g, ctx.content || '')
    result = result.replace(/\{channel\}/g, ctx.channel || '')
    result = result.replace(/\{server\}/g, serverId)

    // Replace {varName} with variable values
    const varMatches = result.match(/\{(\w+)\}/g) || []
    for (const match of varMatches) {
      const varName = match.slice(1, -1)
      const val = await getVar(serverId, botId, varName)
      if (val !== null) result = result.replace(match, val)
    }
    return result
  }

  // ── Find channel ID by name ───────────────────────────────────────
  const findChannelId = (serverId, channelName) =>
    new Promise(resolve => {
      let found = null
      gun.get('channels').get(serverId).map().once((ch, id) => {
        if (ch && ch.name && ch.name.toLowerCase() === channelName.toLowerCase()) found = id
      })
      setTimeout(() => resolve(found), 300)
    })

  // ── Execute a single node ─────────────────────────────────────────
  const executeNode = async (node, flow, ctx, serverId, botId) => {
    const config = node.data?.config || {}

    switch (node.type) {
      // ── TRIGGERS (matching happens before execution) ──
      case 'trigger_timer': return true

      // ── CONDITIONS ──────────────────────────────────────────────
      case 'condition_contains': {
        const text = (config.text || '').toLowerCase()
        const msg = (ctx.content || '').toLowerCase()
        if (config.mode === 'exact') return msg === text
        if (config.mode === 'regex') { try { return new RegExp(text).test(msg) } catch { return false } }
        return msg.includes(text)
      }
      case 'condition_has_role': {
        const role = config.role || ''
        const members = await new Promise(resolve => {
          gun.get('members').get(serverId).get(ctx.username).once(m => resolve(m))
        })
        const m = members
        if (!m) return false
        return m.role === role || m.customRoleId === role
      }
      case 'condition_in_channel':
        return (ctx.channel || '').toLowerCase() === (config.channel || '').toLowerCase()
      case 'condition_variable': {
        const val = await getVar(serverId, botId, config.name || '')
        const compare = config.value || ''
        switch (config.operator) {
          case '=': return String(val) === compare
          case '≠': return String(val) !== compare
          case '>': return parseFloat(val || '0') > parseFloat(compare)
          case '<': return parseFloat(val || '0') < parseFloat(compare)
          case '≥': return parseFloat(val || '0') >= parseFloat(compare)
          case '≤': return parseFloat(val || '0') <= parseFloat(compare)
          default: return String(val) === compare
        }
      }
      case 'condition_cooldown': {
        const key = `${botId}_${node.id}`
        const now = Date.now()
        const last = cooldowns[key] || 0
        const secs = parseFloat(config.seconds || '60') * 1000
        if (now - last < secs) return false
        cooldowns[key] = now
        return true
      }
      case 'condition_and': return !!(ctx._cond_a && ctx._cond_b)
      case 'condition_or':  return !!(ctx._cond_a || ctx._cond_b)

      // ── ACTIONS ──────────────────────────────────────────────────
      case 'action_send_message': {
        const text = await interpolate(config.text, ctx, serverId, botId)
        const channelName = config.channel || ctx.channel || 'général'
        const channelId = await findChannelId(serverId, channelName)
        if (channelId) {
          const msgId = `bot_${Date.now()}`
          const roomKey = `${serverId}_${channelId}`
          gun.get('messages').get(roomKey).get(msgId).put({
            id: msgId, content: text, author: '🤖 Bot', authorName: '🤖 Bot',
            color: '#9b59b6', time: new Date().toLocaleTimeString('fr-FR'),
            timestamp: Date.now()
          })
          io.to(roomKey).emit('new_message', { id: msgId, content: text, author: '🤖 Bot', color: '#9b59b6' })
          addLog(serverId, botId, `Message envoyé dans #${channelName}: "${text.slice(0, 50)}"`)
        }
        return true
      }
      case 'action_send_dm': {
        const text = await interpolate(config.text, ctx, serverId, botId)
        if (ctx.username) {
          const pairId = ['🤖Bot', ctx.username].sort().join('_')
          const msgId = `bot_${Date.now()}`
          gun.get('dms').get(pairId).get(msgId).put({
            id: msgId, content: text, authorId: '🤖Bot',
            timestamp: Date.now(), time: new Date().toLocaleTimeString('fr-FR')
          })
          addLog(serverId, botId, `DM envoyé à ${ctx.username}`)
        }
        return true
      }
      case 'action_add_role':
        if (ctx.username && config.role) {
          gun.get('members').get(serverId).get(ctx.username).put({ role: config.role })
          addLog(serverId, botId, `Rôle "${config.role}" assigné à ${ctx.username}`)
        }
        return true
      case 'action_remove_role':
        if (ctx.username) {
          gun.get('members').get(serverId).get(ctx.username).put({ role: 'member' })
          addLog(serverId, botId, `Rôle retiré à ${ctx.username}`)
        }
        return true
      case 'action_kick':
        if (ctx.username) {
          gun.get('members').get(serverId).get(ctx.username).put({ role: 'banned' })
          addLog(serverId, botId, `${ctx.username} a été expulsé. Raison: ${config.reason || 'aucune'}`)
        }
        return true
      case 'action_ban':
        if (ctx.username) {
          gun.get('members').get(serverId).get(ctx.username).put({ role: 'banned' })
          addLog(serverId, botId, `${ctx.username} a été banni. Raison: ${config.reason || 'aucune'}`)
        }
        return true
      case 'action_delete_message':
        if (ctx.messageId && ctx.roomKey) {
          gun.get('messages').get(ctx.roomKey).get(ctx.messageId).put(null)
          addLog(serverId, botId, `Message supprimé dans ${ctx.channel}`)
        }
        return true
      case 'action_pin_message':
        if (ctx.messageId && ctx.roomKey) {
          const pinData = { id: ctx.messageId, content: ctx.content, author: ctx.username, timestamp: Date.now() }
          gun.get('pins').get(ctx.roomKey).get(ctx.messageId).put(pinData)
          addLog(serverId, botId, `Message épinglé dans ${ctx.channel}`)
        }
        return true
      case 'action_add_reaction':
        if (ctx.messageId && ctx.roomKey && config.emoji) {
          gun.get('reactions').get(ctx.roomKey).get(ctx.messageId).get(config.emoji).get('🤖Bot').put('🤖Bot')
          addLog(serverId, botId, `Réaction ${config.emoji} ajoutée`)
        }
        return true
      case 'action_wait': {
        const ms = parseFloat(config.seconds || '1') * 1000
        await new Promise(r => setTimeout(r, ms))
        return true
      }

      // ── VARIABLES ────────────────────────────────────────────────
      case 'variable_set':
        if (config.name) {
          await setVar(serverId, botId, config.name, config.value || '')
          addLog(serverId, botId, `Variable "${config.name}" = "${config.value}"`)
        }
        return true
      case 'variable_increment': {
        const cur = parseFloat(await getVar(serverId, botId, config.name || '') || '0')
        await setVar(serverId, botId, config.name || 'x', cur + 1)
        return true
      }
      case 'variable_decrement': {
        const cur2 = parseFloat(await getVar(serverId, botId, config.name || '') || '0')
        await setVar(serverId, botId, config.name || 'x', cur2 - 1)
        return true
      }
      case 'variable_get': {
        const v = await getVar(serverId, botId, config.name || '')
        ctx._lastVar = v
        return true
      }
      case 'variable_list_add': {
        const lst = await getList(serverId, botId, config.list || 'list')
        const val = await interpolate(config.value, ctx, serverId, botId)
        if (!lst.includes(val)) lst.push(val)
        await setList(serverId, botId, config.list || 'list', lst)
        return true
      }
      case 'variable_list_remove': {
        const lst2 = await getList(serverId, botId, config.list || 'list')
        const val2 = await interpolate(config.value, ctx, serverId, botId)
        const filtered = lst2.filter((x) => x !== val2)
        await setList(serverId, botId, config.list || 'list', filtered)
        return true
      }
      case 'variable_list_contains': {
        const lst3 = await getList(serverId, botId, config.list || 'list')
        const val3 = await interpolate(config.value, ctx, serverId, botId)
        return lst3.includes(val3)
      }

      // ── UTILITIES ────────────────────────────────────────────────
      case 'util_log':
        addLog(serverId, botId, await interpolate(config.message, ctx, serverId, botId))
        return true
      case 'util_random': {
        const options = (config.options || '').split(',').map(s => s.trim()).filter(Boolean)
        if (options.length && config.varName) {
          const chosen = options[Math.floor(Math.random() * options.length)]
          await setVar(serverId, botId, config.varName, chosen)
        }
        return true
      }
      case 'util_format': {
        if (config.varName) {
          const formatted = await interpolate(config.template, ctx, serverId, botId)
          await setVar(serverId, botId, config.varName, formatted)
        }
        return true
      }
      case 'util_math': {
        const a = parseFloat(await getVar(serverId, botId, config.varA || '') || '0')
        const b = parseFloat(config.valueB || '0')
        let result = a
        switch (config.operator) {
          case '+': result = a + b; break
          case '-': result = a - b; break
          case '*': result = a * b; break
          case '/': result = b !== 0 ? a / b : 0; break
        }
        if (config.result) await setVar(serverId, botId, config.result, result)
        return true
      }

      default:
        return true
    }
  }

  // ── Execute flow from a given node ────────────────────────────────
  const executeFlow = async (flow, nodeId, ctx, serverId, botId, depth = 0) => {
    if (depth > 50) return  // prevent infinite loops
    const node = flow.nodes.find(n => n.id === nodeId)
    if (!node) return

    const result = await executeNode(node, flow, ctx, serverId, botId)

    const outEdges = flow.edges.filter(e => e.source === nodeId)
    const isCondition = node.type?.startsWith('condition_') || node.type === 'variable_list_contains'

    if (isCondition) {
      const handle = result ? 'yes' : 'no'
      const nextEdge = outEdges.find(e => e.sourceHandle === handle || e.sourceHandle === 'out')
      if (nextEdge) await executeFlow(flow, nextEdge.target, ctx, serverId, botId, depth + 1)
    } else {
      for (const edge of outEdges) {
        await executeFlow(flow, edge.target, ctx, serverId, botId, depth + 1)
      }
    }
  }

  // ── Trigger matching ──────────────────────────────────────────────
  const shouldTrigger = (triggerNode, eventType, ctx) => {
    const config = triggerNode.data?.config || {}
    if (triggerNode.type !== eventType) return false
    switch (eventType) {
      case 'trigger_message':
        if (config.channel && config.channel.toLowerCase() !== (ctx.channel || '').toLowerCase()) return false
        return true
      case 'trigger_command':
        return (ctx.content || '').startsWith(config.prefix || '!')
      case 'trigger_reaction':
        if (config.emoji && config.emoji !== ctx.emoji) return false
        return true
      default:
        return true
    }
  }

  // ── Run a bot for a given event ───────────────────────────────────
  const runBot = async (flow, eventType, ctx) => {
    const { id: botId, serverId } = flow
    const triggerNodes = flow.nodes.filter(n => n.type === eventType)
    for (const trigger of triggerNodes) {
      if (shouldTrigger(trigger, eventType, ctx)) {
        const startEdges = flow.edges.filter(e => e.source === trigger.id)
        for (const edge of startEdges) {
          await executeFlow(flow, edge.target, ctx, serverId, botId)
        }
      }
    }
  }

  // ── Load all active bots ──────────────────────────────────────────
  const activeBots = {}  // key: `${serverId}_${botId}` → flow

  const loadBot = (serverId, botId, rawBot) => {
    if (!rawBot || !rawBot.active || !rawBot.json) {
      delete activeBots[`${serverId}_${botId}`]
      // Clear timer
      if (timers[`${serverId}_${botId}`]) {
        clearInterval(timers[`${serverId}_${botId}`])
        delete timers[`${serverId}_${botId}`]
      }
      return
    }
    try {
      const flow = JSON.parse(rawBot.json)
      flow.id = botId
      flow.serverId = serverId
      activeBots[`${serverId}_${botId}`] = flow

      // Set up timer triggers
      const timerNodes = (flow.nodes || []).filter(n => n.type === 'trigger_timer')
      const key = `${serverId}_${botId}`
      if (timers[key]) { clearInterval(timers[key]); delete timers[key] }
      if (timerNodes.length > 0) {
        const intervalMin = parseFloat(timerNodes[0].data?.config?.interval || '60')
        const channel = timerNodes[0].data?.config?.channel || 'général'
        timers[key] = setInterval(() => {
          runBot(flow, 'trigger_timer', { channel, username: '🤖Bot', content: '' })
        }, intervalMin * 60 * 1000)
      }

      // S'abonner aux messages GunDB de ce serveur pour déclencher les bots
      subscribeToServerMessages(serverId)

      console.log(`[BotEngine] Bot chargé: ${rawBot.name} (${botId}) dans serveur ${serverId}`)
    } catch (e) {
      console.error('[BotEngine] Erreur parsing bot:', e)
    }
  }

  // ── Abonnement GunDB aux messages d'un serveur ────────────────────
  const subscribeToServerMessages = (serverId) => {
    if (serverSubscriptions[serverId]) return
    serverSubscriptions[serverId] = true
    const startTime = Date.now()

    gun.get('channels').get(serverId).map().on((channel, channelId) => {
      if (!channel || !channel.name) return
      const roomKey = `${serverId}_${channelId}`
      if (messageSubscriptions[roomKey]) return
      messageSubscriptions[roomKey] = true

      gun.get('messages').get(roomKey).map().on((msg, msgId) => {
        if (!msg || !msg.content || !msg.timestamp) return
        if (processedMessages.has(msgId)) return
        if ((msg.timestamp || 0) < startTime) return
        // Nettoyer le Set si trop grand pour éviter la fuite mémoire
        if (processedMessages.size > MAX_PROCESSED) {
          const iter = processedMessages.values()
          for (let i = 0; i < 1000; i++) processedMessages.delete(iter.next().value)
        }
        processedMessages.add(msgId)

        const ctx = {
          content: msg.content,
          username: msg.author || msg.authorName || '',
          channel: channel.name,
          serverId,
          messageId: msgId,
          roomKey
        }

        Object.values(activeBots).forEach(flow => {
          if (flow.serverId !== serverId) return
          runBot(flow, 'trigger_message', ctx)
          if (msg.content && /^[!/]/.test(msg.content)) {
            runBot(flow, 'trigger_command', ctx)
          }
        })
      })
    })

    console.log(`[BotEngine] Abonné aux messages GunDB du serveur ${serverId}`)
  }

  // ── Écoute GunDB : bot_saved depuis le client (BotEditor) ────────────
  // Le client écrit dans gun.get('bot_events').get(serverId) après chaque
  // sauvegarde. On recharge le bot concerné immédiatement.
  gun.get('bot_events').map().on((data, serverId) => {
    if (!data || !data.botId || !data.event) return
    if (data.event === 'bot_saved') {
      gun.get('bots').get(serverId).get(data.botId).once((rawBot) => {
        loadBot(serverId, data.botId, rawBot)
        console.log(`[BotEngine] Bot rechargé via GunDB: ${data.botId} (serveur ${serverId})`)
      })
    }
  })

  // ── Bootstrap : charger tous les bots existants au démarrage ────────
  // gun.get().map().on() ne re-déclenche PAS pour les données déjà présentes
  // après un restart. On utilise .once() pour bootstrapper, puis .on() pour
  // les mises à jour live (nouveaux bots, modifications, désactivations).
  gun.get('bots').map().once((serverBots, serverId) => {
    if (!serverBots || typeof serverBots !== 'object') return
    gun.get('bots').get(serverId).map().once((rawBot, botId) => {
      if (rawBot && rawBot.active) {
        loadBot(serverId, botId, rawBot)
      }
    })
  })

  // ── Subscribe to all bots in GunDB (mises à jour live) ────────────
  gun.get('bots').map().on((serverBots, serverId) => {
    if (!serverBots || typeof serverBots !== 'object') return
    gun.get('bots').get(serverId).map().on((rawBot, botId) => {
      loadBot(serverId, botId, rawBot)
    })
  })

  // ── Listen to socket events ───────────────────────────────────────
  io.on('connection', (socket) => {

    socket.on('member_joined', (data) => {
      const { username, serverId } = data
      const ctx = { username, serverId, content: '', channel: '' }
      Object.values(activeBots).forEach(flow => {
        if (flow.serverId !== serverId) return
        runBot(flow, 'trigger_member_join', ctx)
      })
    })

    socket.on('member_left', (data) => {
      const { username, serverId } = data
      const ctx = { username, serverId, content: '', channel: '' }
      Object.values(activeBots).forEach(flow => {
        if (flow.serverId !== serverId) return
        runBot(flow, 'trigger_member_leave', ctx)
      })
    })

    socket.on('reaction_added', (data) => {
      const { emoji, username, serverId, channelId } = data
      const ctx = { emoji, username, serverId, channel: channelId, content: '' }
      Object.values(activeBots).forEach(flow => {
        if (flow.serverId !== serverId) return
        runBot(flow, 'trigger_reaction', ctx)
      })
    })

    socket.on('join_voice', (data) => {
      const { username, roomId } = data
      const serverId = roomId?.split('_')[0]
      if (!serverId) return
      const ctx = { username, serverId, channel: roomId, content: '' }
      Object.values(activeBots).forEach(flow => {
        if (flow.serverId !== serverId) return
        runBot(flow, 'trigger_voice_join', ctx)
      })
    })

    // ── Rechargement live d'un bot après sauvegarde ──────────────────
    socket.on('bot_saved', ({ serverId, botId }) => {
      if (!serverId || !botId) return
      gun.get('bots').get(serverId).get(botId).once((rawBot) => {
        loadBot(serverId, botId, rawBot)
        console.log(`[BotEngine] Bot rechargé en live: ${botId} (serveur ${serverId})`)
      })
    })

    // ── Rechargement complet après reconnexion client ─────────────────
    // Le client envoie 'request_bot_reload' quand il détecte que le serveur
    // vient de redémarrer (via socket 'connect' event). Cela force un
    // re-bootstrap de tous les bots actifs depuis GunDB.
    socket.on('request_bot_reload', () => {
      console.log('[BotEngine] Rechargement demandé par le client…')
      gun.get('bots').map().once((serverBots, serverId) => {
        if (!serverBots || typeof serverBots !== 'object') return
        gun.get('bots').get(serverId).map().once((rawBot, botId) => {
          if (rawBot && rawBot.active) {
            loadBot(serverId, botId, rawBot)
          }
        })
      })
    })
  })

  console.log('[BotEngine] Moteur démarré — en attente d\'événements.')
}
