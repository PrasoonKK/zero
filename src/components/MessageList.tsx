import React, { useEffect, useRef, useState } from 'react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { Message } from '../stores/chatStore'
import { parseCodeBlocks, formatTime } from '../lib/utils'

function CodeBlock({ code, language }: { code: string; language: string }): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }
  return (
    <div className="my-2 overflow-hidden" style={{ border: '1px solid rgba(var(--accent-rgb),0.15)', borderRadius: '4px' }}>
      <div className="flex items-center justify-between px-3 py-1.5 border-b" style={{ background: 'var(--bg-code)', borderColor: 'var(--border-med)' }}>
        <span className="label-caps text-[9px] text-[var(--accent)]">{language}</span>
        <button
          onClick={handleCopy}
          className="label-caps text-[9px] text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors px-2 py-0.5"
        >
          {copied ? 'COPIED' : 'COPY'}
        </button>
      </div>
      <SyntaxHighlighter
        language={language}
        style={vscDarkPlus}
        customStyle={{ margin: 0, background: 'var(--bg-code)', fontSize: '12px', lineHeight: '1.6', padding: '12px' }}
        wrapLongLines
      >
        {code}
      </SyntaxHighlighter>
    </div>
  )
}

function MessageBubble({ message }: { message: Message }): React.JSX.Element {
  const isUser   = message.role === 'user'
  const isSystem = message.role === 'system'
  const parts    = parseCodeBlocks(message.content)

  if (isSystem) {
    return (
      <div className="flex justify-center mb-4 slide-in-up">
        <div
          className="px-4 py-2 text-xs font-mono text-[#ffb4ab] max-w-sm text-center"
          style={{ background: 'rgba(255,180,171,0.06)', border: '1px solid rgba(255,180,171,0.2)', borderRadius: '2px' }}
        >
          ⚠ {message.content}
        </div>
      </div>
    )
  }

  return (
    <div className={`flex mb-5 group slide-in-up ${isUser ? 'justify-end' : 'justify-start'}`}>
      {isUser ? (
        /* ── User message ── */
        <div className="max-w-[72%]">
          <div className="flex items-center justify-end gap-2 mb-1">
            <span className="label-caps text-[8px] text-[var(--text-muted)]">{formatTime(message.timestamp)}</span>
            <span className="label-caps text-[9px] text-[var(--text-muted)]">YOU</span>
          </div>
          <div
            className="px-4 py-2.5 font-mono text-sm leading-relaxed whitespace-pre-wrap break-words"
            style={{ background: 'var(--bg-user-msg)', border: '1px solid var(--border-med)', borderRadius: '4px 2px 4px 4px', color: 'var(--text-primary)' }}
          >
            {message.content}
          </div>
        </div>
      ) : (
        /* ── AI message ── */
        <div className="max-w-[80%]">
          <div className="flex items-center gap-2 mb-1">
            <span className="label-caps text-[9px] text-[var(--accent)]">ZERO</span>
            <span className="label-caps text-[8px] text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity">{formatTime(message.timestamp)}</span>
          </div>
          <div
            className="px-4 py-3"
            style={{ background: 'var(--bg-card)', border: '1px solid rgba(var(--accent-rgb),0.1)', borderRadius: '2px 4px 4px 4px' }}
          >
            {parts.map((part, i) =>
              part.type === 'code' ? (
                <CodeBlock key={i} code={part.content} language={part.language || 'text'} />
              ) : (
                <p key={i} className="font-mono text-sm leading-relaxed whitespace-pre-wrap break-words" style={{ color: 'var(--text-body)' }}>
                  {part.content}
                  {message.isStreaming && i === parts.length - 1 && (
                    <span className="inline-block w-1.5 h-3.5 ml-0.5 align-middle cursor-blink" style={{ background: 'var(--accent)' }} />
                  )}
                </p>
              )
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function MessageList({ messages }: { messages: Message[] }): React.JSX.Element {
  const bottomRef = useRef<HTMLDivElement>(null)
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])
  return (
    <div>
      {messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)}
      <div ref={bottomRef} />
    </div>
  )
}
