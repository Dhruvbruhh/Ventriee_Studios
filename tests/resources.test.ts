import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { RESOURCE_CATALOG, buildResources, discoverResources, packageNames, type ResourceSources } from '../src/shared/resources'
import { readProjectDeps } from '../src/main/resources'

const sources = (deps: Set<string> | null): ResourceSources => ({
  skills: [
    { id: 'ponytail', name: 'ponytail', description: 'Small diffs, least code.', enabled: true, source: 'bundled' },
    { id: 'parallax', name: 'parallax-scroll', description: 'Scroll-driven animation helper.', enabled: false, source: 'imported' }
  ],
  plugins: [{ id: 'acme.pack', name: 'Acme Pack', description: 'Adds an invoice workflow.', version: '1.2.0' }],
  mcpServers: [
    { name: 'playwright', enabled: true },
    { name: 'postgres', enabled: false }
  ],
  workflows: [{ id: 'wf1', name: 'Weekly security scan', enabled: true }],
  agents: [{ role: 'frontend', name: 'Kai', title: 'Frontend engineer' }],
  deps
})

const names = (list: Resource[]) => list.map((r) => r.name)

describe('resource catalog', () => {
  it('has unique ids and an https homepage for every entry', () => {
    expect(new Set(RESOURCE_CATALOG.map((e) => e.slug)).size).toBe(RESOURCE_CATALOG.length)
    for (const entry of RESOURCE_CATALOG) {
      expect(entry.name, entry.slug).toBeTruthy()
      expect(entry.url, entry.slug).toMatch(/^https:\/\//)
      expect(entry.capabilities.length, entry.slug).toBeGreaterThan(0)
    }
  })

  it('gives every entry either a detectable package or an install step', () => {
    for (const entry of RESOURCE_CATALOG) {
      if (!entry.packages && !entry.prefixes) expect(entry.install, entry.slug).toBeTruthy()
    }
  })
})

describe('buildResources', () => {
  it('reports the real state of every source', () => {
    const list = buildResources(sources(new Set(['gsap', '@radix-ui/react-dialog'])))
    const byId = new Map(list.map((r) => [r.id, r]))
    expect(byId.get('skill:ponytail')?.state).toBe('installed')
    expect(byId.get('skill:parallax')?.state).toBe('available')
    expect(byId.get('plugin:acme.pack')?.state).toBe('installed')
    expect(byId.get('plugin:acme.pack')?.version).toBe('1.2.0')
    expect(byId.get('mcp:playwright')?.state).toBe('installed')
    expect(byId.get('mcp:postgres')?.state).toBe('available')
    expect(byId.get('workflow:wf1')?.state).toBe('installed')
    expect(byId.get('agent:frontend')?.state).toBe('installed')
    expect(byId.get('library:gsap')?.state).toBe('installed')
    expect(byId.get('library:radix')?.state).toBe('installed')
    expect(byId.get('library:drizzle')?.state).toBe('missing')
  })

  it('never claims a library is installed when no project is open', () => {
    for (const resource of buildResources(sources(null)).filter((r) => r.kind === 'library')) {
      expect(resource.state, resource.id).toBe('missing')
      expect(resource.install, resource.id).toBeTruthy()
    }
  })

  it('reads dependencies from package.json only', () => {
    expect([...packageNames({ dependencies: { gsap: '3' }, devDependencies: { vitest: '2' } })]).toEqual(['gsap', 'vitest'])
    expect(packageNames({ name: 'x', version: '1' }).size).toBe(0)
    expect(packageNames(null).size).toBe(0)
  })

  it('reads the open project and survives a folder without package.json', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ventriee-resources-'))
    expect(readProjectDeps(dir)).toBeNull()
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies: { motion: '^12.0.0' } }))
    expect([...readProjectDeps(dir)!]).toEqual(['motion'])
    const list = buildResources(sources(readProjectDeps(dir)))
    expect(list.find((r) => r.id === 'library:framer-motion')?.state).toBe('installed')
  })
})

describe('discoverResources', () => {
  const list = buildResources(sources(new Set(['gsap'])))

  it('returns everything for an empty query', () => {
    expect(discoverResources(list, '   ')).toHaveLength(list.length)
  })

  it('finds design and motion resources for a plain-language request', () => {
    const found = discoverResources(list, 'Build a modern animated website')
    const names = found.map((r) => r.name)
    expect(names).toContain('GSAP')
    expect(names).toContain('Motion (Framer Motion)')
    expect(names).toContain('Tailwind CSS v4')
    expect(found[0].score).toBeGreaterThan(0)
    for (const match of found) expect(match.why).toMatch(/^Matches /)
  })

  it('explains a match with the terms that matched', () => {
    const gsap = discoverResources(list, 'scroll animation').find((r) => r.name === 'GSAP')!
    expect(gsap.why.replace('Matches ', '').split(', ').sort()).toEqual(['animation', 'motion', 'scroll'])
  })

  it('matches installed skills and servers by their own text', () => {
    expect(discoverResources(list, 'scroll').some((r) => r.id === 'skill:parallax')).toBe(true)
    expect(discoverResources(list, 'postgres').some((r) => r.id === 'mcp:postgres')).toBe(true)
  })

  it('returns nothing when nothing matches', () => {
    expect(discoverResources(list, 'quantum block chain')).toEqual([])
  })

  it('ranks installed resources first when relevance ties', () => {
    const found = discoverResources(list, 'animation')
    expect(found.findIndex((r) => r.id === 'library:gsap')).toBeLessThan(found.findIndex((r) => r.id === 'library:lottie'))
  })
})
