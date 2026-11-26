import { useEffect, useRef, useState } from 'react'
import { Modal } from '../shell'
import { guard, useStore } from '../store'
import type { PluginAgentTemplate, PluginInfo, RegistryServer } from '../../../shared/types'

const FEATURED = ['GitHub', 'GitLab', 'Filesystem', 'PostgreSQL', 'Supabase', 'Figma', 'Slack', 'Notion', 'Linear', 'Playwright', 'Docker']
type Preview = Awaited<ReturnType<typeof window.ventriee.pluginPreview>>

export function MarketplacePanel({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<'mcp' | 'plugins'>('mcp')
  return (
    <Modal title="Marketplace" subtitle="MCP servers from the official registry, and plugins that bundle skills, servers, workflows, agents and themes." onClose={onClose}>
      <div className="vx-modes" role="tablist" style={{ maxWidth: 320, marginBottom: 14 }}>
        <button role="tab" aria-selected={tab === 'mcp'} className={tab === 'mcp' ? 'on' : ''} onClick={() => setTab('mcp')}>MCP servers</button>
        <button role="tab" aria-selected={tab === 'plugins'} className={tab === 'plugins' ? 'on' : ''} onClick={() => setTab('plugins')}>Plugins</button>
      </div>
      {tab === 'mcp' ? <McpMarket /> : <Plugins />}
    </Modal>
  )
}

function McpMarket() {
  const installedSources = useStore((s) => s.snapshot?.settings.mcpServers ?? []).map((s) => s.source)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<RegistryServer[]>([])
  const [cursor, setCursor] = useState('')
  const [loading, setLoading] = useState(false)
  const [installing, setInstalling] = useState<{ server: RegistryServer; option: number; values: Record<string, string> } | null>(null)

  const search = async (q: string, more = false) => {
    setLoading(true)
    const r = await guard(() => window.ventriee.mcpSearch(q, more ? cursor : ''))
    setLoading(false)
    if (!r) return
    setResults((old) => (more ? [...old, ...r.servers] : r.servers))
    setCursor(r.nextCursor)
  }
  useEffect(() => { void search('') }, [])

  const install = async () => {
    if (!installing) return
    const added = await guard(() => window.ventriee.mcpInstall(installing.server, installing.option, installing.values), 'Installed, switched off. Test and turn it on in Settings → MCP tools.')
    if (added) setInstalling(null)
  }
  return <>
    <form className="flex gap-8" onSubmit={(e) => { e.preventDefault(); void search(query) }}>
      <input className="input grow" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search MCP servers, e.g. postgres, slack, browser" aria-label="Search MCP servers" />
      <button className="btn primary" type="submit" disabled={loading}>{loading ? 'Searching…' : 'Search'}</button>
    </form>
    <div className="mk-chips">{FEATURED.map((f) => <button key={f} className="vx-chip" onClick={() => { setQuery(f); void search(f) }}>{f}</button>)}</div>
    <p className="hint">Every server is a program or service you have not reviewed. Installing adds it switched off; test it, check its tools, then turn it on. Names are reverse-domain namespaces the registry verified for the publisher.</p>
    {installing ? <InstallForm key={`${installing.server.name}-${installing.option}`} installing={installing} setInstalling={setInstalling} install={install} /> : null}
    <div className="mk-grid">
      {results.map((s) => {
        const installed = installedSources.includes(s.name)
        return <article key={`${s.name}@${s.version}`} className="mk-card">
          <div className="mk-head"><b>{s.title}</b><span className="dim">v{s.version}</span></div>
          <div className="mk-ns mono" title="Publisher namespace verified by the MCP registry">{s.name}</div>
          <p>{s.description || 'No description.'}</p>
          <div className="mk-foot">
            <span className="dim text-sm">{s.installs.map((i) => i.label).join(' · ') || 'No installable package'}</span>
            {s.repository ? <button className="ghost-link" onClick={() => void window.ventriee.openExternal(s.repository)}>Source</button> : null}
            <button className="btn tiny primary" disabled={!s.installs.length || installed} onClick={() => setInstalling({ server: s, option: 0, values: {} })}>{installed ? 'Installed' : 'Install'}</button>
          </div>
        </article>
      })}
    </div>
    {cursor ? <button className="btn" onClick={() => void search(query, true)} disabled={loading}>More results</button> : null}
  </>
}

function InstallForm({ installing, setInstalling, install }: {
  installing: { server: RegistryServer; option: number; values: Record<string, string> }
  setInstalling: (v: { server: RegistryServer; option: number; values: Record<string, string> } | null) => void
  install: () => Promise<void>
}) {
  const option = installing.server.installs[installing.option]
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { ref.current?.scrollIntoView({ block: 'nearest' }); ref.current?.querySelector('input')?.focus() }, [])
  return <>
    {option ? <div className="mk-dialog" role="dialog" aria-label={`Install ${installing.server.title}`} ref={ref}>
      <h3>Install {installing.server.title}</h3>
      {installing.server.installs.length > 1 ? <label className="field">How to run it
        <select className="input" value={installing.option} onChange={(e) => setInstalling({ ...installing, option: Number(e.target.value), values: {} })}>
          {installing.server.installs.map((i, n) => <option key={n} value={n}>{i.label}: {i.identifier}</option>)}
        </select></label> : null}
      <p className="hint">{option.kind === 'remote' ? `Connects to ${option.url}.` : `Runs ${option.identifier}${option.version ? ` ${option.version}` : ''} on this computer with your permissions${option.kind === 'pypi' ? ' (needs uv)' : option.kind === 'oci' ? ' (needs Docker)' : ' (needs Node.js)'}.`}</p>
      {[...option.env, ...option.headers].map((i) => (
        <label key={i.name} className="field">{i.name}{i.required ? ' *' : ''}
          <input className="input mono" type={i.secret ? 'password' : 'text'} autoComplete="off" value={installing.values[i.name] ?? ''} placeholder={i.template ?? ''}
            onChange={(e) => setInstalling({ ...installing, values: { ...installing.values, [i.name]: e.target.value } })} />
          {i.description ? <span className="hint">{i.description}</span> : null}
        </label>
      ))}
      <p className="hint">Values are saved in Studio settings on this computer and given only to this server.</p>
      <div className="flex gap-8"><button className="btn primary" onClick={() => void install()}>Install (switched off)</button><button className="btn" onClick={() => setInstalling(null)}>Cancel</button></div>
    </div> : null}
  </>
}

function Plugins() {
  const snapshot = useStore((s) => s.snapshot)!
  const [list, setList] = useState<PluginInfo[]>([])
  const [git, setGit] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [busy, setBusy] = useState(false)
  const load = async () => setList((await guard(() => window.ventriee.pluginList())) ?? [])
  useEffect(() => { void load() }, [])

  const check = async (source: { type: 'folder' | 'git'; value: string }) => {
    setBusy(true)
    const p = await guard(() => window.ventriee.pluginPreview(source))
    setBusy(false)
    if (p) setPreview(p)
  }
  const fromFolder = async () => { const dir = await guard(() => window.ventriee.pickFolder()); if (dir) await check({ type: 'folder', value: dir }) }
  const install = async () => {
    if (!preview) return
    const info = await guard(() => window.ventriee.pluginInstall(preview.token), preview.installed ? `Updated ${preview.name} to ${preview.version}` : `Installed ${preview.name}`)
    setPreview(null)
    if (info) await load()
  }
  const cancel = () => { if (preview) void window.ventriee.pluginDiscard(preview.token); setPreview(null) }
  const remove = async (p: PluginInfo) => {
    if (!window.confirm(`Remove ${p.name}? Its skills, MCP servers and workflows are removed too.`)) return
    if ((await guard(() => window.ventriee.pluginRemove(p.id), `Removed ${p.name}`)) !== null) await load()
  }
  const addAgent = async (t: PluginAgentTemplate) => {
    const projectId = snapshot.activeProjectId
    if (!projectId) return useStore.getState().notify('Open a project first', 'error')
    const s = snapshot.settings
    await guard(() => window.ventriee.createAgent({ projectId, role: t.role, name: t.name, title: t.title, instructions: t.instructions, skills: t.skills,
      engine: s.orchestratorEngine, model: s.orchestratorModel, endpoint: '', autonomy: 'scoped', reasoning: 'auto', color: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(), budgetUsd: 0 }), `${t.name} joined the team`)
  }

  return <>
    <div className="flex gap-8">
      <button className="btn primary" onClick={() => void fromFolder()} disabled={busy}>Install from a folder…</button>
      <form className="flex gap-8 grow" onSubmit={(e) => { e.preventDefault(); if (git.trim()) void check({ type: 'git', value: git.trim() }) }}>
        <input className="input grow mono" value={git} onChange={(e) => setGit(e.target.value)} placeholder="https://github.com/you/your-plugin.git" aria-label="Plugin Git address" />
        <button className="btn" type="submit" disabled={busy || !git.trim()}>{busy ? 'Checking…' : 'Check'}</button>
      </form>
    </div>
    <p className="hint">A plugin is a folder with a <code>ventriee-plugin.json</code>. Plugins only declare things: Ventriee never runs code from them, so they cannot read your files or keys.</p>

    {preview ? <div className="mk-dialog" role="dialog" aria-label={`Install ${preview.name}`}>
      <h3>{preview.name} {preview.version}{preview.installed ? <span className="dim"> (installed: {preview.installed})</span> : null}</h3>
      {preview.description ? <p>{preview.description}</p> : null}
      <div className="section-label">It will</div>
      <ul className="mk-list">{preview.permissions.map((p) => <li key={p}>{p}</li>)}</ul>
      {preview.errors.length ? <><div className="section-label">Problems</div><ul className="mk-list bad">{preview.errors.map((e) => <li key={e}>{e}</li>)}</ul></> : null}
      <div className="flex gap-8"><button className="btn primary" onClick={() => void install()}>{preview.installed ? 'Update' : 'Install'}</button><button className="btn" onClick={cancel}>Cancel</button></div>
    </div> : null}

    {!list.length ? <p className="settings-empty">No plugins installed.</p> : list.map((p) => (
      <article key={p.id} className="mk-card wide">
        <div className="mk-head"><b>{p.name}</b><span className="dim">v{p.version}{p.author ? ` · ${p.author}` : ''}</span></div>
        {p.description ? <p>{p.description}</p> : null}
        <ul className="mk-list">{p.permissions.map((x) => <li key={x}>{x}</li>)}</ul>
        {p.errors.length ? <ul className="mk-list bad">{p.errors.map((e) => <li key={e}>{e}</li>)}</ul> : null}
        {p.agents.length ? <div className="mk-row"><span className="dim">Agents:</span>{p.agents.map((a) => <button key={a.name} className="vx-chip" onClick={() => void addAgent(a)} title={`Add ${a.title} to the current project`}>+ {a.name}</button>)}</div> : null}
        {p.themes.length ? <div className="mk-row"><span className="dim">Themes:</span>{p.themes.map((t) => <button key={t.id} className="vx-chip" onClick={() => void guard(() => window.ventriee.saveSettings({ theme: `plugin:${p.id}:${t.id}` }), `Theme: ${t.name}`)}>{t.name}</button>)}</div> : null}
        {p.commands.length ? <div className="mk-row"><span className="dim">Shortcuts:</span>{p.commands.map((c) => <span key={c.id} className="vx-chip">{c.title}</span>)}<span className="dim text-sm">(in the command bar)</span></div> : null}
        <div className="mk-foot">
          <span className="dim text-sm">From {p.source.type === 'git' ? p.source.value : 'a folder'}</span>
          <button className="btn tiny" onClick={() => void check(p.source)} disabled={busy}>Check for update</button>
          <button className="btn tiny" onClick={() => void remove(p)}>Remove</button>
        </div>
      </article>
    ))}
  </>
}
