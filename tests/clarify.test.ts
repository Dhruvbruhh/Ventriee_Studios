import { describe, expect, it } from 'vitest'
import { foldClarifications, parseClarifyAnswer } from '../src/main/clarify'

describe('parseClarifyAnswer', () => {
  it('reads fenced JSON wrapped in prose', () => {
    const raw = 'Sure:\n```json\n{"questions":[{"question":"Who is it for?","default":"Small businesses"}]}\n```\nDone.'
    expect(parseClarifyAnswer(raw)).toEqual([{ question: 'Who is it for?', answer: 'Small businesses' }])
  })

  it('treats junk as no questions', () => {
    expect(parseClarifyAnswer('I think the brief is fine.')).toEqual([])
    expect(parseClarifyAnswer('{not json}')).toEqual([])
    expect(parseClarifyAnswer('{"questions":"none"}')).toEqual([])
  })

  it('returns nothing for a clear brief', () => {
    expect(parseClarifyAnswer('{"questions":[]}')).toEqual([])
  })

  it('caps at five and drops empty questions', () => {
    const qs = Array.from({ length: 8 }, (_, i) => ({ question: `Q${i}`, default: `A${i}` }))
    const parsed = parseClarifyAnswer(JSON.stringify({ questions: [{ question: ' ' }, ...qs] }))
    expect(parsed).toHaveLength(5)
    expect(parsed[0]).toEqual({ question: 'Q0', answer: 'A0' })
  })
})

describe('foldClarifications', () => {
  it('appends a Clarifications block', () => {
    expect(foldClarifications('Build a bakery site', [{ question: 'Online orders?', answer: 'No' }])).toBe(
      'Build a bakery site\n\nClarifications:\n- Q: Online orders?\n  A: No'
    )
  })

  it('leaves the brief unchanged with no answers', () => {
    expect(foldClarifications('Build a bakery site', [])).toBe('Build a bakery site')
    expect(foldClarifications('Build a bakery site')).toBe('Build a bakery site')
  })
})
