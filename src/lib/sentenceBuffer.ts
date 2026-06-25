// WordBuffer — fires every N words so TTS starts within the first few tokens,
// not at the end of a full sentence.
//
// ElevenLabs: batch=12 (fewer API calls, still fast — first audio in ~600ms)
// OS voices:  batch=5  (instant local TTS, near character-by-character feel)

export class WordBuffer {
  private words: string[] = []
  private partial = ''         // current incomplete word (no trailing space yet)
  readonly batchSize: number

  constructor(batchSize = 5) {
    this.batchSize = batchSize
  }

  /** Feed a raw streaming chunk. Returns any ready batches to speak. */
  push(chunk: string): string[] {
    // Build word list from buffer + chunk
    const raw = this.partial + chunk
    const parts = raw.split(/(\s+)/)  // split keeping whitespace

    // Last part may be an incomplete word (no space yet)
    const endsWithSpace = /\s$/.test(raw)
    this.partial = endsWithSpace ? '' : (parts.pop() ?? '')

    // Add completed words
    for (const p of parts) {
      const w = p.trim()
      if (w) this.words.push(w)
    }

    const out: string[] = []
    while (this.words.length >= this.batchSize) {
      out.push(this.words.splice(0, this.batchSize).join(' '))
    }
    return out
  }

  /** Call at end of stream — returns any remaining words. */
  flush(): string {
    const all = [...this.words]
    if (this.partial.trim()) all.push(this.partial.trim())
    this.words = []
    this.partial = ''
    return all.join(' ')
  }
}
