import axios from 'axios'

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1'

interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface OpenRouterChoice {
  delta: { content?: string }
  finish_reason?: string
}

interface OpenRouterChunk {
  choices: OpenRouterChoice[]
}

export async function chatOpenRouter(
  message: string,
  systemPrompt: string,
  apiKey: string,
  model: string = 'mistralai/mistral-7b-instruct:free',
  onChunk?: (chunk: string) => void
): Promise<string> {
  const messages: OpenRouterMessage[] = []
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt })
  messages.push({ role: 'user', content: message })

  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'HTTP-Referer': 'https://zero-ai.local',
    'X-Title': 'Zero AI Assistant',
    'Content-Type': 'application/json',
  }

  if (onChunk) {
    const response = await axios.post(
      `${OPENROUTER_BASE}/chat/completions`,
      { model, messages, stream: true },
      { headers, responseType: 'stream', timeout: 120000 }
    )

    let fullText = ''
    return new Promise((resolve, reject) => {
      response.data.on('data', (chunk: Buffer) => {
        const lines = chunk.toString().split('\n')
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data: ')) continue
          const data = trimmed.slice(6)
          if (data === '[DONE]') continue
          try {
            const parsed = JSON.parse(data) as OpenRouterChunk
            const content = parsed.choices?.[0]?.delta?.content
            if (content) {
              fullText += content
              onChunk(content)
            }
          } catch {}
        }
      })
      response.data.on('end', () => resolve(fullText))
      response.data.on('error', (err: Error) => reject(err))
    })
  } else {
    const response = await axios.post(
      `${OPENROUTER_BASE}/chat/completions`,
      { model, messages, stream: false },
      { headers, timeout: 60000 }
    )
    interface NonStreamResponse { choices: Array<{ message: { content: string } }> }
    const data = response.data as NonStreamResponse
    return data.choices?.[0]?.message?.content ?? ''
  }
}
