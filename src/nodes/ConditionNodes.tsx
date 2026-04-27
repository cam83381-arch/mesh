import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import { NODE_DEFS } from './nodeConfig'

export function ConditionNode({ data, selected, type }: NodeProps & { type: string }) {
  const def = NODE_DEFS[type as string] || NODE_DEFS['condition_contains']
  const config = (data.config as Record<string, string>) || {}
  const configPreview = Object.values(config).filter(Boolean).slice(0, 1).join(', ')

  return (
    <div className={`bot-node bot-node-condition${selected ? ' bot-node-selected' : ''}`}>
      <Handle type="target" position={Position.Left} id="in" className="bot-handle bot-handle-in" />
      <div className="bot-node-header" style={{ background: '#f0b232' }}>
        <span className="bot-node-icon" style={{ color: '#000' }}>{def.icon}</span>
        <span className="bot-node-label" style={{ color: '#000' }}>{def.label}</span>
      </div>
      {configPreview && (
        <div className="bot-node-preview">{configPreview}</div>
      )}
      <div className="bot-node-outputs">
        <div className="bot-output-yes">
          <span>Oui</span>
          <Handle type="source" position={Position.Right} id="yes" className="bot-handle bot-handle-yes" style={{ top: '30%' }} />
        </div>
        <div className="bot-output-no">
          <span>Non</span>
          <Handle type="source" position={Position.Right} id="no" className="bot-handle bot-handle-no" style={{ top: '70%' }} />
        </div>
      </div>
    </div>
  )
}
