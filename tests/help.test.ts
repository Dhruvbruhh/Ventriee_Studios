import { describe, expect, it } from 'vitest'
import { HELP_SECTION_HEADINGS, HELP_TOPICS, searchHelp } from '../src/renderer/src/help'

const haystack = (t: (typeof HELP_TOPICS)[number]) =>
  [t.title, t.summary, ...t.sections.flatMap((s) => [s.heading, ...s.points])].join(' ').toLowerCase()

describe('help center content', () => {
  it('covers the major features with unique ids and titles', () => {
    expect(HELP_TOPICS.length).toBeGreaterThanOrEqual(14)
    expect(new Set(HELP_TOPICS.map((t) => t.id)).size).toBe(HELP_TOPICS.length)
    expect(new Set(HELP_TOPICS.map((t) => t.title)).size).toBe(HELP_TOPICS.length)
  })

  it('every topic has every required section with non-empty points', () => {
    for (const topic of HELP_TOPICS) {
      expect(topic.summary.trim().length, `${topic.id} summary`).toBeGreaterThan(0)
      const headings = topic.sections.map((s) => s.heading)
      for (const heading of HELP_SECTION_HEADINGS) {
        expect(headings, `${topic.id} missing section ${heading}`).toContain(heading)
      }
      for (const section of topic.sections) {
        expect(section.points.length, `${topic.id} / ${section.heading} points`).toBeGreaterThan(0)
        for (const point of section.points) {
          expect(point.trim().length, `${topic.id} empty point in ${section.heading}`).toBeGreaterThan(0)
        }
      }
    }
  })

  it('search filters topics case-insensitively and matches content', () => {
    expect(searchHelp('')).toBe(HELP_TOPICS)
    const hits = searchHelp('ollama')
    expect(hits.length).toBeGreaterThan(0)
    expect(hits.every((t) => haystack(t).includes('ollama'))).toBe(true)
    expect(searchHelp('ZZZZ-no-match-here').length).toBe(0)
  })
})
