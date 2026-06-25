import React, { useState, useRef, KeyboardEvent, useCallback, useEffect } from 'react'
import { useChatStore } from '../stores/chatStore'
import VoiceIndicator from './VoiceIndicator'
import { ollamaChatStream, openRouterChatStream, ChatMessage } from '../lib/ollama'
import { speak, stop as ttsStop, isSpeaking } from '../lib/tts'
import { startVAD, VADInstance, isNoiseTranscript } from '../lib/vad'
import { WordBuffer } from '../lib/sentenceBuffer'

const SYSTEM_PROMPTS: Record<string, string> = {
  assistant: 'You are Zero, a helpful desktop AI assistant. Answer clearly and concisely. Remember all previous messages in this conversation.',
  coder:     'You are Zero, an expert coding assistant. Write clean, working code in markdown code blocks with the language specified. Be direct and precise. Remember all previous messages in this conversation.',
}

const LLM_CTX = '__LLM_CONTEXT__:'

export default function InputBar(): React.JSX.Element {
  const [input, setInput]             = useState('')
  const [interimText, setInterimText] = useState('')
  const [vadVolume, setVadVolume]     = useState(0)    // 0-100 for live waveform

  const {
    isLoading, isRecording, messages, addMessage, updateLastMessage,
    setLoading, setRecording, mode, settings, setProvider, ollamaOnline,
  } = useChatStore()

  const textareaRef     = useRef<HTMLTextAreaElement>(null)
  const sendingRef      = useRef(false)
  const abortRef        = useRef<AbortController | null>(null)
  const mediaRecRef     = useRef<MediaRecorder | null>(null)
  const audioChunks     = useRef<Blob[]>([])
  const vadRef          = useRef<VADInstance | null>(null)
  const vadRecRef       = useRef<MediaRecorder | null>(null)
  const vadChunks       = useRef<Blob[]>([])
  const autoListenRef   = useRef(false)  // whether VAD loop is active
  const isAutoMode      = settings.voiceMode === 'auto'
  const isTTSOn         = settings.ttsEnabled

  // ─── Build message history ────────────────────────────────────────────────
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

  // ─── Core send ───────────────────────────────────────────────────────────
  const sendText = useCallback(async (text: string) => {
    if (!text.trim() || isLoading || sendingRef.current) return
    sendingRef.current = true

    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    addMessage({ role: 'user', content: text })
    ttsStop()  // stop any ongoing speech before responding

    // ── System commands ──
    const LLM_BYPASS_CTX = LLM_CTX
    try {
      const sysResult = await window.ai.systemCommand(text)
      if (sysResult !== null) {
        if (!sysResult.startsWith(LLM_BYPASS_CTX)) {
          addMessage({ role: 'assistant', content: sysResult })
          if (isTTSOn) await speak(sysResult)
          sendingRef.current = false
          return
        }
        // Falls through with injected LLM context below
      }
    } catch { /* fall through */ }

    // ── Plugin triggers ──
    try {
      const pluginList = await window.ai.listPlugins()
      const lower = text.toLowerCase()
      const matched = pluginList.find(p => p.triggers.some(t => lower.includes(t.toLowerCase())))
      if (matched) {
        setLoading(true)
        addMessage({ role: 'assistant', content: '', isStreaming: true })
        try {
          const pluginResult = await window.ai.runPlugin(matched.name, text)
          updateLastMessage(pluginResult)
          if (isTTSOn) await speak(pluginResult)
        } catch (err) {
          updateLastMessage(`⚠️ Plugin error: ${String(err)}`)
        } finally {
          setLoading(false); sendingRef.current = false
        }
        return
      }
    } catch { /* fall through */ }

    // ── LLM call ──
    setLoading(true)
    addMessage({ role: 'assistant', content: '', isStreaming: true })

    // If system command returned __LLM_CONTEXT__, use that as the prompt
    let llmInput = text
    try {
      const sysResult2 = await window.ai.systemCommand(text)
      if (sysResult2?.startsWith(LLM_BYPASS_CTX)) {
        llmInput = sysResult2.slice(LLM_BYPASS_CTX.length)
      }
    } catch { /* use original text */ }

    const model        = mode === 'coder' ? (settings.coderModel || 'codellama') : (settings.chatModel || 'mistral')
    const chatMessages = llmInput !== text
      ? [{ role: 'system' as const, content: 'You are Zero, a helpful AI assistant. Be concise.' }, { role: 'user' as const, content: llmInput }]
      : buildMessages(text)
    const abort = new AbortController()
    abortRef.current = abort
    let accumulated = ''

    // Streaming TTS: speak every N words as they arrive.
    // ElevenLabs batch=12 (fewer calls), OS voices batch=5 (near-instant).
    const streamWithTTS = async (
      streamFn: (onChunk: (c: string) => void) => Promise<void>
    ): Promise<boolean> => {
      const batchSize = isTTSOn ? (settings.elevenLabsKey ? 12 : 5) : 0
      const buf = batchSize > 0 ? new WordBuffer(batchSize) : null
      try {
        await streamFn(chunk => {
          accumulated += chunk
          updateLastMessage(accumulated)
          if (buf) buf.push(chunk).forEach(batch => { void speak(batch) })
        })
        if (buf) {
          const tail = buf.flush()
          if (tail.trim()) void speak(tail)
        }
        return true
      } catch (err: unknown) {
        if ((err as { name?: string }).name === 'AbortError') return true
        return false
      }
    }

    if (ollamaOnline) {
      setProvider('ollama')
      const ok = await streamWithTTS(onChunk =>
        ollamaChatStream(model, chatMessages, onChunk, abort.signal)
      )
      if (ok) {
        if (!accumulated) updateLastMessage(`> MODEL_NOT_FOUND\n\nPull the model:\n  ollama pull ${model}`)
        return
      }
      accumulated = ''; updateLastMessage('')
    }

    if (settings.openrouterKey) {
      setProvider('openrouter')
      const orModel = settings.openrouterModel || 'mistralai/mistral-7b-instruct:free'
      const ok = await streamWithTTS(onChunk =>
        openRouterChatStream(settings.openrouterKey!, orModel, chatMessages, onChunk, abort.signal)
      )
      if (ok) {
        if (!accumulated) updateLastMessage('> EMPTY_RESPONSE from OpenRouter')
        return
      }
      updateLastMessage(`> OPENROUTER_ERROR`); return
    }

    updateLastMessage('> NO_LLM_AVAILABLE\n\nOllama is offline and no OpenRouter key is set.\nStart Ollama:  ollama serve\nOr add an OpenRouter key in Settings.')
  }, [isLoading, mode, settings, ollamaOnline, messages, addMessage, updateLastMessage, setLoading, setProvider, buildMessages, isTTSOn])

  const handleStop = () => { abortRef.current?.abort(); ttsStop() }

  const wrappedSend = useCallback(async () => {
    try { await sendText(input.trim()) }
    finally { setLoading(false); sendingRef.current = false; abortRef.current = null }
  }, [input, sendText, setLoading])

  // ─── Manual voice (button) ────────────────────────────────────────────────
  const handleVoice = useCallback(async () => {
    if (isRecording) { mediaRecRef.current?.stop(); return }
    if (!settings.groqKey) {
      addMessage({ role: 'system', content: '⚠ Voice requires a Groq API key. Add it in Settings → VOICE_INPUT.' })
      return
    }
    let stream: MediaStream
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }) }
    catch { addMessage({ role: 'system', content: '⚠ Microphone access denied.' }); return }

    audioChunks.current = []
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm'
    const rec = new MediaRecorder(stream, { mimeType })
    mediaRecRef.current = rec
    rec.ondataavailable = e => { if (e.data.size > 0) audioChunks.current.push(e.data) }
    rec.onstop = async () => {
      stream.getTracks().forEach(t => t.stop())
      setRecording(false)
      setInterimText('TRANSCRIBING...')
      const blob = new Blob(audioChunks.current, { type: mimeType })
      const buf  = await blob.arrayBuffer()
      const res  = await window.ai.transcribeAudio(buf, settings.groqKey!)
      setInterimText('')
      if (res.success && res.transcript) setInput(prev => (prev ? `${prev} ${res.transcript}` : res.transcript!).trim())
      else addMessage({ role: 'system', content: `⚠ Transcription failed: ${res.error}` })
    }
    rec.start(250)
    setRecording(true)
  }, [isRecording, settings.groqKey, setRecording, addMessage])

  // ─── Auto-listen VAD loop ─────────────────────────────────────────────────
  const startAutoListen = useCallback(async () => {
    if (!settings.groqKey || autoListenRef.current) return
    autoListenRef.current = true

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm'

    try {
      const vad = await startVAD({
        threshold:   38,
        silenceMs:   1800,
        minSpeechMs: 1200,
        onVolume: v => setVadVolume(v),
        onSpeechStart: () => {
          if (isSpeaking()) { ttsStop(); return }  // stop TTS so it doesn't record itself
          if (sendingRef.current) return
          setRecording(true)
          setInterimText('LISTENING...')
          vadChunks.current = []
          const rec = new MediaRecorder(new MediaStream(), { mimeType })
          // We need a fresh stream from the VAD's stream — reuse by creating own recorder
          navigator.mediaDevices.getUserMedia({ audio: true }).then(s => {
            const r = new MediaRecorder(s, { mimeType })
            vadRecRef.current = r
            r.ondataavailable = e => { if (e.data.size > 0) vadChunks.current.push(e.data) }
            r.start(250)
          }).catch(() => {})
          void rec
        },
        onSpeechEnd: async () => {
          setRecording(false)
          const rec = vadRecRef.current
          if (!rec) { setInterimText(''); return }

          await new Promise<void>(res => {
            rec.onstop = () => res()
            rec.stop()
            rec.stream?.getTracks().forEach(t => t.stop())
          })
          vadRecRef.current = null

          if (vadChunks.current.length === 0) { setInterimText(''); return }

          setInterimText('TRANSCRIBING...')
          const blob = new Blob(vadChunks.current, { type: mimeType })
          const buf  = await blob.arrayBuffer()
          const res  = await window.ai.transcribeAudio(buf, settings.groqKey!)
          setInterimText('')

          if (res.success && res.transcript?.trim() && !isNoiseTranscript(res.transcript)) {
            // Auto-send directly without user pressing anything
            const transcript = res.transcript.trim()
            try { await sendText(transcript) }
            finally { setLoading(false); sendingRef.current = false; abortRef.current = null }
          }
        },
      })
      vadRef.current = vad
    } catch {
      autoListenRef.current = false
    }
  }, [settings.groqKey, sendText, setRecording, setLoading])

  const stopAutoListen = useCallback(() => {
    vadRef.current?.stop()
    vadRef.current = null
    autoListenRef.current = false
    setVadVolume(0)
    setRecording(false)
    setInterimText('')
  }, [setRecording])

  // Start/stop auto-listen when voiceMode changes
  useEffect(() => {
    if (isAutoMode && settings.groqKey) {
      startAutoListen()
    } else {
      stopAutoListen()
    }
    return () => stopAutoListen()
  }, [isAutoMode, settings.groqKey]) // eslint-disable-line

  // Cleanup on unmount
  useEffect(() => () => {
    mediaRecRef.current?.stop()
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
      {/* Voice indicator — shown for both manual recording and auto-VAD listening */}
      {isRecording && (
        <div className="absolute bottom-full left-0 right-0 pb-1 px-0">
          <VoiceIndicator
            onStop={isAutoMode ? stopAutoListen : () => mediaRecRef.current?.stop()}
            volume={vadVolume}
          />
        </div>
      )}

      {interimText && (
        <div className="mb-1.5 px-1 font-mono text-xs truncate label-caps" style={{ fontSize: 9, color: 'var(--accent)' }}>
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

        {/* Auto-listen indicator / manual mic button */}
        {settings.voiceMode !== 'off' && (
          <button
            onClick={isAutoMode ? (isRecording ? stopAutoListen : startAutoListen) : handleVoice}
            className="flex-shrink-0 w-8 h-8 flex items-center justify-center transition-all active:scale-95"
            style={{ color: isRecording ? '#ffb4ab' : isAutoMode ? 'var(--accent)' : 'var(--text-muted)' }}
            title={isAutoMode ? (isRecording ? 'Stop listening' : 'Listening (auto-on)') : 'Voice input'}
          >
            {isAutoMode && !isRecording ? (
              // Animated rings = always listening
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

        {/* Send / Stop */}
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
