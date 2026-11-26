export interface VadOptions {
  frameMs: number
  /** Silence that ends a turn. */
  endSilenceMs: number
  /** Speech needed before a turn starts, so clicks and coughs are ignored. */
  minSpeechMs: number
  /** How far above the background noise speech must be. */
  factor: number
  /** Absolute floor, for a very quiet room. */
  minRms: number
}

const CALIBRATION_FRAMES = 15

export const DEFAULT_VAD: VadOptions ={ frameMs: 21, endSilenceMs: 700, minSpeechMs: 120, factor: 3, minRms: 0.012 }

/**
 * Energy voice-activity detection with an adaptive noise floor: the floor follows
 * the room while nobody speaks, so a fan or AC raises the bar instead of holding a turn open.
 */
export class Vad {
  noise = 0
  speaking = false
  private frames = 0
  private speechMs = 0
  private silenceMs = 0
  constructor(public opts: VadOptions = DEFAULT_VAD) {}

  /** boost > 1 makes starting a turn harder, e.g. while the assistant's own voice may leak into the mic. */
  push(rms: number, boost = 1): 'start' | 'end' | null {
    // The first ~300 ms only learn the room.
    if (this.frames++ < CALIBRATION_FRAMES) {
      this.noise = this.frames === 1 ? rms : this.noise * 0.7 + rms * 0.3
      return null
    }
    const threshold = Math.max(this.opts.minRms, this.noise * this.opts.factor) * boost
    // Minimum tracking: the floor drops fast in pauses and rises slowly, so a fan switched on mid-turn still lets the turn end.
    this.noise += (rms - this.noise) * (rms < this.noise ? 0.1 : this.speaking ? 0.002 : 0.02)
    if (!this.speaking) {
      if (rms > threshold) {
        this.speechMs += this.opts.frameMs
        if (this.speechMs >= this.opts.minSpeechMs) {
          this.speaking = true
          this.silenceMs = 0
          return 'start'
        }
      } else {
        this.speechMs = 0
      }
      return null
    }
    // Hysteresis: a softer level keeps the turn going between words.
    if (rms > threshold * 0.6) this.silenceMs = 0
    else this.silenceMs += this.opts.frameMs
    if (this.silenceMs >= this.opts.endSilenceMs) {
      this.speaking = false
      this.speechMs = 0
      return 'end'
    }
    return null
  }

  reset() {
    this.speaking = false
    this.speechMs = 0
    this.silenceMs = 0
  }
}

export function rms(samples: Float32Array): number {
  let sum = 0
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i]
  return Math.sqrt(sum / (samples.length || 1))
}

/** Average-based resampling down to the rate Whisper expects. */
export function downsample(input: Float32Array, from: number, to: number): Float32Array {
  if (to >= from) return input
  const ratio = from / to
  const out = new Float32Array(Math.floor(input.length / ratio))
  for (let i = 0; i < out.length; i++) {
    const start = Math.floor(i * ratio)
    const end = Math.min(input.length, Math.floor((i + 1) * ratio))
    let sum = 0
    for (let j = start; j < end; j++) sum += input[j]
    out[i] = sum / Math.max(1, end - start)
  }
  return out
}

/** 16-bit PCM mono WAV. */
export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)
  const ascii = (offset: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i)) }
  ascii(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  ascii(8, 'WAVE')
  ascii(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  ascii(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return new Uint8Array(buffer)
}

export function concat(frames: Float32Array[]): Float32Array {
  const out = new Float32Array(frames.reduce((n, f) => n + f.length, 0))
  let at = 0
  for (const f of frames) { out.set(f, at); at += f.length }
  return out
}
