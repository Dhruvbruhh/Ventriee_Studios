import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { guard, useStore } from '../store'
import { Modal, Switch } from '../shell'
import { ENGINE_LABELS, type Agent, type EngineKind } from '../../../shared/types'
import type { RemoteStatus } from '../../../shared/ipc'
// CLI adapters spawn a process per request; mirrors isCliEngine in main.
const isCliEngine = (engine: EngineKind) => engine.startsWith('cli-')
import { IconClose, IconCheck, IconCpu, IconDatabase, IconKey, IconPlug, IconPlus, IconRefresh, IconSliders, IconTrash, IconUsers } from '../icons'
import { ModelPicker, resolveModel } from '../components/ModelPicker'
import { AddProviderDialog } from '../components/AddProviderDialog'
import { TerminalView } from '../components/Terminal'
import { Toolchains } from '../components/Toolchains'
import { installUpdate, useUpdateState } from '../components/UpdateNotice'
import type { CredentialInfo } from '../../../shared/ipc'

type Tab = 'subscriptions' | 'engines' | 'workers' | 'run' | 'tools' | 'data'

/** Subscriptions reach the studio through each vendor's own CLI login; the studio never sees the password. */
const SUBSCRIPTIONS: Array<{ engine: EngineKind; name: string; plan: string; install: string; login: string; hint: string }> = [
  { engine: 'cli-claude', name: 'Claude', plan: 'Claude Pro / Max', install: 'npm install -g @anthropic-ai/claude-code', login: 'claude', hint: 'Claude Code opens (if it asks to trust the folder, choose Yes). Type /login, choose your Claude subscription and finish in the browser, then type /exit.' },
  { engine: 'cli-codex', name: 'ChatGPT', plan: 'ChatGPT Plus / Pro (Codex CLI)', install: 'npm install -g @openai/codex', login: 'codex login', hint: 'Choose "Sign in with ChatGPT" and finish in the browser.' },
  { engine: 'cli-gemini', name: 'Gemini', plan: 'Google account (Gemini CLI)', install: 'npm install -g @google/gemini-cli', login: 'gemini', hint: 'Choose "Login with Google" and finish in the browser, then type /quit.' },
  { engine: 'cli-opencode', name: 'OpenCode', plan: 'Any provider OpenCode supports', install: 'npm install -g opencode-ai', login: 'opencode auth login', hint: 'Pick a provider and follow its sign-in.' }
]

const ENGINE_ORDER = Object.keys(ENGINE_LABELS) as EngineKind[]

const TABS: Array<[Tab, string, ReactNode]> = [
  ['subscriptions', 'Subscriptions', <IconKey key="i" />],
  ['engines', 'Engines', <IconCpu key="i" />],
  ['workers', 'Workers', <IconUsers key="i" />],
  ['run', 'Run policy', <IconSliders key="i" />],
  ['tools', 'MCP tools', <IconPlug key="i" />],
  ['data', 'Data', <IconDatabase key="i" />]
]

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('subscriptions')
  return (
    <Modal
      title="Studio settings"
      subtitle="Engines, workers and run policy. Keys are stored in the OS keychain."
      onClose={onClose}
      nav={
        <div className="modal-nav" role="tablist" aria-orientation="vertical" aria-label="Settings sections">
          {TABS.map(([id, label, icon]) => (
            <button key={id} className={`modal-nav-item${tab === id ? ' on' : ''}`} onClick={() => setTab(id)} role="tab" aria-selected={tab === id}>
              {icon}{label}
            </button>
          ))}
        </div>
      }
    >
      {tab === 'subscriptions' ? <Subscriptions /> : null}
      {tab === 'engines' ? <Engines /> : null}
      {tab === 'workers' ? <Workers /> : null}
      {tab === 'run' ? <RunPolicy /> : null}
      {tab === 'tools' ? <McpTools /> : null}
      {tab === 'data' ? <DataTab /> : null}
    </Modal>
  )
}

function PaneHead({ title, children }: { title: string; children?: ReactNode }) {
  return <header className="pane-head"><h3>{title}</h3>{children ? <p>{children}</p> : null}</header>
}

function McpTools() {
  const servers = useStore((s) => s.snapshot)!.settings.mcpServers ?? []
  const [name, setName] = useState('')
  const [command, setCommand] = useState('')
  const [args, setArgs] = useState('')
  const save = (next: typeof servers, done?: string) => guard(() => window.ventriee.saveSettings({ mcpServers: next }), done)
  const nameOk = /^[A-Za-z0-9_-]{1,40}$/.test(name) && !servers.some((s) => s.name === name)
  return <>
    <PaneHead title="MCP tools">
      MCP servers give workers extra tools (a browser, a database, GitHub…). Enabled servers are passed to <b>Claude Code</b> workers on every run.
      Codex and Gemini CLI read MCP servers from their own config files (<code>~/.codex/config.toml</code>, <code>~/.gemini/settings.json</code>), so add them there for those engines.
      A server runs as a program on this computer with your permissions: add only ones you trust.
    </PaneHead>
    {!servers.length ? <p className="settings-empty">No MCP servers yet. Add one below.</p> : <div className="settings-list">{servers.map((s, i) => <div className="provider-line" key={s.name}>
      <span className="prov-name">{s.name}</span>
      <span className="prov-detail mono" title={`${s.command} ${s.args.join(' ')}`}>{s.command} {s.args.join(' ')}</span>
      <Switch on={s.enabled} onClick={() => void save(servers.map((x, j) => (j === i ? { ...x, enabled: !x.enabled } : x)))} label={`Enable ${s.name}`} />
      <button className="btn tiny" onClick={() => void save(servers.filter((_, j) => j !== i), `Removed ${s.name}`)} aria-label={`Remove ${s.name}`}><IconTrash /></button>
    </div>)}</div>}
    <form className="mcp-add" onSubmit={(e) => { e.preventDefault(); if (!nameOk || !command.trim()) return
      void save([...servers, { name, command: command.trim(), args: args.trim() ? args.trim().split(/\s+/) : [], enabled: true }], `Added ${name}`).then(() => { setName(''); setCommand(''); setArgs('') }) }}>
      <input className="input" aria-label="Server name" placeholder="name, e.g. filesystem" value={name} onChange={(e) => setName(e.target.value)} />
      <input className="input mono" aria-label="Command" placeholder="command, e.g. npx" value={command} onChange={(e) => setCommand(e.target.value)} />
      <input className="input mono" aria-label="Arguments" placeholder="arguments, e.g. -y @modelcontextprotocol/server-filesystem ." value={args} onChange={(e) => setArgs(e.target.value)} />
      <button className="btn primary" disabled={!nameOk || !command.trim()}>Add server</button>
    </form>
    {name && !nameOk ? <p className="hint">Use letters, numbers, - or _ (up to 40), and a name not already used.</p> : null}
  </>
}

function Subscriptions() {
  const snapshot = useStore((s) => s.snapshot)!
  const project = snapshot.projects.find((p) => p.id === snapshot.activeProjectId) ?? null
  const [running, setRunning] = useState<{ engine: EngineKind; action: 'install' | 'login' } | null>(null)
  const [checking, setChecking] = useState<EngineKind | null>(null)
  const [checked, setChecked] = useState<Record<string, { ok: boolean; detail: string }>>({})
  const sub = running ? SUBSCRIPTIONS.find((s) => s.engine === running.engine)! : null
  return <>
    <PaneHead title="Subscriptions">
      Use a subscription you already pay for. Each one signs in through the vendor's own command-line tool, in a terminal below; Ventriee never sees your password.
      After signing in, <b>Check</b> sends one tiny request to prove it works, and <b>Use everywhere</b> makes it the default for the planner and new workers.
    </PaneHead>
    <div className="sub-grid">
    {SUBSCRIPTIONS.map((s) => {
      const provider = snapshot.providers.find((p) => p.engine === s.engine)
      const result = checked[s.engine]
      const isDefault = snapshot.settings.plannerEngine === s.engine && snapshot.settings.orchestratorEngine === s.engine
      return <article key={s.engine} className={`sub-card${isDefault ? ' is-default' : ''}${provider?.available ? '' : ' is-missing'}`}>
        <div className="sub-card-head">
          <span className="sub-mark" aria-hidden>{s.name.slice(0, 1)}</span>
          <span className="sub-name"><b>{s.name}</b><small>{s.plan}</small></span>
          {isDefault ? <span className="badge accent">Default</span> : <span className={`badge ${provider?.available ? 'ok' : 'warn'}`}>{provider?.available ? 'Installed' : 'Not installed'}</span>}
        </div>
        <p className={`sub-status${result ? (result.ok ? ' ok-text' : ' err-text') : ''}`} title={result?.detail}>
          {result ? <>{result.ok ? <IconCheck width={13} height={13} aria-hidden /> : <IconClose width={13} height={13} aria-hidden />} {result.ok ? 'Signed in and answering' : result.detail}</>
            : isDefault ? 'Default for the planner and new workers'
            : provider?.available ? 'Sign in, then check it answers' : `Installs with ${s.install.split(' ').slice(-1)[0]}`}
        </p>
        <div className="sub-actions">
          {!provider?.available ? <button className="btn tiny primary" disabled={!project} onClick={() => setRunning({ engine: s.engine, action: 'install' })}>Install</button> : null}
          <button className="btn tiny" disabled={!project || !provider?.available} onClick={() => setRunning({ engine: s.engine, action: 'login' })}>Sign in</button>
          <button className="btn tiny" disabled={!provider?.available || checking === s.engine} onClick={async () => {
            setChecking(s.engine)
            const r = await guard(() => window.ventriee.testEngine(s.engine, '', ''))
            setChecking(null)
            if (r) setChecked((c) => ({ ...c, [s.engine]: r }))
          }}>{checking === s.engine ? 'Checking…' : 'Check'}</button>
          <button className="btn tiny ghost" disabled={!provider?.available || isDefault} onClick={() => void guard(() => window.ventriee.saveSettings({ plannerEngine: s.engine, plannerModel: '', plannerEndpoint: '', orchestratorEngine: s.engine, orchestratorModel: '' }), `${s.name} is now the default`)}>Use everywhere</button>
        </div>
      </article>
    })}
    </div>
    {!project ? <p className="hint">Open a project first: the sign-in terminal starts in its folder.</p> : null}
    {running && sub && project ? <div className="subscription-terminal">
      <p className="hint"><b>{running.action === 'install' ? `Installing ${sub.name} (needs Node.js)` : `Signing in to ${sub.name}`}.</b> {running.action === 'install' ? 'When it finishes, close this and press Sign in.' : sub.hint}
        {' '}<button className="ghost-link" onClick={() => setRunning(null)}>Close terminal</button></p>
      <TerminalView key={`${running.engine}-${running.action}`} projectId={project.id} slot={`connect-${running.engine}-${running.action}`} label={running.action === 'install' ? `Install ${sub.name}` : `${sub.name} sign-in`} command={running.action === 'install' ? sub.install : sub.login} closeOnUnmount />
    </div> : null}
  </>
}

function Engines() {
  const snapshot = useStore((s) => s.snapshot)!
  const [creds, setCreds] = useState<CredentialInfo[]>([])
  const [draftKeys, setDraftKeys] = useState<Record<string, string>>({})
  const [testing, setTesting] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, { ok: boolean; detail: string }>>({})

  useEffect(() => {
    void window.ventriee.credentials().then(setCreds)
  }, [snapshot.providers])

  const configured = useMemo(
    () => new Map(creds.map((c) => [c.engine, c.configured])),
    [creds]
  )

  return (
    <>
      <PaneHead title="Engines">
        CLI adapters run real local processes. API adapters call the provider directly. Nothing here is
        faked: unavailable engines stay marked unavailable until they actually respond.
      </PaneHead>
      <div className="settings-list">
      {ENGINE_ORDER.map((engine) => {
        const provider = snapshot.providers.find((p) => p.engine === engine)
        const isCli = provider?.kind === 'cli'
        const status = results[engine]
        const keyed = !['api-ollama', 'api-lmstudio', 'api-vllm', 'api-custom'].includes(engine)
        return (
          <div key={engine} className="provider-line">
            <span className="prov-name">{ENGINE_LABELS[engine]}</span>
            <span className={`badge ${provider?.available ? 'ok' : 'err'}`}>
              {isCli ? (provider?.available ? 'on PATH' : 'missing') : configured.get(engine) || !keyed ? 'ready' : 'no key'}
            </span>
            <span className="prov-detail" title={status?.detail ?? provider?.detail}>
              {status ? <>{status.ok ? <IconCheck width={12} height={12} aria-hidden /> : <IconClose width={12} height={12} aria-hidden />} {status.detail}</> : provider?.detail}
            </span>
            {!isCli && keyed ? (
              <input
                className="input mono key-input"
                type="password"
                placeholder="API key"
                value={draftKeys[engine] ?? ''}
                onChange={(e) => setDraftKeys((d) => ({ ...d, [engine]: e.target.value }))}
              />
            ) : null}
            {!isCli && keyed && draftKeys[engine] ? (
              <button
                className="btn tiny primary"
                onClick={async () => {
                  await guard(() => window.ventriee.saveCredential(engine, draftKeys[engine] ?? ''), 'Key stored in OS keychain')
                  setDraftKeys((d) => ({ ...d, [engine]: '' }))
                }}
              >
                Save
              </button>
            ) : null}
            {!isCli && keyed && configured.get(engine) && !draftKeys[engine] ? (
              <button
                className="btn tiny"
                onClick={async () => {
                  await guard(() => window.ventriee.clearCredential(engine), 'Key removed')
                }}
              >
                Clear
              </button>
            ) : null}
            <button
              className="btn tiny"
              disabled={testing === engine}
              onClick={async () => {
                setTesting(engine)
                const result = await guard(() =>
                  window.ventriee.testEngine(engine, '', '')
                )
                setTesting(null)
                if (result) setResults((r) => ({ ...r, [engine]: result }))
              }}
            >
              {testing === engine ? 'Testing…' : 'Test'}
            </button>
          </div>
        )
      })}
      </div>
      <div className="hint space-above">
        Env vars are also honoured (OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY, OPENROUTER_API_KEY,
        DEEPSEEK_API_KEY, MISTRAL_API_KEY). A key set here overrides the environment.
      </div>
    </>
  )
}

function Workers() {
  const snapshot = useStore((s) => s.snapshot)!
  const [selected, setSelected] = useState<string | null>(snapshot.agents[0]?.id ?? null)
  const agent = snapshot.agents.find((a) => a.id === selected) ?? null
  const [creaing, setCreating] = useState(false)

  return (<>
    <PaneHead title="Workers">Who is on the team, which model each one runs, and how much it may do on its own.</PaneHead>
    <div className="agents-editor">
      <div className="agents-list">
        {snapshot.agents.map((a) => (
          <button key={a.id} className={`agent-pick${a.id === selected ? ' on' : ''}`} onClick={() => setSelected(a.id)}>
            <span className="avatar" style={{ ['--who' as string]: a.color }}>{a.name.slice(0, 2).toUpperCase()}</span>
            <span className="agent-pick-name">{a.name}</span>
            <span className="badge agent-pick-role">{a.role.slice(0, 4)}</span>
          </button>
        ))}
        <button
          className="agent-pick agent-pick-new"
          onClick={() => {
            setCreating(true)
            setSelected(null)
          }}
        >
          <IconPlus width={12} height={12} /> New worker
        </button>
      </div>
      <div className="agents-form">
        {creaing ? (
          <NewWorker
            engineDefault={snapshot.settings.orchestratorEngine}
            onDone={(id) => {
              setCreating(false)
              setSelected(id)
            }}
          />
        ) : agent ? (
          <AgentForm agent={agent} key={agent.id} />
        ) : (
          <p className="faint text-sm">Select a worker.</p>
        )}
      </div>
    </div>
  </>)
}

function AgentForm({ agent }: { agent: Agent }) {
  const snapshot = useStore((s) => s.snapshot)!
  const [draft, setDraft] = useState(agent)
  const [addingProvider, setAddingProvider] = useState(false)
  useEffect(() => setDraft(agent), [agent])

  const save = async () => {
    await guard(
      () =>
        window.ventriee.updateAgent(agent.id, {
          name: draft.name,
          title: draft.title,
          role: draft.role,
          engine: draft.engine,
          model: draft.model,
          endpoint: draft.endpoint,
          instructions: draft.instructions,
          autonomy: draft.autonomy,
          reasoning: draft.reasoning,
          skills: draft.skills,
          budgetUsd: draft.budgetUsd,
          enabled: draft.enabled
        }),
      'Worker saved'
    )
  }

  return (
    <>
      <div className="row">
        <div className="field">
          <label className="field-label">Name</label>
          <input aria-label="Name" className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </div>
        <div className="field">
          <label className="field-label">Title</label>
          <input aria-label="Title" className="input" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
        </div>
      </div>
      <div className="row">
        <div className="field">
          <label className="field-label">Role</label>
          <select aria-label="Role" className="select" value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })}>
            {['orchestrator', 'researcher', 'architect', 'designer', 'frontend', 'integration', 'backend', 'database', 'security', 'reviewer', 'fixer', 'qa', 'seo', 'aeo', 'deployment', 'monitoring'].map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="field-label">Engine</label>
          <select aria-label="Engine"
            className="select"
            value={draft.engine}
            onChange={(e) => setDraft({ ...draft, engine: e.target.value as EngineKind })}
          >
            {ENGINE_ORDER.map((e) => (
              <option key={e} value={e}>{ENGINE_LABELS[e]}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="row">
        <div className="field">
          <label className="field-label">Model</label>
          <div className="flex gap-8">
            <ModelPicker
              value={draft.model ? { engine: draft.engine, model: draft.model, endpoint: draft.endpoint, providerId: null } : null}
              onPick={(option) => {
                const pick = resolveModel(option, snapshot.providerConfigs)
                setDraft({ ...draft, engine: pick.engine, model: pick.model, endpoint: pick.endpoint })
              }}
              onAddProvider={() => setAddingProvider(true)}
            />
            {draft.model ? (
              <button className="ghost-link" onClick={() => setDraft({ ...draft, model: '' })}>clear</button>
            ) : null}
          </div>
          <div className="hint">Picked from providers that actually answered. Clear it to use the engine default.</div>
        </div>
        <div className="field">
          <label className="field-label">Autonomy</label>
          <select aria-label="Autonomy" className="select" value={draft.autonomy} onChange={(e) => setDraft({ ...draft, autonomy: e.target.value as Agent['autonomy'] })}>
            <option value="ask">Ask before acting</option>
            <option value="scoped">Scoped (recommended)</option>
            <option value="autonomous">Autonomous in workspace</option>
          </select>
        </div>
        <div className="field">
          <label className="field-label">Reasoning effort</label>
          <select aria-label="Reasoning effort"
            className="select"
            value={draft.reasoning}
            onChange={(e) => setDraft({ ...draft, reasoning: e.target.value as Agent['reasoning'] })}
          >
            <option value="auto">Model default</option>
            <option value="none">Off (answer straight away)</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
          <div className="hint">Only sent when you pick a level. A provider that does not know the setting may reject the run.</div>
        </div>
      </div>
      <div className="field">
        <label className="field-label">Endpoint / CLI arguments</label>
        <input aria-label="Endpoint / CLI arguments"
          className="input mono"
          value={draft.endpoint}
          placeholder="Leave empty for the provider default"
          onChange={(e) => setDraft({ ...draft, endpoint: e.target.value })}
        />
        <div className="hint">For a custom CLI, use {'{prompt}'} where the prompt belongs, e.g. <span className="mono">my-agent --yes {'{prompt}'}</span></div>
      </div>
      <div className="field">
        <label className="field-label">Role instructions</label>
        <textarea aria-label="Role instructions"
          className="textarea mono textarea-tall"
          value={draft.instructions}
          onChange={(e) => setDraft({ ...draft, instructions: e.target.value })}
        />
      </div>
      <div className="field">
        <label className="field-label">Skills</label>
        <div className="flex gap-8 flex-wrap">
          {snapshot.skills.filter((s) => s.enabled).map((skill) => {
            const on = draft.skills.includes(skill.id)
            return (
              <button
                key={skill.id}
                className={`btn tiny ${on ? 'primary' : ''}`}
                onClick={() =>
                  setDraft({
                    ...draft,
                    skills: on ? draft.skills.filter((id) => id !== skill.id) : [...draft.skills, skill.id]
                  })
                }
              >
                {skill.name}
              </button>
            )
          })}
        </div>
        <div className="hint">
          {draft.skills.length
            ? 'This worker is offered exactly these skills, and told to read each SKILL.md before relying on it.'
            : 'No skills picked, so this worker uses the defaults for its role.'}
        </div>
      </div>
      <div className="row items-end">
        <div className="field field-narrow">
          <label className="field-label">Budget (USD)</label>
          <input aria-label="Budget (USD)"
            className="input"
            type="number"
            min={0}
            step={1}
            value={draft.budgetUsd}
            onChange={(e) => setDraft({ ...draft, budgetUsd: Number(e.target.value) })}
          />
        </div>
        <div className="field flex-none">
          <label className="field-label">Enabled</label>
          <Switch on={draft.enabled} onClick={() => setDraft({ ...draft, enabled: !draft.enabled })} label="Worker enabled" />
        </div>
        <div className="grow" />
      </div>
      <div className="flex gap-8 flex-wrap">
        <button className="btn primary" onClick={save}><IconCheck /> Save worker</button>
        <button className="btn" onClick={() => void guard(() => window.ventriee.duplicateAgent(agent.id), 'Worker duplicated')}>
          Duplicate
        </button>
        <button
          className="btn danger"
          onClick={async () => {
            if (!window.confirm(`Remove ${agent.name}? Their memory files are archived.`)) return
            await guard(() => window.ventriee.deleteAgent(agent.id), 'Worker removed')
          }}
        >
          <IconTrash /> Remove
        </button>
        <span className="faint text-xs ml-auto">
          {snapshot.settings.requireDeployApproval ? 'Deploys require your approval' : 'Deploys run without approval'}
        </span>
      </div>
    </>
  )
}

function NewWorker({ engineDefault, onDone }: { engineDefault: EngineKind; onDone: (id: string) => void }) {
  const snapshot = useStore((s) => s.snapshot)!
  const [form, setForm] = useState({
    name: '',
    title: '',
    role: 'frontend',
    engine: engineDefault,
    model: '',
    instructions: '',
    autonomy: 'scoped' as Agent['autonomy'],
    color: '#9aa4b2',
    budgetUsd: 5
  })

  return (
    <>
      <div className="row">
        <div className="field">
          <label className="field-label">Name</label>
          <input aria-label="Name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
        </div>
        <div className="field">
          <label className="field-label">Title</label>
          <input aria-label="Title" className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </div>
      </div>
      <div className="row">
        <div className="field">
          <label className="field-label">Role</label>
          <select aria-label="Role" className="select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {['researcher', 'architect', 'designer', 'frontend', 'integration', 'backend', 'database', 'security', 'reviewer', 'fixer', 'qa', 'seo', 'aeo', 'deployment', 'monitoring', 'orchestrator'].map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="field-label">Engine</label>
          <select aria-label="Engine" className="select" value={form.engine} onChange={(e) => setForm({ ...form, engine: e.target.value as EngineKind })}>
            {ENGINE_ORDER.map((e) => (
              <option key={e} value={e}>{ENGINE_LABELS[e]}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <label className="field-label">Model</label>
        <input aria-label="Model" className="input mono" value={form.model} placeholder="engine default" onChange={(e) => setForm({ ...form, model: e.target.value })} />
      </div>
      <div className="field">
        <label className="field-label">Instructions</label>
        <textarea aria-label="Instructions" className="textarea mono" value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} />
      </div>
      <button
        className="btn primary"
        disabled={!form.name.trim() || !snapshot.activeProjectId}
        onClick={async () => {
          const created = await guard(
            () =>
              window.ventriee.createAgent({
                projectId: snapshot.activeProjectId!,
                name: form.name.trim(),
                title: form.title.trim() || form.role,
                role: form.role,
                engine: form.engine,
                model: form.model,
                endpoint: '',
                instructions: form.instructions || `You are a ${form.role} at Ventriee Studios.`,
                autonomy: form.autonomy,
                reasoning: 'auto',
                color: form.color,
                budgetUsd: form.budgetUsd
              }),
            'Worker hired'
          )
          if (created) onDone(created.id)
        }}
      >
        <IconPlus /> Hire worker
      </button>
    </>
  )
}

/** Inbound remote control ("Jarvis"): register/heartbeat status, the on/off toggle, and recent commands. */
function RemoteControlSection() {
  const [status, setStatus] = useState<RemoteStatus | null>(null)
  const load = () => window.ventriee.remoteStatus().then(setStatus).catch(() => {})
  useEffect(() => { void load(); const t = setInterval(load, 5000); return () => clearInterval(t) }, [])
  const device = status?.device
  return <>
    <div className="section-label space-above">Remote control (Jarvis)</div>
    <div className="kv-row">
      <div className="kv-row-main">
        <div className="kv-row-title">Let your phone or the web drive this device</div>
        <div className="kv-row-sub">
          {device
            ? <>Registered as <strong>{device.name}</strong> ({device.platform}). Commands arrive through your Ventriee account — no open ports. Off by default; only you (or people you grant) can send commands.</>
            : <>Sign in to register this device. Then turn this on to let an authorized phone or web client ask for project status, start or stop a run, or open a preview.</>}
        </div>
      </div>
      {device ? <Switch on={Boolean(status?.enabled)}
        onClick={() => void guard(() => window.ventriee.remoteSetEnabled(!status?.enabled), status?.enabled ? 'Remote control off' : 'Remote control on').then(() => load())}
        label="Remote control" /> : null}
    </div>
    {device && status?.commands.length ? <div className="kv-row"><div className="kv-row-main">
      <div className="kv-row-sub">Recent commands</div>
      <ul aria-label="Recent remote commands">
        {status.commands.slice(0, 8).map((c) => <li key={c.id} className="kv-row-sub">
          <code>{c.type}</code> — {c.status}{c.requires_confirmation ? ' (confirmed)' : ''}{c.error ? `: ${c.error}` : ''}
        </li>)}
      </ul>
    </div></div> : null}
  </>
}

/** Editor settings sync through the owner's account, and the opt-in local error log behind "Report a problem". */
function SyncAndReports() {
  const settings = useStore((s) => s.snapshot?.settings)
  const [missing, setMissing] = useState<string[]>([])
  const [log, setLog] = useState<string | null>(null)
  if (!settings) return null
  return <>
    <div className="section-label space-above">Settings sync</div>
    <div className="kv-row">
      <div className="kv-row-main">
        <div className="kv-row-title">Editor theme, Vim mode, shortcuts and extensions</div>
        <div className="kv-row-sub">Stored on your Ventriee account so another computer can download them. API keys, endpoints and MCP settings are never synced.</div>
      </div>
      <button className="btn tiny" onClick={() => void guard(() => window.ventriee.syncPush(), 'Settings uploaded to your account')}>Upload</button>
      <button className="btn tiny" onClick={() => void guard(() => window.ventriee.syncPull()).then((r) => {
        if (r === null) return
        if (!r) { useStore.getState().notify('Nothing synced to this account yet', 'info'); return }
        setMissing(r.missingExtensions)
        useStore.getState().notify(r.missingExtensions.length ? `Settings downloaded. ${r.missingExtensions.length} extension(s) to install.` : 'Settings downloaded')
      })}>Download</button>
    </div>
    {missing.length ? <div className="kv-row"><div className="kv-row-main"><div className="kv-row-sub">Extensions from your other computer: {missing.join(', ')}</div></div>
      <button className="btn tiny primary" onClick={() => void (async () => { for (const id of missing) await guard(() => window.ventriee.extInstall(id)); setMissing([]) })()}>Install them</button></div> : null}

    <RemoteControlSection />

    <div className="section-label space-above">Spending limits</div>
    <div className="kv-row">
      <div className="kv-row-main">
        <div className="kv-row-title">Daily limits in USD (0 = no limit)</div>
        <div className="kv-row-sub">At a limit, new agent tasks and editor AI requests wait until tomorrow; nothing running is stopped. Counts what API engines report; subscription CLIs report no cost.</div>
      </div>
      <label className="budget-field">All projects <input className="input" type="number" min={0} step={1} aria-label="Daily limit for all projects in dollars" defaultValue={settings.dailyBudgetUsd} onBlur={(e) => void guard(() => window.ventriee.saveSettings({ dailyBudgetUsd: Number(e.target.value) }))} /></label>
      <label className="budget-field">Each project <input className="input" type="number" min={0} step={1} aria-label="Daily limit per project in dollars" defaultValue={settings.projectBudgetUsd} onBlur={(e) => void guard(() => window.ventriee.saveSettings({ projectBudgetUsd: Number(e.target.value) }))} /></label>
    </div>

    <div className="section-label space-above">Look and feel</div>
    <div className="kv-row">
      <div className="kv-row-main">
        <div className="kv-row-title">Anime effects</div>
        <div className="kv-row-sub">Impact bursts, puffs and manga lettering when you send, confirm, finish a task or pass your tests. Off automatically when your system asks for reduced motion.</div>
      </div>
      <Switch on={settings.effects !== false} onClick={() => void guard(() => window.ventriee.saveSettings({ effects: settings.effects === false }))} label="Anime effects" />
    </div>

    <div className="section-label space-above">Problems and crashes</div>
    <div className="kv-row">
      <div className="kv-row-main">
        <div className="kv-row-title">Keep a local error log</div>
        <div className="kv-row-sub">Off by default. Errors and crashes are written to a file on this computer, with secrets removed. Nothing is sent anywhere.</div>
      </div>
      <Switch on={settings.errorReports} onClick={() => void guard(() => window.ventriee.saveSettings({ errorReports: !settings.errorReports }))} label="Keep a local error log" />
    </div>
    <div className="kv-row">
      <div className="kv-row-main"><div className="kv-row-sub">Report a problem opens a prefilled GitHub issue in your browser with the recent errors. You read and edit it before posting.</div></div>
      <button className="btn tiny" onClick={() => void guard(() => window.ventriee.errorLog()).then((t) => t !== null && setLog(t || 'The log is empty.'))}>View log</button>
      <button className="btn tiny" onClick={() => void guard(() => window.ventriee.reportProblem())}>Report a problem</button>
    </div>
    {log !== null ? <pre className="debug-output max-h-sm" aria-label="Error log">{log}</pre> : null}
  </>
}

function RunPolicy() {
  const snapshot = useStore((s) => s.snapshot)!
  const settings = snapshot.settings
  const [busy, setBusy] = useState(false)

  const update = async (patch: Parameters<typeof window.ventriee.saveSettings>[0]) => {
    setBusy(true)
    await guard(() => window.ventriee.saveSettings(patch))
    setBusy(false)
  }

  return (
    <div className={busy ? 'is-busy' : undefined}>
      <PaneHead title="Run policy">How the orchestrator routes models, how many workers run at once, and what waits for your approval.</PaneHead>
      <div className="section-label">Model routing</div>
      <div className="assign-modes">
        {([
          ['manual', 'Manual', 'Every worker runs the model you chose. Nothing is overridden.'],
          ['automatic', 'Automatic', 'The orchestrator picks a model per task from what is available.'],
          ['hybrid', 'Hybrid', 'Your per-worker choice wins; the orchestrator may override when no model is set.']
        ] as Array<[typeof settings.routingMode, string, string]>).map(([mode, title, sub]) => (
          <button
            key={mode}
            className={`assign-mode${settings.routingMode === mode ? ' on' : ''}`}
            onClick={() => void update({ routingMode: mode })}
            role="radio"
            aria-checked={settings.routingMode === mode}
          >
            <span className="assign-mode-title">{title}</span>
            <span className="assign-mode-sub">{sub}</span>
          </button>
        ))}
      </div>
      <div className="kv-row">
        <div className="kv-row-main">
          <div className="kv-row-title">When routing automatically</div>
          <div className="kv-row-sub">What the orchestrator optimises for. Ignored in manual mode.</div>
        </div>
        <select
          className="select w-sm"
          value={settings.costPreference}
          onChange={(e) => void update({ costPreference: e.target.value as typeof settings.costPreference })}
        >
          <option value="cheap">Cheapest</option>
          <option value="balanced">Balanced</option>
          <option value="quality">Best quality</option>
        </select>
      </div>

      <div className="section-label space-above">Prompt optimizer</div>
      <div className="kv-row">
        <div className="kv-row-main">
          <div className="kv-row-title">Model for Enhance</div>
          <div className="kv-row-sub">
            {settings.optimizerModel ? `Enhance runs on ${settings.optimizerModel}.` : 'Not set: Enhance uses the planner model.'} A local Ollama model makes it free and private; the User Manual explains setup.
          </div>
        </div>
        <ModelPicker compact value={settings.optimizerModel ? { engine: settings.optimizerEngine, model: settings.optimizerModel, endpoint: settings.optimizerEndpoint, providerId: null } : null}
          onPick={(option) => { const r = resolveModel(option, snapshot.providerConfigs); void update({ optimizerEngine: r.engine, optimizerModel: r.model, optimizerEndpoint: r.endpoint }) }}
          onAddProvider={() => useStore.getState().notify('Add local models under Engines, or start Ollama and reopen Settings.', 'info')} />
        {settings.optimizerModel ? <button className="btn tiny" onClick={() => void update({ optimizerModel: '' })}>Use planner</button> : null}
      </div>

      <div className="section-label space-above">Inline completions</div>
      <div className="kv-row">
        <div className="kv-row-main">
          <div className="kv-row-title">Suggest code as you type</div>
          <div className="kv-row-sub">
            {settings.completionModel
              ? isCliEngine(settings.completionEngine) ? `${settings.completionModel} is a command-line agent, too slow to answer each keystroke. Pick an API or local model.` : `On: ${settings.completionModel} suggests code after a short pause in typing; Tab accepts.`
              : 'Off.'} Code near the cursor is sent to this model. A small local Ollama coding model keeps it free and private.
          </div>
        </div>
        <ModelPicker compact value={settings.completionModel ? { engine: settings.completionEngine, model: settings.completionModel, endpoint: settings.completionEndpoint, providerId: null } : null}
          onPick={(option) => { const r = resolveModel(option, snapshot.providerConfigs); void update({ completionEngine: r.engine, completionModel: r.model, completionEndpoint: r.endpoint }) }}
          onAddProvider={() => useStore.getState().notify('Add local models under Engines, or start Ollama and reopen Settings.', 'info')} />
        {settings.completionModel ? <button className="btn tiny" onClick={() => void update({ completionModel: '' })}>Turn off</button> : null}
      </div>

      <div className="section-label space-above">Languages and tools</div>
      <Toolchains />

      <SyncAndReports />

      <div className="section-label space-above">Run</div>
      <div className="kv-row">
        <div className="kv-row-main">
          <div className="kv-row-title">Parallel sessions</div>
          <div className="kv-row-sub">Maximum workers executing at the same time. Code-writing roles are serialized per project.</div>
        </div>
        <input
          className="input w-xs"
          type="number"
          min={1}
          max={8}
          value={settings.maxConcurrentSessions}
          onChange={(e) => void update({ maxConcurrentSessions: Math.max(1, Number(e.target.value)) })}
        />
      </div>
      <div className="kv-row">
        <div className="kv-row-main">
          <div className="kv-row-title">Session timeout</div>
          <div className="kv-row-sub">Minutes before a hung worker process is killed.</div>
        </div>
        <input
          className="input w-xs"
          type="number"
          min={2}
          max={240}
          value={settings.sessionTimeoutMinutes}
          onChange={(e) => void update({ sessionTimeoutMinutes: Math.max(2, Number(e.target.value)) })}
        />
      </div>
      <div className="kv-row">
        <div className="kv-row-main">
          <div className="kv-row-title">Require approval before deploy</div>
          <div className="kv-row-sub">Deployment tasks pause in the approval queue until you accept them.</div>
        </div>
        <Switch on={settings.requireDeployApproval} onClick={() => void update({ requireDeployApproval: !settings.requireDeployApproval })} label="Deploy approval" />
      </div>
      <div className="kv-row">
        <div className="kv-row-main">
          <div className="kv-row-title">Extract verified lessons after a run</div>
          <div className="kv-row-sub">Only accepted tasks become lessons and reusable workflow skills.</div>
        </div>
        <Switch on={settings.autoExtractLessons} onClick={() => void update({ autoExtractLessons: !settings.autoExtractLessons })} label="Auto lessons" />
      </div>
      <div className="kv-row">
        <div className="kv-row-main">
          <div className="kv-row-title">Fallback planner</div>
          <div className="kv-row-sub">Use the deterministic planner when no model is reachable, instead of stalling.</div>
        </div>
        <Switch on={settings.plannerFallback} onClick={() => void update({ plannerFallback: !settings.plannerFallback })} label="Fallback planner" />
      </div>
    </div>
  )
}

function DataTab() {
  const snapshot = useStore((s) => s.snapshot)!
  const project = snapshot.projects.find((p) => p.id === snapshot.activeProjectId)
  const update = useUpdateState()
  const [checking, setChecking] = useState(false)
  const statusText: Record<string, string> = {
    unsupported: update?.message ?? 'Updates are checked in the installed app.',
    idle: 'Checks automatically a few seconds after start and every six hours.',
    checking: 'Checking…',
    current: 'You have the latest version.',
    downloading: `Downloading ${update?.version ?? ''} (${update?.percent ?? 0}%).`,
    ready: `Version ${update?.version ?? ''} is downloaded. It installs when you restart or close the app.`,
    manual: `Version ${update?.version ?? ''} is available. This portable copy cannot update itself; download the new one.`,
    error: `Could not check for updates: ${update?.message ?? 'unknown error'}. The app keeps working; it tries again later.`
  }
  return (
    <>
      <PaneHead title="Data">Updates, sync across your computers, spending limits and local logs.</PaneHead>
      <div className="section-label">Updates</div>
      <div className="kv-row">
        <div className="kv-row-main">
          <div className="kv-row-title">Ventriee Studios {update?.current ?? ''}</div>
          <div className="kv-row-sub" role="status">{update ? statusText[update.status] : 'Loading…'} Updating never touches your projects, settings or sign-in; the studio database is backed up before a new version changes it.</div>
        </div>
        {update?.status === 'ready' ? <button className="btn primary" onClick={() => void installUpdate()}>Restart to update</button>
          : update?.status === 'manual' && update.url ? <a className="btn" href={update.url} target="_blank" rel="noreferrer">Download</a>
          : <button className="btn" disabled={checking || !update || ['unsupported', 'checking', 'downloading'].includes(update.status)}
              onClick={async () => { setChecking(true); await guard(() => window.ventriee.updateCheck()); setChecking(false) }}>{checking ? 'Checking…' : 'Check now'}</button>}
      </div>

      <div className="section-label space-above">Current project</div>
      <dl>
        <div className="kv"><dt>Name</dt><dd>{project?.name ?? '—'}</dd></div>
        <div className="kv"><dt>Workspace</dt><dd className="mono">{project?.path ?? '—'}</dd></div>
        <div className="kv"><dt>Workers</dt><dd>{snapshot.agents.length}</dd></div>
        <div className="kv"><dt>Tasks</dt><dd>{snapshot.tasks.length}</dd></div>
        <div className="kv"><dt>Sessions</dt><dd>{snapshot.sessions.length}</dd></div>
        <div className="kv"><dt>Memory docs</dt><dd>{snapshot.memories.length}</dd></div>
        <div className="kv"><dt>Skills</dt><dd>{snapshot.skills.length}</dd></div>
      </dl>
      <div className="section-label space-above">Local storage</div>
      <p className="hint lh-relaxed">
        Everything lives on this machine: SQLite at <span className="mono">%APPDATA%/ventriee-studios/ventriee.db</span>,
        human-readable memory under <span className="mono">%APPDATA%/ventriee-studios/memory</span>, and skills under
        <span className="mono"> %APPDATA%/ventriee-studios/skills</span>. Nothing is uploaded.
      </p>
      <div className="flex gap-8 space-above">
        <button className="btn" onClick={() => void guard(() => window.ventriee.refreshSkills(), 'Skill registry rescanned')}>
          <IconRefresh /> Rescan skills
        </button>
        {project ? (
          <button className="btn" onClick={() => void guard(() => window.ventriee.openPath(project.path), 'Workspace opened')}>
            Open workspace folder
          </button>
        ) : null}
      </div>
    </>
  )
}
