import React, { useState, useRef, KeyboardEvent, useCallback, useEffect } from 'react'
import { useChatStore } from '../stores/chatStore'
import VoiceIndicator from './VoiceIndicator'
import { ollamaChatStream, openRouterChatStream, ChatMessage } from '../lib/ollama'
import { speak, stop as ttsStop } from '../lib/tts'
import { startVAD, VADInstance, isNoiseTranscript } from '../lib/vad'
import { WordBuffer } from '../lib/sentenceBuffer'

const SYSTEM_PROMPTS: Record<string, string> = {
  assistant: 'You are Zero, a helpful desktop AI assistant. Answer clearly and concisely. Remember all previous messages in this conversation.',
  coder:     'You are Zero, an expert coding assistant. Write clean, working code in markdown code blocks with the language specified. Be direct and precise. Remember all previous messages in this conversation.',
}

const LLM_CTX = '__LLM_CONTEXT__:'

const MIME = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
  ? 'audio/webm;codecs=opus'
  : 'audio/webm'

export default function InputBar(): React.JSX.Element {
  const [input, setInput]             = useState('')
  const [interimText, setInterimText] = useState('')
  const [vadVolume, setVadVolume]     = useState(0)

  const {
    isLoading, isRecording, messages, addMessage, updateLastMessage,
    setLoading, setRecording, mode, settings, setProvider, ollamaOnline,
  } = useChatStore()

  const textareaRef   = useRef<HTMLTextAreaElement>(null)
  const sendingRef    = useRef(false)
  const abortRef      = useRef<AbortController | null>(null)

  // Manual PTT refs
  const manualRecRef  = useRef<MediaRecorder | null>(null)
  const manualChunks  = useRef<Blob[]>([])

  // Auto-listen refs — InputBar owns the mic stream lifecycle
  const micStreamRef  = useRef<MediaStream | null>(null)
  const vadRef        = useRef<VADInstance | null>(null)
  const vadRecRef     = useRef<MediaRecorder | null>(null)
  const vadChunks     = useRef<Blob[]>([])
  const autoActiveRef = useRef(false)

  const isAutoMode = settings.voiceMode === 'auto'
  const isTTSOn    = settings.ttsEnabled

  // ─── Build message history ────────────────────────────────────────────────
  const buildMessages = useCallback((userText: string, extraContext = ''): ChatMessage[] => {
    const history: ChatMessage[] = messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .filter(m => m.content.trim())
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))
    return [
      { role: 'system', content: (SYSTEM_PROMPTS[mode] || SYSTEM_PROMPTS.assistant) + extraContext },
      ...history,
      { role: 'user', content: userText },
    ]
  }, [messages, mode])

  // ─── Core send ────────────────────────────────────────────────────────────
  const sendText = useCallback(async (text: string) => {
    if (!text.trim() || isLoading || sendingRef.current) return
    sendingRef.current = true

    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    addMessage({ role: 'user', content: text })
    ttsStop()

    // Load memories for context injection
    let memoryContext = ''
    try {
      const memories: Array<{id: string; text: string; createdAt: number}> = await window.ai.memoryGet()
      if (memories.length > 0) {
        memoryContext = '\n\nThings the user has asked you to remember:\n' +
          memories.slice(-20).map(m => `• ${m.text}`).join('\n')
      }
    } catch { /* ignore */ }

    // ── System commands — call once ──
    let sysResult: string | null = null
    try {
      sysResult = await window.ai.systemCommand(text)
      if (sysResult !== null && !sysResult.startsWith(LLM_CTX)) {
        if (sysResult === '__COPY_LAST__') {
          const lastMsg = [...messages].reverse().find(m => m.role === 'assistant' && m.content.trim())
          if (lastMsg) {
            try { await navigator.clipboard.writeText(lastMsg.content) } catch {}
            addMessage({ role: 'assistant', content: '✅ Copied last response to clipboard.' })
          }
          sendingRef.current = false
          return
        }
        addMessage({ role: 'assistant', content: sysResult })
        if (isTTSOn) void speak(sysResult)
        sendingRef.current = false
        return
      }
    } catch { /* fall through */ }

    // ── Plugin triggers ──
    try {
      const plugins = await window.ai.listPlugins()
      const lower   = text.toLowerCase()
      const hit     = plugins.find(p => p.triggers.some(t => lower.includes(t.toLowerCase())))
      if (hit) {
        setLoading(true)
        addMessage({ role: 'assistant', content: '', isStreaming: true })
        try {
          const res = await window.ai.runPlugin(hit.name, text)
          updateLastMessage(res)
          if (isTTSOn) void speak(res)
        } catch (e) {
          updateLastMessage(`⚠️ Plugin error: ${String(e)}`)
        } finally {
          setLoading(false); sendingRef.current = false
        }
        return
      }
    } catch { /* fall through */ }

    // ── LLM ──
    setLoading(true)
    addMessage({ role: 'assistant', content: '', isStreaming: true })

    // __LLM_CONTEXT__ prefix = inject diff/context as direct LLM prompt
    let llmInput = text
    if (sysResult?.startsWith(LLM_CTX)) llmInput = sysResult.slice(LLM_CTX.length)

    const model    = mode === 'coder' ? (settings.coderModel || 'codellama') : (settings.chatModel || 'mistral')
    const msgs     = llmInput !== text
      ? [{ role: 'system' as const, content: 'You are Zero, a helpful AI assistant. Be concise.' }, { role: 'user' as const, content: llmInput }]
      : buildMessages(text, memoryContext)
    const abort    = new AbortController()
    abortRef.current = abort
    let accumulated = ''

    // ElevenLabs: batch=6 words (prefetch pipeline closes the gap between chunks)
    // OS voices:  batch=4 words (instant local TTS)
    const streamWithTTS = async (fn: (cb: (c: string) => void) => Promise<void>): Promise<boolean> => {
      const batchSize = isTTSOn ? (settings.elevenLabsKey ? 6 : 4) : 0
      const buf = batchSize > 0 ? new WordBuffer(batchSize) : null
      try {
        await fn(chunk => {
          accumulated += chunk
          updateLastMessage(accumulated)
          if (buf) buf.push(chunk).forEach(batch => { void speak(batch) })
        })
        if (buf) { const tail = buf.flush(); if (tail.trim()) void speak(tail) }
        return true
      } catch (e: unknown) {
        return (e as { name?: string }).name === 'AbortError'
      }
    }

    if (ollamaOnline) {
      setProvider('ollama')
      const ok = await streamWithTTS(cb => ollamaChatStream(model, msgs, cb, abort.signal))
      if (ok) {
        if (!accumulated) updateLastMessage(`> MODEL_NOT_FOUND\n\nPull the model:\n  ollama pull ${model}`)
        return
      }
      accumulated = ''; updateLastMessage('')
    }

    if (settings.openrouterKey) {
      setProvider('openrouter')
      const orModel = settings.openrouterModel || 'mistralai/mistral-7b-instruct:free'
      const ok = await streamWithTTS(cb => openRouterChatStream(settings.openrouterKey!, orModel, msgs, cb, abort.signal))
      if (ok) {
        if (!accumulated) updateLastMessage('> EMPTY_RESPONSE from OpenRouter')
        return
      }
      updateLastMessage('> OPENROUTER_ERROR'); return
    }

    updateLastMessage('> NO_LLM_AVAILABLE\n\nOllama is offline and no OpenRouter key is set.\nStart Ollama:  ollama serve\nOr add an OpenRouter key in Settings.')
  }, [isLoading, mode, settings, ollamaOnline, messages, addMessage, updateLastMessage, setLoading, setProvider, buildMessages, isTTSOn])

  const handleStop = () => { abortRef.current?.abort(); ttsStop() }

  const wrappedSend = useCallback(async () => {
    try { await sendText(input.trim()) }
    finally { setLoading(false); sendingRef.current = false; abortRef.current = null }
  }, [input, sendText, setLoading])

  // ─── Manual push-to-talk ── directly sends, never puts text in box ────────
  const handleVoice = useCallback(async () => {
    // Stop if already recording
    if (isRecording) { manualRecRef.current?.stop(); return }

    if (!settings.groqKey) {
      addMessage({ role: 'system', content: '⚠ Voice requires a Groq API key. Add it in Settings → VOICE_INPUT.' })
      return
    }

    let stream: MediaStream
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }) }
    catch { addMessage({ role: 'system', content: '⚠ Microphone access denied.' }); return }

    manualChunks.current = []
    const rec = new MediaRecorder(stream, { mimeType: MIME })
    manualRecRef.current = rec

    rec.ondataavailable = e => { if (e.data.size > 0) manualChunks.current.push(e.data) }
    rec.onstop = async () => {
      stream.getTracks().forEach(t => t.stop())
      setRecording(false)
      setInterimText('TRANSCRIBING...')

      const blob = new Blob(manualChunks.current, { type: MIME })
      const buf  = await blob.arrayBuffer()
      const res  = await window.ai.transcribeAudio(buf, settings.groqKey!)
      setInterimText('')

      if (res.success && res.transcript?.trim()) {
        // Auto-send — no text box involvement
        try { await sendText(res.transcript.trim()) }
        finally { setLoading(false); sendingRef.current = false; abortRef.current = null }
      } else if (!res.success) {
        addMessage({ role: 'system', content: `⚠ Transcription failed: ${res.error}` })
      }
    }

    rec.start(250)
    setRecording(true)
  }, [isRecording, settings.groqKey, setRecording, addMessage, sendText, setLoading])

  // ─── Auto-listen VAD loop ─────────────────────────────────────────────────
  // InputBar creates ONE mic stream and shares it between:
  //   • VAD AnalyserNode (for energy detection)
  //   • MediaRecorder (for capturing speech audio)
  const startAutoListen = useCallback(async () => {
    if (!settings.groqKey || autoActiveRef.current) return
    autoActiveRef.current = true

    let micStream: MediaStream
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    } catch {
      autoActiveRef.current = false
      return
    }
    micStreamRef.current = micStream

    try {
      const vad = startVAD({
        stream:      micStream,
        threshold:   28,
        silenceMs:   1800,
        minSpeechMs: 1000,
        onVolume:    v => setVadVolume(v),

        onSpeechStart: () => {
          ttsStop()   // kill TTS so we don't record our own voice
          if (sendingRef.current) return   // still generating — skip this utterance

          setRecording(true)
          setInterimText('LISTENING...')
          vadChunks.current = []

          try {
            const r = new MediaRecorder(micStream, { mimeType: MIME })
            vadRecRef.current = r
            r.ondataavailable = e => { if (e.data.size > 0) vadChunks.current.push(e.data) }
            r.start(100)
          } catch (e) {
            console.error('[VAD] recorder failed:', e)
            setRecording(false); setInterimText('')
          }
        },

        onSpeechEnd: async () => {
          setRecording(false)
          const rec = vadRecRef.current
          if (!rec || rec.state === 'inactive') { setInterimText(''); return }

          await new Promise<void>(done => {
            rec.onstop = () => done()
            try { rec.stop() } catch { done() }
          })
          vadRecRef.current = null

          if (vadChunks.current.length === 0) { setInterimText(''); return }

          setInterimText('TRANSCRIBING...')
          const blob = new Blob(vadChunks.current, { type: MIME })
          const buf  = await blob.arrayBuffer()
          const res  = await window.ai.transcribeAudio(buf, settings.groqKey!)
          setInterimText('')

          if (res.success && res.transcript?.trim() && !isNoiseTranscript(res.transcript)) {
            try { await sendText(res.transcript.trim()) }
            finally { setLoading(false); sendingRef.current = false; abortRef.current = null }
          }
        },
      })

      vadRef.current = vad
    } catch {
      micStream.getTracks().forEach(t => t.stop())
      micStreamRef.current = null
      autoActiveRef.current = false
    }
  }, [settings.groqKey, sendText, setRecording, setLoading])

  const stopAutoListen = useCallback(() => {
    vadRef.current?.stop()
    vadRef.current = null
    // Stop the mic stream — release hardware
    micStreamRef.current?.getTracks().forEach(t => t.stop())
    micStreamRef.current = null
    autoActiveRef.current = false
    setVadVolume(0)
    setRecording(false)
    setInterimText('')
  }, [setRecording])

  useEffect(() => {
    if (isAutoMode && settings.groqKey) startAutoListen()
    else stopAutoListen()
    return () => stopAutoListen()
  }, [isAutoMode, settings.groqKey]) // eslint-disable-line

  useEffect(() => () => {
    manualRecRef.current?.stop()
    stopAutoListen()
  }, []) // eslint-disable-line

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); wrappedSend() }
  }
  const handleInput = () => {
    const el = textareaRef.current
    if (el) { el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 120)}px` }
  }

  return (
    <div
      className="relative px-5 py-3 shrink-0"
      style={{ borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-inputbar)', backdropFilter: 'blur(8px)' }}
    >
      {isRecording && (
        <div className="absolute bottom-full left-0 right-0 pb-1 px-0">
          <VoiceIndicator
            onStop={isAutoMode ? stopAutoListen : () => manualRecRef.current?.stop()}
            volume={vadVolume}
          />
        </div>
      )}

      {interimText && (
        <div className="mb-1.5 px-1 font-mono label-caps" style={{ fontSize: 9, color: 'var(--accent)' }}>
          {interimText}<span className="cursor-blink">_</span>
        </div>
      )}

      <div className="flex items-center gap-2">
        <span className="font-mono text-sm shrink-0 select-none" style={{ color: 'var(--accent)' }}>›</span>

        <textarea
          ref={textareaRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          placeholder={isAutoMode ? 'AUTO_LISTEN_ACTIVE — or type here...' : 'ENTER_COMMAND...'}
          disabled={isLoading || isRecording}
          rows={1}
          className="flex-1 font-mono text-sm resize-none outline-none disabled:opacity-40 bg-transparent"
          style={{ minHeight: '38px', maxHeight: '120px', color: 'var(--text-primary)', caretColor: 'var(--accent)' }}
        />

        {settings.voiceMode !== 'off' && (
          <button
            onClick={isAutoMode ? (isRecording ? stopAutoListen : startAutoListen) : handleVoice}
            className="flex-shrink-0 w-8 h-8 flex items-center justify-center transition-all active:scale-95"
            style={{ color: isRecording ? '#ffb4ab' : isAutoMode ? 'var(--accent)' : 'var(--text-muted)' }}
            title={isAutoMode ? (isRecording ? 'Stop listening' : 'Listening (auto)') : 'Voice input (auto-sends)'}
          >
            {isAutoMode && !isRecording ? (
              <div style={{ position: 'relative', width: 14, height: 14 }}>
                <div style={{
                  position: 'absolute', inset: -3, borderRadius: '50%',
                  border: '1px solid rgba(var(--accent-rgb),0.4)',
                  animation: 'ring-pulse 2s ease-in-out infinite',
                }} />
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8"/>
                </svg>
              </div>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8"/>
              </svg>
            )}
          </button>
        )}

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
