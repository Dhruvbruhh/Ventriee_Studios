import { describe, expect, it, vi } from 'vitest'
import { readSse, runEngine } from '../src/main/engines'
import type { Credentials } from '../src/main/credentials'

describe('SSE framing', () => {
  it('passes a deadline and caller cancellation to API fetch', async () => {
    const caller = new AbortController()
    let signal: AbortSignal | undefined
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      signal = init?.signal as AbortSignal
      return new Response('data: [DONE]\n\n')
    })
    try {
      await runEngine({ engine: 'api-custom', model: 'test', endpoint: 'http://localhost:1234',
        system: '', prompt: '', cwd: '.', maxTokens: 10, timeoutMs: 1000, signal: caller.signal },
      { get: () => null } as unknown as Credentials)
      expect(signal).toBeInstanceOf(AbortSignal)
      caller.abort()
      expect(signal?.aborted).toBe(true)
    } finally { fetchMock.mockRestore() }
  })
  it('handles CRLF split between chunks, multiline data and a final event without a separator', async () => {
    const encoder = new TextEncoder()
    const body = new ReadableStream<Uint8Array>({ start(controller) {
      for (const part of ['data: first\r', '\n\r\ndata: second\r\ndata: line\r\n\r', '\ndata: last']) {
        controller.enqueue(encoder.encode(part))
      }
      controller.close()
    } })
    const events: string[] = []
    await readSse(body, (event) => events.push(event))
    expect(events).toEqual(['first', 'second\nline', 'last'])
    expect(body.locked).toBe(false)
  })

  it('releases the reader when handling an event fails', async () => {
    const body = new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(new TextEncoder().encode('data: x\n\n'))
      controller.close()
    } })
    await expect(readSse(body, () => { throw new Error('consumer failed') })).rejects.toThrow('consumer failed')
    expect(body.locked).toBe(false)
  })
})
