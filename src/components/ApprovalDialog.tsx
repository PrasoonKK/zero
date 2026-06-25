import React from 'react'
import { useChatStore } from '../stores/chatStore'

interface Props {
  onApprove: (approved: boolean) => void
}

export default function ApprovalDialog({ onApprove }: Props): React.JSX.Element | null {
  const { pendingApproval } = useChatStore()
  if (!pendingApproval) return null

  return (
    <div
      className="mx-5 mb-4 slide-in-up"
      style={{
        background: 'rgba(255,220,100,0.05)',
        border: '1px solid rgba(255,220,100,0.3)',
        borderRadius: '2px',
      }}
    >
      <div className="px-4 py-3">
        <div className="label-caps text-[9px] text-[#ffd364] mb-2">EXECUTION_APPROVAL_REQUIRED</div>
        <p className="font-mono text-xs text-[#c4c7c8] mb-3">
          The agent wants to execute code on your system. Review and approve to continue.
        </p>
        {pendingApproval.code && (
          <pre
            className="font-mono text-xs text-[#8e9192] overflow-x-auto mb-3 whitespace-pre-wrap break-all"
            style={{
              background: 'rgba(13,14,18,0.7)',
              border: '1px solid rgba(68,71,72,0.4)',
              padding: '10px 12px',
              borderRadius: '2px',
            }}
          >
            {pendingApproval.code}
          </pre>
        )}
        <div className="label-caps text-[8px] text-[#8e9192] mb-3">
          LANG: {(pendingApproval.language || 'bash').toUpperCase()} — {pendingApproval.description}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onApprove(true)}
            className="label-caps text-[9px] px-4 py-2 transition-all active:scale-95"
            style={{
              background: 'rgba(var(--accent-rgb),0.1)',
              border: '1px solid rgba(var(--accent-rgb),0.3)',
              color: 'var(--accent)',
              borderRadius: '2px',
            }}
          >
            ALLOW_EXECUTE
          </button>
          <button
            onClick={() => onApprove(false)}
            className="label-caps text-[9px] px-4 py-2 transition-all active:scale-95"
            style={{
              background: 'rgba(255,180,171,0.08)',
              border: '1px solid rgba(255,180,171,0.25)',
              color: '#ffb4ab',
              borderRadius: '2px',
            }}
          >
            DENY
          </button>
        </div>
      </div>
    </div>
  )
}
