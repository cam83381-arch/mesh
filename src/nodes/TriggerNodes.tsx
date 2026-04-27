import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import { NODE_DEFS } from './nodeConfig'

export function TriggerNode({ data, selected, type }: NodeProps & { type: string }) {
  const def = NODE_DEFS[type as string] || NODE_DEFS['trigger_message']
  const config = (data.config as Record<string, string>) || {}
  const configPreview = Object.values(config).filter(Boolean).slice(0, 1).join(', ')

  return (
    <div className={`bot-node bot-node-trigger${selected ? ' bot-node-selected' : ''}`}>
      <div className="bot-node-header" style={{ background: '#5865f2' }}>
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
