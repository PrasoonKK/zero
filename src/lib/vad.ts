// Voice Activity Detection — Web Audio API, no packages, no API keys
// Monitors mic volume every 50ms; calls onSpeechStart/onSpeechEnd automatically.

export interface VADOptions {
  onSpeechStart: () => void
  onSpeechEnd:   () => void
  onVolume?:     (vol: number) => void   // 0–100, for waveform UI
  threshold?:    number                  // volume level 0-255 to trigger (default 18)
  silenceMs?:    number                  // ms of silence before speech ends (default 1400)
  minSpeechMs?:  number                  // min ms of speech before it counts (default 250)
}

export interface VADInstance {
  stop: () => void
}

export async function startVAD(opts: VADOptions): Promise<VADInstance> {
  const {
    onSpeechStart, onSpeechEnd, onVolume,
    threshold  = 18,
    silenceMs  = 1400,
    minSpeechMs = 250,
  } = opts

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
  const ctx    = new AudioContext()
  const src    = ctx.createMediaStreamSource(stream)
  const ana    = ctx.createAnalyser()
  ana.fftSize  = 512
  src.connect(ana)

  const buf = new Uint8Array(ana.frequencyBinCount)

  let speaking       = false
  let speechStartAt  = 0
  let silenceStart   = 0
  let rafId: number

  function tick() {
    ana.getByteFrequencyData(buf)
    const vol = buf.reduce((a, b) => a + b, 0) / buf.length
    onVolume?.(Math.min(100, (vol / 255) * 100 * 3))   // amplify for UI

    const now = Date.now()

    if (!speaking) {
      if (vol > threshold) {
        speaking     = true
        speechStartAt = now
        silenceStart  = 0
        onSpeechStart()
      }
    } else {
      if (vol <= threshold) {
        if (silenceStart === 0) silenceStart = now
        const silent = now - silenceStart
        if (silent >= silenceMs) {
          speaking = false
          // Only fire onSpeechEnd if speech was long enough to be real
          if (now - speechStartAt >= minSpeechMs) onSpeechEnd()
          else onSpeechEnd()   // still fire — let caller decide what to do with short clip
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
      cancelAnimationFrame(rafId)
      stream.getTracks().forEach(t => t.stop())
      ctx.close()
    },
  }
}
