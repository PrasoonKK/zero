import { IpcMain } from 'electron'
import { writeFileSync, unlinkSync, existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

async function transcribeWithGroq(audioBuffer: Buffer, apiKey: string): Promise<string> {
  const tmpPath = join(tmpdir(), `zero-voice-${Date.now()}.webm`)
  try {
    writeFileSync(tmpPath, audioBuffer)

    const formData = new FormData()
    const fileBytes = readFileSync(tmpPath)
    const blob = new Blob([fileBytes], { type: 'audio/webm' })
    formData.append('file', blob, 'audio.webm')
    formData.append('model', 'whisper-large-v3-turbo')
    formData.append('response_format', 'text')

    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Groq ${res.status}: ${err}`)
    }

    return (await res.text()).trim()
  } finally {
    if (existsSync(tmpPath)) unlinkSync(tmpPath)
  }
}

// ElevenLabs TTS — runs in main process to avoid renderer CORS restrictions
async function elevenLabsTTS(text: string, apiKey: string, voiceId: string): Promise<Buffer | null> {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key':   apiKey,
      'Content-Type': 'application/json',
      'Accept':       'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_turbo_v2_5',
      // Tuned for clear, natural assistant voice:
      // stability=0.55 — consistent tone, not monotone; similarity=0.80 — stays true to voice;
      // style=0.25 — slight expressiveness; speaker_boost=true — cleaner audio
      voice_settings: { stability: 0.55, similarity_boost: 0.80, style: 0.25, use_speaker_boost: true },
    }),
  })
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`)
  return Buffer.from(await res.arrayBuffer())
}

export function registerVoiceHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('ai:transcribeAudio', async (_event, audioData: Buffer, groqKey: string) => {
    if (!groqKey) return { success: false, error: 'No Groq API key. Add it in Settings → VOICE_INPUT.' }
    try {
      const transcript = await transcribeWithGroq(Buffer.from(audioData), groqKey)
      return { success: true, transcript }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('ai:ttsSpeak', async (_event, text: string, apiKey: string, voiceId: string) => {
    try {
      const audio = await elevenLabsTTS(text, apiKey, voiceId)
      return { success: true, audio: audio?.toString('base64') }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('ai:startRecording', async () => ({ available: false, message: '' }))
  ipcMain.handle('ai:stopRecording',  async () => ({ available: false, transcript: '', message: '' }))
}
