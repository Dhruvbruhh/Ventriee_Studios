import type { Credentials } from './credentials'
import { defaultEndpoint } from './engines'
import { transcribe } from './transcribe'
import type { AppSettings, EngineKind, Project, VoiceSettings } from '../shared/types'

/** Whisper follows the style of its prompt, so this keeps Hinglish in Latin script instead of translating it. */
const STT_PROMPT = 'Conversation in Hindi, English or Hinglish. Kya haal hai, project open kar, homepage check karo.'

export function voiceEngine(s: AppSettings): { engine: EngineKind; model: string; endpoint: string } {
  if (s.voice.source === 'local') return { engine: 'api-ollama', model: s.voice.localModel, endpoint: s.voice.localEndpoint || defaultEndpoint('api-ollama') }
  return { engine: s.plannerEngine, model: s.plannerModel, endpoint: s.plannerEndpoint }
}

export function voiceSystemPrompt(input: { projects: Project[]; active: Project | null; running: boolean; tasks: string[] }): string {
  return `You are Ventriee, the voice assistant inside Ventriee Studios, an AI studio where an agency builds client websites and apps with a team of AI agents.
Your words are spoken aloud, so:
- Reply in 1-2 short sentences unless the owner asks for detail or an explanation.
- No markdown, lists, code blocks or emoji. Write numbers and names the way they are said.
- Follow the owner's language: Hinglish in, Hinglish out (Latin script); Hindi in Devanagari for Hindi; English for English.
- Friendly, confident, a little witty, never robotic. Ask one short question when a request is ambiguous.
- Never claim work started, ran or finished unless the state below says so.

Studio state:
- Projects: ${input.projects.map((p) => p.name).join(', ') || 'none'}
- Open project: ${input.active ? `${input.active.name}${input.active.description ? ` (${input.active.description})` : ''}` : 'none'}
- Agent run: ${input.running ? 'in progress' : 'idle'}
- Recent tasks:${input.tasks.length ? '\n' + input.tasks.join('\n') : ' none'}

When the owner asks you to do something in the studio, acknowledge it in a few words, then end with exactly one line of this form:
ACTION {"type":"open_project","name":"<project name from the list>"}
ACTION {"type":"show","view":"home|plan|code|office|clients|analytics|workflows|runs|settings"}
ACTION {"type":"run","instruction":"<the change for the agent team, written as a clear English instruction>"}
ACTION {"type":"stop_run"}
ACTION {"type":"new_session"}
Use "run" for building, fixing, checking or changing the open project; it starts the agent team. Use no ACTION line for questions or chat.`
}

function httpBase(url: string): string {
  const u = new URL(url)
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('The transcriber address must start with http:// or https://')
  return url.replace(/\/+$/, '')
}

/** A short spoken turn (16 kHz WAV) to text: the owner's local Whisper server first, else the built-in transcriber. */
export async function voiceTranscribe(audio: unknown, s: VoiceSettings, creds: Pick<Credentials, 'get'>, fetcher: typeof fetch = fetch): Promise<string> {
  if (!(audio instanceof Uint8Array) || audio.length < 100) throw new Error('No audio was recorded')
  if (!s.sttEndpoint.trim()) return transcribe(audio, creds, fetcher, 'wav')
  const form = new FormData()
  form.append('file', new Blob([new Uint8Array(audio)], { type: 'audio/wav' }), 'speech.wav')
  form.append('model', s.sttModel || 'whisper-1')
  form.append('prompt', STT_PROMPT)
  form.append('response_format', 'json')
  if (s.language !== 'auto') form.append('language', s.language)
  const res = await fetcher(`${httpBase(s.sttEndpoint.trim())}/audio/transcriptions`, { method: 'POST', body: form })
  if (!res.ok) throw new Error(`The local transcriber answered HTTP ${res.status}`)
  return String(((await res.json()) as { text?: string }).text ?? '').trim()
}

/** Natural speech for one sentence through OpenAI, as MP3 bytes the renderer plays. */
export async function voiceSpeak(text: string, s: VoiceSettings, creds: Pick<Credentials, 'get'>, fetcher: typeof fetch = fetch): Promise<Uint8Array> {
  const key = creds.get('api-openai')
  if (!key) throw new Error('OpenAI voices need an OpenAI API key (Settings → Engines). Switch the voice to System to stay local.')
  const res = await fetcher(`${defaultEndpoint('api-openai')}/audio/speech`, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: s.ttsModel, voice: s.voiceName || 'alloy', input: text.slice(0, 4000), response_format: 'mp3' })
  })
  if (!res.ok) throw new Error(`OpenAI speech failed (HTTP ${res.status})`)
  return new Uint8Array(await res.arrayBuffer())
}
