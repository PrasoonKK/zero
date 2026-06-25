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

  ipcMain.handle('ai:startRecording', async () => ({ available: false, message: '' }))
  ipcMain.handle('ai:stopRecording',  async () => ({ available: false, transcript: '', message: '' }))
}
