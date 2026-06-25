export const OLLAMA_BASE = 'http://localhost:11434'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

// Multi-turn streaming via /api/chat — preserves full conversation history
export async function ollamaChatStream(
  model: string,
  messages: ChatMessage[],
  onChunk: (text: string) => void,
  signal?: AbortSignal
): Promise<string> {
  const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: true }),
    signal,
  })

  if (!res.ok) {
    const err = `Ollama error ${res.status}: ${await res.text()}`
    onChunk(err)
    return err
  }

  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let full = ''
  let buf = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const obj = JSON.parse(line) as { message?: { content?: string }; done?: boolean }
        if (obj.message?.content) { full += obj.message.content; onChunk(obj.message.content) }
      } catch { /* skip malformed */ }
    }
  }
  return full
}

// OpenRouter streaming with full message history
export async function openRouterChatStream(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  onChunk: (text: string) => void,
  signal?: AbortSignal
): Promise<string> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'zero-ai-assistant',
      'X-Title': 'Zero AI',
    },
    body: JSON.stringify({ model, messages, stream: true }),
    signal,
  })

  if (!res.ok) {
    const err = `OpenRouter error ${res.status}: ${await res.text()}`
    onChunk(err)
    return err
  }

  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let full = ''
  let buf = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.replace(/^data:\s*/, '').trim()
      if (!trimmed || trimmed === '[DONE]') continue
      try {
        const obj = JSON.parse(trimmed) as { choices?: [{ delta?: { content?: string } }] }
        const chunk = obj.choices?.[0]?.delta?.content
        if (chunk) { full += chunk; onChunk(chunk) }
      } catch { /* skip malformed */ }
    }
  }
  return full
}

// Single-turn non-streaming (used by agentRunner) — kept for agent planner
export async function ollamaChat(
  model: string,
  messages: ChatMessage[],
  signal?: AbortSignal
): Promise<string> {
  const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: false }),
    signal,
  })
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`)
  const data = await res.json() as { message?: { content?: string } }
  return data.message?.content ?? ''
}

// OpenRouter non-streaming for agent planner fallback
export async function openRouterChat(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
): Promise<string> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'zero-ai-assistant',
      'X-Title': 'Zero AI',
    },
    body: JSON.stringify({ model, messages, stream: false }),
  })
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`)
  const data = await res.json() as { choices?: [{ message?: { content?: string } }] }
  return data.choices?.[0]?.message?.content ?? ''
}

export async function ollamaStatus(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: AbortSignal.timeout(3000) })
    return res.ok
  } catch {
    return false
  }
}
