// Text-to-speech via Web Speech API (Chromium built-in, uses Windows SAPI)
// No API keys, no packages, works offline.

let currentUtterance: SpeechSynthesisUtterance | null = null

export function speak(text: string, rate = 1.05, pitch = 1.0): Promise<void> {
  return new Promise((resolve) => {
    stop()

    // Strip markdown so it reads cleanly
    const clean = text
      .replace(/```[\s\S]*?```/g, 'code block')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/#{1,6}\s/g, '')
      .replace(/>\s/g, '')
      .replace(/\n{2,}/g, '. ')
      .replace(/\n/g, ' ')
      .trim()

    if (!clean) { resolve(); return }

    const utterance = new SpeechSynthesisUtterance(clean)
    utterance.rate  = rate
    utterance.pitch = pitch
    utterance.volume = 1

    // Prefer a natural-sounding voice if available
    const voices = window.speechSynthesis.getVoices()
    const preferred = voices.find(v =>
      v.name.includes('Aria') ||    // Windows 11 neural voice
      v.name.includes('Jenny') ||
      v.name.includes('Zira') ||
      v.name.includes('David')
    ) || voices.find(v => v.lang.startsWith('en')) || null
    if (preferred) utterance.voice = preferred

    utterance.onend   = () => resolve()
    utterance.onerror = () => resolve()

    currentUtterance = utterance
    window.speechSynthesis.speak(utterance)
  })
}

export function stop(): void {
  window.speechSynthesis.cancel()
  currentUtterance = null
}

export function isSpeaking(): boolean {
  return window.speechSynthesis.speaking
}
