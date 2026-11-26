import { useEffect, useMemo, useState } from 'react'
import { Modal } from '../shell'
import { cleanError, useStore } from '../store'
import { discoverResources, type Resource, type ResourceKind, type ResourceState } from '../../../shared/resources'

const STATE_LABEL: Record<ResourceState, string> = {
  installed: 'Installed',
  available: 'Available',
  missing: 'Needs install'
}

const KIND_LABEL: Record<ResourceKind, string> = {
  skill: 'Skill',
  plugin: 'Plugin',
  mcp: 'MCP server',
  workflow: 'Workflow',
  agent: 'Worker',
  library: 'Library'
}

/** Where a resource is managed after it is installed. Libraries are external. */
const MANAGE: Partial<Record<ResourceKind, { panel: 'skills' | 'marketplace' | 'workflows'; label: string }>> = {
  skill: { panel: 'skills', label: 'Manage skills' },
  plugin: { panel: 'marketplace', label: 'Manage plugins' },
  mcp: { panel: 'marketplace', label: 'Manage MCP' },
  workflow: { panel: 'workflows', label: 'Open workflows' }
}

export function ResourcesPanel({ onClose }: { onClose: () => void }) {
  const snapshot = useStore((s) => s.snapshot)
  const setPanel = useStore((s) => s.setPanel)
  const project = snapshot?.projects.find((p) => p.id === snapshot.activeProjectId) ?? null
  const [resources, setResources] = useState<Resource[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [state, setState] = useState<ResourceState | 'all'>('all')
  const [category, setCategory] = useState('All')

  useEffect(() => {
    let live = true
    setLoading(true)
    window.ventriee.resources(project?.id ?? null)
      .then((list) => { if (live) { setResources(list); setError('') } })
      .catch((e) => { if (live) setError(cleanError(e)) })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [project?.id])

  const categories = useMemo(() => Array.from(new Set(resources.map((r) => r.category))).sort(), [resources])
  const counts = useMemo(() => ({
    installed: resources.filter((r) => r.state === 'installed').length,
    available: resources.filter((r) => r.state === 'available').length,
    missing: resources.filter((r) => r.state === 'missing').length
  }), [resources])

  const matches = useMemo(() => discoverResources(resources, search), [resources, search])
  const filtered = matches.filter((r) => (state === 'all' || r.state === state) && (category === 'All' || r.category === category))

  return (
    <Modal title="Resource Library" subtitle={project ? `Skills, tools and libraries for ${project.name}. Library state is read from this project's package.json.` : 'Open a project to detect installed libraries. Skills, plugins, MCP servers and workers are shown as they are.'} onClose={onClose}>
      <div className="resources-toolbar">
        <input className="input" placeholder="Describe what you need, e.g. an animated marketing site." value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: 1 }} />
        <select className="select" value={category} onChange={(e) => setCategory(e.target.value)} style={{ width: 160 }} aria-label="Filter by category">
          <option value="All">All categories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div className="resources-toolbar">
        <div className="seg" role="group" aria-label="Filter by state">
          <button className={state === 'all' ? 'on' : ''} onClick={() => setState('all')}>All {resources.length}</button>
          <button className={state === 'installed' ? 'on' : ''} onClick={() => setState('installed')}>Installed {counts.installed}</button>
          <button className={state === 'available' ? 'on' : ''} onClick={() => setState('available')}>Available {counts.available}</button>
          <button className={state === 'missing' ? 'on' : ''} onClick={() => setState('missing')}>Needs install {counts.missing}</button>
        </div>
      </div>
      {error ? <div className="text-sm" style={{ color: 'var(--danger, #b42318)', padding: '8px 0' }}>{error}</div> : null}
      {loading ? <div className="dim text-sm" style={{ padding: '16px 0' }}>Reading installed resources…</div> : null}
      <div className="resources-grid">
        {filtered.map((r) => {
          const manage = MANAGE[r.kind]
          return (
            <div key={r.id} className="resource-card">
              <div className="resource-card-header">
                <span className="resource-card-name">{r.name}</span>
                <span className={`resource-state is-${r.state}`}>{STATE_LABEL[r.state]}</span>
              </div>
              <div className="resource-card-desc dim">{r.description}</div>
              {r.why ? <div className="resource-why">{r.why}</div> : null}
              {r.capabilities.length ? (
                <div className="resource-tags">{r.capabilities.slice(0, 4).map((c) => <span key={c} className="resource-tag">{c}</span>)}</div>
              ) : null}
              {r.agents.length > 0 && r.kind === 'library' ? <div className="dim text-xs">For: {r.agents.join(', ')}</div> : null}
              {r.state === 'missing' && r.install ? <code className="resource-install">{r.install}</code> : null}
              <div className="resource-card-foot">
                <span className="dim text-xs">{KIND_LABEL[r.kind]} · {r.category}{r.version ? ` · v${r.version}` : ''}</span>
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  {r.url ? (
                    <button className="btn btn-sm" onClick={() => { window.ventriee.openExternal(r.url!) }}>Open ↗</button>
                  ) : null}
                  {manage ? <button className="btn btn-sm" onClick={() => setPanel(manage.panel)}>{manage.label}</button> : null}
                </div>
              </div>
            </div>
          )
        })}
        {!loading && filtered.length === 0 ? (
          <div className="dim text-sm" style={{ gridColumn: '1/-1', padding: '16px 0' }}>
            {search ? `Nothing matches “${search}”. Try a broader capability, or install a resource from the Marketplace.` : 'No resources in this filter.'}
          </div>
        ) : null}
      </div>
    </Modal>
  )
}
