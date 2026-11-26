import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { homepage } from '../../shared/auth-config'
import { guard, useStore } from './store'
import { Modal, NewProjectDialog, Toast } from './shell'
import { Floor } from './components/Floor'
import { Rail } from './components/Rail'
import { Preview } from './components/Preview'
import { CommandBar } from './components/CommandBar'
import { Inspector } from './components/Inspector'
import { Workspace } from './components/Workspace'
import { Dashboard } from './components/Dashboard'
import { SideChat } from './components/SideChat'
import { SimpleMode } from './components/SimpleMode'
import { CloudSyncBadge } from './components/CloudSync'
import { TerminalView } from './components/Terminal'
import { SettingsPanel } from './panels/SettingsPanel'
import { MemoryPanel } from './panels/MemoryPanel'
import { AutomationsPanel, SkillsPanel } from './panels/SkillsPanel'
import { ProjectPanel } from './panels/ProjectPanel'
import { RunsPanel } from './panels/RunsPanel'
import { ClientsPanel } from './panels/ClientsPanel'
import { ResourcesPanel } from './panels/ResourcesPanel'
import { SecurityPanel } from './panels/SecurityPanel'
import { AnalyticsPanel } from './panels/AnalyticsPanel'
import { WorkflowsPanel } from './panels/WorkflowsPanel'
import { BrowserPanel } from './panels/BrowserPanel'
import { RemotePanel } from './panels/RemotePanel'
import { MarketplacePanel } from './panels/MarketplacePanel'
import { HelpPanel } from './panels/HelpPanel'
import { VoiceAssistant } from './components/VoiceAssistant'
import { IconSidebar, IconSpark } from './icons'
import { Sidebar } from './components/Sidebar'
import { UpdateNotice } from './components/UpdateNotice'
import { Toolchains } from './components/Toolchains'
import { impact } from './fx'
const CodeWorkspace = lazy(() => import('./editor/CodeWorkspace'))

export function App() {
  const snapshot = useStore((s) => s.snapshot)
  const ready = useStore((s) => s.ready)
  const panel = useStore((s) => s.panel)
  const setPanel = useStore((s) => s.setPanel)
  const setSnapshot = useStore((s) => s.setSnapshot)
  const appendOutput = useStore((s) => s.appendOutput)
  const appendChat = useStore((s) => s.appendChat)
  const workspace = useStore((s) => s.workspace)
  const setWorkspace = useStore((s) => s.setWorkspace)
  const selectedAgentId = useStore((s) => s.selectedAgentId)
  const [newProject, setNewProject] = useState(false)
  const [showAdvisor, setShowAdvisor] = useState(false)
  const [sidebar, setSidebar] = useState(true)
  // A task that turns done while you watch gets the impact effect, on the task counter or the open view's tab.
  const statuses = useRef(new Map<string, string>())
  useEffect(() => {
    let finished = false
    for (const task of snapshot?.tasks ?? []) {
      const before = statuses.current.get(task.id)
      if (task.status === 'done' && before && before !== 'done') finished = true
      statuses.current.set(task.id, task.status)
    }
    if (finished) impact(document.querySelector('[data-fx-anchor="tasks"]') ?? document.querySelector('.ws-tab.on'))
  }, [snapshot?.tasks])
  useEffect(() => {
    const keys = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'b' && useStore.getState().workspace !== 'code') { event.preventDefault(); setSidebar((v) => !v) } }
    window.addEventListener('keydown', keys)
    return () => window.removeEventListener('keydown', keys)
  }, [])
  const [codeOpened, setCodeOpened] = useState(false)
  useEffect(() => { if (workspace === 'code') setCodeOpened(true) }, [workspace])
  const theme = snapshot?.settings.theme ?? 'dark'
  useEffect(() => {
    const root = document.documentElement
    const media = window.matchMedia('(prefers-color-scheme: light)')
    let vars: string[] = []
    let cancelled = false
    const apply = () => { if (!theme.startsWith('plugin:')) root.dataset.theme = theme === 'system' ? (media.matches ? 'light' : 'dark') : theme }
    apply()
    if (theme.startsWith('plugin:')) {
      const [, pluginId, themeId] = theme.split(':')
      void window.ventriee.pluginList().then((list) => {
        if (cancelled) return
        const t = list.find((p) => p.id === pluginId)?.themes.find((x) => x.id === themeId)
        root.dataset.theme = t?.base ?? 'dark'
        for (const [k, v] of Object.entries(t?.colors ?? {})) root.style.setProperty(k, v)
        vars = Object.keys(t?.colors ?? {})
      }).catch(() => { root.dataset.theme = 'dark' })
    }
    media.addEventListener('change', apply)
    return () => { cancelled = true; media.removeEventListener('change', apply); for (const k of vars) root.style.removeProperty(k) }
  }, [theme])

  useEffect(() => {
    let mounted = true
    void guard(() => window.ventriee.snapshot()).then((snap) => {
      if (mounted && snap) setSnapshot(snap)
    })
    const offPatch = window.ventriee.onPatch((snap) => setSnapshot(snap))
    const offOutput = window.ventriee.onOutput((payload) => appendOutput(payload.agentId, payload.chunk))
    const offChat = window.ventriee.onChatChunk((payload) => appendChat(payload.messageId, payload.chunk))
    return () => {
      mounted = false
      offPatch()
      offOutput()
      offChat()
    }
  }, [setSnapshot, appendOutput, appendChat])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        document.getElementById('owner-input')?.focus()
      }
      if (e.key === 'Escape' && useStore.getState().selectedAgentId) {
        useStore.getState().select(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // first run opens the dialog once; creating a project (from any surface) closes it
  const hasProjects = Boolean(snapshot && snapshot.projects.length > 0)
  const autoOpened = useRef(false)
  useEffect(() => {
    if (!ready || !snapshot || autoOpened.current) return
    autoOpened.current = true
    if (snapshot.projects.length === 0) setNewProject(true)
  }, [ready, snapshot])
  useEffect(() => {
    if (hasProjects) setNewProject(false)
  }, [hasProjects])

  if (!ready || !snapshot) {
    return (
      <div className="app">
        <div className="skeleton">Starting Ventriee Studios…</div>
      </div>
    )
  }

  if (snapshot.settings.simpleMode) return <SimpleMode />

  const project = snapshot.projects.find((p) => p.id === snapshot.activeProjectId) ?? null
  const working = snapshot.agents.filter((a) => a.status === 'working').length
  const configured = snapshot.providers.filter((p) => p.available).length
  const sessionNumber = snapshot.conversations.findIndex((c) => c.id === snapshot.conversation?.id) + 1
  const sessionTitle = snapshot.conversation?.title || (sessionNumber ? `Session ${sessionNumber}` : 'Chat')

  return (
    <div className={`shell${sidebar ? '' : ' no-sidebar'}`}>
    {sidebar ? <Sidebar onNewProject={() => setNewProject(true)} /> : null}
    <div className="app">
      <header className="topbar">
        <button className="icon-btn" onClick={() => setSidebar((v) => !v)} aria-label={sidebar ? 'Hide sidebar' : 'Show sidebar'} aria-expanded={sidebar} title="Toggle sidebar (Ctrl+B)">
          <IconSidebar />
        </button>
        <div className="tb-title" title={project?.path}>
          <span className="tb-session">{workspace === 'plan' ? sessionTitle : workspace === 'code' ? 'Code' : workspace === 'home' ? 'Dashboard' : 'Office'}</span>
          {project ? <span className="tb-project">{project.name}</span> : null}
        </div>
        <div className="tb-spacer" />
        <div className="ws-toggle" role="tablist" aria-label="Workspace" onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
          const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
          const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length
          event.preventDefault(); buttons[next]?.focus(); buttons[next]?.click()
        }}>
          <button data-fx="tab" className={`ws-tab${workspace === 'plan' ? ' on' : ''}`} role="tab" aria-selected={workspace === 'plan'} onClick={() => setWorkspace('plan')} title="Talk through the idea, write and approve the prompt">Chat</button>
          <button data-fx="tab" className={`ws-tab${workspace === 'code' ? ' on' : ''}`} role="tab" aria-selected={workspace === 'code'} onClick={() => setWorkspace('code')} title="Edit project files and manage Git">Code</button>
          <button data-fx="tab" className={`ws-tab${workspace === 'home' ? ' on' : ''}`} role="tab" aria-selected={workspace === 'home'} onClick={() => setWorkspace('home')} title="Project overview">Dashboard</button>
          <button data-fx="tab" className={`ws-tab${workspace === 'office' ? ' on' : ''}`} role="tab" aria-selected={workspace === 'office'} onClick={() => setWorkspace('office')} title="Watch the team work">
            Office
            {working > 0 ? <span className="ws-live" aria-label={`${working} working`} /> : null}
          </button>
        </div>
        <UpdateNotice />
        <div className="health" title={`${configured} of ${snapshot.providers.length} engines ready`}>
          <span className={`health-dot${working > 0 ? ' on' : configured > 0 ? ' warn' : ''}`} />
          <span className="health-label">
            {working > 0 ? `${working} active` : configured > 0 ? `${configured} engines` : 'no engines'}
          </span>
        </div>
        <CloudSyncBadge />
        <button className="btn ghost" onClick={() => void guard(() => window.ventriee.saveSettings({ simpleMode: true }))} title="Switch to the chat-first Simple mode">Simple mode</button>
        <button className={`icon-btn${showAdvisor ? ' active' : ''}`} onClick={() => setShowAdvisor((v) => !v)} title="Side chat" aria-label="Side chat">
          <IconSpark />
        </button>
      </header>

      {workspace === 'home' ? (
        <Dashboard onNewProject={() => setNewProject(true)} />
      ) : workspace === 'plan' ? (
        <Workspace />
      ) : workspace === 'office' ? (
        <>
          <div className="main with-terminals">
            {project ? <aside className="office-terminals" aria-label="Terminals">
              <TerminalView projectId={project.id} slot="office-1" label="Terminal 1" />
              <TerminalView projectId={project.id} slot="office-2" label="Terminal 2" />
            </aside> : null}
            <div className="floor-wrap">
              <Floor onNewProject={() => setNewProject(true)} />
              {selectedAgentId ? <Inspector agentId={selectedAgentId} /> : null}
            </div>
            <aside className="side">
              <Preview />
              <Rail />
            </aside>
          </div>
          <CommandBar />
        </>
      ) : null}
      {codeOpened && project ? <Suspense fallback={workspace === 'code' ? <div className="code-empty">Loading code workspace…</div> : null}>
        <CodeWorkspace key={project.id} project={project} visible={workspace === 'code'} onNavigate={setWorkspace} />
      </Suspense> : workspace === 'code' && !project ? <div className="code-empty"><p>Create a project to open its files.</p><button className="btn primary" onClick={() => setNewProject(true)}>Create project</button></div> : null}

      {newProject ? <NewProjectDialog onClose={() => setNewProject(false)} /> : null}
      {panel === 'settings' ? <SettingsPanel onClose={() => setPanel('none')} /> : null}
      {panel === 'runs' ? <RunsPanel onClose={() => setPanel('none')} /> : null}
      {panel === 'memory' ? <MemoryPanel onClose={() => setPanel('none')} /> : null}
      {panel === 'skills' ? <SkillsPanel onClose={() => setPanel('none')} /> : null}
      {panel === 'automations' ? <AutomationsPanel onClose={() => setPanel('none')} /> : null}
      {panel === 'project' ? <ProjectPanel onClose={() => setPanel('none')} /> : null}
      {panel === 'clients' ? <ClientsPanel onClose={() => setPanel('none')} /> : null}
      {panel === 'resources' ? <ResourcesPanel onClose={() => setPanel('none')} /> : null}
      {panel === 'security' ? <SecurityPanel onClose={() => setPanel('none')} /> : null}
      {panel === 'analytics' ? <AnalyticsPanel onClose={() => setPanel('none')} /> : null}
      {panel === 'workflows' ? <WorkflowsPanel onClose={() => setPanel('none')} /> : null}
      {panel === 'browser' ? <BrowserPanel onClose={() => setPanel('none')} /> : null}
      {panel === 'remote' ? <RemotePanel onClose={() => setPanel('none')} /> : null}
      {panel === 'marketplace' ? <MarketplacePanel onClose={() => setPanel('none')} /> : null}
      {panel === 'help' ? <HelpPanel onClose={() => setPanel('none')} /> : null}
      <VoiceAssistant />
      {!project && snapshot.projects.length > 0 ? (
        <Modal title="No active project" onClose={() => setPanel('none')} narrow>
          <p className="dim text-sm">
            Pick a project in the sidebar, or create a new one.
          </p>
        </Modal>
      ) : null}
      {project && configured === 0 && !snapshot.settings.onboardingSeen ? (
        <OnboardingModal onClose={() => void guard(() => window.ventriee.saveSettings({ onboardingSeen: true }))} />
      ) : null}
      {showAdvisor ? <SideChat onClose={() => setShowAdvisor(false)} /> : null}
      <Toast />
    </div>
    </div>
  )
}

/** First-run: no engine is usable yet, tell the owner what to install or configure. */
function OnboardingModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Set up an engine to start" onClose={onClose} narrow>
      <p className="dim text-sm lh-relaxed">
        Ventriee runs agents through CLI tools or API providers. None are ready on this machine yet. Pick one path:
      </p>
      <div className="kv-row space-above">
        <div className="kv-row-main">
          <div className="kv-row-title">CLI agent (recommended)</div>
          <div className="kv-row-sub">
            Install and sign in to one of these, then restart: OpenCode (<span className="mono">npm i -g opencode-ai</span>), Claude Code (<span className="mono">claude</span>), Codex, or Ollama.
          </div>
        </div>
      </div>
      <div className="kv-row">
        <div className="kv-row-main">
          <div className="kv-row-title">API provider</div>
          <div className="kv-row-sub">Add a provider and API key in Settings → Providers (OpenAI, Anthropic, Gemini, OpenRouter, DeepSeek, Mistral, local Ollama/LM Studio).</div>
        </div>
      </div>
      <div className="section-label space-above">Your coding tools</div>
      <Toolchains />
      <div className="flex gap-8 space-above">
        <button className="btn primary" onClick={onClose}>I'll set it up</button>
        <button className="btn" onClick={() => void guard(() => window.ventriee.openExternal(`${homepage}#engines`))}>
          Read the guide
        </button>
      </div>
    </Modal>
  )
}
