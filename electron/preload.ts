import { contextBridge, ipcRenderer } from 'electron'
import type { AgentStep } from './ipc/agent'

interface AgentResult {
  steps: AgentStep[]
  finalAnswer: string
}

contextBridge.exposeInMainWorld('ai', {
  chat: (message: string, mode: string): Promise<string> => ipcRenderer.invoke('ai:chat', message, mode),
  systemCommand: (input: string): Promise<string | null> => ipcRenderer.invoke('ai:systemCommand', input),
  startRecording: (): Promise<{ available: boolean; message: string }> => ipcRenderer.invoke('ai:startRecording'),
  stopRecording: (): Promise<{ available: boolean; transcript: string; message: string }> => ipcRenderer.invoke('ai:stopRecording'),
  getSettings: (): Promise<Record<string, string>> => ipcRenderer.invoke('ai:getSettings'),
  saveSettings: (settings: Record<string, string>): Promise<boolean> => ipcRenderer.invoke('ai:saveSettings', settings),
  streamChat: (message: string, mode: string, callback: (chunk: string) => void): Promise<string> => {
    const channel = `ai:stream:${Date.now()}:${Math.random().toString(36).slice(2)}`
    const listener = (_event: Electron.IpcRendererEvent, chunk: string) => callback(chunk)
    ipcRenderer.on(channel, listener)
    return ipcRenderer.invoke('ai:streamChat', message, mode, channel).finally(() => { ipcRenderer.removeListener(channel, listener) })
  },
  ollamaStatus: (): Promise<boolean> => ipcRenderer.invoke('ai:ollamaStatus'),
  runAgent: (task: string, context: string, callback: (step: AgentStep) => void): Promise<AgentResult> => {
    const channel = `ai:agent:${Date.now()}:${Math.random().toString(36).slice(2)}`
    const listener = (_event: Electron.IpcRendererEvent, step: AgentStep) => callback(step)
    ipcRenderer.on(channel, listener)
    return ipcRenderer.invoke('ai:runAgent', task, context, channel).finally(() => { ipcRenderer.removeListener(channel, listener) })
  },
  readFile: (path: string): Promise<{ content: string; truncated: boolean; size: number }> => ipcRenderer.invoke('ai:readFile', path),
  listFiles: (path: string): Promise<string[]> => ipcRenderer.invoke('ai:listFiles', path),
  executeCode: (code: string, language: string): Promise<{ stdout: string; stderr: string; exitCode: number }> => ipcRenderer.invoke('ai:executeCode', code, language),
  approveExecution: (stepId: string, approved: boolean): Promise<void> => ipcRenderer.invoke('ai:approveExecution', stepId, approved),
  listPlugins: (): Promise<{ name: string; description: string; triggers: string[] }[]> => ipcRenderer.invoke('ai:listPlugins'),
  runPlugin: (name: string, input: string): Promise<string> => ipcRenderer.invoke('ai:runPlugin', name, input),
  reloadPlugins: (): Promise<{ name: string; description: string; triggers: string[] }[]> => ipcRenderer.invoke('ai:reloadPlugins'),
  transcribeAudio: (audioData: ArrayBuffer, groqKey: string): Promise<{ success: boolean; transcript?: string; error?: string }> =>
    ipcRenderer.invoke('ai:transcribeAudio', Buffer.from(audioData), groqKey),
  ttsSpeak: (text: string, apiKey: string, voiceId: string): Promise<{ success: boolean; audio?: string; error?: string }> =>
    ipcRenderer.invoke('ai:ttsSpeak', text, apiKey, voiceId),
  gitStatus:   (cwd: string): Promise<string> => ipcRenderer.invoke('ai:gitStatus', cwd),
  gitLog:      (cwd: string, n?: number): Promise<string> => ipcRenderer.invoke('ai:gitLog', cwd, n),
  gitDiff:     (cwd: string, staged?: boolean): Promise<string> => ipcRenderer.invoke('ai:gitDiff', cwd, staged),
  gitBranches: (cwd: string): Promise<string> => ipcRenderer.invoke('ai:gitBranches', cwd),
  gitCommit:   (cwd: string, message: string): Promise<string> => ipcRenderer.invoke('ai:gitCommit', cwd, message),
  memoryGet:   (): Promise<Array<{ id: string; text: string; createdAt: number }>> => ipcRenderer.invoke('ai:memoryGet'),
  memoryAdd:   (text: string): Promise<{ success: boolean }> => ipcRenderer.invoke('ai:memoryAdd', text),
  memoryClear: (): Promise<{ success: boolean }> => ipcRenderer.invoke('ai:memoryClear'),
  edgeTTS: (text: string, voice?: string): Promise<{ success: boolean; audio?: string; error?: string }> =>
    ipcRenderer.invoke('ai:edgeTTS', text, voice),
})
