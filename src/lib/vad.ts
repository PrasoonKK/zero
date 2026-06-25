// Voice Activity Detection — Web Audio API, no packages, no API keys.
// Caller passes in an external MediaStream (so InputBar owns the mic capture,
// not the VAD). One getUserMedia total for both analysis and recording.

export interface VADOptions {
  stream:        MediaStream    // caller-owned mic stream
  onSpeechStart: () => void
  onSpeechEnd:   () => void
  onVolume?:     (vol: number) => void   // 0–100 for waveform UI
  threshold?:    number    // RMS level 0-255 (default 28)
  silenceMs?:    number    // ms of quiet before speech ends (default 1800)
  minSpeechMs?:  number    // ms of sustained speech required (default 1000)
}

export interface VADInstance {
  stop: () => void
}

// Groq Whisper silence hallucinations — discard these transcripts.
const NOISE_PATTERNS = [
  /^\.+$/,
  /^(you|yeah|yes|no|ok|okay|um+|uh+|hmm+|huh)\.?$/i,
  /^thank you\.?$/i,
  /^thanks\.?$/i,
  /^(bye|goodbye|see you)\.?$/i,
  /^please subscribe\.?$/i,
  /^\s*$/,
]

export function isNoiseTranscript(text: string): boolean {
  const t = text.trim()
  if (t.length < 4) return true
  if (t.split(/\s+/).length < 2) return true
  return NOISE_PATTERNS.some(p => p.test(t))
}

export function startVAD(opts: VADOptions): VADInstance {
  const {
    stream,
    onSpeechStart, onSpeechEnd, onVolume,
    threshold   = 28,
    silenceMs   = 1800,
    minSpeechMs = 1000,
  } = opts

  const ctx = new AudioContext()
  const src = ctx.createMediaStreamSource(stream)
  const ana = ctx.createAnalyser()
  ana.fftSize = 1024
  src.connect(ana)

  const bytes = new Uint8Array(ana.frequencyBinCount)

  let speaking      = false
  let speechStartAt = 0
  let silenceStart  = 0
  let rafId: number
  let stopped       = false

  function getRMS(): number {
    ana.getByteFrequencyData(bytes)
    let sum = 0
    for (let i = 0; i < bytes.length; i++) sum += bytes[i]
    return sum / bytes.length
  }

  function tick() {
    if (stopped) return
    const vol = getRMS()
    onVolume?.(Math.min(100, (vol / threshold) * 40))

    const now = Date.now()

    if (!speaking) {
      if (vol > threshold) {
        speaking      = true
        speechStartAt = now
        silenceStart  = 0
        onSpeechStart()
      }
    } else {
      if (vol <= threshold * 0.7) {
        if (silenceStart === 0) silenceStart = now
        if (now - silenceStart >= silenceMs) {
          speaking = false
          if (now - speechStartAt >= minSpeechMs) {
            onSpeechEnd()
          } else {
            onSpeechEnd()   // still fire — isNoiseTranscript will filter short clips
          }
        }
      } else {
        silenceStart = 0
      }
    }

    rafId = requestAnimationFrame(tick)
  }

  rafId = requestAnimationFrame(tick)

  return {
    stop() {
      stopped = true
      cancelAnimationFrame(rafId)
      ctx.close().catch(() => {})
      // NOTE: caller owns the stream — we don't stop tracks here
    },
  }
}
