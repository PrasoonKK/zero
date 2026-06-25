import { IpcMain } from 'electron'
import axios from 'axios'
import { request as httpRequest } from 'http'
import { createHash } from 'crypto'
import { getCached, setCached } from './cache'
import { join } from 'path'
import { readFileSync } from 'fs'
import { chatOpenRouter } from './openrouter'

const OLLAMA_BASE = 'http://localhost:11434'

function loadPrompts(): Record<string, string> {
  const paths = [join(__dirname, '../../../config/prompts.json'), join(process.cwd(), 'config/prompts.json')]
  for (const p of paths) { try { return JSON.parse(readFileSync(p, 'utf-8')) } catch {} }
  return {
    assistant: 'You are a helpful desktop AI assistant. Answer concisely in 1-3 sentences unless more detail is needed.',
    coder: 'You are an expert coding assistant. Write clean code in markdown code blocks with the language specified. Be direct and show working solutions.',
    agent: 'You are a code agent for a desktop AI assistant. The user will give you a task. Respond ONLY with valid JSON in this exact format: {"steps": [{"action": "read_file|list_files|explain|write_code|execute", "description": "what this step does", "filePath": "path if reading/listing", "code": "code if writing/executing", "language": "js|python|bash", "needsApproval": true}], "explanation": "brief plan summary"}. Actions: read_file (read a file), list_files (list directory), explain (text explanation, no code), write_code (generate code, needsApproval=false), execute (run code, ALWAYS needsApproval=true).',
  }
}

function loadConfig(): Record<string, string> {
  const paths = [join(__dirname, '../../../config/default-config.json'), join(process.cwd(), 'config/default-config.json')]
  for (const p of paths) { try { return JSON.parse(readFileSync(p, 'utf-8')) } catch {} }
  return { chatModel: 'mistral', coderModel: 'codellama', ollamaUrl: OLLAMA_BASE }
}

export async function chat(message: string, mode: string, settings?: Record<string, string>): Promise<string> {
  const config = loadConfig()
  const prompts = loadPrompts()
  const ollamaUrl = config.ollamaUrl || OLLAMA_BASE
  const model = mode === 'agent'
    ? settings?.chatModel || config.chatModel || 'mistral'
    : mode === 'coder'
      ? settings?.coderModel || config.coderModel || 'codellama'
      : settings?.chatModel || config.chatModel || 'mistral'
  const systemPrompt = prompts[mode] || prompts['assistant'] || ''
  const fullPrompt = `${systemPrompt}\n\nUser: ${message}\nAssistant:`
  const hash = createHash('md5').update(`${model}:${fullPrompt}`).digest('hex')
  const cached = getCached(hash)
  if (cached) return cached

  return new Promise((resolve) => {
    const postData = JSON.stringify({ model, prompt: fullPrompt, stream: false })
    const parsedUrl = new URL(ollamaUrl)
    const req = httpRequest({
      hostname: parsedUrl.hostname,
      port: Number(parsedUrl.port) || 11434,
      path: '/api/generate',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) },
    }, (res) => {
      let body = ''
      res.on('data', (chunk: Buffer) => { body += chunk.toString() })
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body) as { response?: string }
          const result = parsed.response || ''
          if (result) setCached(hash, model, result)
          resolve(result)
        } catch {
          resolve(`⚠️ Failed to parse Ollama response: ${body.slice(0, 200)}`)
        }
      })
    })
    req.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
        resolve('⚠️ Ollama is not running. Start it with: ollama serve')
      } else {
        resolve(`⚠️ Connection error (${err.code}): ${err.message}`)
      }
    })
    req.setTimeout(60000, () => { req.destroy(); resolve('⚠️ Request timed out after 60s') })
    req.write(postData)
    req.end()
  })
}

export async function streamChat(message: string, mode: string, onChunk: (chunk: string) => void, settings?: Record<string, string>): Promise<string> {
  const config = loadConfig()
  const prompts = loadPrompts()
  const ollamaUrl = config.ollamaUrl || OLLAMA_BASE
  const model = mode === 'coder' ? settings?.coderModel || config.coderModel || 'codellama' : settings?.chatModel || config.chatModel || 'mistral'
  const systemPrompt = prompts[mode] || prompts['assistant'] || ''
  const fullPrompt = `${systemPrompt}\n\nUser: ${message}\nAssistant:`

  // Use Node.js native http.request — axios responseType:'stream' has issues in Electron
  return new Promise((resolve) => {
    const postData = JSON.stringify({ model, prompt: fullPrompt, stream: true })
    let fullResponse = ''

    const tryOpenRouter = async () => {
      const openrouterKey = settings?.openrouterKey || config.openrouterKey || ''
      if (openrouterKey) {
        const orModel = settings?.openrouterModel || config.openrouterModel || 'mistralai/mistral-7b-instruct:free'
        onChunk('__PROVIDER__:openrouter')
        try {
          const result = await chatOpenRouter(message, systemPrompt, openrouterKey, orModel, onChunk)
          resolve(result)
        } catch (orErr) {
          const msg = `⚠️ OpenRouter error: ${String(orErr)}`
          onChunk(msg); resolve(msg)
        }
      } else {
        const msg = '⚠️ Ollama is not running. Start it with: ollama serve'
        onChunk(msg); resolve(msg)
      }
    }

    const parsedUrl = new URL(ollamaUrl)
    const req = httpRequest({
      hostname: parsedUrl.hostname,
      port: Number(parsedUrl.port) || 11434,
      path: '/api/generate',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) },
    }, (res) => {
      res.on('data', (chunk: Buffer) => {
        const lines = chunk.toString().split('\n').filter((l: string) => l.trim())
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line) as { response?: string; done?: boolean }
            if (parsed.response) { fullResponse += parsed.response; onChunk(parsed.response) }
          } catch {}
        }
      })
      res.on('end', () => resolve(fullResponse))
    })

    req.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
        tryOpenRouter()
      } else {
        const msg = `⚠️ Connection error (${err.code}): ${err.message}`
        onChunk(msg); resolve(msg)
      }
    })

    req.setTimeout(120000, () => {
      req.destroy()
      const msg = '⚠️ Request timed out after 120s. Is Ollama running a large model?'
      onChunk(msg); resolve(msg)
    })

    req.write(postData)
    req.end()
  })
}

export async function checkOllamaStatus(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = httpRequest({ hostname: 'localhost', port: 11434, path: '/api/tags', method: 'GET' }, (res) => {
      res.resume()
      resolve(res.statusCode === 200)
    })
    req.on('error', () => resolve(false))
    req.setTimeout(3000, () => { req.destroy(); resolve(false) })
    req.end()
  })
}

export function registerLLMHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('ai:chat', async (_event, message: string, mode: string) => { return chat(message, mode) })
  ipcMain.handle('ai:streamChat', async (event, message: string, mode: string, channel: string) => {
    return streamChat(message, mode, (chunk) => { event.sender.send(channel, chunk) })
  })
  ipcMain.handle('ai:ollamaStatus', async () => { return checkOllamaStatus() })
}
