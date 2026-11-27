import { describe, expect, it } from 'vitest'
import { routeModel, routeModels, deriveProfile } from '../src/main/routing'
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

describe('capability profiles', () => {
  it('derives depth, speed and context hints from the model id', () => {
    const opus = deriveProfile(option('claude-opus-4'))
    const flash = deriveProfile(option('gemini-2.5-flash'))
    expect(opus.reasoningScore).toBeGreaterThan(flash.reasoningScore)
    expect(flash.latencyTier).toBe('fast')
    expect(opus.contextWindow).toBeGreaterThanOrEqual(200_000)
  })
  it('lets an owner override pull a derived-weak model to the top', () => {
    const profiles = { 'api-openrouter::gemini-2.5-flash': { codingScore: 100, reasoningScore: 100 } }
    const pick = routeModel({ role: 'backend', models, costPreference: 'quality', difficulty: 'high', profiles })!
    expect(pick.option.model).toBe('gemini-2.5-flash')
  })
  it('ranks local models by their reported parameter size, not their name', () => {
    const big = deriveProfile({ ...option('mistral-local'), paramsB: 70, contextLength: 32_768 })
    const small = deriveProfile({ ...option('mistral-local'), paramsB: 7 })
    const mid = deriveProfile({ ...option('mistral-local'), paramsB: 13 })
    expect(big.reasoningScore).toBe(80)
    expect(big.contextWindow).toBe(32_768)
    expect(big.latencyTier).toBe('slow')
    expect(small.reasoningScore).toBe(45)
    expect(small.latencyTier).toBe('fast')
    expect(mid.reasoningScore).toBe(60)
    // a bogus size falls back to the name-derived profile
    expect(deriveProfile({ ...option('mistral-local'), paramsB: 0 }).reasoningScore).toBe(60)
  })
})

describe('fallback chain', () => {
  it('ranks every available model best-first, matching routeModel for the top pick', () => {
    const chain = routeModels({ role: 'architect', models, costPreference: 'balanced', difficulty: 'high' })
    expect(chain.length).toBe(3)
    expect(chain[0].option.model).toBe('claude-opus-4')
    expect(chain[0].option).toEqual(routeModel({ role: 'architect', models, costPreference: 'balanced', difficulty: 'high' })!.option)
    expect(chain[1].reason).toContain('fallback #1')
  })
  it('drops a model the owner marked unavailable', () => {
    const culled = routeModels({ role: 'architect', models, costPreference: 'balanced', difficulty: 'high', profiles: { 'api-openrouter::claude-opus-4': { availability: 'unavailable' } } })
    expect(culled.length).toBe(2)
    expect(culled.map((c) => c.option.model)).not.toContain('claude-opus-4')
  })
})

describe('provider lists', () => {
  it('splits ENGINE_ENDPOINTS into local and keyed providers', async () => {
    const { LOCAL_API_ENGINES, KEYED_API_ENGINES, ENGINE_ENDPOINTS } = await import('../src/shared/types')
    expect(LOCAL_API_ENGINES).toEqual(['api-ollama', 'api-lmstudio', 'api-vllm'])
    expect(KEYED_API_ENGINES.length + LOCAL_API_ENGINES.length).toBe(Object.keys(ENGINE_ENDPOINTS).length)
    // xAI and Groq are registered hosted providers (OpenAI-compatible, keyed).
    expect(KEYED_API_ENGINES).toContain('api-xai')
    expect(KEYED_API_ENGINES).toContain('api-groq')
    expect(ENGINE_ENDPOINTS['api-xai']).toBe('https://api.x.ai/v1')
    expect(ENGINE_ENDPOINTS['api-groq']).toBe('https://api.groq.com/openai/v1')
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

describe('ollamaShow', () => {
  it('calls the native /api/show root (not the /v1 compat layer) and parses size and context', async () => {
    const { vi } = await import('vitest')
    const { ollamaShow } = await import('../src/main/planning')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      details: { parameter_size: '7.6B' },
      model_info: { 'llama3:8b.context_length': 8192 }
    })))
    const out = await ollamaShow('llama3:8b')
    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toMatch(/\/api\/show$/)
    expect(url).not.toContain('/v1/')
    expect(out).toEqual({ paramsB: 7.6, contextLength: 8192 })
    fetchMock.mockRestore()
  })
})
