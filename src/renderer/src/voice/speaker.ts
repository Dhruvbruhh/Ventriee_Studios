import { ttsLang } from './text'

export interface SpeakerConfig { tts: 'system' | 'openai'; voiceName: string; rate: number; volume: number }

export function pickVoice(name: string, lang: string): SpeechSynthesisVoice | null {
  const voices = speechSynthesis.getVoices()
  const chosen = voices.find((v) => v.name === name)
  // The owner's voice, unless it cannot speak this sentence's language.
  if (chosen && chosen.lang.slice(0, 2) === lang.slice(0, 2)) return chosen
  return voices.find((v) => v.lang === lang) ?? voices.find((v) => v.lang.startsWith(lang.slice(0, 2))) ?? chosen ?? null
}

/** Plays sentences in order. Cloud audio for each sentence is requested as soon as it is queued, so playback has no gaps. */
export class Speaker {
  private queue: Array<{ text: string; audio?: Promise<Uint8Array> }> = []
  private busy = false
  private generation = 0
  private current: HTMLAudioElement | null = null

  constructor(
    private config: () => SpeakerConfig,
    private events: { onStart: () => void; onIdle: () => void; onError: (message: string) => void }
  ) {}

  get active() {
    return this.busy || this.queue.length > 0
  }

  enqueue(text: string) {
    const audio = this.config().tts === 'openai' ? window.ventriee.voiceSpeak(text) : undefined
    audio?.catch(() => {}) // reported when its turn to play comes
    this.queue.push({ text, audio })
    if (!this.busy) void this.next()
  }

  stop() {
    this.generation++
    this.queue = []
    speechSynthesis.cancel()
    this.current?.pause()
    this.current = null
    if (this.busy) {
      this.busy = false
      this.events.onIdle()
    }
  }

  private async next() {
    const item = this.queue.shift()
    if (!item) {
      this.busy = false
      this.events.onIdle()
      return
    }
    this.busy = true
    const generation = this.generation
    try {
      if (item.audio) await this.playAudio(item.audio, generation)
      else await this.speakSystem(item.text, generation)
    } catch (e) {
      if (generation === this.generation) this.events.onError(e instanceof Error ? e.message : String(e))
    }
    if (generation === this.generation) void this.next()
  }

  private speakSystem(text: string, generation: number) {
    return new Promise<void>((resolve) => {
      const c = this.config()
      const u = new SpeechSynthesisUtterance(text)
      u.lang = ttsLang(text)
      const voice = pickVoice(c.voiceName, u.lang)
      if (voice) u.voice = voice
      u.rate = c.rate
      u.volume = c.volume
      u.onstart = () => { if (generation === this.generation) this.events.onStart() }
      u.onend = () => resolve()
      u.onerror = () => resolve()
      speechSynthesis.speak(u)
    })
  }

  private async playAudio(pending: Promise<Uint8Array>, generation: number) {
    const bytes = await pending
    if (generation !== this.generation) return
    const c = this.config()
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'audio/mpeg' }))
    const audio = new Audio(url)
    audio.playbackRate = c.rate
    audio.volume = c.volume
    this.current = audio
    audio.onplaying = () => { if (generation === this.generation) this.events.onStart() }
    try {
      await new Promise<void>((resolve) => {
        audio.onended = () => resolve()
        audio.onerror = () => resolve()
        audio.onpause = () => resolve()
        audio.play().catch(() => resolve())
      })
    } finally {
      URL.revokeObjectURL(url)
      if (this.current === audio) this.current = null
    }
  }
}
