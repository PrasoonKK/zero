import React, { useState, useRef, useCallback } from 'react'
import { useChatStore } from '../stores/chatStore'
import type { AgentStep } from '../stores/chatStore'
import { runAgent } from '../lib/agentRunner'
import ApprovalDialog from './ApprovalDialog'

const ACTION_LABEL: Record<AgentStep['action'], string> = {
  read_file:  'READ_FILE',
  list_files: 'LIST_DIR',
  explain:    'EXPLAIN',
  write_code: 'WRITE_CODE',
  execute:    'EXECUTE',
}

const STATUS_STYLE: Record<AgentStep['status'], { border: string; bg: string; text: string }> = {
  pending:           { border: 'rgba(68,71,72,0.4)',       bg: 'rgba(52,52,57,0.3)',      text: '#8e9192' },
  running:           { border: 'rgba(var(--accent-rgb),0.3)',     bg: 'rgba(var(--accent-rgb),0.06)',  text: 'var(--accent)' },
  done:              { border: 'rgba(var(--accent-rgb),0.2)',     bg: 'rgba(var(--accent-rgb),0.04)',  text: 'var(--accent)' },
  error:             { border: 'rgba(255,180,171,0.3)',     bg: 'rgba(255,180,171,0.06)',  text: '#ffb4ab' },
  awaiting_approval: { border: 'rgba(255,220,100,0.3)',     bg: 'rgba(255,220,100,0.06)',  text: '#ffd364' },
}

function StepCard({ step }: { step: AgentStep }): React.JSX.Element {
  const [expanded, setExpanded] = useState(step.status === 'done' || step.status === 'error')
  const st = STATUS_STYLE[step.status]

  return (
    <div
      className="mb-2 slide-in-up"
      style={{ border: `1px solid ${st.border}`, background: st.bg, borderRadius: '2px' }}
    >
      <div
        className="flex items-center gap-3 px-3 py-2.5 cursor-pointer"
        onClick={() => setExpanded(e => !e)}
      >
        <span className="label-caps text-[9px] shrink-0" style={{ color: st.text }}>
          {ACTION_LABEL[step.action]}
        </span>
        <span className="font-mono text-xs text-[#c4c7c8] flex-1 truncate">{step.description}</span>
        <span className="label-caps text-[9px] shrink-0 flex items-center gap-1.5" style={{ color: st.text }}>
          {step.status === 'running' && (
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ background: 'var(--accent)', animation: 'ring-pulse 1s ease-in-out infinite' }}
            />
          )}
          {step.status.replace('_', ' ').toUpperCase()}
        </span>
        {step.result && (
          <span className="text-[#444748] text-xs shrink-0">{expanded ? '▲' : '▼'}</span>
        )}
      </div>
      {expanded && step.result && (
        <div
          className="mx-3 mb-3 p-3"
          style={{ borderTop: '1px solid rgba(68,71,72,0.3)', background: 'rgba(13,14,18,0.5)' }}
        >
          <pre className="font-mono text-xs text-[#8e9192] whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
            {step.result}
          </pre>
        </div>
      )}
    </div>
  )
}

export default function AgentPanel(): React.JSX.Element {
  const {
    agentSteps, pendingApproval, isLoading, settings,
    setLoading, addAgentStep, updateAgentStep, clearAgentSteps, setPendingApproval,
  } = useChatStore()

  const [task, setTask]                           = useState('')
  const [context, setContext]                     = useState('')
  const [finalAnswer, setFinalAnswer]             = useState<string | null>(null)
  const [error, setError]                         = useState<string | null>(null)
  const [filePathInput, setFilePathInput]         = useState('')
  const [repoDirInput, setRepoDirInput]           = useState('')
  const [contextPickerOpen, setContextPickerOpen] = useState(false)
  const [gitLoading, setGitLoading]               = useState(false)
  const approvalResolvers = useRef<Map<string, (approved: boolean) => void>>(new Map())

  const handleRun = useCallback(async () => {
    const t = task.trim()
    if (!t || isLoading) return

    clearAgentSteps()
    setFinalAnswer(null)
    setError(null)
    setLoading(true)

    try {
      const result = await runAgent(
        t,
        context,
        settings.chatModel || 'mistral',
        (step) => {
          const existing = useChatStore.getState().agentSteps.find(s => s.id === step.id)
          if (existing) updateAgentStep(step.id, step)
          else addAgentStep(step)

          if (step.status === 'awaiting_approval') {
            setPendingApproval(step)
          } else if (step.status === 'done' || step.status === 'error') {
            if (useChatStore.getState().pendingApproval?.id === step.id) setPendingApproval(null)
          }
        },
        (step) => new Promise<boolean>((resolve) => {
          approvalResolvers.current.set(step.id, resolve)
        }),
        settings.openrouterKey,
        settings.openrouterModel,
      )
      setFinalAnswer(result.finalAnswer)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
      setPendingApproval(null)
      approvalResolvers.current.clear()
    }
  }, [task, context, isLoading, settings, clearAgentSteps, setLoading, addAgentStep, updateAgentStep, setPendingApproval])

  const handleApprove = (approved: boolean) => {
    const pending = useChatStore.getState().pendingApproval
    if (!pending) return
    const resolver = approvalResolvers.current.get(pending.id)
    if (resolver) { approvalResolvers.current.delete(pending.id); resolver(approved) }
    setPendingApproval(null)
  }

  const handleAttachFile = () => {
    const p = filePathInput.trim()
    if (p) {
      setContext(prev => prev ? `${prev}\nFile: ${p}` : `File: ${p}`)
      setFilePathInput('')
      setContextPickerOpen(false)
    }
  }

  const handleAddGitContext = async () => {
    const dir = repoDirInput.trim() || 'C:\\Users\\praso\\Desktop\\Zero'
    setGitLoading(true)
    try {
      const [status, log] = await Promise.all([
        window.ai.gitStatus(dir),
        window.ai.gitLog(dir, 10),
      ])
      const block = `=== GIT STATUS (${dir}) ===\n${status}\n\n=== RECENT COMMITS ===\n${log}`
      setContext(prev => prev ? `${prev}\n\n${block}` : block)
    } catch (e) {
      setContext(prev => `${prev}\n⚠ Git context failed: ${String(e)}`)
    } finally {
      setGitLoading(false)
    }
  }

  const EXAMPLE_TASKS = [
    `List files in C:\\Users\\praso\\Desktop\\Zero`,
    `Read package.json and explain the dependencies`,
    `Write a Python script to list all .ts files`,
  ]

  return (
    <div className="flex flex-col h-full">
      {/* Task input */}
      <div
        className="px-5 pt-4 pb-3 shrink-0 space-y-2"
        style={{ borderBottom: '1px solid rgba(68,71,72,0.25)' }}
      >
        <div className="flex gap-2 items-start">
          <span className="font-mono text-sm pt-2.5 shrink-0 select-none" style={{ color: 'var(--accent)' }}>›</span>
          <textarea
            value={task}
            onChange={e => setTask(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleRun() } }}
            disabled={isLoading}
            placeholder="DESCRIBE_TASK..."
            rows={2}
            className="flex-1 font-mono text-sm text-[#e3e2e7] placeholder-[#444748] resize-none outline-none disabled:opacity-40 bg-transparent pt-2"
            style={{ minHeight: '48px' }}
          />
          <button
            onClick={handleRun}
            disabled={!task.trim() || isLoading}
            className="flex-shrink-0 px-4 py-2 mt-1 label-caps text-[9px] disabled:opacity-30 transition-all active:scale-95"
            style={{
              background: 'rgba(var(--accent-rgb),0.1)',
              border: '1px solid rgba(var(--accent-rgb),0.25)',
              color: 'var(--accent)',
              borderRadius: '2px',
            }}
          >
            {isLoading ? (
              <span className="inline-block w-3 h-3 rounded-full border border-t-transparent animate-spin" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
            ) : 'EXECUTE'}
          </button>
        </div>

        <div className="flex items-center gap-2 pl-5 flex-wrap">
          <button
            onClick={() => setContextPickerOpen(v => !v)}
            className="label-caps text-[9px] text-[#8e9192] hover:text-[var(--accent)] transition-colors"
          >
            + ATTACH_FILE
          </button>
          <button
            onClick={handleAddGitContext}
            disabled={gitLoading}
            className="label-caps text-[9px] text-[#8e9192] hover:text-[var(--accent)] transition-colors disabled:opacity-40"
          >
            {gitLoading ? 'LOADING...' : '+ GIT_CONTEXT'}
          </button>
          <input
            value={repoDirInput}
            onChange={e => setRepoDirInput(e.target.value)}
            placeholder="repo path (optional)"
            className="font-mono text-[10px] text-[#8e9192] placeholder-[#444748] outline-none bg-transparent"
            style={{ width: 160 }}
          />
          {context && (
            <div className="flex-1 flex items-center gap-2 min-w-0">
              <span className="font-mono text-xs text-[#8e9192] truncate">{context}</span>
              <button onClick={() => setContext('')} className="text-[#8e9192] hover:text-[#ffb4ab] transition-colors text-xs shrink-0">✕</button>
            </div>
          )}
        </div>

        {contextPickerOpen && (
          <div className="flex gap-2 pl-5">
            <input
              value={filePathInput}
              onChange={e => setFilePathInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAttachFile() }}
              placeholder="C:\path\to\file"
              className="flex-1 font-mono text-xs text-[#e3e2e7] placeholder-[#444748] outline-none bg-transparent"
              style={{
                background: 'rgba(13,14,18,0.6)',
                border: '1px solid rgba(68,71,72,0.4)',
                padding: '4px 10px',
                borderRadius: '2px',
              }}
            />
            <button
              onClick={handleAttachFile}
              className="label-caps text-[9px] text-[var(--accent)] px-3 py-1 transition-colors hover:text-white"
              style={{ border: '1px solid rgba(var(--accent-rgb),0.2)', borderRadius: '2px' }}
            >
              ADD
            </button>
          </div>
        )}
      </div>

      {/* Steps area */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {agentSteps.length === 0 && !isLoading && !error && (
          <div className="flex flex-col items-center justify-center h-full text-center fade-in">
            <div className="label-caps text-[9px] text-[#8e9192] mb-6">EXAMPLE_DIRECTIVES</div>
            <div className="space-y-2 w-full max-w-sm">
              {EXAMPLE_TASKS.map(s => (
                <button
                  key={s}
                  onClick={() => setTask(s)}
                  className="w-full text-left px-4 py-2.5 transition-all active:scale-[0.98]"
                  style={{
                    background: 'rgba(30,31,36,0.4)',
                    border: '1px solid rgba(68,71,72,0.3)',
                    borderRadius: '2px',
                  }}
                >
                  <span className="font-mono text-xs text-[#8e9192] hover:text-[#c4c7c8]">&gt; {s}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div
            className="mb-3 px-4 py-3 slide-in-up"
            style={{ border: '1px solid rgba(255,180,171,0.3)', background: 'rgba(255,180,171,0.06)', borderRadius: '2px' }}
          >
            <div className="label-caps text-[9px] text-[#ffb4ab] mb-1.5">EXECUTION_ERROR</div>
            <p className="font-mono text-xs text-[#ffb4ab]/80">{error}</p>
          </div>
        )}

        {agentSteps.map(step => <StepCard key={step.id} step={step} />)}

        {finalAnswer && (
          <div
            className="mt-3 px-4 py-3 slide-in-up"
            style={{ border: '1px solid rgba(var(--accent-rgb),0.2)', background: 'rgba(var(--accent-rgb),0.04)', borderRadius: '2px' }}
          >
            <div className="label-caps text-[9px] text-[var(--accent)] mb-2">TASK_SUMMARY</div>
            <p className="font-mono text-xs text-[#c4c7c8] whitespace-pre-wrap">{finalAnswer}</p>
          </div>
        )}
      </div>

      {pendingApproval && <ApprovalDialog onApprove={handleApprove} />}
    </div>
  )
}
