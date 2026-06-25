// Splits a streaming text into complete sentences as chunks arrive.
// Feed chunks via push(), get back any complete sentences ready to speak.
// Call flush() at end of stream for any remaining partial sentence.

export class SentenceBuffer {
  private buf = ''

  push(chunk: string): string[] {
    this.buf += chunk
    const out: string[] = []
    // Match sentences ending with . ! ? followed by whitespace or end
    // Also split on newlines (code blocks, lists)
    const re = /[^.!?\n]+[.!?]+[\s]*/g
    let m: RegExpExecArray | null
    let last = 0
    while ((m = re.exec(this.buf)) !== null) {
      const s = m[0].trim()
      if (s.length > 4) out.push(s)   // skip noise like "ok." or "I."
      last = m.index + m[0].length
    }
    this.buf = this.buf.slice(last)
    return out
  }

  flush(): string {
    const r = this.buf.trim()
    this.buf = ''
    return r
  }
}
