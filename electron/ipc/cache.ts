import { IpcMain } from 'electron'
import { createHash } from 'crypto'

// Pure JS in-memory + JSON cache (no native deps)
// We use a simple Map for runtime caching and persist to electron-store

interface CacheEntry {
  model: string
  response: string
  createdAt: number
}

interface CacheStore {
  responses: Record<string, CacheEntry>
  settings: Record<string, string>
}

const TTL = 86400000 // 24 hours
const MAX_RESPONSES = 1000

let storeInstance: CacheStore | null = null
let ElectronStore: typeof import('electron-store').default | null = null
let storeObj: import('electron-store').default<CacheStore> | null = null

async function getStore(): Promise<import('electron-store').default<CacheStore>> {
  if (storeObj) return storeObj
  if (!ElectronStore) {
    const mod = await import('electron-store')
    ElectronStore = mod.default
  }
  storeObj = new ElectronStore<CacheStore>({
    name: 'zero-cache',
    defaults: { responses: {}, settings: {} },
  })
  storeInstance = storeObj.store
  return storeObj
}

// Sync versions for use in LLM module (called synchronously)
const memCache = new Map<string, CacheEntry>()
let settingsCache: Record<string, string> = {}
let initialized = false

export async function initCache(): Promise<void> {
  if (initialized) return
  initialized = true
  try {
    const store = await getStore()
    const data = store.store
    // Load into memory
    for (const [k, v] of Object.entries(data.responses || {})) {
      if (Date.now() - v.createdAt < TTL) {
        memCache.set(k, v)
      }
    }
    settingsCache = { ...(data.settings || {}) }
  } catch {
    // ignore
  }
}

export function getCached(hash: string): string | null {
  const entry = memCache.get(hash)
  if (!entry) return null
  if (Date.now() - entry.createdAt > TTL) {
    memCache.delete(hash)
    return null
  }
  return entry.response
}

export function setCached(hash: string, model: string, response: string): void {
  memCache.set(hash, { model, response, createdAt: Date.now() })

  // LRU eviction
  if (memCache.size > MAX_RESPONSES) {
    const oldest = [...memCache.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt)
    for (let i = 0; i < memCache.size - MAX_RESPONSES; i++) {
      memCache.delete(oldest[i][0])
    }
  }

  // Async persist
  getStore().then((store) => {
    const responses: Record<string, CacheEntry> = {}
    memCache.forEach((v, k) => { responses[k] = v })
    store.set('responses', responses)
  }).catch(() => {})
}

export function getSettings(): Record<string, string> {
  return { ...settingsCache }
}

export function saveSettingKV(key: string, value: string): void {
  settingsCache[key] = value
  getStore().then((store) => {
    store.set(`settings.${key}`, value)
  }).catch(() => {})
}

export function registerCacheHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('ai:getSettings', async () => {
    return getSettings()
  })

  ipcMain.handle('ai:saveSettings', async (_event, settings: Record<string, string>) => {
    for (const [key, value] of Object.entries(settings)) {
      saveSettingKV(key, String(value))
    }
    return true
  })
}

export { createHash }
