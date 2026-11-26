import { useEffect, useState } from 'react'
import { Modal } from '../shell'
import { cleanError, guard, useStore } from '../store'
import { ENGINE_LABELS, type EngineKind } from '../../../shared/types'
import type { AgentCatalogue, AgentTemplate, Department } from '../../../shared/agents'

type Draft = Omit<AgentTemplate, 'builtin'>
const list = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean)
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)

/** Editor for one template. Creating asks for the role key; editing keeps it, since tasks refer to it. */
function TemplateForm({ draft, create, departments, onDone }: { draft: Draft; create: boolean; departments: Department[]; onDone: (saved: boolean) => void }) {
  const [d, setD] = useState(draft)
  const [skills, setSkills] = useState(draft.skills.join(', '))
  const [mcp, setMcp] = useState(draft.mcpServers.join(', '))
  const set = (patch: Partial<Draft>) => setD({ ...d, ...patch })
  const save = async () => {
    const ok = await guard(() => window.ventriee.agentTemplateSave({ ...d, skills: list(skills), mcpServers: list(mcp) }, create), create ? `${d.name} added to the catalogue` : `${d.name} saved`)
    if (ok) onDone(true)
  }
  return (
    <form className="mk-dialog" aria-label={create ? 'New agent' : `Edit ${draft.name}`} onSubmit={(e) => { e.preventDefault(); void save() }}>
      <h3>{create ? 'New agent' : `Edit ${draft.name}`}</h3>
      <div className="field"><label className="field-label" htmlFor="ag-name">Name</label>
        <input id="ag-name" className="input" value={d.name} onChange={(e) => set({ name: e.target.value })} required /></div>
      <div className="field"><label className="field-label" htmlFor="ag-title">Title</label>
        <input id="ag-title" className="input" value={d.title} onChange={(e) => set({ title: e.target.value, ...(create ? { role: slug(e.target.value) } : {}) })} placeholder="e.g. Accessibility Specialist" /></div>
      <div className="field"><label className="field-label" htmlFor="ag-role">Role key</label>
        <input id="ag-role" className="input mono" value={d.role} onChange={(e) => set({ role: e.target.value })} disabled={!create} required aria-describedby="ag-role-hint" />
        <span id="ag-role-hint" className="hint">The planner schedules tasks by this key. Lowercase letters, digits and dashes.</span></div>
      <div className="field"><label className="field-label" htmlFor="ag-desc">Description</label>
        <input id="ag-desc" className="input" value={d.description} onChange={(e) => set({ description: e.target.value })} /></div>
      <div className="field"><label className="field-label" htmlFor="ag-dept">Department</label>
        <select id="ag-dept" className="input" value={d.department} onChange={(e) => set({ department: e.target.value })}>
          {departments.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select></div>
      <div className="field"><label className="field-label" htmlFor="ag-instr">System instructions</label>
        <textarea id="ag-instr" className="textarea" value={d.instructions} onChange={(e) => set({ instructions: e.target.value })} required /></div>
      <div className="flex gap-8">
        <div className="field grow"><label className="field-label" htmlFor="ag-engine">Preferred engine</label>
          <select id="ag-engine" className="input" value={d.engine} onChange={(e) => set({ engine: e.target.value as EngineKind | '' })}>
            <option value="">Studio default</option>
            {(Object.keys(ENGINE_LABELS) as EngineKind[]).map((k) => <option key={k} value={k}>{ENGINE_LABELS[k]}</option>)}
          </select></div>
        <div className="field grow"><label className="field-label" htmlFor="ag-model">Model</label>
          <input id="ag-model" className="input mono" value={d.model} onChange={(e) => set({ model: e.target.value })} disabled={!d.engine} placeholder={d.engine ? 'engine default' : 'set an engine first'} /></div>
        <div className="field"><label className="field-label" htmlFor="ag-budget">Budget (USD, 0 = none)</label>
          <input id="ag-budget" className="input" type="number" min={0} step={0.5} value={d.budgetUsd} onChange={(e) => set({ budgetUsd: Math.max(0, Number(e.target.value) || 0) })} /></div>
      </div>
      <div className="field"><label className="field-label" htmlFor="ag-skills">Skills (comma separated ids)</label>
        <input id="ag-skills" className="input mono" value={skills} onChange={(e) => setSkills(e.target.value)} /></div>
      <div className="field"><label className="field-label" htmlFor="ag-mcp">MCP servers (comma separated; empty = all enabled)</label>
        <input id="ag-mcp" className="input mono" value={mcp} onChange={(e) => setMcp(e.target.value)} /></div>
      <div className="flex gap-8">
        <label className="flex gap-8"><input type="checkbox" checked={d.writesCode} onChange={(e) => set({ writesCode: e.target.checked })} /> Writes code</label>
        <label className="flex gap-8"><input type="checkbox" checked={d.requiresApproval} onChange={(e) => set({ requiresApproval: e.target.checked })} /> Owner approves its work</label>
        <label className="flex gap-8"><input type="checkbox" checked={d.enabled} onChange={(e) => set({ enabled: e.target.checked })} /> Enabled</label>
      </div>
      <div className="flex gap-8"><button className="btn primary" type="submit">Save</button><button className="btn" type="button" onClick={() => onDone(false)}>Cancel</button></div>
    </form>
  )
}

/** The agent catalogue (§9): every agent type the planner can schedule, grouped by department. */
export function AgentsPanel({ onClose }: { onClose: () => void }) {
  const notify = useStore((s) => s.notify)
  const [catalogue, setCatalogue] = useState<AgentCatalogue | null>(null)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<{ draft: Draft; create: boolean } | null>(null)
  const [dept, setDept] = useState<{ id: string | null; name: string } | null>(null)

  const load = () => window.ventriee.agentCatalogue().then((c) => { setCatalogue(c); setError('') }).catch((e) => setError(cleanError(e)))
  useEffect(() => { void load() }, [])

  if (!catalogue) return <Modal title="Agents" onClose={onClose} wide>{error ? <p className="text-sm">{error}</p> : <p className="dim text-sm">Loading…</p>}</Modal>
  const { departments, templates } = catalogue

  const done = (saved: boolean) => { setEditing(null); if (saved) void load() }
  const blank = (department: string): Draft => ({ role: '', name: '', title: '', description: '', department, color: '#94a3b8', instructions: '', engine: '', model: '', skills: [], mcpServers: [], writesCode: false, budgetUsd: 5, requiresApproval: false, enabled: true })
  const draftOf = ({ builtin: _b, ...t }: AgentTemplate): Draft => t
  const duplicate = (t: AgentTemplate) => {
    let role = `${t.role}-copy`
    for (let i = 2; templates.some((x) => x.role === role); i++) role = `${t.role}-copy-${i}`
    setEditing({ draft: { ...draftOf(t), role, name: `${t.name} (copy)` }, create: true })
  }
  const toggle = async (t: AgentTemplate) => { if (await guard(() => window.ventriee.agentTemplateSave({ ...draftOf(t), enabled: !t.enabled }, false), `${t.name} ${t.enabled ? 'disabled' : 'enabled'}`)) void load() }
  const remove = async (t: AgentTemplate) => {
    if (!window.confirm(t.builtin ? `Reset ${t.name} to its built-in defaults? Your edits to it are lost.` : `Delete ${t.name} (${t.role}) from the catalogue? Workers already hired in projects stay.`)) return
    if ((await guard(() => window.ventriee.agentTemplateDelete(t.role), t.builtin ? `${t.name} reset` : `${t.name} deleted`)) !== null) void load()
  }
  const exportOf = async (pick: { role?: string; department?: string }) => {
    const path = await guard(() => window.ventriee.agentExport(pick))
    if (path) notify(`Saved ${path}`)
  }
  const importFile = async () => {
    const r = await guard(() => window.ventriee.agentImport())
    if (!r) return
    notify(`Imported ${r.added.join(', ')}. New agents are switched off until you enable them.${r.missing.length ? ` Not installed: ${r.missing.join(', ')}.` : ''}`, r.missing.length ? 'error' : undefined)
    void load()
  }
  const saveDepartments = async (next: Department[], msg: string) => { if (await guard(() => window.ventriee.agentDepartmentsSave(next), msg)) { setDept(null); void load() } }
  const submitDept = () => {
    if (!dept?.name.trim()) return
    const name = dept.name.trim()
    if (dept.id) return void saveDepartments(departments.map((d) => (d.id === dept.id ? { ...d, name } : d)), `Renamed to ${name}`)
    const id = slug(name)
    if (departments.some((d) => d.id === id)) return notify(`A department "${name}" already exists`, 'error')
    void saveDepartments([...departments, { id, name }], `Added ${name}`)
  }

  return (
    <Modal title="Agents" subtitle="Every agent type the planner can schedule. Enabled agents are hired into a project when a task needs them." onClose={onClose} wide>
      <div className="resources-toolbar flex gap-8">
        <button className="btn primary" onClick={() => setEditing({ draft: blank(departments[0].id), create: true })}>New agent</button>
        <button className="btn" onClick={() => setDept({ id: null, name: '' })}>New department</button>
        <button className="btn" onClick={() => void importFile()}>Import…</button>
      </div>
      <p className="hint">Manifests are data only: importing never runs code. Imported agents arrive switched off so you can review them first.</p>
      {error ? <p className="text-sm">{error}</p> : null}
      {dept ? (
        <form className="flex gap-8" onSubmit={(e) => { e.preventDefault(); submitDept() }}>
          <input className="input grow" autoFocus value={dept.name} onChange={(e) => setDept({ ...dept, name: e.target.value })} placeholder="Department name" aria-label="Department name" />
          <button className="btn primary" type="submit">{dept.id ? 'Rename' : 'Add'}</button>
          <button className="btn" type="button" onClick={() => setDept(null)}>Cancel</button>
        </form>
      ) : null}
      {editing ? <TemplateForm key={editing.draft.role} draft={editing.draft} create={editing.create} departments={departments} onDone={done} /> : null}

      {departments.map((d) => {
        const members = templates.filter((t) => t.department === d.id)
        return (
          <section key={d.id} aria-label={d.name}>
            <div className="section-label space-above flex gap-8">
              <span className="grow">{d.name} <span className="faint">{members.length}</span></span>
              <button className="btn tiny" onClick={() => setDept({ id: d.id, name: d.name })}>Rename</button>
              <button className="btn tiny" onClick={() => void exportOf({ department: d.id })} disabled={!members.length}>Export</button>
              <button className="btn tiny" onClick={() => void saveDepartments(departments.filter((x) => x.id !== d.id), `Removed ${d.name}`)} disabled={!!members.length || departments.length < 2} title={members.length ? 'Move its agents to another department first' : undefined}>Delete</button>
            </div>
            {!members.length ? <p className="settings-empty">No agents in this department.</p> : members.map((t) => (
              <article key={t.role} className="mk-card wide" style={{ opacity: t.enabled ? 1 : 0.6 }}>
                <div className="mk-head">
                  <b style={{ color: t.color }}>{t.name}</b>
                  <span className="dim">{t.title} · <span className="mono">{t.role}</span></span>
                  {t.builtin ? <span className="badge">built-in</span> : <span className="badge accent">custom</span>}
                  {!t.enabled ? <span className="badge err">off</span> : null}
                  {t.writesCode ? <span className="badge">writes code</span> : null}
                  {t.requiresApproval ? <span className="badge">needs approval</span> : null}
                </div>
                {t.description ? <p>{t.description}</p> : null}
                <div className="dim text-xs">{t.engine ? `${ENGINE_LABELS[t.engine]}${t.model ? ` / ${t.model}` : ''}` : 'Studio default engine'} · {t.skills.length} skills · {t.mcpServers.length ? `${t.mcpServers.length} MCP servers` : 'all enabled MCP servers'} · {t.budgetUsd ? `$${t.budgetUsd} budget` : 'no budget cap'}</div>
                <div className="mk-foot">
                  <label className="dim text-sm">Department{' '}
                    <select className="input" value={t.department} aria-label={`Department of ${t.name}`} onChange={(e) => void guard(() => window.ventriee.agentTemplateSave({ ...draftOf(t), department: e.target.value }, false), `Moved ${t.name}`).then(() => load())}>
                      {departments.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                    </select>
                  </label>
                  <button className="btn tiny" onClick={() => setEditing({ draft: draftOf(t), create: false })}>Edit</button>
                  <button className="btn tiny" onClick={() => duplicate(t)}>Duplicate</button>
                  <button className="btn tiny" onClick={() => void toggle(t)}>{t.enabled ? 'Disable' : 'Enable'}</button>
                  <button className="btn tiny" onClick={() => void exportOf({ role: t.role })}>Export</button>
                  <button className="btn tiny" onClick={() => void remove(t)}>{t.builtin ? 'Reset' : 'Delete'}</button>
                </div>
              </article>
            ))}
          </section>
        )
      })}
    </Modal>
  )
}
