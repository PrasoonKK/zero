import { ipcMain, app } from 'electron'
import { join } from 'path'
import { readdir, readFile } from 'fs/promises'
import { existsSync, mkdirSync } from 'fs'
import * as vm from 'vm'
import * as https from 'https'
import * as http from 'http'

interface PluginAPI {
  readFile: (path: string) => Promise<string>
  listFiles: (path: string) => Promise<string[]>
  http: (url: string) => Promise<string>
}

interface LoadedPlugin {
  name: string
  description: string
  triggers: string[]
  handler: (input: string, api: PluginAPI) => Promise<string>
}

const plugins = new Map<string, LoadedPlugin>()

export function getPluginsDir(): string {
  // %APPDATA%\zero-ai\plugins
  return join(app.getPath('userData'), '..', 'zero-ai', 'plugins')
}

function httpFetch(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http
    const req = client.get(url, { timeout: 10000 }, (res) => {
      let data = ''
      res.on('data', (chunk) => (data += chunk))
      res.on('end', () => resolve(data))
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')) })
  })
}

const pluginAPI: PluginAPI = {
  readFile: async (filePath: string) => {
    const content = await readFile(filePath, 'utf-8')
    return content.slice(0, 10240)
  },
  listFiles: async (dirPath: string) => {
    const { readdir: fsReaddir } = await import('fs/promises')
    const IGNORE = new Set(['node_modules', '.git', 'dist', 'build', '__pycache__'])
    const entries = await fsReaddir(dirPath, { withFileTypes: true })
    return entries
      .filter((e) => !IGNORE.has(e.name))
      .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
      .slice(0, 100)
  },
  http: httpFetch,
}

async function loadPlugin(filePath: string): Promise<LoadedPlugin | null> {
  try {
    const code = await readFile(filePath, 'utf-8')
    const sandbox = {
      module: { exports: {} as Record<string, unknown> },
      require: undefined as unknown,
      __filename: filePath,
      __dirname: join(filePath, '..'),
      console: { log: console.log, error: console.error, warn: console.warn },
    }
    vm.runInNewContext(code, sandbox, { timeout: 2000, filename: filePath })
    const exported = sandbox.module.exports as Record<string, unknown>

    if (
      typeof exported.name !== 'string' ||
      !Array.isArray(exported.triggers) ||
      typeof exported.handler !== 'function'
    ) {
      console.warn(`[plugins] Invalid plugin at ${filePath}: must export { name, triggers, handler }`)
      return null
    }

    return {
      name: exported.name,
      description: typeof exported.description === 'string' ? exported.description : '',
      triggers: exported.triggers as string[],
      handler: exported.handler as LoadedPlugin['handler'],
    }
  } catch (err) {
    console.error(`[plugins] Failed to load ${filePath}:`, err)
    return null
  }
}

export async function loadPlugins(): Promise<void> {
  plugins.clear()
  const dir = getPluginsDir()
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
    return
  }

  let files: string[]
  try {
    files = await readdir(dir)
  } catch {
    return
  }

  for (const file of files.filter((f) => f.endsWith('.plugin.js'))) {
    const plugin = await loadPlugin(join(dir, file))
    if (plugin) {
      plugins.set(plugin.name, plugin)
      console.log(`[plugins] Loaded: ${plugin.name} (triggers: ${plugin.triggers.join(', ')})`)
    }
  }
}

export function registerPluginHandlers(ipcMainInstance: typeof ipcMain): void {
  ipcMainInstance.handle('ai:listPlugins', () =>
    Array.from(plugins.values()).map((p) => ({
      name: p.name,
      description: p.description,
      triggers: p.triggers,
    }))
  )

  ipcMainInstance.handle('ai:runPlugin', async (_event, name: string, input: string) => {
    const plugin = plugins.get(name)
    if (!plugin) throw new Error(`Plugin not found: ${name}`)
    const result = await plugin.handler(input, pluginAPI)
    if (typeof result !== 'string') throw new Error(`Plugin ${name} handler must return a string`)
    return result
  })

  ipcMainInstance.handle('ai:reloadPlugins', async () => {
    await loadPlugins()
    return Array.from(plugins.values()).map((p) => ({
      name: p.name,
      description: p.description,
      triggers: p.triggers,
    }))
  })
}
