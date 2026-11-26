import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Store } from '../src/main/store'
import { SkillService } from '../src/main/skills'
import { PluginService } from '../src/main/plugins'
import { compareVersions, readManifest } from '../src/main/pluginManifest'

function makePlugin(manifest: object, files: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'vs-plugin-'))
  writeFileSync(join(dir, 'ventriee-plugin.json'), JSON.stringify(manifest))
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(join(dir, path, '..'), { recursive: true })
    writeFileSync(join(dir, path), body)
  }
  return dir
}

const SEO = {
  id: 'seo-pack', name: 'SEO pack', version: '1.0.0', minAppVersion: '0.1.0',
  contributes: {
    skills: ['skills/seo-audit', '../../outside'],
    mcpServers: [{ name: 'lighthouse', command: 'npx', args: ['-y', 'lighthouse-mcp'], enabled: true }],
    workflows: ['flows/weekly.json'],
    agents: [{ role: 'seo', name: 'Sam', title: 'SEO lead', instructions: 'Audit metadata.' }],
    themes: [{ id: 'sunset', name: 'Sunset', base: 'light', colors: { '--accent': '#ff6a00', '--bg': 'url(https://evil.test/x)', '--evil': '#000', '--text': 'red; } body { display:none' } }],
    commands: [{ id: 'audit', title: 'SEO audit', prompt: 'Audit the site for SEO' }]
  }
}
const SEO_FILES = {
  'skills/seo-audit/SKILL.md': '---\nname: seo-audit\ndescription: Audit SEO\n---\n\nCheck titles and meta descriptions.\n',
  'flows/weekly.json': JSON.stringify({ name: 'Weekly SEO', scheduleMinutes: 10080, nodes: [{ id: 't', kind: 'trigger' }, { id: 'a', kind: 'ai', config: { prompt: 'x' } }, { id: 'z', kind: 'rm-rf' }], edges: [{ from: 't', to: 'a' }, { from: 'a', to: 'z' }] })
}

describe('plugin manifests', () => {
  it('keeps valid contributions and reports the rest', () => {
    const { manifest, errors } = readManifest(makePlugin(SEO, SEO_FILES), '0.3.5')
    expect(manifest.skills).toHaveLength(1)
    expect(manifest.mcpServers[0]).toMatchObject({ name: 'lighthouse', enabled: false, source: 'plugin:seo-pack' })
    expect(manifest.workflows[0].nodes.map((n) => n.kind)).toEqual(['trigger', 'ai'])
    expect(manifest.workflows[0].edges).toHaveLength(1)
    expect(manifest.themes[0].colors).toEqual({ '--accent': '#ff6a00' })
    expect(errors.join('\n')).toMatch(/outside the plugin folder/)
    expect(errors.join('\n')).toMatch(/ignored --bg/)
  })

  it('rejects bad ids, versions and apps that are too old', () => {
    expect(() => readManifest(makePlugin({ ...SEO, id: '../x' }), '0.3.5')).toThrow(/plugin id/)
    expect(() => readManifest(makePlugin({ ...SEO, version: 'latest' }), '0.3.5')).toThrow(/1\.2\.3/)
    expect(() => readManifest(makePlugin({ ...SEO, minAppVersion: '9.0.0' }), '0.3.5')).toThrow(/9\.0\.0 or newer/)
  })

  it('compares versions numerically', () => {
    expect(compareVersions('0.10.0', '0.9.9')).toBe(1)
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
    expect(compareVersions('junk', '0.0.1')).toBe(-1)
  })
})

describe('PluginService', () => {
  const setup = () => {
    const data = mkdtempSync(join(tmpdir(), 'vs-data-'))
    const store = new Store(join(data, 'ventriee.db'))
    const skills = new SkillService(store, data)
    return { data, store, skills, plugins: new PluginService(store, skills, data, '0.3.5') }
  }

  it('installs, updates keeping the owner\'s choices, and removes exactly what it added', async () => {
    const { data, store, plugins } = setup()
    store.saveSettings({ mcpServers: [{ name: 'mine', command: 'x', args: [], enabled: true }] })
    const preview = await plugins.preview({ type: 'folder', value: makePlugin(SEO, SEO_FILES) })
    expect(preview.permissions.join(' ')).toMatch(/run programs on this computer once you turn them on/)
    const info = plugins.install(preview.token)
    expect(info.added).toMatchObject({ skills: ['seo-audit'], mcpServers: ['lighthouse'] })
    expect(store.workflows().map((w) => [w.name, w.enabled])).toEqual([['Weekly SEO', false]])
    expect(existsSync(join(data, 'skills', 'seo-audit', 'SKILL.md'))).toBe(true)

    // The owner turns the server on and adds a key; an update keeps both.
    store.saveSettings({ mcpServers: store.settings().mcpServers.map((s) => (s.name === 'lighthouse' ? { ...s, enabled: true, env: { KEY: 'k' } } : s)) })
    const next = await plugins.preview({ type: 'folder', value: makePlugin({ ...SEO, version: '1.1.0' }, SEO_FILES) })
    expect(next.installed).toBe('1.0.0')
    plugins.install(next.token)
    expect(plugins.list()[0].version).toBe('1.1.0')
    expect(store.settings().mcpServers.find((s) => s.name === 'lighthouse')).toMatchObject({ enabled: true, env: { KEY: 'k' } })
    expect(store.workflows()).toHaveLength(1)

    plugins.remove('seo-pack')
    expect(store.settings().mcpServers.map((s) => s.name)).toEqual(['mine'])
    expect(store.workflows()).toEqual([])
    expect(existsSync(join(data, 'skills', 'seo-audit'))).toBe(false)
    expect(existsSync(join(data, 'plugins', 'seo-pack'))).toBe(false)
    expect(plugins.list()).toEqual([])
  })

  it('enforces dependencies both ways', async () => {
    const { plugins } = setup()
    const needy = await plugins.preview({ type: 'folder', value: makePlugin({ id: 'needy', version: '1.0.0', dependencies: { base: '^2.0.0' } }) })
    expect(needy.errors.join()).toMatch(/Needs the plugin "base" 2\.0\.0/)
    expect(() => plugins.install(needy.token)).toThrow(/base/)
    plugins.install((await plugins.preview({ type: 'folder', value: makePlugin({ id: 'base', version: '2.1.0' }) })).token)
    plugins.install((await plugins.preview({ type: 'folder', value: makePlugin({ id: 'needy', version: '1.0.0', dependencies: { base: '^2.0.0' } }) })).token)
    expect(() => plugins.remove('base')).toThrow(/Remove needy first/)
  })
})
