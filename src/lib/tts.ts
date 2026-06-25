// TTS engine — three providers, best available first:
//   1. ElevenLabs  (API key required — best quality)
//   2. Edge TTS    (free, no key — Microsoft neural voices, natural punctuation)
//   3. Web Speech  (OS fallback — last resort)
//
// Prefetch pipeline: fetches chunk N+1 while chunk N is playing → gapless audio.

let _elevenLabsKey   = ''
let _elevenLabsVoice = 'pNInz6obpgDQGcFmaJgB'   // Adam (deep/calm)
let _edgeVoice       = 'en-US-GuyNeural'          // Guy (authoritative, closest to Jarvis)
let _rate            = 1.0

export function configureTTS(opts: {
  elevenLabsKey?: string
  elevenLabsVoice?: string
  edgeVoice?: string
  rate?: number
}) {
  if (opts.elevenLabsKey   !== undefined) _elevenLabsKey   = opts.elevenLabsKey
  if (opts.elevenLabsVoice !== undefined) _elevenLabsVoice = opts.elevenLabsVoice
  if (opts.edgeVoice       !== undefined) _edgeVoice       = opts.edgeVoice
  if (opts.rate            !== undefined) _rate            = opts.rate
}

// ── Queue ─────────────────────────────────────────────────────────────────────
type Item = {
  text:          string
  resolve:       () => void
  audioPromise?: Promise<string | null>   // pre-fetched base64 audio
}

const _q:    Item[]                    = []
let _busy    = false
let _stopped = false
let _curAudio: HTMLAudioElement | null = null

// ── Provider: which one to use ────────────────────────────────────────────────
function useElevenLabs() { return !!_elevenLabsKey }
function useEdgeTTS()    { return !_elevenLabsKey }   // Edge TTS when no EL key

// ── Prefetch helpers ──────────────────────────────────────────────────────────
function fetchElevenLabs(text: string): Promise<string | null> {
  return window.ai.ttsSpeak(text, _elevenLabsKey, _elevenLabsVoice)
    .then(r => r.success && r.audio ? r.audio : null)
    .catch(() => null)
}

function fetchEdgeTTS(text: string): Promise<string | null> {
  return window.ai.edgeTTS(text, _edgeVoice)
    .then(r => r.success && r.audio ? r.audio : null)
    .catch(() => null)
}

function prefetch(text: string): Promise<string | null> {
  const clean = stripMarkdown(text).trim()
  if (!clean) return Promise.resolve(null)
  return useElevenLabs() ? fetchElevenLabs(clean) : fetchEdgeTTS(clean)
}

// ── Core drain loop ───────────────────────────────────────────────────────────
function drain() {
  if (_busy || _stopped || _q.length === 0) return
  _busy = true
  const item  = _q.shift()!
  const clean = stripMarkdown(item.text).trim()

  const done = () => { _busy = false; item.resolve(); drain() }
  if (!clean) { done(); return }

  // Start pre-fetching next item right now — runs in parallel with current playback
  if (_q.length > 0 && !_q[0].audioPromise) {
    const nextClean = stripMarkdown(_q[0].text).trim()
    if (nextClean) _q[0].audioPromise = prefetch(nextClean)
  }

  if (useElevenLabs() || useEdgeTTS()) {
    const audioP = item.audioPromise ?? prefetch(clean)
    audioP.then(b64 => {
      if (_stopped) { done(); return }
      if (!b64)     { speakOS(clean).then(done).catch(done); return }
      playBase64(b64).then(done).catch(done)
    }).catch(() => speakOS(clean).then(done).catch(done))
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
  if (_curAudio) { _curAudio.pause(); _curAudio.src = ''; _curAudio = null }
  window.speechSynthesis.cancel()
  setTimeout(() => { _stopped = false }, 80)
}

export function isSpeaking(): boolean {
  return _busy || !!_curAudio || window.speechSynthesis.speaking
}

// ── Audio playback ─────────────────────────────────────────────────────────────
function playBase64(b64: string): Promise<void> {
  return new Promise(resolve => {
    const bytes = atob(b64)
    const buf   = new Uint8Array(bytes.length)
    for (let i = 0; i < bytes.length; i++) buf[i] = bytes.charCodeAt(i)
    const blob  = new Blob([buf], { type: 'audio/mpeg' })
    const url   = URL.createObjectURL(blob)
    const audio = new Audio(url)
    _curAudio   = audio
    const cleanup = () => { URL.revokeObjectURL(url); _curAudio = null; resolve() }
    audio.onended = cleanup
    audio.onerror = cleanup
    audio.play().catch(cleanup)
  })
}

// ── Web Speech API fallback ────────────────────────────────────────────────────
let _voicesCache: SpeechSynthesisVoice[] | null = null

async function getVoices(): Promise<SpeechSynthesisVoice[]> {
  if (_voicesCache) return _voicesCache
  const v = window.speechSynthesis.getVoices()
  if (v.length) { _voicesCache = v; return v }
  return new Promise(resolve => {
    const handler = () => { _voicesCache = window.speechSynthesis.getVoices(); resolve(_voicesCache) }
    window.speechSynthesis.addEventListener('voiceschanged', handler, { once: true })
    setTimeout(handler, 1500)
  })
}

async function speakOS(text: string): Promise<void> {
  const voices = await getVoices()
  return new Promise(resolve => {
    const u = new SpeechSynthesisUtterance(text)
    u.rate = _rate; u.pitch = 1.0; u.volume = 1.0

    const PRIORITY = [
      'Microsoft Guy Online (Natural)', 'Microsoft Aria Online (Natural)',
      'Microsoft Jenny Online (Natural)', 'Microsoft Guy', 'Microsoft Aria',
      'Samantha', 'Karen', 'Daniel',
    ]
    const voice = PRIORITY.map(n => voices.find(v => v.name === n)).find(Boolean)
      || voices.find(v => v.lang === 'en-US') || null
    if (voice) u.voice = voice

    let done = false
    const finish = () => { if (done) return; done = true; clearInterval(kA); resolve() }
    u.onend = finish; u.onerror = finish
    // Chromium Electron: speechSynthesis silently pauses — keep-alive fix
    const kA = setInterval(() => { if (window.speechSynthesis.paused) window.speechSynthesis.resume() }, 250)
    setTimeout(finish, Math.max(3000, text.length * 80))
    window.speechSynthesis.speak(u)
  })
}

// ── Helpers ────────────────────────────────────────────────────────────────────
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
