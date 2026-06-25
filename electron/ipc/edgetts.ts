import { IpcMain } from 'electron'
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts'

// Best free neural voices — all sound natural, handle punctuation correctly
export const EDGE_VOICES = {
  guy:   'en-US-GuyNeural',    // calm, authoritative male — default (closest to Jarvis)
  aria:  'en-US-AriaNeural',   // natural female
  davis: 'en-US-DavisNeural',  // warm, conversational male
  tony:  'en-US-TonyNeural',   // confident male
  jason: 'en-US-JasonNeural',  // deep male
} as const

async function synthesize(text: string, voice = EDGE_VOICES.guy): Promise<Buffer | null> {
  const tts = new MsEdgeTTS()
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    tts.toStream(text)
      .then(({ audioStream }) => {
        audioStream.on('data',  (chunk: Buffer) => chunks.push(chunk))
        audioStream.on('end',   () => resolve(Buffer.concat(chunks)))
        audioStream.on('error', reject)
      })
      .catch(reject)
  })
}

export function registerEdgeTTSHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('ai:edgeTTS', async (_e, text: string, voice?: string) => {
    try {
      const buf = await synthesize(text, (voice as typeof EDGE_VOICES[keyof typeof EDGE_VOICES]) || EDGE_VOICES.guy)
      if (!buf) return { success: false, error: 'empty audio' }
      return { success: true, audio: buf.toString('base64') }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })
}
