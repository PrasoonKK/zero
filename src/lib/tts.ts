// TTS with two providers:
// 1. ElevenLabs (if key set) — high quality, cross-platform, free 10k chars/month
// 2. Web Speech API fallback — OS voices, no key, works offline
//
// Both share a sentence queue so audio never overlaps.

let _elevenLabsKey  = ''
let _elevenLabsVoice = '21m00Tcm4TlvDq8ikWAM'  // Rachel — clear, neutral
let _rate = 1.05

// ── Config (called from App.tsx when settings load) ──────────────────────────
export function configureTTS(opts: { elevenLabsKey?: string; voiceId?: string; rate?: number }) {
  if (opts.elevenLabsKey  !== undefined) _elevenLabsKey   = opts.elevenLabsKey
  if (opts.voiceId        !== undefined) _elevenLabsVoice = opts.voiceId
  if (opts.rate           !== undefined) _rate            = opts.rate
}

// ── Queue ────────────────────────────────────────────────────────────────────
type QueueItem = { text: string; resolve: () => void }
const _queue: QueueItem[] = []
let _busy = false
let _stopped = false
let _currentAudio: HTMLAudioElement | null = null

function drainQueue() {
  if (_busy || _stopped || _queue.length === 0) return
  _busy = true
  const { text, resolve } = _queue.shift()!
  const clean = stripMarkdown(text)
  if (!clean) { _busy = false; resolve(); drainQueue(); return }

  const done = () => { _busy = false; resolve(); drainQueue() }

  if (_elevenLabsKey) {
    speakElevenLabs(clean).then(done).catch(done)
  } else {
    speakOS(clean).then(done).catch(done)
  }
}

// ── Public API ────────────────────────────────────────────────────────────────
/** Queue a text segment for speaking. Returns when this segment finishes playing. */
export function speak(text: string): Promise<void> {
  if (_stopped) return Promise.resolve()
  return new Promise(resolve => { _queue.push({ text, resolve }); drainQueue() })
}

/** Immediately stop all speech and clear queue. */
export function stop(): void {
  _stopped = true
  _queue.length = 0
  window.speechSynthesis.cancel()
  if (_currentAudio) { _currentAudio.pause(); _currentAudio = null }
  // Re-enable for future calls
  setTimeout(() => { _stopped = false }, 50)
}

export function isSpeaking(): boolean {
  return _busy || window.speechSynthesis.speaking
}

// ── ElevenLabs provider ───────────────────────────────────────────────────────
async function speakElevenLabs(text: string): Promise<void> {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${_elevenLabsVoice}`, {
    method: 'POST',
    headers: { 'xi-api-key': _elevenLabsKey, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
    body: JSON.stringify({
      text,
      model_id: 'eleven_turbo_v2_5',   // fastest model, ~300ms latency
      voice_settings: { stability: 0.45, similarity_boost: 0.75, style: 0.1, use_speaker_boost: true },
    }),
  })
  if (!res.ok) {
    // ElevenLabs error — fall back to OS
    return speakOS(text)
  }
  const blob = new Blob([await res.arrayBuffer()], { type: 'audio/mpeg' })
  const url  = URL.createObjectURL(blob)
  return new Promise((resolve) => {
    const audio = new Audio(url)
    _currentAudio = audio
    audio.onended = () => { URL.revokeObjectURL(url); _currentAudio = null; resolve() }
    audio.onerror = () => { URL.revokeObjectURL(url); _currentAudio = null; resolve() }
    audio.play().catch(() => resolve())
  })
}

// ── Web Speech API provider ───────────────────────────────────────────────────
async function speakOS(text: string): Promise<void> {
  // Ensure voices are loaded (Chromium defers this)
  const voices = await getVoices()

  return new Promise(resolve => {
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate   = _rate
    utterance.pitch  = 1.0
    utterance.volume = 1

    // Prefer neural/high-quality voices across platforms
    const preferred = voices.find(v =>
      v.name.includes('Aria')   ||  // Windows 11 neural
      v.name.includes('Jenny')  ||
      v.name.includes('Guy')    ||
      v.name.includes('Samantha') || // macOS
      v.name.includes('Karen')  ||   // macOS
      v.name.includes('Daniel') ||   // macOS/iOS
      v.name.includes('Zira')   ||   // Windows 8+
      v.name.includes('David')
    ) || voices.find(v => v.lang.startsWith('en')) || null
    if (preferred) utterance.voice = preferred

    // Chromium bug: speechSynthesis silently pauses after ~15s.
    // Keep-alive: resume every 500ms if paused.
    const keepAlive = setInterval(() => {
      if (window.speechSynthesis.paused) window.speechSynthesis.resume()
    }, 500)

    const cleanup = () => { clearInterval(keepAlive); resolve() }
    utterance.onend   = cleanup
    utterance.onerror = cleanup

    window.speechSynthesis.cancel()  // clear any stuck state
    window.speechSynthesis.speak(utterance)

    // Safety net: if onend never fires (another Chromium bug), resolve after timeout
    setTimeout(cleanup, text.length * 90 + 3000)
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise(resolve => {
    const v = window.speechSynthesis.getVoices()
    if (v.length) { resolve(v); return }
    window.speechSynthesis.addEventListener('voiceschanged', () => resolve(window.speechSynthesis.getVoices()), { once: true })
    setTimeout(() => resolve([]), 1000)  // fallback if event never fires
  })
}

function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, 'code block.')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/#{1,6}\s+/g, '')
    .replace(/>\s+/g, '')
    .replace(/\n{2,}/g, '. ')
    .replace(/\n/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}
