import { describe, expect, it } from 'vitest'
import { routeModel, routeModels, deriveProfile, paramsFromName, CODING_FLOOR_B, NO_MODEL_ERROR } from '../src/main/routing'
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

describe('model-size floor (W45)', () => {
  it('parses parameter sizes from model names', () => {
    expect(paramsFromName('granite3.2-vision:2b')).toBe(2)
    expect(paramsFromName('SmolVLM-500M')).toBe(0.5)
    expect(paramsFromName('qwen2.5-coder:14b')).toBe(14)
    expect(paramsFromName('120b-coder')).toBe(120)
    expect(paramsFromName('prompt-guard-2-22m')).toBe(0.022) // parsed, then excluded by the non-chat filter and the floor
    expect(paramsFromName('claude-opus-4')).toBe(null)
  })

  it('never routes non-chat models, however they score', () => {
    const guard = routeModel({ role: 'backend', models: [option('prompt-guard-2-22m'), option('claude-opus-4')], costPreference: 'balanced', difficulty: 'high' })
    expect(guard!.option.model).toBe('claude-opus-4')
  })

  it('reproduces the hotel failure: tiny vision models lose to any strong model on hard tasks', () => {
    const local = (model: string): ModelOption => ({ provider: 'cli-ollama', providerLabel: 'Ollama', model, free: true, configured: true })
    const pool = [local('granite3.2-vision:2b'), local('moondream2'), local('qwen3-vl:2b-instruct'), option('SmolVLM-500M'), option('claude-opus-4')]
    const pick = routeModel({ role: 'frontend', models: pool, costPreference: 'balanced', difficulty: 'high' })
    expect(pick!.option.model).toBe('claude-opus-4')
    // A 7B coder beats a 2B vision model even among local-only pools.
    const localsOnly = routeModel({ role: 'frontend', models: [local('granite3.2-vision:2b'), local('qwen2.5-coder:7b')], costPreference: 'balanced', difficulty: 'high' })
    expect(localsOnly!.option.model).toBe('qwen2.5-coder:7b')
  })

  it('drops sub-7B models on code work only when a stronger or unknown-size option exists', () => {
    const small = option('qwen3-2b')
    const chain = routeModels({ role: 'backend', models: [small, option('claude-opus-4')], costPreference: 'balanced', difficulty: 'high' })
    expect(chain.map((c) => c.option.model)).not.toContain('qwen3-2b')
    // Unknown-size names (claude-opus-4) still count as strong enough.
    // Alone, the tiny model is still tried rather than refusing outright on easy work.
    expect(routeModel({ role: 'research', models: [small], costPreference: 'balanced', difficulty: 'low' })!.option.model).toBe('qwen3-2b')
  })

  it('fails fast with guidance when only tiny models remain for hard work', () => {
    const tiny = [{ provider: 'cli-ollama', providerLabel: 'Ollama', model: 'granite3.2-vision:2b', free: true, configured: true } as ModelOption]
    expect(() => routeModels({ role: 'frontend', models: tiny, costPreference: 'balanced', difficulty: 'high' })).toThrow(NO_MODEL_ERROR)
  })

  it('keeps CLI engines routable on their default model', () => {
    const cli: ModelOption = { provider: 'cli-opencode', providerLabel: 'OpenCode', model: '', free: true, configured: true }
    const pick = routeModel({ role: 'backend', models: [cli], costPreference: 'balanced', difficulty: 'high' })
    expect(pick).not.toBeNull()
    // The default profile is a strong coder, so it survives the floor.
    expect(deriveProfile(cli).codingScore).toBeGreaterThanOrEqual(70)
  })
})
