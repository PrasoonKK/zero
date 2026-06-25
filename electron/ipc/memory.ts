import { IpcMain } from 'electron'
import Store from 'electron-store'

interface MemoryEntry {
  id: string
  text: string
  createdAt: number
}

const memStore = new Store<{ memories: MemoryEntry[] }>({ name: 'zero-memory', defaults: { memories: [] } })

export function getMemories(): MemoryEntry[] {
  return memStore.get('memories') || []
}

export function addMemory(text: string): MemoryEntry {
  const entries = getMemories()
  const entry: MemoryEntry = { id: String(Date.now()), text: text.trim(), createdAt: Date.now() }
  entries.push(entry)
  if (entries.length > 200) entries.splice(0, entries.length - 200)
  memStore.set('memories', entries)
  return entry
}

export function clearMemories(): void {
  memStore.set('memories', [])
}

export function registerMemoryHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('ai:memoryGet',   () => getMemories())
  ipcMain.handle('ai:memoryAdd',   (_e, text: string) => { addMemory(text); return { success: true } })
  ipcMain.handle('ai:memoryClear', () => { clearMemories(); return { success: true } })
}
