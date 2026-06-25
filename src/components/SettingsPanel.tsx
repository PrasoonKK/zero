import React, { useState, useEffect } from 'react'
import { useChatStore } from '../stores/chatStore'

function Field({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div>
      <div className="label-caps text-[9px] text-[#8e9192] mb-1.5">{label}</div>
      {children}
    </div>
  )
}

const inputClass = "w-full font-mono text-sm placeholder-[#444748] outline-none bg-transparent transition-colors"
const inputStyle: React.CSSProperties = {
  background: 'var(--bg-input)',
  border: '1px solid var(--border-med)',
  padding: '7px 12px',
  borderRadius: '2px',
  color: 'var(--text-primary)',
}
const inputFocusStyle = (focused: boolean): React.CSSProperties => ({
  ...inputStyle,
  borderColor: focused ? 'rgba(var(--accent-rgb),0.4)' : 'var(--border-med)',
})

function FocusInput(props: React.InputHTMLAttributes<HTMLInputElement>): React.JSX.Element {
  const [focused, setFocused] = useState(false)
  return (
    <input
      {...props}
      className={inputClass}
      style={inputFocusStyle(focused)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    />
  )
}

export default function SettingsPanel(): React.JSX.Element {
  const { settings, setSettings, toggleSettings, setCompact, isCompact } = useChatStore()
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') toggleSettings() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [toggleSettings])

  const [saving, setSaving]       = useState(false)
  const [saved, setSaved]         = useState(false)
  const [showKey, setShowKey]     = useState(false)
  const [pluginCount, setPluginCount]  = useState<number | null>(null)
  const [reloading, setReloading] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      const toSave: Record<string, string> = {
        chatModel:   settings.chatModel,
        coderModel:  settings.coderModel,
        hotkey:      settings.hotkey,
        theme:       settings.theme,
        accentColor: settings.accentColor,
      }
      if (settings.openrouterKey)   toSave['openrouterKey']   = settings.openrouterKey
      if (settings.openrouterModel) toSave['openrouterModel'] = settings.openrouterModel
      if (settings.groqKey)         toSave['groqKey']         = settings.groqKey
      if (settings.elevenLabsKey)   toSave['elevenLabsKey']   = settings.elevenLabsKey
      toSave['voiceMode']  = settings.voiceMode
      toSave['ttsEnabled'] = String(settings.ttsEnabled)
      await window.ai.saveSettings(toSave)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  const Section = ({ title }: { title: string }) => (
    <div className="flex items-center gap-3 mb-4">
      <div className="w-1 h-4" style={{ background: 'var(--accent)', borderRadius: '1px' }} />
      <span className="label-caps text-[10px] text-[#e3e2e7]">{title}</span>
    </div>
  )

  const Toggle = ({ on, onClick }: { on: boolean; onClick: () => void }) => (
    <button
      onClick={onClick}
      className="relative w-10 h-5 rounded-full transition-colors overflow-hidden shrink-0"
      style={{ background: on ? 'rgba(var(--accent-rgb),0.3)' : 'rgba(68,71,72,0.5)', border: `1px solid ${on ? 'rgba(var(--accent-rgb),0.5)' : 'rgba(68,71,72,0.6)'}` }}
    >
      <span
        className="absolute top-0.5 left-0 w-4 h-4 rounded-full transition-transform duration-200"
        style={{ background: on ? 'var(--accent)' : '#8e9192', transform: on ? 'translateX(22px)' : 'translateX(2px)' }}
      />
    </button>
  )

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={toggleSettings}
    >
      <div
        className="w-[480px] max-h-[85vh] overflow-y-auto"
        style={{ background: 'var(--bg-surface)', border: '1px solid rgba(var(--accent-rgb),0.15)', borderRadius: '4px', backdropFilter: 'blur(16px)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid var(--border-subtle)' }}
        >
          <div>
            <h2 className="font-ui font-bold text-base text-white">SETTINGS</h2>
            <p className="label-caps text-[8px] text-[#8e9192] mt-0.5">SYSTEM CONFIGURATION</p>
          </div>
          <button onClick={toggleSettings} className="text-[#8e9192] hover:text-[#ffb4ab] transition-colors text-sm">✕</button>
        </div>

        <div className="px-6 py-5 space-y-7">
          {/* Models */}
          <section>
            <Section title="OLLAMA_MODELS" />
            <div className="space-y-3">
              <Field label="CHAT_MODEL">
                <FocusInput
                  type="text"
                  value={settings.chatModel}
                  onChange={e => setSettings({ chatModel: e.target.value })}
                  placeholder="mistral"
                />
              </Field>
              <Field label="CODER_MODEL">
                <FocusInput
                  type="text"
                  value={settings.coderModel}
                  onChange={e => setSettings({ coderModel: e.target.value })}
                  placeholder="codellama"
                />
              </Field>
            </div>
          </section>

          {/* OpenRouter */}
          <section>
            <Section title="OPENROUTER_FALLBACK" />
            <p className="font-mono text-xs text-[#8e9192] mb-3">
              Used automatically when Ollama is offline.{' '}
              <a
                href="https://openrouter.ai/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--accent)] hover:text-[#acfffa] transition-colors"
                onClick={e => e.stopPropagation()}
              >
                Get API key →
              </a>
            </p>
            <div className="space-y-3">
              <Field label="API_KEY">
                <div className="flex gap-2">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={settings.openrouterKey || ''}
                    onChange={e => setSettings({ openrouterKey: e.target.value })}
                    placeholder="sk-or-..."
                    className={`flex-1 ${inputClass}`}
                    style={inputStyle}
                  />
                  <button
                    onClick={() => setShowKey(v => !v)}
                    className="label-caps text-[9px] text-[#8e9192] hover:text-[var(--accent)] px-3 transition-colors"
                    style={{ border: '1px solid rgba(68,71,72,0.4)', borderRadius: '2px' }}
                  >
                    {showKey ? 'HIDE' : 'SHOW'}
                  </button>
                </div>
              </Field>
              <Field label="MODEL_ID">
                <FocusInput
                  type="text"
                  value={settings.openrouterModel || 'mistralai/mistral-7b-instruct:free'}
                  onChange={e => setSettings({ openrouterModel: e.target.value })}
                  placeholder="mistralai/mistral-7b-instruct:free"
                />
              </Field>
            </div>
          </section>

          {/* Plugins */}
          <section>
            <Section title="PLUGINS" />
            <p className="font-mono text-xs text-[#8e9192] mb-3">
              Drop <span className="text-[var(--accent)]">*.plugin.js</span> files in{' '}
              <span className="text-[var(--accent)]">%APPDATA%\zero-ai\plugins\</span>
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={async () => {
                  setReloading(true)
                  try {
                    const list = await window.ai.reloadPlugins()
                    setPluginCount(list.length)
                  } finally { setReloading(false) }
                }}
                disabled={reloading}
                className="label-caps text-[9px] text-[var(--accent)] px-4 py-2 disabled:opacity-40 transition-all active:scale-95"
                style={{ border: '1px solid rgba(var(--accent-rgb),0.25)', borderRadius: '2px', background: 'rgba(var(--accent-rgb),0.06)' }}
              >
                {reloading ? 'RELOADING...' : 'RELOAD_PLUGINS'}
              </button>
              {pluginCount !== null && (
                <span className="label-caps text-[9px] text-[#8e9192]">
                  {pluginCount === 0 ? 'NO_PLUGINS' : `${pluginCount}_LOADED`}
                </span>
              )}
            </div>
          </section>

          {/* Voice */}
          <section>
            <Section title="VOICE_INPUT" />
            <p className="font-mono text-xs text-[#8e9192] mb-3">
              Free Groq Whisper API for voice transcription.{' '}
              <a
                href="https://console.groq.com/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--accent)] hover:text-[#acfffa] transition-colors"
                onClick={e => e.stopPropagation()}
              >
                Get free key →
              </a>
            </p>
            <Field label="GROQ_API_KEY">
              <FocusInput
                type="password"
                value={settings.groqKey || ''}
                onChange={e => setSettings({ groqKey: e.target.value })}
                placeholder="gsk_..."
              />
            </Field>

            <div className="mt-4">
              <Field label="ELEVENLABS_KEY — OPTIONAL (better voice quality)">
                <FocusInput
                  type="password"
                  value={settings.elevenLabsKey || ''}
                  onChange={e => setSettings({ elevenLabsKey: e.target.value })}
                  placeholder="sk_... — free at elevenlabs.io"
                />
              </Field>
              {settings.elevenLabsKey ? (
                <p className="font-mono text-[10px] mt-1.5" style={{ color: 'var(--accent)' }}>
                  ✓ ElevenLabs active — high quality voice, cross-platform
                </p>
              ) : (
                <p className="font-mono text-[10px] text-[#444748] mt-1.5">
                  Without key: uses OS voices (Windows SAPI / macOS). Add key for much better quality.
                </p>
              )}
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <div className="label-caps text-[9px] text-[#8e9192] mb-2">LISTEN_MODE</div>
                <div className="flex gap-2">
                  {(['off', 'manual', 'auto'] as const).map(m => (
                    <button
                      key={m}
                      onClick={() => setSettings({ voiceMode: m })}
                      className="label-caps text-[9px] px-3 py-1.5 transition-all active:scale-95"
                      style={{
                        borderRadius: '2px',
                        background: settings.voiceMode === m ? 'rgba(var(--accent-rgb),0.15)' : 'transparent',
                        border: `1px solid ${settings.voiceMode === m ? 'rgba(var(--accent-rgb),0.4)' : 'rgba(68,71,72,0.4)'}`,
                        color: settings.voiceMode === m ? 'var(--accent)' : '#8e9192',
                      }}
                    >
                      {m === 'off' ? 'OFF' : m === 'manual' ? 'MANUAL (button)' : 'AUTO (always-on)'}
                    </button>
                  ))}
                </div>
                {settings.voiceMode === 'auto' && (
                  <p className="font-mono text-[10px] text-[#8e9192] mt-2">
                    Zero listens continuously — speaks when you do, sends automatically. Requires Groq key.
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-mono text-sm" style={{ color: 'var(--text-body)' }}>Speak responses (TTS)</p>
                  <p className="label-caps text-[9px] text-[#444748] mt-0.5">ZERO_SPEAKS_REPLIES</p>
                </div>
                <Toggle
                  on={settings.ttsEnabled}
                  onClick={() => setSettings({ ttsEnabled: !settings.ttsEnabled })}
                />
              </div>
            </div>
          </section>

          {/* Hotkey */}
          <section>
            <Section title="GLOBAL_HOTKEY" />
            <FocusInput
              type="text"
              value={settings.hotkey}
              onChange={e => setSettings({ hotkey: e.target.value })}
              placeholder="Ctrl+Shift+A"
            />
            <p className="font-mono text-[10px] text-[#444748] mt-2">Restart required for hotkey changes.</p>
          </section>

          {/* Appearance */}
          <section>
            <Section title="APPEARANCE" />
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-mono text-sm" style={{ color: 'var(--text-body)' }}>Light Theme</p>
                  <p className="label-caps text-[9px] text-[#444748] mt-0.5">SWITCH_THEME</p>
                </div>
                <Toggle
                  on={settings.theme === 'light'}
                  onClick={() => setSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' })}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-mono text-sm" style={{ color: 'var(--text-body)' }}>Compact Mode</p>
                  <p className="label-caps text-[9px] text-[#444748] mt-0.5">REDUCE_SPACING</p>
                </div>
                <Toggle on={isCompact} onClick={() => setCompact(!isCompact)} />
              </div>
              <div>
                <p className="font-mono text-sm mb-2" style={{ color: 'var(--text-body)' }}>Accent Color</p>
                <div className="flex items-center gap-2 flex-wrap">
                  {['#7bd6d1','#7ba7d6','#b07bd6','#d67bb0','#d6a77b','#7bd687','#d6d67b'].map(color => (
                    <button
                      key={color}
                      onClick={() => setSettings({ accentColor: color })}
                      title={color}
                      style={{
                        width: 22, height: 22, borderRadius: '50%', background: color, flexShrink: 0,
                        border: settings.accentColor === color ? `2px solid white` : '2px solid transparent',
                        boxShadow: settings.accentColor === color ? `0 0 8px ${color}` : 'none',
                        transition: 'all 0.15s',
                      }}
                    />
                  ))}
                  <input
                    type="color"
                    value={settings.accentColor || '#7bd6d1'}
                    onChange={e => setSettings({ accentColor: e.target.value })}
                    title="Custom color"
                    style={{ width: 22, height: 22, borderRadius: '50%', border: 'none', cursor: 'pointer', padding: 0, background: 'none' }}
                  />
                  <span className="label-caps text-[8px] text-[#444748]">CUSTOM</span>
                </div>
              </div>
            </div>
          </section>

          {/* Shortcuts */}
          <section>
            <Section title="KEYBOARD_SHORTCUTS" />
            <div className="space-y-1.5">
              {[
                ['Ctrl+Shift+A', 'Toggle window'],
                ['Enter',        'Send message'],
                ['Shift+Enter',  'New line in input'],
                ['Esc',          'Close settings'],
              ].map(([key, desc]) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>{desc}</span>
                  <kbd className="label-caps text-[8px] px-2 py-0.5" style={{
                    background: 'rgba(var(--accent-rgb),0.08)',
                    border: '1px solid rgba(var(--accent-rgb),0.2)',
                    borderRadius: '2px', color: 'var(--accent)',
                  }}>{key}</kbd>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Footer */}
        <div
          className="px-6 py-4 flex justify-end"
          style={{ borderTop: '1px solid var(--border-subtle)' }}
        >
          <button
            onClick={handleSave}
            disabled={saving}
            className="label-caps text-[10px] px-6 py-2.5 disabled:opacity-40 transition-all active:scale-95"
            style={{
              background: saving || saved ? 'rgba(var(--accent-rgb),0.15)' : 'rgba(var(--accent-rgb),0.1)',
              border: '1px solid rgba(var(--accent-rgb),0.3)',
              color: 'var(--accent)',
              borderRadius: '2px',
            }}
          >
            {saving ? 'SAVING...' : saved ? '✓ SAVED' : 'SAVE_CONFIG'}
          </button>
        </div>
      </div>
    </div>
  )
}
