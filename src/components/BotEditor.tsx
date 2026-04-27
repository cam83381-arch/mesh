import React, { useCallback, useRef, useState, useEffect } from 'react'
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap,
  addEdge, useNodesState, useEdgesState, useReactFlow,
  type Node, type Edge, type Connection, type NodeTypes
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { TriggerNode } from '../nodes/TriggerNodes'
import { ConditionNode } from '../nodes/ConditionNodes'
import { ActionNode } from '../nodes/ActionNodes'
import { VariableNode } from '../nodes/VariableNodes'
import { UtilityNode } from '../nodes/UtilityNodes'
import { NODE_DEFS, CATEGORY_META, type NodeCategory, type ConfigField } from '../nodes/nodeConfig'

import gun from '../gun'

// ── Build nodeTypes map ──────────────────────────────────────────
const nodeTypes: NodeTypes = {}
Object.entries(NODE_DEFS).forEach(([type, def]) => {
  if (def.category === 'trigger')   nodeTypes[type] = TriggerNode as any
  if (def.category === 'condition') nodeTypes[type] = ConditionNode as any
  if (def.category === 'action')    nodeTypes[type] = ActionNode as any
  if (def.category === 'variable')  nodeTypes[type] = VariableNode as any
  if (def.category === 'utility')   nodeTypes[type] = UtilityNode as any
})

// ── Category order for palette ────────────────────────────────
const CATEGORY_ORDER: NodeCategory[] = ['trigger', 'condition', 'action', 'variable', 'utility']

interface BotFlow {
  id: string
  name: string
  active: boolean
  serverId: string
  nodes: Node[]
  edges: Edge[]
}

interface Props {
  serverId: string
  botId: string | null   // null = new bot
  onBack: () => void
}

function BotEditorInner({ serverId, botId, onBack }: Props) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const { screenToFlowPosition } = useReactFlow()

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [botName, setBotName] = useState('Nouveau bot')
  const [isActive, setIsActive] = useState(false)
  const [currentBotId] = useState(() => botId || `bot_${Date.now()}`)
  const [selectedNode, setSelectedNode] = useState<Node | null>(null)
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({})
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')

  // ── Load existing bot ──────────────────────────────────────────
  useEffect(() => {
    if (!botId) return
    gun.get('bots').get(serverId).get(botId).once((raw: any) => {
      if (!raw) return
      try {
        const flow: BotFlow = JSON.parse(raw.json || '{}')
        setBotName(flow.name || 'Bot sans nom')
        setIsActive(flow.active || false)
        setNodes(flow.nodes || [])
        setEdges(flow.edges || [])
      } catch { /* ignore malformed data */ }
    })
  }, [botId, serverId, setNodes, setEdges])

  // ── Keep selectedNode in sync when nodes change ───────────────
  useEffect(() => {
    if (selectedNode) {
      const updated = nodes.find(n => n.id === selectedNode.id) || null
      setSelectedNode(updated)
    }
  }, [nodes]) // eslint-disable-line

  // ── Connect edges ──────────────────────────────────────────────
  const onConnect = useCallback(
    (connection: Connection) => setEdges(eds => addEdge({ ...connection, animated: false }, eds)),
    [setEdges]
  )

  // ── Drag from palette ──────────────────────────────────────────
  const onDragStart = (e: React.DragEvent, nodeType: string) => {
    e.dataTransfer.setData('application/reactflow', nodeType)
    e.dataTransfer.effectAllowed = 'move'
  }

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const nodeType = e.dataTransfer.getData('application/reactflow')
    if (!nodeType || !reactFlowWrapper.current) return
    const def = NODE_DEFS[nodeType]
    if (!def) return
    const position = screenToFlowPosition({ x: e.clientX, y: e.clientY })
    const newNode: Node = {
      id: `${nodeType}_${Date.now()}`,
      type: nodeType,
      position,
      data: { label: def.label, config: {} },
    }
    setNodes(nds => [...nds, newNode])
  }, [screenToFlowPosition, setNodes])

  // ── Node click → select for properties ───────────────────────
  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node)
  }, [])

  const onPaneClick = useCallback(() => {
    setSelectedNode(null)
  }, [])

  // ── Update config field in selected node ──────────────────────
  const updateConfig = (key: string, value: string) => {
    if (!selectedNode) return
    setNodes(nds => nds.map(n => {
      if (n.id !== selectedNode.id) return n
      const updatedData = { ...n.data, config: { ...(n.data.config as object), [key]: value } }
      return { ...n, data: updatedData }
    }))
  }

  // ── Save bot to GunDB ─────────────────────────────────────────
  const saveBotflow = async () => {
    setSaveStatus('saving')
    const flow: BotFlow = {
      id: currentBotId,
      name: botName,
      active: isActive,
      serverId,
      nodes,
      edges,
    }
    gun.get('bots').get(serverId).get(currentBotId).put({
      id: currentBotId,
      name: botName,
      active: isActive,
      json: JSON.stringify(flow),
    })
    setTimeout(() => {
      // Notifier les autres pairs via GunDB (remplace l'événement Socket.io)
      gun.get('bot_events').get(serverId).put({ event: 'bot_saved', botId: currentBotId, ts: Date.now() })
      setSaveStatus('saved')
    }, 400)
    setTimeout(() => setSaveStatus('idle'), 2000)
  }

  // ── Toggle active ──────────────────────────────────────────────
  const toggleActive = () => {
    const next = !isActive
    setIsActive(next)
    gun.get('bots').get(serverId).get(currentBotId).put({ active: next })
  }

  // ── Delete selected node ──────────────────────────────────────
  const deleteSelectedNode = () => {
    if (!selectedNode) return
    setNodes(nds => nds.filter(n => n.id !== selectedNode.id))
    setEdges(eds => eds.filter(e => e.source !== selectedNode.id && e.target !== selectedNode.id))
    setSelectedNode(null)
  }

  const toggleCategory = (cat: string) =>
    setCollapsedCategories(prev => ({ ...prev, [cat]: !prev[cat] }))

  // ── Render right panel ─────────────────────────────────────────
  const renderPropertiesPanel = () => {
    if (!selectedNode) {
      return (
        <div className="bot-props-empty">
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>👆</div>
          <div>Clique sur un nœud pour configurer ses paramètres</div>
        </div>
      )
    }
    const def = NODE_DEFS[selectedNode.type as string]
    if (!def) return null
    const config = (selectedNode.data.config as Record<string, string>) || {}

    return (
      <div className="bot-props-body">
        <div className="bot-props-title">
          <span>{def.icon} {def.label}</span>
          <button className="bot-props-delete" onClick={deleteSelectedNode} title="Supprimer le nœud">🗑️</button>
        </div>
        <div className="bot-props-description">{def.description}</div>
        {def.configFields.length === 0 && (
          <div className="bot-props-no-config">Aucun paramètre pour ce nœud.</div>
        )}
        {def.configFields.map((field: ConfigField) => (
          <div key={field.key} className="bot-prop-field">
            <label className="bot-prop-label">{field.label}</label>
            {field.type === 'textarea' ? (
              <textarea
                className="bot-prop-input bot-prop-textarea"
                value={config[field.key] || ''}
                placeholder={field.placeholder || ''}
                onChange={e => updateConfig(field.key, e.target.value)}
                rows={3}
              />
            ) : field.type === 'select' ? (
              <select
                className="bot-prop-input bot-prop-select"
                value={config[field.key] || String(field.default || '')}
                onChange={e => updateConfig(field.key, e.target.value)}
              >
                {field.options?.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            ) : (
              <input
                className="bot-prop-input"
                type={field.type}
                value={config[field.key] || ''}
                placeholder={field.placeholder || ''}
                onChange={e => updateConfig(field.key, e.target.value)}
              />
            )}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="bot-editor">
      {/* ── Toolbar ── */}
      <div className="bot-toolbar">
        <button className="bot-toolbar-back" onClick={() => { saveBotflow(); onBack() }} title="Retour">← Bots</button>
        <input
          className="bot-toolbar-name"
          value={botName}
          onChange={e => setBotName(e.target.value)}
          placeholder="Nom du bot"
        />
        <div className="bot-toolbar-actions">
          <button
            className={`bot-toolbar-btn ${isActive ? 'active' : ''}`}
            onClick={toggleActive}
            title={isActive ? 'Désactiver le bot' : 'Activer le bot'}
          >
            {isActive ? '🟢 Actif' : '⚫ Inactif'}
          </button>
          <button className="bot-toolbar-btn save" onClick={saveBotflow}>
            {saveStatus === 'saving' ? '⏳ Sauvegarde…' : saveStatus === 'saved' ? '✅ Sauvegardé' : '💾 Sauvegarder'}
          </button>
        </div>
      </div>

      <div className="bot-editor-body">
        {/* ── Left palette ── */}
        <div className="bot-palette">
          <div className="bot-palette-title">Nœuds</div>
          {CATEGORY_ORDER.map(cat => {
            const meta = CATEGORY_META[cat]
            const items = Object.entries(NODE_DEFS).filter(([, d]) => d.category === cat)
            const collapsed = collapsedCategories[cat]
            return (
              <div key={cat} className="bot-palette-category">
                <div
                  className="bot-palette-cat-header"
                  style={{ borderLeftColor: meta.color }}
                  onClick={() => toggleCategory(cat)}
                >
                  <span style={{ color: meta.color }}>{meta.label}</span>
                  <span style={{ fontSize: '10px', opacity: 0.6 }}>{collapsed ? '▸' : '▾'}</span>
                </div>
                {!collapsed && items.map(([type, def]) => (
                  <div
                    key={type}
                    className="bot-palette-item"
                    style={{ borderLeftColor: meta.color }}
                    draggable
                    onDragStart={e => onDragStart(e, type)}
                    title={def.description}
                  >
                    <span className="bot-palette-icon">{def.icon}</span>
                    <span className="bot-palette-label">{def.label}</span>
                  </div>
                ))}
              </div>
            )
          })}
        </div>

        {/* ── Canvas ── */}
        <div className="bot-canvas-wrapper" ref={reactFlowWrapper} onDragOver={onDragOver} onDrop={onDrop}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
            fitView
            deleteKeyCode="Delete"
            style={{ background: '#0b0b18' }}
          >
            <Background color="#2b2d31" gap={20} size={1} />
            <Controls />
            <MiniMap nodeColor={(n) => {
              const def = NODE_DEFS[n.type as string]
              return CATEGORY_META[def?.category || 'utility'].color
            }} style={{ background: '#141428' }} />
          </ReactFlow>
        </div>

        {/* ── Right properties panel ── */}
        <div className="bot-props-panel">
          <div className="bot-props-header">Propriétés</div>
          {renderPropertiesPanel()}
        </div>
      </div>
    </div>
  )
}

function BotEditor(props: Props) {
  return (
    <ReactFlowProvider>
      <BotEditorInner {...props} />
    </ReactFlowProvider>
  )
}

export default BotEditor
