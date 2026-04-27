import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import { NODE_DEFS } from './nodeConfig'

export function ActionNode({ data, selected, type }: NodeProps & { type: string }) {
  const def = NODE_DEFS[type as string] || NODE_DEFS['action_send_message']
  const config = (data.config as Record<string, string>) || {}
  const configPreview = Object.values(config).filter(Boolean).slice(0, 1).join(', ')

  return (
    <div className={`bot-node bot-node-action${selected ? ' bot-node-selected' : ''}`}>
      <Handle type="target" position={Position.Left} id="in" className="bot-handle bot-handle-in" />
      <div className="bot-node-header" style={{ background: '#f23f43' }}>
        <span className="bot-node-icon">{def.icon}</span>
        <span className="bot-node-label">{def.label}</span>
      </div>
      {configPreview && (
        <div className="bot-node-preview">{configPreview}</div>
      )}
      <Handle type="source" position={Position.Right} id="out" className="bot-handle bot-handle-out" />
    </div>
  )
}
