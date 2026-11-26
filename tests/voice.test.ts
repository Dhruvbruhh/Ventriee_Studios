import { describe, expect, it } from 'vitest'
import { SentenceStream, afterWakeWord, parseAction, speechStyle, stripAction } from '../src/renderer/src/voice/text'
import { Vad, downsample, encodeWav } from '../src/renderer/src/voice/audio'

describe('SentenceStream', () => {
  it('releases each sentence as soon as it is complete', () => {
    const s = new SentenceStream()
    expect(s.push('Homepage check kar')).toEqual([])
    expect(s.push(' raha hoon. Ek ')).toEqual(['Homepage check kar raha hoon.'])
    expect(s.push('minute!')).toEqual([])
    expect(s.flush()).toEqual(['Ek minute!'])
  })

  it('does not split a decimal that arrives in two chunks', () => {
    const s = new SentenceStream()
    expect(s.push('Version 3.')).toEqual([])
    expect(s.push('5 is out. ')).toEqual(['Version 3.5 is out.'])
  })

  it('handles the Hindi full stop', () => {
    const s = new SentenceStream()
    expect(s.push('ठीक है। अभी करता हूँ')).toEqual(['ठीक है।'])
  })

  it('never speaks the ACTION line', () => {
    const s = new SentenceStream()
    const spoken = [...s.push('Opening EXYO.\nACTION {"type":"open_'), ...s.push('project","name":"EXYO"}'), ...s.flush()]
    expect(spoken).toEqual(['Opening EXYO.'])
    expect(parseAction(s.text)).toEqual({ type: 'open_project', name: 'EXYO' })
    expect(stripAction(s.text)).toBe('Opening EXYO.')
  })

  it('breaks a long run-on reply at a comma so audio starts early', () => {
    const s = new SentenceStream()
    const out = s.push(`${'word '.repeat(20)}, and then ${'more '.repeat(20)}`)
    expect(out.length).toBe(1)
    expect(out[0].endsWith(',')).toBe(true)
  })
})

describe('parseAction', () => {
  it('rejects unknown or incomplete actions', () => {
    expect(parseAction('ACTION {"type":"delete_everything"}')).toBeNull()
    expect(parseAction('ACTION {"type":"run"}')).toBeNull()
    expect(parseAction('ACTION {"type":"run"')).toBeNull()
    expect(parseAction('just chatting')).toBeNull()
    expect(parseAction('Sure.\nACTION {"type":"run","instruction":"Fix the mobile overflow"}')).toEqual({ type: 'run', instruction: 'Fix the mobile overflow' })
  })
})

describe('speech style and wake word', () => {
  it('tells Hindi, Hinglish and English apart', () => {
    expect(speechStyle('यह प्रोजेक्ट खोलो')).toBe('hi')
    expect(speechStyle('Ab iska homepage check kar')).toBe('hinglish')
    expect(speechStyle('Open the homepage please')).toBe('en')
  })

  it('finds the request after the wake word', () => {
    expect(afterWakeWord('Hey Ventriee, open EXYO')).toBe('open EXYO')
    expect(afterWakeWord('ventri')).toBe('')
    expect(afterWakeWord('open EXYO')).toBeNull()
  })
})

describe('Vad', () => {
  const frames = (n: number, level: number) => Array.from({ length: n }, () => level)

  it('starts after enough speech and ends after enough silence', () => {
    const vad = new Vad({ frameMs: 20, endSilenceMs: 200, minSpeechMs: 60, factor: 3, minRms: 0.01 })
    const events = [...frames(20, 0.002), ...frames(10, 0.2), ...frames(15, 0.002)].map((l) => vad.push(l)).filter(Boolean)
    expect(events).toEqual(['start', 'end'])
  })

  it('ignores a click shorter than the minimum speech', () => {
    const vad = new Vad({ frameMs: 20, endSilenceMs: 200, minSpeechMs: 60, factor: 3, minRms: 0.01 })
    expect([...frames(20, 0.002), 0.3, ...frames(10, 0.002)].map((l) => vad.push(l)).filter(Boolean)).toEqual([])
  })

  it('lets a turn end when a steady noise starts mid-turn', () => {
    const vad = new Vad({ frameMs: 20, endSilenceMs: 300, minSpeechMs: 60, factor: 3, minRms: 0.01 })
    const events = [...frames(20, 0.002), ...frames(5, 0.2), ...frames(1500, 0.05)].map((l) => vad.push(l)).filter(Boolean)
    expect(events).toEqual(['start', 'end'])
  })

  it('raises the bar for a steady background noise', () => {
    const vad = new Vad({ frameMs: 20, endSilenceMs: 200, minSpeechMs: 60, factor: 3, minRms: 0.001 })
    for (const l of frames(300, 0.05)) vad.push(l)
    expect(vad.speaking).toBe(false)
    expect(vad.noise).toBeGreaterThan(0.04)
  })

  it('needs louder speech while boosted', () => {
    const vad = new Vad({ frameMs: 20, endSilenceMs: 200, minSpeechMs: 60, factor: 3, minRms: 0.01 })
    for (const l of frames(20, 0.002)) vad.push(l)
    expect(frames(10, 0.02).map((l) => vad.push(l, 4)).filter(Boolean)).toEqual([])
    expect(frames(10, 0.02).map((l) => vad.push(l)).filter(Boolean)).toEqual(['start'])
  })
})

describe('audio encoding', () => {
  it('writes a valid 16 kHz mono WAV header', () => {
    const wav = encodeWav(new Float32Array([0, 1, -1]), 16000)
    const view = new DataView(wav.buffer)
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe('RIFF')
    expect(view.getUint32(24, true)).toBe(16000)
    expect(view.getUint32(40, true)).toBe(6)
    expect(view.getInt16(46, true)).toBe(0x7fff)
    expect(view.getInt16(48, true)).toBe(-0x8000)
  })

  it('downsamples 48 kHz to 16 kHz', () => {
    expect(downsample(new Float32Array(4800), 48000, 16000).length).toBe(1600)
  })
})
