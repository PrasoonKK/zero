/// <reference types="vite/client" />

interface AgentStep {
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

interface Window {
  ai: {
    chat: (message: string, mode: string) => Promise<string>
    systemCommand: (input: string) => Promise<string | null>
    startRecording: () => Promise<{ available: boolean; message: string }>
    stopRecording: () => Promise<{ available: boolean; transcript: string; message: string }>
    getSettings: () => Promise<Record<string, string>>
    saveSettings: (settings: Record<string, string>) => Promise<boolean>
    streamChat: (message: string, mode: string, callback: (chunk: string) => void) => Promise<string>
    ollamaStatus: () => Promise<boolean>
    runAgent: (task: string, context: string, callback: (step: AgentStep) => void) => Promise<{ steps: AgentStep[]; finalAnswer: string }>
    readFile: (path: string) => Promise<{ content: string; truncated: boolean; size: number }>
    listFiles: (path: string) => Promise<string[]>
    executeCode: (code: string, language: string) => Promise<{ stdout: string; stderr: string; exitCode: number }>
    approveExecution: (stepId: string, approved: boolean) => Promise<void>
    listPlugins: () => Promise<{ name: string; description: string; triggers: string[] }[]>
    runPlugin: (name: string, input: string) => Promise<string>
    reloadPlugins: () => Promise<{ name: string; description: string; triggers: string[] }[]>
    transcribeAudio: (audioData: ArrayBuffer, groqKey: string) => Promise<{ success: boolean; transcript?: string; error?: string }>
    ttsSpeak: (text: string, apiKey: string, voiceId: string) => Promise<{ success: boolean; audio?: string; error?: string }>
    gitStatus:   (cwd: string) => Promise<string>
    gitLog:      (cwd: string, n?: number) => Promise<string>
    gitDiff:     (cwd: string, staged?: boolean) => Promise<string>
    gitBranches: (cwd: string) => Promise<string>
    gitCommit:   (cwd: string, message: string) => Promise<string>
    memoryGet:   () => Promise<Array<{ id: string; text: string; createdAt: number }>>
    memoryAdd:   (text: string) => Promise<{ success: boolean }>
    memoryClear: () => Promise<{ success: boolean }>
  }
}
