// TTS engine — sentence queue, two providers:
//   ElevenLabs (via IPC to avoid CORS) when key is set
//   Web Speech API fallback (OS voices, no key)

let _elevenLabsKey   = ''
// Adam: deep, calm, authoritative — closest to Jarvis
// Alternative voices (paste into SettingsPanel later):
//   Rachel:   21m00Tcm4TlvDq8ikWAM  (warm female)
//   Clyde:    2EiwWnXFnvU5JabPnv8n  (older male, rich)
//   Freya:    jsCqWAovK2LkecY7zXl4  (agentic assistant female)
let _elevenLabsVoice = 'pNInz6obpgDQGcFmaJgB'   // Adam
let _rate            = 1.0

export function configureTTS(opts: { elevenLabsKey?: string; voiceId?: string; rate?: number }) {
  if (opts.elevenLabsKey  !== undefined) _elevenLabsKey   = opts.elevenLabsKey
  if (opts.voiceId        !== undefined) _elevenLabsVoice = opts.voiceId
  if (opts.rate           !== undefined) _rate            = opts.rate
}

// ── Queue — JS-managed, not Web Speech API's internal queue ──────────────────
// Each speak() call adds to this queue. drainQueue() processes one at a time.
type Item = { text: string; resolve: () => void }
const _q: Item[] = []
let _busy    = false
let _stopped = false
let _currentAudio: HTMLAudioElement | null = null

function drain() {
  if (_busy || _stopped || _q.length === 0) return
  _busy = true
  const { text, resolve } = _q.shift()!
  const clean = stripMarkdown(text).trim()

  const done = () => { _busy = false; resolve(); drain() }
  if (!clean) { done(); return }

  if (_elevenLabsKey) {
    speakElevenLabs(clean).then(done).catch(done)
  } else {
    speakOS(clean).then(done).catch(done)
  }
}

export function speak(text: string): Promise<void> {
  if (_stopped) return Promise.resolve()
  return new Promise(resolve => { _q.push({ text, resolve }); drain() })
}

export function stop(): void {
  _stopped = true
  _q.length = 0
  _busy = false
  if (_currentAudio) { _currentAudio.pause(); _currentAudio.src = ''; _currentAudio = null }
  window.speechSynthesis.cancel()
  setTimeout(() => { _stopped = false }, 80)
}

export function isSpeaking(): boolean {
  return _busy || !!_currentAudio || window.speechSynthesis.speaking
}

// ── ElevenLabs — via IPC (main process does the fetch, no CORS) ───────────────
async function speakElevenLabs(text: string): Promise<void> {
  const res = await window.ai.ttsSpeak(text, _elevenLabsKey, _elevenLabsVoice)

  if (!res.success || !res.audio) {
    // ElevenLabs failed — fall back to OS
    return speakOS(text)
  }

  // Decode base64 → Blob → play
  const bytes  = atob(res.audio)
  const buf    = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) buf[i] = bytes.charCodeAt(i)
  const blob   = new Blob([buf], { type: 'audio/mpeg' })
  const url    = URL.createObjectURL(blob)

  return new Promise(resolve => {
    const audio = new Audio(url)
    _currentAudio = audio
    const cleanup = () => {
      URL.revokeObjectURL(url)
      _currentAudio = null
      resolve()
    }
    audio.onended = cleanup
    audio.onerror = cleanup
    audio.play().catch(cleanup)
  })
}

// ── Web Speech API — OS voices, no key, handles Chromium bugs ─────────────────
let _voicesCache: SpeechSynthesisVoice[] | null = null

async function getVoices(): Promise<SpeechSynthesisVoice[]> {
  if (_voicesCache) return _voicesCache
  const immediate = window.speechSynthesis.getVoices()
  if (immediate.length) { _voicesCache = immediate; return immediate }
  return new Promise(resolve => {
    const handler = () => {
      const v = window.speechSynthesis.getVoices()
      _voicesCache = v
      resolve(v)
    }
    window.speechSynthesis.addEventListener('voiceschanged', handler, { once: true })
    setTimeout(() => { handler() }, 1500)   // fallback if event never fires
  })
}

async function speakOS(text: string): Promise<void> {
  const voices = await getVoices()

  return new Promise(resolve => {
    const utterance    = new SpeechSynthesisUtterance(text)
    utterance.rate     = _rate
    utterance.pitch    = 1.0
    utterance.volume   = 1.0

    // Prefer neural/online voices — they sound significantly better than legacy SAPI
    // Order: best-sounding first. Windows 11 "Natural" voices are miles ahead of Zira/David.
    const VOICE_PRIORITY = [
      'Microsoft Guy Online (Natural)',
      'Microsoft Aria Online (Natural)',
      'Microsoft Jenny Online (Natural)',
      'Microsoft Guy',
      'Microsoft Aria',
      'Microsoft Jenny',
      'Samantha',   // macOS neural
      'Karen',      // macOS
      'Daniel',     // macOS UK
      'Alex',       // macOS
    ]
    const preferred =
      VOICE_PRIORITY.map(name => voices.find(v => v.name === name)).find(Boolean) ||
      voices.find(v => v.name.includes('Natural') && v.lang.startsWith('en')) ||
      voices.find(v => v.lang === 'en-US') ||
      voices.find(v => v.lang.startsWith('en')) ||
      null
    if (preferred) utterance.voice = preferred

    let resolved = false
    const finish = () => {
      if (resolved) return
      resolved = true
      clearInterval(keepAlive)
      resolve()
    }
    utterance.onend   = finish
    utterance.onerror = finish

    // Chromium Electron bug: speechSynthesis silently pauses. Resume every 250ms.
    const keepAlive = setInterval(() => {
      if (window.speechSynthesis.paused) window.speechSynthesis.resume()
    }, 250)

    // Safety timeout — if onend never fires (another Chromium bug)
    setTimeout(finish, Math.max(3000, text.length * 80))

    // NOTE: do NOT call speechSynthesis.cancel() here — it would kill other queued items
    window.speechSynthesis.speak(utterance)
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function stripMarkdown(t: string): string {
  return t
    .replace(/```[\s\S]*?```/g, 'code block.')
    .replace(/`[^`]+`/g, s => s.slice(1, -1))
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/#{1,6}\s+/g, '')
    .replace(/>\s+/g, '')
    .replace(/\n{2,}/g, '. ')
    .replace(/\n/g, ' ')
    .replace(/\s{2,}/g, ' ')
}
