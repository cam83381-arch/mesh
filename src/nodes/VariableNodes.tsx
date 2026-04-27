import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import { NODE_DEFS } from './nodeConfig'

export function VariableNode({ data, selected, type }: NodeProps & { type: string }) {
  const def = NODE_DEFS[type as string] || NODE_DEFS['variable_set']
  const config = (data.config as Record<string, string>) || {}
  const configPreview = Object.values(config).filter(Boolean).slice(0, 1).join(', ')
  const hasCondOutput = type === 'variable_list_contains'

  return (
    <div className={`bot-node bot-node-variable${selected ? ' bot-node-selected' : ''}`}>
      <Handle type="target" position={Position.Left} id="in" className="bot-handle bot-handle-in" />
      <div className="bot-node-header" style={{ background: '#23a559' }}>
        <span className="bot-node-icon">{def.icon}</span>
        <span className="bot-node-label">{def.label}</span>
      </div>
      {configPreview && (
        <div className="bot-node-preview">{configPreview}</div>
      )}
      {hasCondOutput ? (
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
      ) : (
        <Handle type="source" position={Position.Right} id="out" className="bot-handle bot-handle-out" />
      )}
    </div>
  )
}
