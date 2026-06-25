import { create } from 'zustand'

export interface AgentStep {
  id: string
  action: 'read_file' | 'list_files' | 'explain' | 'write_code' | 'execute'
  description: string
  status: 'pending' | 'running' | 'done' | 'error' | 'awaiting_approval'
  result?: string
  code?: string
  language?: string
  filePath?: string
  needsApproval?: boolean
}

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  isStreaming?: boolean
}

export interface Settings {
  chatModel: string
  coderModel: string
  hotkey: string
  theme: 'dark' | 'light'
  accentColor: string
  openrouterKey?: string
  openrouterModel?: string
  groqKey?: string
  voiceMode: 'off' | 'manual' | 'auto'  // off=no voice, manual=button, auto=always-on VAD
  ttsEnabled: boolean
  elevenLabsKey?: string
}

interface ChatStore {
  messages: Message[]
  mode: 'assistant' | 'coder' | 'agent'
  isLoading: boolean
  isRecording: boolean
  settings: Settings
  settingsOpen: boolean
  ollamaOnline: boolean
  agentSteps: AgentStep[]
  pendingApproval: AgentStep | null
  provider: 'ollama' | 'openrouter'
  isCompact: boolean
  addMessage: (msg: Omit<Message, 'id' | 'timestamp'>) => void
  updateLastMessage: (content: string) => void
  setMode: (mode: 'assistant' | 'coder' | 'agent') => void
  setLoading: (v: boolean) => void
  setRecording: (v: boolean) => void
  setSettings: (s: Partial<Settings>) => void
  toggleSettings: () => void
  clearMessages: () => void
  setOllamaOnline: (v: boolean) => void
  addAgentStep: (step: AgentStep) => void
  updateAgentStep: (id: string, updates: Partial<AgentStep>) => void
  clearAgentSteps: () => void
  setPendingApproval: (step: AgentStep | null) => void
  setProvider: (provider: 'ollama' | 'openrouter') => void
  setCompact: (v: boolean) => void
}

const defaultSettings: Settings = {
  chatModel: 'mistral',
  coderModel: 'codellama',
  hotkey: 'Ctrl+Shift+A',
  theme: 'dark',
  accentColor: '#7bd6d1',
  openrouterModel: 'mistralai/mistral-7b-instruct:free',
  voiceMode: 'manual',
  ttsEnabled: true,
}

export const useChatStore = create<ChatStore>((set) => ({
  messages: [],
  mode: 'assistant',
  isLoading: false,
  isRecording: false,
  settings: defaultSettings,
  settingsOpen: false,
  ollamaOnline: false,
  agentSteps: [],
  pendingApproval: null,
  provider: 'ollama',
  isCompact: false,
  addMessage: (msg) => set((state) => ({
    messages: [...state.messages, { ...msg, id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, timestamp: Date.now() }]
  })),
  updateLastMessage: (content) => set((state) => {
    const messages = [...state.messages]
    const last = messages[messages.length - 1]
    if (last && last.role === 'assistant') { messages[messages.length - 1] = { ...last, content, isStreaming: false } }
    return { messages }
  }),
  setMode: (mode) => set({ mode }),
  setLoading: (isLoading) => set({ isLoading }),
  setRecording: (isRecording) => set({ isRecording }),
  setSettings: (s) => set((state) => ({ settings: { ...state.settings, ...s } })),
  toggleSettings: () => set((state) => ({ settingsOpen: !state.settingsOpen })),
  clearMessages: () => set({ messages: [] }),
  setOllamaOnline: (ollamaOnline) => set({ ollamaOnline }),
  addAgentStep: (step) => set((state) => ({ agentSteps: [...state.agentSteps, step] })),
  updateAgentStep: (id, updates) => set((state) => ({
    agentSteps: state.agentSteps.map(s => s.id === id ? { ...s, ...updates } : s)
  })),
  clearAgentSteps: () => set({ agentSteps: [] }),
  setPendingApproval: (step) => set({ pendingApproval: step }),
  setProvider: (provider) => set({ provider }),
  setCompact: (isCompact) => set({ isCompact }),
}))
