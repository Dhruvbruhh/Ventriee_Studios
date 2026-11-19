import { execFile } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Credentials } from './credentials'
import { defaultEndpoint } from './engines'
import { findExecutable } from './lsp'
import type { EngineKind } from '../shared/types'

/** API providers with an OpenAI-style /audio/transcriptions endpoint, tried in order when the owner has their key. */
export const TRANSCRIBERS: Array<{ engine: EngineKind; name: string; model: string }> = [
  { engine: 'api-openai', name: 'OpenAI', model: 'whisper-1' },
  { engine: 'api-mistral', name: 'Mistral', model: 'voxtral-mini-latest' }
]

export const NO_TRANSCRIBER = 'Voice input needs a transcriber: install Whisper locally (pip install openai-whisper, plus ffmpeg), or add an OpenAI or Mistral API key in Settings.'

/** Speech (webm/opus from the mic) to text. A local Whisper keeps audio on this computer, so it goes first. */
export async function transcribe(audio: unknown, creds: Pick<Credentials, 'get'>, fetcher: typeof fetch = fetch): Promise<string> {
  if (!(audio instanceof Uint8Array) || audio.length < 100) throw new Error('No audio was recorded')
  if (audio.length > 25 * 1024 * 1024) throw new Error('Recordings can be up to 25 MB; record a shorter message')
  const whisper = findExecutable('whisper')
  if (whisper && findExecutable('ffmpeg')) {
    const dir = mkdtempSync(join(tmpdir(), 'ventriee-voice-'))
    try {
      writeFileSync(join(dir, 'speech.webm'), audio)
      await new Promise<void>((resolve, reject) => execFile(whisper, [join(dir, 'speech.webm'), '--model', 'base', '--output_format', 'txt', '--output_dir', dir, '--fp16', 'False'],
        { windowsHide: true, timeout: 5 * 60_000 }, (error, _out, stderr) => (error ? reject(new Error(`Whisper failed: ${String(stderr || error.message).trim().split('\n').at(-1)}`)) : resolve())))
      return readFileSync(join(dir, 'speech.txt'), 'utf8').trim()
    } finally { rmSync(dir, { recursive: true, force: true }) }
  }
  for (const t of TRANSCRIBERS) {
    const key = creds.get(t.engine)
    if (!key) continue
    const form = new FormData()
    form.append('file', new Blob([new Uint8Array(audio)], { type: 'audio/webm' }), 'speech.webm')
    form.append('model', t.model)
    const res = await fetcher(`${defaultEndpoint(t.engine)}/audio/transcriptions`, { method: 'POST', headers: { authorization: `Bearer ${key}` }, body: form })
    if (!res.ok) throw new Error(`${t.name} could not transcribe the recording (HTTP ${res.status})`)
    return String(((await res.json()) as { text?: string }).text ?? '').trim()
  }
  throw new Error(NO_TRANSCRIBER)
}
