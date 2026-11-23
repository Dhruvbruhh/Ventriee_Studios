import { useMemo, useState } from 'react'
import { guard, useStore } from '../store'
import { Modal, Switch } from '../shell'
import { IconClock, IconExternal, IconPlus, IconRefresh, IconSearch, IconTrash } from '../icons'
import type { SkillScanReport } from '../../../shared/types'

function ScanBadge({ scan }: { scan?: SkillScanReport | null }) {
  if (!scan) return <span className="badge">scanning…</span>
  const cls =
    scan.recommendation === 'SAFE' ? ' ok' : scan.recommendation === 'CAUTION' ? ' warn' : ' danger'
  const label = scan.recommendation === 'SAFE' ? 'Safe' : scan.recommendation === 'CAUTION' ? 'Caution' : 'Unsafe'
  return <span className={`badge${cls}`} title={scan.findings.length ? scan.findings.map((f) => `${f.id} ${f.title} at ${f.location}`).join('\n') : `No problems found (score ${scan.score})`}>{label}</span>
}

type Filter = 'all' | 'on' | 'off' | 'review'

export function SkillsPanel({ onClose }: { onClose: () => void }) {
  const snapshot = useStore((s) => s.snapshot)!
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [instructions, setInstructions] = useState('')
  const [creating, setCreating] = useState(false)
  const [report, setReport] = useState<SkillScanReport | null>(null)
  const [reportSkill, setReportSkill] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')

  const skills = snapshot.skills
  const review = (s: (typeof skills)[number]) => Boolean(s.scan && s.scan.recommendation !== 'SAFE')
  const counts = { all: skills.length, on: skills.filter((s) => s.enabled).length, off: skills.filter((s) => !s.enabled).length, review: skills.filter(review).length }
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return skills.filter((s) =>
      (filter === 'all' || (filter === 'on' ? s.enabled : filter === 'off' ? !s.enabled : review(s))) &&
      (!q || s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)))
  }, [skills, query, filter])

  const importSkill = async () => {
    const result = await guard(() => window.ventriee.importSkill())
    if (!result) return
    if (result.removed) {
      setReport(result.report)
      setReportSkill('Imported skill')
    } else if (result.report?.findings.length) {
      setReport(result.report)
      setReportSkill(result.skill?.name ?? 'Imported skill')
    }
  }

  return (
    <Modal
      title="Skills"
      subtitle={`${counts.on} enabled of ${counts.all}. Enabled skills are offered to workers in their task brief.`}
      onClose={onClose}
      actions={
        <>
          <button className="btn" onClick={() => void guard(() => window.ventriee.refreshSkills(), 'Registry rescanned')}>
            <IconRefresh /> Rescan
          </button>
          <button className="btn" onClick={importSkill} title="Pick a skill folder to scan and install">
            <IconPlus /> Import
          </button>
          <button className="btn primary" onClick={() => setCreating((v) => !v)} aria-expanded={creating}>
            <IconPlus /> New skill
          </button>
        </>
      }
    >
      {report ? (
        <Modal
          title={
            report.recommendation === 'SAFE'
              ? `${reportSkill}: no problems`
              : report.recommendation === 'CAUTION'
                ? `${reportSkill}: caution`
                : `${reportSkill}: removed, do not install`
          }
          subtitle={`Score ${report.score}/100, ${report.severity}. ${report.executable ? 'Contains executable scripts (risk weighted ×1.3).' : 'No executable scripts.'}`}
          onClose={() => setReport(null)}
          narrow
        >
          {report.recommendation === 'DO NOT INSTALL' ? (
            <p className="err-text text-sm space-below">
              This skill was removed and not registered. Fix the problems below, then import it again.
            </p>
          ) : null}
          {report.findings.length ? (
            <div className="finding-list">
              {report.findings.map((f, i) => (
                <div key={i} className="finding">
                  <div className="finding-head">
                    <b>{f.id}: {f.title}</b>
                    <span className="badge danger">{f.severity}</span>
                  </div>
                  <div className="faint mono text-xs">{f.location}</div>
                  <p>{f.detail}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="ok-text text-sm">No suspicious patterns found.</p>
          )}
        </Modal>
      ) : null}

      {creating ? (
        <form
          className="inset-form space-below"
          onSubmit={async (e) => {
            e.preventDefault()
            const created = await guard(
              () =>
                window.ventriee.saveMemory({
                  path: `skills/${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}/SKILL.md`,
                  title: name.trim(),
                  body: `---\nname: ${name.trim()}\ndescription: ${description.trim()}\nversion: 1.0.0\n---\n\n${instructions}`,
                  scope: 'skill',
                  projectId: snapshot.activeProjectId
                }),
              'Skill written'
            )
            if (created) {
              await guard(() => window.ventriee.refreshSkills(), 'Skill registered')
              setCreating(false)
              setName('')
              setDescription('')
              setInstructions('')
            }
          }}
        >
          <div className="row">
            <div className="field">
              <label className="field-label" htmlFor="skill-name">Name</label>
              <input id="skill-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="playwright-smoke-test" autoFocus />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="skill-desc">When to use it</label>
              <input id="skill-desc" className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="One line on when to use this skill." />
            </div>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="skill-body">Instructions</label>
            <textarea id="skill-body" className="textarea mono" value={instructions} onChange={(e) => setInstructions(e.target.value)} />
          </div>
          <div className="form-foot">
            <button type="button" className="btn ghost" onClick={() => setCreating(false)}>Cancel</button>
            <button type="submit" className="btn primary" disabled={!name.trim() || !description.trim()}>Create skill</button>
          </div>
        </form>
      ) : null}

      <div className="list-toolbar">
        <label className="search-field">
          <IconSearch width={14} height={14} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${counts.all} skills`} aria-label="Search skills" />
        </label>
        <div className="seg-control" role="radiogroup" aria-label="Show">
          {([['all', 'All'], ['on', 'Enabled'], ['off', 'Off'], ['review', 'Needs review']] as Array<[Filter, string]>).map(([id, label]) => (
            <button key={id} role="radio" aria-checked={filter === id} className={filter === id ? 'on' : ''} onClick={() => setFilter(id)}>
              {label}<span>{counts[id]}</span>
            </button>
          ))}
        </div>
      </div>
      <p className="hint space-below">
        Skills are folders with a <span className="mono">SKILL.md</span>. Every skill is scanned for malicious patterns on import and on rescan; one that fails badly is removed and never registered.
      </p>

      <div className="item-list">
        {shown.map((skill) => (
          <div key={skill.id} className={`item-row${skill.enabled ? '' : ' is-off'}`}>
            <div className="item-main">
              <div className="item-title">
                <b>{skill.name}</b>
                <span className="item-meta mono">v{skill.version}</span>
                <ScanBadge scan={skill.scan} />
                {skill.uses ? <span className="item-meta">used {skill.uses}×, {Math.round((skill.successes / skill.uses) * 100)}% pass</span> : null}
              </div>
              <p className="item-desc" title={skill.description}>{skill.description.replace(/^>\s*$/, '') || 'No description.'}</p>
            </div>
            <div className="item-actions">
              {skill.scan?.findings.length ? (
                <button className="btn tiny" onClick={() => { setReport(skill.scan!); setReportSkill(skill.name) }}>
                  {skill.scan.findings.length} {skill.scan.findings.length === 1 ? 'issue' : 'issues'}
                </button>
              ) : null}
              <button className="icon-btn" onClick={() => void guard(() => window.ventriee.revealFile(skill.path))} aria-label={`Show ${skill.name} folder`} title={`${skill.source}: show folder`}>
                <IconExternal />
              </button>
              <Switch on={skill.enabled} onClick={() => void guard(() => window.ventriee.toggleSkill(skill.id))} label={`Enable ${skill.name}`} />
            </div>
          </div>
        ))}
        {!shown.length ? (
          <p className="settings-empty">
            {skills.length ? 'No skills match.' : 'No skills yet. Verified workflows are added automatically after a run, or create one above.'}
          </p>
        ) : null}
      </div>
    </Modal>
  )
}

export function AutomationsPanel({ onClose }: { onClose: () => void }) {
  const snapshot = useStore((s) => s.snapshot)!
  const [name, setName] = useState('')
  const [instruction, setInstruction] = useState('')
  const [interval, setInterval] = useState(60)

  return (
    <Modal
      title="Automations"
      subtitle="A local scheduler. Nothing runs unless you create and enable it here."
      onClose={onClose}
      narrow
    >
      <form
        className="inset-form space-below"
        onSubmit={async (e) => {
          e.preventDefault()
          const created = await guard(
            () =>
              window.ventriee.addAutomation({
                projectId: snapshot.activeProjectId!,
                name: name.trim(),
                instruction: instruction.trim(),
                intervalMinutes: interval
              }),
            'Automation scheduled'
          )
          if (created) {
            setName('')
            setInstruction('')
          }
        }}
      >
        <div className="row">
          <div className="field">
            <label className="field-label" htmlFor="auto-name">Name</label>
            <input id="auto-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Weekly SEO check" />
          </div>
          <div className="field field-narrow">
            <label className="field-label" htmlFor="auto-every">Every (minutes)</label>
            <input id="auto-every" className="input" type="number" min={5} value={interval} onChange={(e) => setInterval(Number(e.target.value))} />
          </div>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="auto-instruction">Instruction sent to the orchestrator</label>
          <textarea id="auto-instruction" className="textarea" value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="Re-run the SEO audit and report anything that regressed." />
        </div>
        <div className="form-foot">
          <button type="submit" className="btn primary" disabled={!name.trim() || !instruction.trim() || !snapshot.activeProjectId}>
            <IconPlus /> Add automation
          </button>
        </div>
      </form>

      <div className="section-label">Scheduled <span className="faint">{snapshot.automations.length}</span></div>
      {snapshot.automations.length ? (
        <div className="item-list">
          {snapshot.automations.map((auto) => (
            <div key={auto.id} className={`item-row${auto.enabled ? '' : ' is-off'}`}>
              <div className="item-main">
                <div className="item-title">
                  <b>{auto.name}</b>
                  <span className="badge"><IconClock width={11} height={11} /> every {auto.intervalMinutes} min</span>
                </div>
                <p className="item-desc">{auto.instruction}</p>
                <p className="item-meta">
                  {auto.enabled ? `Next ${auto.nextRunAt ? new Date(auto.nextRunAt).toLocaleString() : 'soon'}` : 'Paused'}
                  {auto.lastRunAt ? `, last ran ${new Date(auto.lastRunAt).toLocaleString()}` : ''}
                </p>
              </div>
              <div className="item-actions">
                <button className="icon-btn" onClick={() => void guard(() => window.ventriee.deleteAutomation(auto.id), 'Automation removed')} aria-label={`Remove ${auto.name}`}>
                  <IconTrash />
                </button>
                <Switch on={auto.enabled} onClick={() => void guard(() => window.ventriee.toggleAutomation(auto.id))} label={`Toggle ${auto.name}`} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="settings-empty">No automations yet. Add one above to run an instruction on a schedule.</p>
      )}
    </Modal>
  )
}
