// Voice Activity Detection — Web Audio API, no packages, no API keys.
// Monitors mic RMS every 50ms. Fires onSpeechStart/onSpeechEnd when
// real speech is detected (not background hiss or short noise bursts).

export interface VADOptions {
  onSpeechStart: () => void
  onSpeechEnd:   () => void
  onVolume?:     (vol: number) => void   // 0–100 for waveform UI
  threshold?:    number    // RMS level 0-255 that counts as speech (default 35)
  silenceMs?:    number    // ms of quiet before speech ends (default 1800)
  minSpeechMs?:  number    // ms of sustained speech before onSpeechEnd fires (default 1500)
}

export interface VADInstance {
  stop: () => void
}

// Noise transcriptions Groq whispers on silence — discard these.
const NOISE_PATTERNS = [
  /^\.+$/,                            // just dots
  /^(you|yeah|yes|no|ok|okay|um+|uh+|hmm+)\.?$/i,
  /^thank you\.?$/i,
  /^thanks\.?$/i,
  /^(bye|goodbye)\.?$/i,
  /^please subscribe\.?$/i,
  /^\s*$/,
]

/** Returns true if a transcript is likely noise/hallucination, not real speech. */
export function isNoiseTranscript(text: string): boolean {
  const t = text.trim()
  if (t.length < 4) return true                   // too short
  if (t.split(/\s+/).length < 2) return true      // single word only
  return NOISE_PATTERNS.some(p => p.test(t))
}

export async function startVAD(opts: VADOptions): Promise<VADInstance> {
  const {
    onSpeechStart, onSpeechEnd, onVolume,
    threshold   = 35,
    silenceMs   = 1800,
    minSpeechMs = 1500,
  } = opts

  const stream  = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
  const ctx     = new AudioContext()
  const src     = ctx.createMediaStreamSource(stream)
  const ana     = ctx.createAnalyser()
  ana.fftSize   = 1024
  src.connect(ana)

  const buf = new Float32Array(ana.frequencyBinCount)

  let speaking      = false
  let speechStartAt = 0
  let silenceStart  = 0
  let rafId: number

  function getRMS(): number {
    ana.getByteFrequencyData(new Uint8Array(buf.buffer))
    // Use byte data — sum of freq bins / count gives mean energy
    let sum = 0
    const bytes = new Uint8Array(buf.buffer)
    for (let i = 0; i < bytes.length; i++) sum += bytes[i]
    return sum / bytes.length
  }

  function tick() {
    const vol = getRMS()
    // Amplify for display (make waveform look alive)
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
      if (vol <= threshold * 0.7) {   // hysteresis: stop at 70% of start threshold
        if (silenceStart === 0) silenceStart = now
        if (now - silenceStart >= silenceMs) {
          speaking = false
          // Only fire if speech was long enough to be real (not a cough or knock)
          if (now - speechStartAt >= minSpeechMs) {
            onSpeechEnd()
          } else {
            // Too short — reset silently
            onSpeechEnd()  // still fire so recorder stops, but isNoiseTranscript will filter it
          }
        }
      } else {
        silenceStart = 0   // reset silence timer on any sound
      }
    }

    rafId = requestAnimationFrame(tick)
  }

  rafId = requestAnimationFrame(tick)

  return {
    stop() {
      cancelAnimationFrame(rafId)
      stream.getTracks().forEach(t => t.stop())
      ctx.close().catch(() => {})
    },
  }
}
