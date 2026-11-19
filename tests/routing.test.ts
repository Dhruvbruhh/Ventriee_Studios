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
