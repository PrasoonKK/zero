export function cn(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(' ')
}

export function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export interface ContentPart {
  type: 'text' | 'code'
  content: string
  language?: string
}

export function parseCodeBlocks(content: string): ContentPart[] {
  const parts: ContentPart[] = []
  const regex = /```(\w+)?\n?([\s\S]*?)```/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      const text = content.slice(lastIndex, match.index).trim()
      if (text) parts.push({ type: 'text', content: text })
    }
    parts.push({
      type: 'code',
      language: match[1] || 'text',
      content: match[2].trim(),
    })
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < content.length) {
    const text = content.slice(lastIndex).trim()
    if (text) parts.push({ type: 'text', content: text })
  }

  return parts.length > 0 ? parts : [{ type: 'text', content }]
}
