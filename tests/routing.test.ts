import { describe, expect, it } from 'vitest'
import { routeModel } from '../src/main/routing'
import { parsePlanAnswer } from '../src/main/planner'
import type { ModelOption } from '../src/shared/types'

const option = (model: string, free: boolean | null = null): ModelOption => ({ provider: 'api-openrouter', providerLabel: 'OpenRouter', model, free, configured: true })
const models = [option('claude-opus-4'), option('gemini-2.5-flash'), option('qwen3-7b:free', true)]

describe('difficulty routing', () => {
  it('sends low tasks to a small or free model and high tasks to a strong one, whatever the role', () => {
    expect(routeModel({ role: 'architect', models, costPreference: 'balanced', difficulty: 'low' })!.option.model).not.toBe('claude-opus-4')
    expect(routeModel({ role: 'seo', models, costPreference: 'balanced', difficulty: 'high' })!.option.model).toBe('claude-opus-4')
    expect(routeModel({ role: 'seo', models, costPreference: 'balanced', difficulty: 'low' })!.reason).toContain('low-difficulty')
  })
  it('falls back to the role when the plan gave no difficulty', () => {
    expect(routeModel({ role: 'architect', models, costPreference: 'balanced' })!.option.model).toBe('claude-opus-4')
  })
  it('reads difficulty from a model plan and ignores unknown values', () => {
    const plan = parsePlanAnswer(JSON.stringify({ summary: 's', tasks: [
      { title: 'Copy', role: 'frontend', difficulty: 'LOW' }, { title: 'Auth', role: 'backend', difficulty: 'extreme' }] }), ['frontend', 'backend'])!
    expect(plan.tasks.map((t) => t.difficulty)).toEqual(['low', undefined])
  })
})

describe('provider lists', () => {
  it('splits ENGINE_ENDPOINTS into local and keyed providers', async () => {
    const { LOCAL_API_ENGINES, KEYED_API_ENGINES, ENGINE_ENDPOINTS } = await import('../src/shared/types')
    expect(LOCAL_API_ENGINES).toEqual(['api-ollama', 'api-lmstudio', 'api-vllm'])
    expect(KEYED_API_ENGINES.length + LOCAL_API_ENGINES.length).toBe(Object.keys(ENGINE_ENDPOINTS).length)
  })
})

describe('providerModel', () => {
  it('uses the first model the provider lists when none is picked', async () => {
    const { vi } = await import('vitest')
    const { providerModel } = await import('../src/main/engines')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ models: [{ name: 'models/gem-x' }] })))
    expect(await providerModel('api-gemini', 'https://example.test/v1', 'k')).toBe('gem-x')
    expect(fetchMock.mock.calls[0][0]).toBe('https://example.test/v1/models')
    fetchMock.mockResolvedValue(new Response('', { status: 401 }))
    await expect(providerModel('api-openai', 'https://example.test/x', null)).rejects.toThrow(/Pick a model in Settings/)
    fetchMock.mockRestore()
  })
})
