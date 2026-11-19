import { describe, expect, it } from 'vitest'
import { findExecutable } from '../src/main/lsp'
import { NO_TRANSCRIBER, transcribe } from '../src/main/transcribe'

const audio = new Uint8Array(500)

// Only meaningful where no local Whisper is installed (that one would be used first).
describe.skipIf(Boolean(findExecutable('whisper')))('voice transcription', () => {
  it('refuses empty audio and explains what to install when nothing can transcribe', async () => {
    await expect(transcribe(new Uint8Array(10), { get: () => null })).rejects.toThrow('No audio')
    await expect(transcribe(audio, { get: () => null })).rejects.toThrow(NO_TRANSCRIBER)
  })

  it("sends the recording to the first provider the owner has a key for", async () => {
    const calls: Array<{ url: string; auth: string; model: unknown }> = []
    const fetcher = (async (url: string, init: RequestInit) => {
      calls.push({ url, auth: (init.headers as Record<string, string>).authorization, model: (init.body as FormData).get('model') })
      return new Response(JSON.stringify({ text: ' make the button blue ' }), { status: 200 })
    }) as unknown as typeof fetch
    const text = await transcribe(audio, { get: (e) => (e === 'api-mistral' ? 'mk' : null) }, fetcher)
    expect(text).toBe('make the button blue')
    expect(calls).toEqual([{ url: 'https://api.mistral.ai/v1/audio/transcriptions', auth: 'Bearer mk', model: 'voxtral-mini-latest' }])
  })

  it('moves on when a key is rejected, and says which one when all fail', async () => {
    const seen: string[] = []
    const fetcher = (async (url: string) => { seen.push(url); return new Response('no', { status: url.includes('openai') ? 401 : 200, headers: {} }) }) as unknown as typeof fetch
    const ok = (async (url: string) => { seen.push(url); return url.includes('openai') ? new Response('no', { status: 401 }) : new Response(JSON.stringify({ text: 'hi' })) }) as unknown as typeof fetch
    expect(await transcribe(audio, { get: () => 'k' }, ok)).toBe('hi')
    await expect(transcribe(audio, { get: (e) => (e === 'api-openai' ? 'k' : null) }, fetcher)).rejects.toThrow('OpenAI could not transcribe the recording (HTTP 401: check its API key')
  })
})
