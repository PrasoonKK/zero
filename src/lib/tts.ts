// TTS engine — prefetch pipeline so chunks play back-to-back with no gap.
//
// How it works:
//   drain() picks up item N, immediately starts pre-fetching item N+1 in
//   parallel. By the time N finishes playing, N+1 is already downloaded.
//   Result: first chunk has ~250ms latency; all subsequent chunks are gapless.
//
// Providers:
//   ElevenLabs (via IPC — CORS blocked in renderer) when key is set
//   Web Speech API fallback (OS voices)

let _elevenLabsKey   = ''
// Adam: deep, calm, authoritative — Jarvis-like
let _elevenLabsVoice = 'pNInz6obpgDQGcFmaJgB'
let _rate            = 1.0

export function configureTTS(opts: { elevenLabsKey?: string; voiceId?: string; rate?: number }) {
  if (opts.elevenLabsKey  !== undefined) _elevenLabsKey   = opts.elevenLabsKey
  if (opts.voiceId        !== undefined) _elevenLabsVoice = opts.voiceId
  if (opts.rate           !== undefined) _rate            = opts.rate
}

// ── Queue ─────────────────────────────────────────────────────────────────────
type Item = {
  text:          string
  resolve:       () => void
  audioPromise?: Promise<string | null>   // pre-fetched base64, set by previous drain()
}

const _q:     Item[]               = []
let _busy     = false
let _stopped  = false
let _curAudio: HTMLAudioElement | null = null

// Kick off an ElevenLabs fetch — returns a promise for the base64 audio string.
// Runs from drain() so it starts while the previous item is still playing.
function prefetchEL(text: string): Promise<string | null> {
  return window.ai.ttsSpeak(text, _elevenLabsKey, _elevenLabsVoice)
    .then(res => (res.success && res.audio) ? res.audio : null)
    .catch(() => null)
}

function drain() {
  if (_busy || _stopped || _q.length === 0) return
  _busy = true
  const item = _q.shift()!
  const clean = stripMarkdown(item.text).trim()

  const done = () => { _busy = false; item.resolve(); drain() }
  if (!clean) { done(); return }

  // Pre-fetch next item RIGHT NOW (parallel to current item loading/playing)
  if (_elevenLabsKey && _q.length > 0 && !_q[0].audioPromise) {
    const nextClean = stripMarkdown(_q[0].text).trim()
    if (nextClean) _q[0].audioPromise = prefetchEL(nextClean)
  }

  if (_elevenLabsKey) {
    // Use pre-fetched audio if available, otherwise fetch now (first item)
    const audioP = item.audioPromise ?? prefetchEL(clean)
    audioP.then(b64 => {
      if (_stopped) { done(); return }
      if (!b64) { speakOS(clean).then(done).catch(done); return }
      playBase64(b64).then(done).catch(done)
    }).catch(() => speakOS(clean).then(done).catch(done))
  } else {
    speakOS(clean).then(done).catch(done)
  }
}

export function speak(text: string): Promise<void> {
  if (_stopped) return Promise.resolve()
  return new Promise(resolve => {
    _q.push({ text, resolve })
    drain()
  })
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

// ── Web Speech API — OS voices, handles Chromium pause bug ───────────────────
let _voicesCache: SpeechSynthesisVoice[] | null = null

async function getVoices(): Promise<SpeechSynthesisVoice[]> {
  if (_voicesCache) return _voicesCache
  const immediate = window.speechSynthesis.getVoices()
  if (immediate.length) { _voicesCache = immediate; return immediate }
  return new Promise(resolve => {
    const handler = () => { _voicesCache = window.speechSynthesis.getVoices(); resolve(_voicesCache) }
    window.speechSynthesis.addEventListener('voiceschanged', handler, { once: true })
    setTimeout(handler, 1500)
  })
}

async function speakOS(text: string): Promise<void> {
  const voices = await getVoices()

  return new Promise(resolve => {
    const u    = new SpeechSynthesisUtterance(text)
    u.rate     = _rate
    u.pitch    = 1.0
    u.volume   = 1.0

    // Prefer Windows 11 neural voices — much better than legacy SAPI
    const PRIORITY = [
      'Microsoft Guy Online (Natural)',
      'Microsoft Aria Online (Natural)',
      'Microsoft Jenny Online (Natural)',
      'Microsoft Guy',
      'Microsoft Aria',
      'Microsoft Jenny',
      'Samantha', 'Karen', 'Daniel', 'Alex',
    ]
    const voice =
      PRIORITY.map(n => voices.find(v => v.name === n)).find(Boolean) ||
      voices.find(v => v.name.includes('Natural') && v.lang.startsWith('en')) ||
      voices.find(v => v.lang === 'en-US') ||
      voices.find(v => v.lang.startsWith('en')) ||
      null
    if (voice) u.voice = voice

    let done = false
    const finish = () => { if (done) return; done = true; clearInterval(keepAlive); resolve() }
    u.onend   = finish
    u.onerror = finish

    // Chromium Electron bug: speechSynthesis silently pauses → resume every 250ms
    const keepAlive = setInterval(() => {
      if (window.speechSynthesis.paused) window.speechSynthesis.resume()
    }, 250)

    // Safety timeout — onend sometimes never fires in Electron
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
