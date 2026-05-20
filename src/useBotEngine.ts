/**
 * useBotEngine — moteur d'exécution des bots visuels Mesh
 *
 * Écoute les événements du serveur via Trystero (messages, réactions,
 * membres) et traverse le graphe de nodes pour exécuter les actions.
 *
 * Source des bots : localStore bots.json (seule source de vérité persistante)
 * Transport : Trystero makeAction — zéro GunDB
 */
import { useEffect, useRef, useCallback } from 'react'
import type { Node, Edge } from '@xyflow/react'
import { readLocal } from './localStore'
import { joinMeshRoom } from './mesh'

interface BotFlow {
  id: string
  name: string
  active: boolean
  serverId: string
  nodes: Node[]
  edges: Edge[]
}

interface BotEvent {
  type: 'message' | 'member_join' | 'member_leave' | 'reaction' | 'voice_join' | 'command'
  serverId: string
  channelId?: string
  channelName?: string
  authorId?: string
  authorName?: string
  content?: string
  command?: string
  emoji?: string
  messageId?: string
}

interface BotContext {
  event: BotEvent
  variables: Record<string, string | number>
  members?: { username: string; roles?: string[] }[]
  sendMessage: (channelId: string | undefined, content: string, serverId: string) => void
  sendDM: (targetUsername: string, content: string) => void
  addReaction: (messageId: string, emoji: string) => void
  deleteMessage: (messageId: string) => void
  kickMember: (username: string) => void
  banMember: (username: string) => void
  pinMessage: (messageId: string) => void
  assignRole: (username: string, role: string) => void
  removeRole: (username: string, role: string) => void
  channels: { id: string; name: string }[]
}

// Résout les templates {username}, {channelName}, {variable}
function resolveTemplate(template: string, ctx: BotContext): string {
  return template
    .replace(/\{username\}/g, ctx.event.authorName || '')
    .replace(/\{channelName\}/g, ctx.event.channelName || '')
    .replace(/\{content\}/g, ctx.event.content || '')
    .replace(/\{([^}]+)\}/g, (_, varName) => String(ctx.variables[varName] ?? ''))
}

function findChannelId(name: string, ctx: BotContext): string | undefined {
  return ctx.channels.find(c => c.name.toLowerCase() === name.toLowerCase())?.id
}

const cooldowns: Map<string, number> = new Map()

async function evalCondition(node: Node, ctx: BotContext): Promise<boolean> {
  const config = (node.data.config as Record<string, string>) || {}
  switch (node.type) {
    case 'condition_contains': {
      const text = (ctx.event.content || '').toLowerCase()
      const target = (config.text || '').toLowerCase()
      if (!target) return true
      if (config.mode === 'exact') return text === target
      if (config.mode === 'regex') { try { return new RegExp(config.text || '').test(ctx.event.content || '') } catch (_e) { return false } }
      return text.includes(target)
    }
    case 'condition_has_role': {
      const member = ctx.members?.find(m => m.username === ctx.event.authorName)
      return !!(member?.roles?.includes(config.role || ''))
    }
    case 'condition_in_channel':
      return ctx.event.channelName?.toLowerCase() === (config.channel || '').toLowerCase()
    case 'condition_variable': {
      const val = ctx.variables[config.name || '']
      const expected = config.value || ''
      switch (config.operator) {
        case '=': return String(val) === expected
        case '≠': return String(val) !== expected
        case '>': return Number(val) > Number(expected)
        case '<': return Number(val) < Number(expected)
        case '≥': return Number(val) >= Number(expected)
        case '≤': return Number(val) <= Number(expected)
        default: return String(val) === expected
      }
    }
    case 'condition_cooldown': {
      const key = `${ctx.event.serverId}_${node.id}`
      const now = Date.now()
      const last = cooldowns.get(key) || 0
      const cooldown = Number(config.seconds || 60) * 1000
      if (now - last < cooldown) return false
      cooldowns.set(key, now)
      return true
    }
    case 'condition_and':
    case 'condition_or':
      return true
    default:
      return true
  }
}

async function execAction(node: Node, ctx: BotContext): Promise<void> {
  const config = (node.data.config as Record<string, string>) || {}
  switch (node.type) {
    case 'action_send_message': {
      const channelName = config.channel || ctx.event.channelName || ''
      const targetId = findChannelId(channelName, ctx) || ctx.event.channelId
      const text = resolveTemplate(config.text || '', ctx)
      if (text) ctx.sendMessage(targetId, text, ctx.event.serverId)
      break
    }
    case 'action_send_dm': {
      const text = resolveTemplate(config.text || '', ctx)
      if (text && ctx.event.authorName) ctx.sendDM(ctx.event.authorName, text)
      break
    }
    case 'action_add_reaction':
      if (ctx.event.messageId && config.emoji) ctx.addReaction(ctx.event.messageId, config.emoji)
      break
    case 'action_delete_message':
      if (ctx.event.messageId) ctx.deleteMessage(ctx.event.messageId)
      break
    case 'action_kick':
      if (ctx.event.authorName) ctx.kickMember(ctx.event.authorName)
      break
    case 'action_ban':
      if (ctx.event.authorName) ctx.banMember(ctx.event.authorName)
      break
    case 'action_add_role':
      if (ctx.event.authorName && config.role) ctx.assignRole(ctx.event.authorName, config.role)
      break
    case 'action_remove_role':
      if (ctx.event.authorName && config.role) ctx.removeRole(ctx.event.authorName, config.role)
      break
    case 'action_pin_message':
      if (ctx.event.messageId) ctx.pinMessage(ctx.event.messageId)
      break
    case 'action_wait': {
      const ms = Number(config.seconds || 0) * 1000
      if (ms > 0 && ms <= 30000) await new Promise(r => setTimeout(r, ms))
      break
    }
    default:
      break
  }
}

function execVariable(node: Node, ctx: BotContext): void {
  const config = (node.data.config as Record<string, string>) || {}
  switch (node.type) {
    case 'variable_set':
      ctx.variables[config.name || ''] = config.value || ''
      break
    case 'variable_increment':
      ctx.variables[config.name || ''] = Number(ctx.variables[config.name || ''] || 0) + 1
      break
    case 'variable_decrement':
      ctx.variables[config.name || ''] = Number(ctx.variables[config.name || ''] || 0) - 1
      break
    case 'variable_get':
      break
    case 'variable_list_add': {
      const listKey = `__list_${config.list || 'default'}`
      const existing: string[] = JSON.parse(String(ctx.variables[listKey] || '[]'))
      const val = resolveTemplate(config.value || '', ctx)
      if (!existing.includes(val)) existing.push(val)
      ctx.variables[listKey] = JSON.stringify(existing)
      break
    }
    case 'variable_list_remove': {
      const listKey = `__list_${config.list || 'default'}`
      const existing: string[] = JSON.parse(String(ctx.variables[listKey] || '[]'))
      const val = resolveTemplate(config.value || '', ctx)
      ctx.variables[listKey] = JSON.stringify(existing.filter(v => v !== val))
      break
    }
    case 'variable_list_contains': {
      const listKey = `__list_${config.list || 'default'}`
      const existing: string[] = JSON.parse(String(ctx.variables[listKey] || '[]'))
      const val = resolveTemplate(config.value || '', ctx)
      ctx.variables[`__contains_${config.list || 'default'}`] = existing.includes(val) ? '1' : '0'
      break
    }
    default:
      break
  }
}

function execUtility(node: Node, ctx: BotContext): void {
  const config = (node.data.config as Record<string, string>) || {}
  switch (node.type) {
    case 'util_log':
      console.log('[BotEngine]', resolveTemplate(config.message || '', ctx))
      break
    case 'util_random': {
      const opts = (config.options || '').split(',').map(s => s.trim()).filter(Boolean)
      if (opts.length && config.varName) {
        ctx.variables[config.varName] = opts[Math.floor(Math.random() * opts.length)]
      }
      break
    }
    case 'util_format': {
      const result = resolveTemplate(config.template || '', ctx)
      if (config.varName) ctx.variables[config.varName] = result
      break
    }
    case 'util_math': {
      const a = Number(ctx.variables[config.varA || ''] || 0)
      const b = Number(config.valueB || 0)
      let result = a
      switch (config.operator) {
        case '+': result = a + b; break
        case '-': result = a - b; break
        case '*': result = a * b; break
        case '/': result = b !== 0 ? a / b : 0; break
      }
      if (config.result) ctx.variables[config.result] = result
      break
    }
    default:
      break
  }
}

async function traverseGraph(
  startNode: Node,
  nodes: Node[],
  edges: Edge[],
  ctx: BotContext,
  depth = 0
): Promise<void> {
  if (depth > 50) return
  const outEdges = edges.filter(e => e.source === startNode.id)
  for (const edge of outEdges) {
    const nextNode = nodes.find(n => n.id === edge.target)
    if (!nextNode) continue
    const category = nextNode.type?.split('_')[0] || ''
    if (category === 'condition') {
      const pass = await evalCondition(nextNode, ctx)
      if (pass) await traverseGraph(nextNode, nodes, edges, ctx, depth + 1)
    } else if (category === 'action') {
      await execAction(nextNode, ctx)
      await traverseGraph(nextNode, nodes, edges, ctx, depth + 1)
    } else if (category === 'variable') {
      execVariable(nextNode, ctx)
      await traverseGraph(nextNode, nodes, edges, ctx, depth + 1)
    } else if (category === 'util') {
      execUtility(nextNode, ctx)
      await traverseGraph(nextNode, nodes, edges, ctx, depth + 1)
    }
  }
}

function triggerMatches(triggerNode: Node, event: BotEvent): boolean {
  const config = (triggerNode.data.config as Record<string, string>) || {}
  switch (triggerNode.type) {
    case 'trigger_message':
      if (event.type !== 'message') return false
      if (config.channel && config.channel !== event.channelName) return false
      return true
    case 'trigger_command': {
      if (event.type !== 'message' && event.type !== 'command') return false
      const prefix = config.prefix || '!'
      const content = event.content || ''
      if (prefix.length > 1 && !prefix.startsWith('!')) {
        return content.toLowerCase().startsWith(prefix.toLowerCase())
      }
      return content.startsWith(prefix)
    }
    case 'trigger_member_join':
      return event.type === 'member_join'
    case 'trigger_member_leave':
      return event.type === 'member_leave'
    case 'trigger_reaction':
      if (event.type !== 'reaction') return false
      if (config.emoji && config.emoji !== event.emoji) return false
      return true
    case 'trigger_voice_join':
      return event.type === 'voice_join'
    case 'trigger_timer':
      return false
    default:
      return false
  }
}

// ── Hook principal ────────────────────────────────────────────────
interface BotEngineOptions {
  serverId: string
  username: string
  channels: { id: string; name: string }[]
  members: { username: string; roles?: string[] }[]
  onSendBotMessage: (channelId: string | undefined, content: string, serverId: string) => void
  onSendBotDM: (targetUsername: string, content: string) => void
  onAddReaction: (messageId: string, emoji: string) => void
  onDeleteMessage: (messageId: string) => void
  onKickMember: (username: string) => void
  onBanMember: (username: string) => void
  onPinMessage: (messageId: string) => void
  onAssignRole: (username: string, role: string) => void
  onRemoveRole: (username: string, role: string) => void
}

export function useBotEngine(opts: BotEngineOptions) {
  const botsRef = useRef<BotFlow[]>([])
  const timersRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map())
  const cleanupRef = useRef<Array<() => void>>([])
  const optsRef = useRef(opts)
  optsRef.current = opts

  const setupTimers = useCallback((flow: BotFlow) => {
    const timerNodes = flow.nodes.filter(n => n.type === 'trigger_timer')
    for (const node of timerNodes) {
      const key = `${flow.id}_${node.id}`
      if (timersRef.current.has(key)) continue
      const config = (node.data.config as Record<string, string>) || {}
      const minutes = Number(config.interval || 60)
      const interval = setInterval(async () => {
        const o = optsRef.current
        const ctx: BotContext = {
          event: {
            type: 'message',
            serverId: o.serverId,
            channelName: config.channel,
            channelId: o.channels.find(c => c.name === config.channel)?.id,
          },
          variables: {},
          members: o.members,
          channels: o.channels,
          sendMessage: o.onSendBotMessage,
          sendDM: o.onSendBotDM,
          addReaction: o.onAddReaction,
          deleteMessage: o.onDeleteMessage,
          kickMember: o.onKickMember,
          banMember: o.onBanMember,
          pinMessage: o.onPinMessage,
          assignRole: o.onAssignRole,
          removeRole: o.onRemoveRole,
        }
        await traverseGraph(node, flow.nodes, flow.edges, ctx)
      }, minutes * 60 * 1000)
      timersRef.current.set(key, interval)
    }
  }, [])

  const dispatchBotEvent = useCallback(async (event: BotEvent) => {
    const o = optsRef.current
    for (const flow of botsRef.current) {
      if (!flow.active || flow.serverId !== event.serverId) continue
      const triggers = flow.nodes.filter(n =>
        n.type?.startsWith('trigger_') && triggerMatches(n, event)
      )
      for (const trigger of triggers) {
        const ctx: BotContext = {
          event,
          variables: {},
          members: o.members,
          channels: o.channels,
          sendMessage: o.onSendBotMessage,
          sendDM: o.onSendBotDM,
          addReaction: o.onAddReaction,
          deleteMessage: o.onDeleteMessage,
          kickMember: o.onKickMember,
          banMember: o.onBanMember,
          pinMessage: o.onPinMessage,
          assignRole: o.onAssignRole,
          removeRole: o.onRemoveRole,
        }
        await traverseGraph(trigger, flow.nodes, flow.edges, ctx)
      }
    }
  }, [])

  // Charger les bots depuis localStore + écouter Trystero pour chaque channel
  useEffect(() => {
    if (!opts.serverId) return
    let active = true

    // Cleanup des anciens listeners
    cleanupRef.current.forEach(fn => fn())
    cleanupRef.current = []
    timersRef.current.forEach(clearInterval)
    timersRef.current.clear()

    const loadAndSubscribe = async () => {
      // 1. Charger les bots depuis localStore (seule source de vérité)
      // Structure dans bots.json : { [serverId]: { [botId]: { id, name, active, json: "BotFlow JSON" } } }
      const data = await readLocal<Record<string, Record<string, { id: string; name: string; active: boolean; json: string }>>>('bots.json') || {}
      if (!active) return

      const serverData = data[opts.serverId] || {}
      botsRef.current = Object.values(serverData)
        .filter(entry => entry.active)
        .map(entry => {
          try {
            const flow: BotFlow = JSON.parse(entry.json || '{}')
            // S'assurer que les champs de base sont présents
            return {
              id: entry.id || flow.id,
              name: entry.name || flow.name || 'Bot',
              active: true,
              serverId: opts.serverId,
              nodes: flow.nodes || [],
              edges: flow.edges || [],
            } as BotFlow
          } catch (_e) {
            return null
          }
        })
        .filter((b): b is BotFlow => b !== null && (b.nodes?.length || 0) > 0)

      // 2. Setup timers pour trigger_timer
      botsRef.current.forEach(setupTimers)

      // 3. Écouter les messages Trystero pour chaque channel
      for (const channel of optsRef.current.channels) {
        if (!active) break
        const roomKey = `${opts.serverId}_${channel.id}`
        const room = joinMeshRoom(roomKey)
        if (!room) continue

        let channelActive = true
        const [, getMsg] = (room.makeAction as any)('msg') as [any, any]
        const [, getReaction] = (room.makeAction as any)('reaction') as [any, any]

        // Messages entrants → event 'message'
        getMsg((msg: any) => {
          if (!channelActive || !active) return
          if (!msg || !msg.content || !msg.id) return
          // Ne pas déclencher les bots sur ses propres messages
          if (msg.author === optsRef.current.username) return
          const event: BotEvent = {
            type: 'message',
            serverId: opts.serverId,
            channelId: channel.id,
            channelName: channel.name,
            authorName: msg.author || msg.authorName,
            content: msg.content,
            messageId: msg.id,
          }
          dispatchBotEvent(event)
        })

        // Réactions entrantes → event 'reaction'
        getReaction((r: any) => {
          if (!channelActive || !active || r?.remove) return
          if (!r?.msgId || !r?.emoji || !r?.user) return
          const event: BotEvent = {
            type: 'reaction',
            serverId: opts.serverId,
            channelId: channel.id,
            channelName: channel.name,
            authorName: r.user,
            emoji: r.emoji,
            messageId: r.msgId,
          }
          dispatchBotEvent(event)
        })

        cleanupRef.current.push(() => { channelActive = false })
      }

      // 4. Écouter les événements de présence (member_join / member_leave)
      const presenceRoom = joinMeshRoom(`presence_${opts.serverId}`)
      if (presenceRoom && active) {
        let presActive = true
        const [, getPresence] = (presenceRoom.makeAction as any)('presence') as [any, any]
        getPresence((p: any) => {
          if (!presActive || !active) return
          if (!p?.username) return
          const eventType: BotEvent['type'] = p.online ? 'member_join' : 'member_leave'
          const event: BotEvent = {
            type: eventType,
            serverId: opts.serverId,
            authorName: p.username,
          }
          dispatchBotEvent(event)
        })
        cleanupRef.current.push(() => { presActive = false })
      }
    }

    loadAndSubscribe()

    return () => {
      active = false
      cleanupRef.current.forEach(fn => fn())
      cleanupRef.current = []
      timersRef.current.forEach(clearInterval)
      timersRef.current.clear()
    }
  }, [opts.serverId, opts.channels.map(c => c.id).join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  return { dispatchBotEvent }
}
