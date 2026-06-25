import React, { useState, useRef, KeyboardEvent, useCallback, useEffect } from 'react'
import { useChatStore } from '../stores/chatStore'
import VoiceIndicator from './VoiceIndicator'
import { ollamaChatStream, openRouterChatStream, ChatMessage } from '../lib/ollama'


const SYSTEM_PROMPTS: Record<string, string> = {
  assistant: 'You are Zero, a helpful desktop AI assistant. Answer clearly and concisely. Remember all previous messages in this conversation.',
  coder:     'You are Zero, an expert coding assistant. Write clean, working code in markdown code blocks with the language specified. Be direct and precise. Remember all previous messages in this conversation.',
}

export default function InputBar(): React.JSX.Element {
  const [input, setInput] = useState('')
  const [interimText, setInterimText] = useState('')
  const { isLoading, isRecording, messages, addMessage, updateLastMessage, setLoading, setRecording, mode, settings, setProvider, ollamaOnline } = useChatStore()
  const textareaRef   = useRef<HTMLTextAreaElement>(null)
  const sendingRef    = useRef(false)
  const abortRef      = useRef<AbortController | null>(null)
  const mediaRecRef   = useRef<MediaRecorder | null>(null)
  const audioChunks   = useRef<Blob[]>([])

  const buildMessages = useCallback((userText: string): ChatMessage[] => {
    const history: ChatMessage[] = messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .filter(m => m.content.trim())
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))

    return [
      { role: 'system', content: SYSTEM_PROMPTS[mode] || SYSTEM_PROMPTS.assistant },
      ...history,
      { role: 'user', content: userText },
    ]
  }, [messages, mode])

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || isLoading || sendingRef.current) return
    sendingRef.current = true

    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    addMessage({ role: 'user', content: text })

    // System commands — zero LLM cost
    // Special prefix __LLM_CONTEXT__: means: route to LLM with this as the user message (e.g. commit msg with diff)
    const LLM_CTX = '__LLM_CONTEXT__:'
    try {
      const sysResult = await window.ai.systemCommand(text)
      if (sysResult !== null) {
        if (sysResult.startsWith(LLM_CTX)) {
          // Fall through to LLM below but substitute the prompt
          const llmPrompt = sysResult.slice(LLM_CTX.length)
          // We'll handle this inline — rewrite chatMessages before LLM call
          setLoading(true)
          addMessage({ role: 'assistant', content: '', isStreaming: true })
          const model = mode === 'coder' ? (settings.coderModel || 'codellama') : (settings.chatModel || 'mistral')
          const ctxMessages: ChatMessage[] = [
            { role: 'system', content: 'You are Zero, a helpful AI assistant. Be concise and direct.' },
            { role: 'user', content: llmPrompt },
          ]
          const abort = new AbortController()
          abortRef.current = abort
          let acc = ''
          if (ollamaOnline) {
            try {
              setProvider('ollama')
              await ollamaChatStream(model, ctxMessages, (chunk) => { acc += chunk; updateLastMessage(acc) }, abort.signal)
              return
            } catch (err: unknown) {
              if ((err as { name?: string }).name === 'AbortError') return
              acc = ''; updateLastMessage('')
            }
          }
          if (settings.openrouterKey) {
            try {
              setProvider('openrouter')
              await openRouterChatStream(settings.openrouterKey, settings.openrouterModel || 'mistralai/mistral-7b-instruct:free', ctxMessages, (chunk) => { acc += chunk; updateLastMessage(acc) }, abort.signal)
              return
            } catch (err: unknown) {
              if ((err as { name?: string }).name === 'AbortError') return
              updateLastMessage(`> OPENROUTER_ERROR\n\n${String(err)}`); return
            }
          }
          updateLastMessage('> NO_LLM_AVAILABLE\n\nOllama is offline and no OpenRouter key is set.')
          return
        }
        addMessage({ role: 'assistant', content: sysResult })
        sendingRef.current = false
        return
      }
    } catch { /* fall through */ }

    // Plugin triggers
    try {
      const pluginList = await window.ai.listPlugins()
      const lowerText  = text.toLowerCase()
      const matched    = pluginList.find((p) => p.triggers.some((t) => lowerText.includes(t.toLowerCase())))
      if (matched) {
        setLoading(true)
        addMessage({ role: 'assistant', content: '', isStreaming: true })
        try {
          const pluginResult = await window.ai.runPlugin(matched.name, text)
          updateLastMessage(pluginResult)
        } catch (err) {
          updateLastMessage(`⚠️ Plugin error: ${String(err)}`)
        } finally {
          setLoading(false)
          sendingRef.current = false
        }
        return
      }
    } catch { /* fall through */ }

    setLoading(true)
    addMessage({ role: 'assistant', content: '', isStreaming: true })

    const model        = mode === 'coder' ? (settings.coderModel || 'codellama') : (settings.chatModel || 'mistral')
    const chatMessages = buildMessages(text)
    const abort        = new AbortController()
    abortRef.current   = abort
    let accumulated    = ''

    // Try Ollama first
    if (ollamaOnline) {
      try {
        setProvider('ollama')
        await ollamaChatStream(model, chatMessages, (chunk) => {
          accumulated += chunk
          updateLastMessage(accumulated)
        }, abort.signal)

        if (!accumulated) {
          updateLastMessage(`> MODEL_NOT_FOUND\n\nPull the model first:\n  ollama pull ${model}`)
        }
        return
      } catch (err: unknown) {
        if ((err as { name?: string }).name === 'AbortError') return
        // Ollama failed — fall through to OpenRouter
        accumulated = ''
        updateLastMessage('')
      }
    }

    // OpenRouter fallback
    if (settings.openrouterKey) {
      try {
        setProvider('openrouter')
        const orModel = settings.openrouterModel || 'mistralai/mistral-7b-instruct:free'
        await openRouterChatStream(settings.openrouterKey, orModel, chatMessages, (chunk) => {
          accumulated += chunk
          updateLastMessage(accumulated)
        }, abort.signal)

        if (!accumulated) updateLastMessage('> EMPTY_RESPONSE from OpenRouter')
        return
      } catch (err: unknown) {
        if ((err as { name?: string }).name === 'AbortError') return
        updateLastMessage(`> OPENROUTER_ERROR\n\n${String(err)}`)
        return
      }
    }

    // Nothing available
    updateLastMessage('> NO_LLM_AVAILABLE\n\nOllama is offline and no OpenRouter API key is set.\nStart Ollama:  ollama serve\nOr add an OpenRouter key in Settings.')

  }, [input, isLoading, mode, settings, ollamaOnline, messages, addMessage, updateLastMessage, setLoading, setProvider, buildMessages])

  const handleStop = () => abortRef.current?.abort()

  // Cleanup: mark streaming done and release lock after send
  const wrappedSend = useCallback(async () => {
    try {
      await handleSend()
    } finally {
      setLoading(false)
      sendingRef.current = false
      abortRef.current   = null
    }
  }, [handleSend, setLoading])

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); wrappedSend() }
  }

  const handleInput = () => {
    const el = textareaRef.current
    if (el) { el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 120)}px` }
  }

  const handleVoice = useCallback(async () => {
    // Stop recording
    if (isRecording) {
      mediaRecRef.current?.stop()
      return
    }

    if (!settings.groqKey) {
      addMessage({ role: 'system', content: '⚠ Voice requires a Groq API key. Add it in Settings → VOICE_INPUT. Free at console.groq.com/keys' })
      return
    }

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      addMessage({ role: 'system', content: '⚠ Microphone access denied. Check system permissions.' })
      return
    }

    audioChunks.current = []
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm'
    const rec = new MediaRecorder(stream, { mimeType })
    mediaRecRef.current = rec

    rec.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.current.push(e.data) }

    rec.onstop = async () => {
      stream.getTracks().forEach(t => t.stop())
      setRecording(false)
      setInterimText('TRANSCRIBING...')

      const blob = new Blob(audioChunks.current, { type: mimeType })
      const arrayBuffer = await blob.arrayBuffer()

      const result = await window.ai.transcribeAudio(arrayBuffer, settings.groqKey!)
      setInterimText('')

      if (result.success && result.transcript) {
        setInput(prev => (prev ? `${prev} ${result.transcript}` : result.transcript!).trim())
      } else {
        addMessage({ role: 'system', content: `⚠ Transcription failed: ${result.error}` })
      }
    }

    rec.start(250) // collect chunks every 250ms so blob is never empty
    setRecording(true)
  }, [isRecording, settings.groqKey, setRecording, addMessage])

  // Cleanup on unmount
  useEffect(() => () => { mediaRecRef.current?.stop() }, [])

  return (
    <div
      className="relative px-5 py-3 shrink-0"
      style={{ borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-inputbar)', backdropFilter: 'blur(8px)' }}
    >
      {isRecording && (
        <div className="absolute bottom-full left-0 right-0 pb-1 px-0">
          <VoiceIndicator onStop={() => mediaRecRef.current?.stop()} />
        </div>
      )}

      {interimText && (
        <div className="mb-1.5 px-1 font-mono text-xs text-[var(--accent)] truncate label-caps" style={{ fontSize: 9 }}>
          {interimText}<span className="cursor-blink">_</span>
        </div>
      )}

      <div className="flex items-center gap-2">
        <span className="font-mono text-[var(--accent)] text-sm shrink-0 select-none">›</span>

        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          placeholder="ENTER_COMMAND..."
          disabled={isLoading || isRecording}
          rows={1}
          className="flex-1 font-mono text-sm resize-none outline-none disabled:opacity-40 bg-transparent"
          style={{ minHeight: '38px', maxHeight: '120px', color: 'var(--text-primary)', caretColor: 'var(--accent)' }}
        />

        <button
          onClick={handleVoice}
          className={`flex-shrink-0 w-8 h-8 flex items-center justify-center transition-all active:scale-95 ${
            isRecording ? 'text-[#ffb4ab]' : 'text-[#8e9192] hover:text-[var(--accent)]'
          }`}
          title="Voice input"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8"/>
          </svg>
        </button>

        <button
          onClick={isLoading ? handleStop : wrappedSend}
          disabled={!isLoading && (!input.trim() || sendingRef.current)}
          className="flex-shrink-0 w-8 h-8 flex items-center justify-center transition-all active:scale-95 disabled:opacity-30"
          style={{
            background: isLoading ? 'rgba(255,180,171,0.15)' : 'rgba(var(--accent-rgb),0.12)',
            border: `1px solid ${isLoading ? 'rgba(255,180,171,0.3)' : 'rgba(var(--accent-rgb),0.25)'}`,
            borderRadius: '2px',
            color: isLoading ? '#ffb4ab' : 'var(--accent)',
          }}
          title={isLoading ? 'Stop' : 'Send (Enter)'}
        >
          {isLoading ? (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><rect width="10" height="10" /></svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 19V5M5 12l7-7 7 7"/>
            </svg>
          )}
        </button>
      </div>
    </div>
  )
}
