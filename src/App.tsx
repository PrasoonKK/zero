import React, { useEffect, useRef, useState } from 'react'
import { useChatStore } from './stores/chatStore'
import ChatWindow from './components/ChatWindow'
import InputBar from './components/InputBar'
import SettingsPanel from './components/SettingsPanel'
import AgentPanel from './components/AgentPanel'
import HomePage from './components/HomePage'
import { ollamaStatus } from './lib/ollama'
import { speak, configureTTS } from './lib/tts'

type View = 'home' | 'chat'

export default function App(): React.JSX.Element {
  const [view, setView]           = useState<View>('home')
  const [updateReady, setUpdateReady] = useState(false)
  const greetedRef = useRef(false)

  const {
    settingsOpen, toggleSettings, setSettings, setOllamaOnline,
    mode, setMode, clearMessages, clearAgentSteps,
    ollamaOnline, isLoading, provider, settings, messages,
  } = useChatStore()

  const activeModel = mode === 'coder' ? settings.coderModel : settings.chatModel
  const contextPct  = Math.min(messages.length * 5, 100)
  const statusColor = isLoading ? '#ffffff' : ollamaOnline ? 'var(--accent)' : '#ffb4ab'
  const statusText  = isLoading ? 'GENERATING' : ollamaOnline ? 'ONLINE' : 'OFFLINE'

  useEffect(() => {
    document.documentElement.classList.toggle('light', settings.theme === 'light')
  }, [settings.theme])

  useEffect(() => {
    configureTTS({ elevenLabsKey: settings.elevenLabsKey || '' })
  }, [settings.elevenLabsKey])

  useEffect(() => {
    const c = settings.accentColor || '#7bd6d1'
    document.documentElement.style.setProperty('--accent', c)
    // Derive rgba variants from hex for glow/bg effects
    const r = parseInt(c.slice(1,3),16), g = parseInt(c.slice(3,5),16), b = parseInt(c.slice(5,7),16)
    document.documentElement.style.setProperty('--accent-rgb', `${r},${g},${b}`)
  }, [settings.accentColor])

  useEffect(() => {
    window.ai.getSettings().then((saved) => {
      const u: Partial<typeof settings> = {}
      if (saved['chatModel'])       u.chatModel       = saved['chatModel']
      if (saved['coderModel'])      u.coderModel      = saved['coderModel']
      if (saved['hotkey'])          u.hotkey          = saved['hotkey']
      if (saved['theme'])           u.theme           = saved['theme'] as 'dark' | 'light'
      if (saved['accentColor'])     u.accentColor     = saved['accentColor']
      if (saved['openrouterKey'])   u.openrouterKey   = saved['openrouterKey']
      if (saved['openrouterModel']) u.openrouterModel = saved['openrouterModel']
      if (saved['groqKey'])         u.groqKey         = saved['groqKey']
      if (saved['voiceMode'])       u.voiceMode       = saved['voiceMode'] as 'off' | 'manual' | 'auto'
      if (saved['ttsEnabled'])      u.ttsEnabled      = saved['ttsEnabled'] === 'true'
      if (saved['elevenLabsKey'])   u.elevenLabsKey   = saved['elevenLabsKey']
      if (Object.keys(u).length) setSettings(u)
    }).catch(() => {})

    const check = async () => {
      const online = await ollamaStatus().catch(() => false)
      setOllamaOnline(online)
      // Greet once on first successful connection — only if TTS is enabled
      if (online && !greetedRef.current && settings.ttsEnabled) {
        greetedRef.current = true
        const hour = new Date().getHours()
        const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
        setTimeout(() => speak(`${greeting}. Zero is online and ready.`), 800)
      }
    }
    check()
    const id = setInterval(check, 15000)

    // Listen for auto-updater events from main process
    const onUpdateReady = () => setUpdateReady(true)
    window.addEventListener('update:ready' as never, onUpdateReady)

    return () => {
      clearInterval(id)
      window.removeEventListener('update:ready' as never, onUpdateReady)
    }
  }, [setSettings, setOllamaOnline]) // eslint-disable-line

  const handleNavigate = (m: 'assistant' | 'coder' | 'agent') => {
    if (m !== mode) { setMode(m); clearMessages(); clearAgentSteps() }
    setView('chat')
  }

  const handleSidebarMode = (m: 'assistant' | 'coder' | 'agent') => {
    if (m !== mode) { setMode(m); clearMessages(); clearAgentSteps() }
    setView('chat')
  }

  const sidebarItems = [
    { key: 'home',      label: 'HOME' },
    { key: 'assistant', label: 'ASSISTANT' },
    { key: 'coder',     label: 'CODER' },
    { key: 'agent',     label: 'AGENT' },
  ] as const

  const activeKey = view === 'home' ? 'home' : mode

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', background: 'var(--bg-base)', color: 'var(--text-primary)', overflow: 'hidden', userSelect: 'none' }}>
      <div className="scanline-overlay" />

      {/* ─── Sidebar ───────────────────────────────────── */}
      <aside style={{
        width: 192, flexShrink: 0, display: 'flex', flexDirection: 'column',
        borderRight: '1px solid var(--border-subtle)',
        background: 'var(--bg-surface)',
        zIndex: 10,
      }}>
        {/* Node status */}
        <div style={{ padding: '28px 24px 20px', borderBottom: '1px solid var(--border-dim)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
              background: ollamaOnline ? 'var(--accent)' : 'rgba(255,180,171,0.7)',
              boxShadow: ollamaOnline ? '0 0 6px rgba(var(--accent-rgb),0.6)' : 'none',
              animation: ollamaOnline ? 'ring-pulse 2s ease-in-out infinite' : 'none',
            }} />
            <span className="label-caps" style={{ fontSize: 9, color: 'var(--text-muted)' }}>
              {ollamaOnline ? 'NODE_ACTIVE' : 'NODE_OFFLINE'}
            </span>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, paddingTop: 12, paddingBottom: 12 }}>
          {sidebarItems.map(({ key, label }) => {
            const isActive = activeKey === key
            return (
              <button
                key={key}
                onClick={() => key === 'home' ? setView('home') : handleSidebarMode(key as 'assistant' | 'coder' | 'agent')}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center',
                  padding: '12px 24px',
                  borderLeft: `2px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
                  background: isActive ? 'rgba(var(--accent-rgb),0.07)' : 'transparent',
                  color: isActive ? 'var(--accent)' : 'var(--text-muted)',
                  cursor: 'pointer', transition: 'all 0.15s ease',
                  textAlign: 'left',
                }}
                onMouseEnter={e => { if (!isActive) { (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'; (e.currentTarget as HTMLElement).style.background = 'var(--bg-surface-hv)' } }}
                onMouseLeave={e => { if (!isActive) { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; (e.currentTarget as HTMLElement).style.background = 'transparent' } }}
              >
                <span className="label-caps" style={{ fontSize: 10 }}>{label}</span>
              </button>
            )
          })}
        </nav>

        {/* Settings */}
        <div style={{ borderTop: '1px solid var(--border-dim)', paddingTop: 8, paddingBottom: 8 }}>
          <button
            onClick={toggleSettings}
            style={{
              width: '100%', display: 'flex', alignItems: 'center',
              padding: '12px 24px', borderLeft: '2px solid transparent',
              color: 'var(--text-muted)', cursor: 'pointer', transition: 'all 0.15s ease',
              background: 'transparent',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'; (e.currentTarget as HTMLElement).style.background = 'var(--bg-surface-hv)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; (e.currentTarget as HTMLElement).style.background = 'transparent' }}
          >
            <span className="label-caps" style={{ fontSize: 10 }}>SETTINGS</span>
          </button>
        </div>
      </aside>

      {/* ─── Main ─────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>

        {/* Header */}
        <header style={{
          flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 32px',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--bg-header)', backdropFilter: 'blur(8px)',
        }}>
          <div>
            {view === 'home' ? (
              <span className="label-caps" style={{ fontSize: 9, color: 'var(--text-muted)' }}>SYSTEM_DASHBOARD</span>
            ) : (
              <>
                <span className="label-caps" style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                  {mode === 'assistant' ? 'NEURAL ASSISTANT' : mode === 'coder' ? 'CODE SYNTHESIS' : 'TASK EXECUTION'}
                </span>
                {isLoading && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                    <span style={{
                      width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)',
                      animation: 'ring-pulse 0.7s ease-in-out infinite',
                    }} />
                    <span className="label-caps" style={{ fontSize: 9, color: 'var(--accent)' }}>PROCESSING</span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Right side: NODE_STATUS + MODEL_ID + STATUS */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 36 }}>
            <div style={{ textAlign: 'right' }}>
              <div className="label-caps" style={{ fontSize: 8, color: 'var(--text-muted)' }}>NODE_STATUS</div>
              <div className="font-mono" style={{ fontSize: 13, color: statusColor, marginTop: 2, fontWeight: 500 }}>{statusText}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="label-caps" style={{ fontSize: 8, color: 'var(--text-muted)' }}>MODEL_ID</div>
              <div className="font-mono" style={{ fontSize: 13, color: 'var(--accent)', marginTop: 2, fontWeight: 500 }}>{activeModel}</div>
            </div>
            {provider === 'openrouter' && (
              <div style={{ textAlign: 'right' }}>
                <div className="label-caps" style={{ fontSize: 8, color: 'var(--text-muted)' }}>PROVIDER</div>
                <div className="font-mono" style={{ fontSize: 13, color: '#ffb4ab', marginTop: 2 }}>OPENROUTER</div>
              </div>
            )}
          </div>
        </header>

        {/* Content */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {view === 'home' ? (
            <HomePage onNavigate={handleNavigate} />
          ) : mode === 'agent' ? (
            <AgentPanel />
          ) : (
            <ChatWindow />
          )}
        </div>

        {/* Vitals dock */}
        {view === 'chat' && mode !== 'agent' && contextPct > 0 && (
          <div style={{
            flexShrink: 0, display: 'flex', alignItems: 'center', gap: 24,
            padding: '8px 32px',
            borderTop: '1px solid var(--border-dim)',
            background: 'var(--bg-vitals)',
          }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="label-caps" style={{ fontSize: 8, color: 'var(--text-muted)' }}>CONTEXT_LOAD</span>
                <span className="label-caps" style={{ fontSize: 8, color: 'var(--text-muted)' }}>{contextPct}%</span>
              </div>
              <div style={{ height: 1, background: 'var(--bg-vitals-bar)' }}>
                <div style={{ height: '100%', width: `${contextPct}%`, background: 'var(--accent)', boxShadow: '0 0 8px rgba(var(--accent-rgb),0.5)', transition: 'width 0.7s ease' }} />
              </div>
            </div>
            <span className="label-caps" style={{ fontSize: 8, color: 'var(--text-faint)' }}>CTRL+SHIFT+A</span>
          </div>
        )}

        {/* Input bar */}
        {view === 'chat' && mode !== 'agent' && <InputBar />}
      </div>

      {settingsOpen && <SettingsPanel />}

      {updateReady && (
        <div style={{
          position: 'fixed', bottom: 20, right: 20, zIndex: 100,
          background: 'rgba(var(--accent-rgb),0.12)', border: '1px solid rgba(var(--accent-rgb),0.3)',
          borderRadius: 4, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span className="label-caps" style={{ fontSize: 9, color: 'var(--accent)' }}>UPDATE_READY</span>
          <button
            className="label-caps"
            style={{ fontSize: 9, color: 'var(--accent)', border: '1px solid rgba(var(--accent-rgb),0.3)', padding: '3px 10px', borderRadius: 2 }}
            onClick={() => { setUpdateReady(false); window.location.reload() }}
          >RESTART</button>
          <button style={{ color: '#8e9192', fontSize: 11 }} onClick={() => setUpdateReady(false)}>✕</button>
        </div>
      )}
    </div>
  )
}
