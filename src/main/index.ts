import { app, BrowserWindow, ipcMain, shell, dialog, Tray, Menu, nativeImage, protocol } from 'electron'
import { join, relative, sep } from 'node:path'
import { existsSync, mkdirSync } from 'node:fs'
import { EventEmitter } from 'node:events'
import { StudioAuth } from './auth'
import { FileService, workspacePath } from './files'
import { GitService } from './git'
import type { TextFile, GitAction } from '../shared/workspace'
import { registerRendererProtocol } from './renderer-protocol'
import { supabaseUrl, supabaseKey, originOf, RENDERER_ORIGIN, RENDERER_SCHEME } from '../shared/auth-config'
import { Store, newId } from './store'
import { Credentials } from './credentials'
import { MemoryService } from './memory'
import { SkillService } from './skills'
import { PreviewService } from './preview'
import { Orchestrator } from './orchestrator'
import { PlanningService } from './planning'
import { isInside } from './paths'
import { detectProviders, testEngine, defaultEndpoint, runEngine } from './engines'
import { IPC } from '../shared/ipc'
import { TerminalService } from './terminal'
import { DebugSession } from './debugger'
import { DapSession, type Debugger } from './dap'
import { debuggerFor, launchConfigs, substitute, currentFileLaunch } from './launch'
import { LspService, findExecutable } from './lsp'
import { ExtensionService } from './extensions'
import { TestService, detectRunners } from './testrunner'
import { listTasks } from './tasks'
import { HistoryService } from './history'
import { github } from './github'
import { ErrorLog, issueUrl } from './errorlog'
import { baseCatalog } from '../shared/catalog'
import { askCode, changeFiles, completeCode } from './code-agent'
import { projectTypes } from './typeindex'
import { eslintFile, prettierFormat } from './projecttools'
import { CheckpointService } from './checkpoint'
import { summarizeRuns } from './runs'
import { validMcpServers, writeMcpConfig } from './mcp'
import { GraphifyService } from './graphify'
import { applyTemplate, type TemplateId } from './templates'
import { Updater } from './updater'
import { spendBlock, startOfToday } from './spend'
import { attachmentPaths, recentScreenshots, saveAttachment } from './attachments'
import { transcribe } from './transcribe'
import type { GithubAction, CodeAskInput, CodeChangeInput, CodeCompleteInput, DebugBreakpoint, DebugEvent, DebugStartInput } from '../shared/workspace'
import type {
  Agent,
  AppSettings,
  AssignPromptInput,
  ChatMessage,
  CreateAgentInput,
  EngineKind,
  MemoryDoc,
  ModelOption,
  ModelPrefs,
  Project,
  PromptDoc,
  ProviderConfig,
  ProviderStatus,
  SessionRecord,
  SkillRecord
} from '../shared/types'

const bus = new EventEmitter()
/** One entry per open window. The project id lives here, not in global kv. */
const windows = new Map<number, { win: BrowserWindow; projectId: string | null }>()
const terminals = new TerminalService()
/** One debug session per window. */
const debugSessions = new Map<number, Debugger>()
const catalog = () => baseCatalog
const lsp = new LspService(catalog)
let tests: TestService
const stopDebug = (owner: number) => { debugSessions.get(owner)?.stop(); debugSessions.delete(owner) }
let tray: Tray | null = null
let quitting = false
let store: Store
let creds: Credentials
let errors: ErrorLog | null = null
let memory: MemoryService
let skills: SkillService
let preview: PreviewService
let orchestrator: Orchestrator
let planning: PlanningService
let checkpoints: CheckpointService
const updater = new Updater(
  (state) => { for (const { win } of windows.values()) if (!win.isDestroyed()) win.webContents.send(IPC.updateChanged, state) },
  () => store.projects().some((p) => store.runningJob(p.id)) ? 'A run is still going. Stop it or let it finish, then restart to update.' : null
)
let scheduler: NodeJS.Timeout | null = null
let lastProviders: ProviderStatus[] = []
/** Discovered model options. Refreshed on demand, never hardcoded. */
let lastModels: ModelOption[] = []
const isDev = !app.isPackaged

// Isolated profile for automated runs, so tests never touch the owner's data.
if (process.env.VENTRIEE_USERDATA) app.setPath('userData', process.env.VENTRIEE_USERDATA)

const rendererUrl = isDev && process.env.ELECTRON_RENDERER_URL ? process.env.ELECTRON_RENDERER_URL : `${RENDERER_ORIGIN}/`
const rendererOrigin = originOf(rendererUrl)!
const auth = new StudioAuth(supabaseUrl, supabaseKey, {
  get: () => creds.getKey('cred:supabase:session'),
  set: (value) => { try { creds.setKey('cred:supabase:session', value) } catch { /* Memory-only session without an OS keychain. */ } },
  clear: () => { store.db.kvDelete('cred:supabase:session') }
})
protocol.registerSchemesAsPrivileged([{ scheme: RENDERER_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }])

function windowProject(win: BrowserWindow): string | null {
  const entry = windows.get(win.webContents.id)
  if (!entry) return null
  if (entry.projectId && store.project(entry.projectId)) return entry.projectId
  // Unassigned windows (first run, no projects yet) take the last used project once one exists.
  // After the window is assigned it never follows another window's selection.
  return store.projects()[0]?.id ?? null
}

/** The project the sender's window is showing, for handlers that need a cwd. */
function projectOf(event: Electron.IpcMainInvokeEvent): string | null {
  const win = BrowserWindow.fromWebContents(event.sender)
  return win ? windowProject(win) : store.activeProjectId()
}

function snapshotFor(projectId: string | null) {
  const project = projectId ? store.project(projectId) : null
  const previewState = preview.get(project?.id ?? null, project?.path)
  return store.snapshot(lastProviders, previewState, lastModels, project?.id ?? null)
}

function sendSnapshot() {
  for (const { win, projectId } of windows.values()) {
    if (win.isDestroyed() || !auth.session(win.webContents.id)) continue
    win.webContents.send(IPC.patch, snapshotFor(windowProject(win) ?? projectId))
  }
  refreshTray()
}

/** Stream output only to windows showing that project. */
function sendToProject(projectId: string | null, channel: string, payload: unknown) {
  for (const { win } of windows.values()) {
    if (win.isDestroyed() || !auth.session(win.webContents.id)) continue
    if (projectId && windowProject(win) !== projectId) continue
    win.webContents.send(channel, payload)
  }
}

function debouncedNotify() {
  if (notifyTimer) return
  notifyTimer = setTimeout(() => {
    notifyTimer = null
    sendSnapshot()
  }, 120)
}
let notifyTimer: ReturnType<typeof setTimeout> | null = null

async function refreshProviders() {
  lastProviders = await detectProviders(creds)
  return lastProviders
}

/** Ask the real providers what they serve. A slow probe must not block the UI. */
async function refreshModels(projectId: string | null) {
  const project = projectId ? store.project(projectId) : null
  const cwd = project?.path ?? store.projects()[0]?.path ?? app.getPath('userData')
  lastModels = await planning.discoverModels(cwd)
  debouncedNotify()
  return lastModels
}

// Packaged builds carry the icon in the exe; dev needs the PNG on disk.
const windowIcon = app.isPackaged
  ? join(process.resourcesPath, 'icon.png')
  : join(__dirname, '../../build/icon.png')

/** Tray menu: one entry per open window and one per project, so six windows stay reachable. */
function refreshTray() {
  if (!tray || tray.isDestroyed()) return
  const open = [...windows.values()].filter((w) => !w.win.isDestroyed())
  const running = store && auth.hasSession() ? store.projects().filter((p) => store.runningJob(p.id)).length : 0
  tray.setToolTip(
    `Ventriee Studios — ${open.length} window${open.length === 1 ? '' : 's'}${running ? `, ${running} running` : ''}`
  )
  const menu = Menu.buildFromTemplate([
    { label: 'Ventriee Studios', enabled: false },
    { type: 'separator' },
    ...open.map(({ win }, index) => ({
      label: `${auth.session(win.webContents.id) ? store.project(windowProject(win) ?? '')?.name ?? 'No project' : 'Sign in'}${index === 0 ? '  (1)' : ''}`,
      click: () => {
        if (win.isMinimized()) win.restore()
        win.show()
        win.focus()
      }
    })),
    { type: 'separator' },
    {
      label: 'Open project in a new window',
      enabled: auth.hasSession(),
      submenu: (auth.hasSession() ? store.projects() : []).map((p) => ({
        label: p.name,
        click: () => createWindow(p.id)
      }))
    },
    { label: 'New window', click: () => createWindow() },
    { type: 'separator' },
    { label: 'Quit', click: () => { quitting = true; app.quit() } }
  ])
  tray.setContextMenu(menu)
}

function createTray() {
  if (tray) return
  const image = nativeImage.createFromPath(windowIcon)
  tray = new Tray(image.isEmpty() ? windowIcon : image.resize({ width: 16, height: 16 }))
  tray.on('double-click', () => {
    const first = [...windows.values()][0]?.win
    if (first) { if (first.isMinimized()) first.restore(); first.show(); first.focus() } else createWindow()
  })
  refreshTray()
}

/** Each window owns its project, so several can run side by side. */
function createWindow(projectId?: string) {
  const win = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1080,
    minHeight: 700,
    show: false,
    backgroundColor: '#14161a',
    icon: windowIcon,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  const initial = projectId ?? store.activeProjectId() ?? store.projects()[0]?.id ?? null
  // No File/Edit/View/Window bar: the studio has its own controls, and text editing shortcuts work without it.
  win.removeMenu()
  const windowId = win.webContents.id
  windows.set(windowId, { win, projectId: initial })
  win.on('closed', () => {
    terminals.closeOwner(windowId)
    stopDebug(windowId)
    lsp.closeOwner(windowId)
    tests?.stop(windowId)
    auth.clear(windowId)
    windows.delete(windowId)
    refreshTray()
  })

  win.once('ready-to-show', () => win.show())

  void win.loadURL(rendererUrl)

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  // Project previews must never navigate the privileged studio document.
  // A reload starts a new renderer that cannot reach the old shells; end them so they don't pile up to the limit.
  win.webContents.on('did-start-navigation', (details) => {
    if (details.isMainFrame && !details.isSameDocument) { terminals.closeOwner(windowId); stopDebug(windowId); lsp.closeOwner(windowId) }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (originOf(url) !== rendererOrigin) event.preventDefault()
  })
  win.webContents.on('will-redirect', (event, url) => {
    if (event.isMainFrame && originOf(url) !== rendererOrigin) event.preventDefault()
  })
  // Only the app's own page may use the microphone (voice input): audio only, no camera, nothing else.
  win.webContents.session.setPermissionRequestHandler((_contents, permission, callback, details) => {
    const types = 'mediaTypes' in details ? details.mediaTypes ?? [] : []
    callback(permission === 'media' && originOf(details.requestingUrl) === rendererOrigin && types.length > 0 && types.every((t) => t === 'audio'))
  })
  return win
}

function registerIpc() {
  const files = new FileService()
  const graphify = new GraphifyService()
  const git = new GitService()
  tests = new TestService(files)
  const projectRoot = (event: Electron.IpcMainInvokeEvent, id: string) => {
    if (id !== projectOf(event)) throw new Error('Select this project before editing its files')
    const project = store.project(id)
    if (!project) throw new Error('Project not found')
    return project.path
  }
  const handle = (channel: string, listener: (event: Electron.IpcMainInvokeEvent, ...args: any[]) => unknown) => {
    ipcMain.handle(channel, (event, ...args) => {
      if (!windows.has(event.sender.id) || event.senderFrame !== event.sender.mainFrame || originOf(event.senderFrame?.url ?? '') !== rendererOrigin) {
        throw new Error('IPC is only available to the studio window')
      }
      if (![IPC.authStatus, IPC.authSignIn, IPC.authClear].includes(channel as any)) auth.requireSession(event.sender.id)
      return listener(event, ...args)
    })
  }
  handle(IPC.filesList, (event, id: string, path = '') => files.list(projectRoot(event, id), path))
  handle(IPC.filesFind, (event, id: string, query: string) => files.find(projectRoot(event, id), query))
  handle(IPC.toolsFormat, (event, id: string, path: string, text: string) => prettierFormat(projectRoot(event, id), path, String(text)))
  handle(IPC.toolsLint, (event, id: string, path: string, text: string) => eslintFile(projectRoot(event, id), path, String(text)))
  handle(IPC.projectTypes, (event, id: string) => projectTypes(projectRoot(event, id), files))
  handle(IPC.filesSearch, (event, id: string, query: string, caseSensitive: boolean) => files.search(projectRoot(event, id), query, caseSensitive === true))
  handle(IPC.updateState, () => updater.state)
  handle(IPC.updateCheck, () => updater.check())
  handle(IPC.updateInstall, () => updater.install())
  handle(IPC.runsList, async (event, id: string) => {
    const root = projectRoot(event, id)
    const runs = summarizeRuns(store.jobs(id), store.sessions(id, 5000), store.agents(id))
    for (const run of runs) run.checkpoint = await checkpoints.has(id, root, run.jobId).catch(() => false)
    return runs
  })
  handle(IPC.runChanges, (event, id: string, jobId: string) => checkpoints.changes(id, projectRoot(event, id), jobId))
  handle(IPC.runUndo, async (event, id: string, jobId: string) => {
    const root = projectRoot(event, id)
    if (store.runningJob(id)) throw new Error('Stop the active run before undoing one')
    const changes = await checkpoints.restore(id, root, jobId)
    store.addEvent({ projectId: id, agentId: null, taskId: null, type: 'checkpoint', message: `Owner undid a run: ${changes.length} file(s) restored to the pre-run checkpoint` })
    debouncedNotify()
    return changes.length
  })
  handle(IPC.codeComplete, (event, id: string, input: CodeCompleteInput) => { projectRoot(event, id); return completeCode(event.sender.id, input, store.settings(), creds) })
  /** Editor AI calls stop at the spending caps too; they are not metered themselves. */
  const capCheck = (id: string) => { const cap = spendBlock((p) => store.spendSince(startOfToday(), p), store.settings(), id); if (cap) throw new Error(cap) }
  handle(IPC.spendToday, (event, id: string) => { projectRoot(event, id); const s = store.settings(); return { all: store.spendSince(startOfToday()), project: store.spendSince(startOfToday(), id), dailyBudgetUsd: s.dailyBudgetUsd, projectBudgetUsd: s.projectBudgetUsd } })
  handle(IPC.codeChange, (event, id: string, input: CodeChangeInput) => { projectRoot(event, id); capCheck(id); return changeFiles(store.project(id)!, input, store.settings(), creds, files) })
  handle(IPC.codeAsk,(event, id: string, input: CodeAskInput) => { projectRoot(event, id); capCheck(id); return askCode(store.project(id)!, input, store.settings(), creds) })
  handle(IPC.filesRead, (event, id: string, path: string) => files.read(projectRoot(event, id), path))
  handle(IPC.filesReadLarge, (event, id: string, path: string) => files.readLarge(projectRoot(event, id), path))
  handle(IPC.toolsDetect, () => {
    const c = catalog()
    const os = process.platform
    const install = (spec: { command?: unknown; url?: string } | undefined) => { const cmd = spec?.command as string | Record<string, string> | undefined; return (typeof cmd === 'string' ? cmd : cmd?.[os] ?? cmd?.default) ?? spec?.url }
    return {
      tools: ['node', 'npm', 'git', 'gh', 'python', 'go', 'cargo', 'java', 'dotnet', 'ollama'].map((name) => ({ name, found: Boolean(findExecutable(name)) })),
      languages: c.languages.map((l) => ({ id: l.id, name: l.name, server: l.servers.find((s) => findExecutable(s.command))?.name ?? null, install: install(l.install) })),
      debuggers: c.debuggers.map((d) => ({ id: d.id, name: d.name, found: Boolean(findExecutable(d.command)), install: install(d.install) }))
    }
  })
  const history = new HistoryService(join(app.getPath('userData'), 'history'))
  handle(IPC.filesSave, async (event, id: string, file: TextFile) => {
    const root = projectRoot(event, id)
    // The version on disk before the first save we see is kept too, so the first change can be undone.
    if (!history.has(id, file.path)) { try { history.record(id, file.path, (await files.read(root, file.path)).text, Date.now() - 1) } catch { /* new file */ } }
    const saved = await files.save(root, file)
    try { history.record(id, file.path, file.text) } catch { /* history is best effort; the save succeeded */ }
    return saved
  })
  handle(IPC.historyList, (event, id: string, path: string) => { workspacePath(projectRoot(event, id), path); return history.list(id, path) })
  handle(IPC.historyRead, (event, id: string, path: string, version: string) => { workspacePath(projectRoot(event, id), path); return history.read(id, path, String(version)) })
  handle(IPC.filesCreate, (event, id: string, path: string, directory: boolean) => files.create(projectRoot(event, id), path, directory === true))
  handle(IPC.filesRename, (event, id: string, from: string, to: string) => files.rename(projectRoot(event, id), from, to))
  // To the Recycle Bin, so a mistaken delete can be undone outside the app.
  handle(IPC.filesTrash, (event, id: string, path: string) => shell.trashItem(workspacePath(projectRoot(event, id), path)))
  handle(IPC.gitStatus, (event, id: string) => git.status(projectRoot(event, id)))
  handle(IPC.gitDiff, (event, id: string, path: string, staged: boolean) => git.diff(projectRoot(event, id), path, staged === true))
  handle(IPC.gitLineChanges, (event, id: string, path: string) => git.lineChanges(projectRoot(event, id), path))
  handle(IPC.gitBlame, (event, id: string, path: string, line: number) => git.blame(projectRoot(event, id), path, Number(line)))
  handle(IPC.gitAction, (event, id: string, action: GitAction, path?: string, value?: string) => git.action(projectRoot(event, id), action, path, value))
  handle(IPC.graphifyStatus, (event, id: string) => graphify.status(projectRoot(event, id)))
  handle(IPC.graphifyBuild, (event, id: string) => graphify.build(projectRoot(event, id)))
  handle(IPC.graphifyQuery, (event, id: string, question: string) => graphify.query(projectRoot(event, id), String(question ?? '')))
  handle(IPC.termOpen, (event, id: string, cols: number, rows: number) => {
    const sender = event.sender
    const send = (channel: string, payload: unknown) => { if (!sender.isDestroyed()) sender.send(channel, payload) }
    return terminals.open(sender.id, projectRoot(event, id), cols, rows, (term, data) => send(IPC.termData, { id: term, data }), (term, code) => send(IPC.termExit, { id: term, code }))
  })
  handle(IPC.termWrite, (event, id: string, data: string) => terminals.write(event.sender.id, id, data))
  handle(IPC.termResize, (event, id: string, cols: number, rows: number) => terminals.resize(event.sender.id, id, cols, rows))
  handle(IPC.termClose, (event, id: string) => terminals.close(event.sender.id, id))
  // Debugging runs the owner's program with their permissions, like a terminal, started in the project folder.
  handle(IPC.debugConfigs, (event, id: string) => launchConfigs(projectRoot(event, id)).map((c) => ({ name: c.name, type: c.type, request: c.request })))
  handle(IPC.debugStart, async (event, id: string, input: DebugStartInput, breakpoints: Record<string, DebugBreakpoint[]>) => {
    const sender = event.sender
    const root = projectRoot(event, id)
    stopDebug(sender.id)
    const named = input?.config ? launchConfigs(root).find((c) => c.name === input.config) : null
    if (input?.config && !named) throw new Error(`No launch configuration named ${input.config}`)
    const config = named ? substitute(named, root, input.file || null) : null
    const kind = debuggerFor(catalog(), config, String(input?.language ?? ''))
    if (!kind) throw new Error(config ? `Debugging "${config.type}" configurations is not supported yet` : `No debugger is known for ${input?.language || 'this file'}`)
    const emit = (e: DebugEvent) => { if (!sender.isDestroyed()) sender.send(IPC.debugEvent, e); if (e.type === 'exited' && debugSessions.get(sender.id) === session) debugSessions.delete(sender.id) }
    const bps = breakpoints && typeof breakpoints === 'object' ? breakpoints : {}
    let session: Debugger
    if (kind === 'node') {
      const node = new DebugSession(root, emit)
      session = node
      debugSessions.set(sender.id, session)
      try {
        if (config?.request === 'attach') await node.attach(Number(config.port ?? 9229), bps)
        else await node.start(config ? relative(root, String(config.program ?? '')).split(sep).join('/') : input.file, bps)
      } catch (error) { stopDebug(sender.id); throw error }
      return
    }
    const spec = catalog().debuggers.find((d) => d.id === kind)!
    const dap = new DapSession(root, spec, emit)
    session = dap
    debugSessions.set(sender.id, session)
    try {
      const args = config ?? await currentFileLaunch(spec, String(input?.language ?? ''), root, input.file)
      await dap.start({ ...args, type: undefined, name: undefined, request: args.request ?? 'launch' }, bps) } catch (error) { stopDebug(sender.id); throw error }
  })
  handle(IPC.debugVariables, (event, ref: number) => debugOf(event.sender.id).variables?.(Number(ref)) ?? [])
  handle(IPC.debugThread, (event, threadId: number) => debugOf(event.sender.id).selectThread?.(Number(threadId)))
  const debugOf = (owner: number) => { const s = debugSessions.get(owner); if (!s) throw new Error('No program is being debugged'); return s }
  handle(IPC.debugCommand, (event, action: 'continue' | 'over' | 'into' | 'out' | 'pause') => debugOf(event.sender.id).command(action))
  handle(IPC.debugEvaluate, (event, expression: string) => debugOf(event.sender.id).evaluate(String(expression)))
  handle(IPC.debugBreakpoints, (event, path: string, list: DebugBreakpoint[]) => debugSessions.get(event.sender.id)?.setBreakpoints(path, Array.isArray(list) ? list : []))
  handle(IPC.debugStop, (event) => stopDebug(event.sender.id))
  handle(IPC.toolCatalog, () => catalog())
  handle(IPC.tasksList, (event, id: string) => listTasks(projectRoot(event, id)))
  handle(IPC.errorReport, (_e, message: string, stack: string) => errors?.record('renderer', String(message).slice(0, 2000), String(stack ?? '').slice(0, 4000)))
  handle(IPC.errorLog, () => errors?.recent() ?? '')
  handle(IPC.errorClear, () => errors?.clear())
  handle(IPC.reportProblem, () => shell.openExternal(issueUrl('Dhruvbruhh/Ventriee_Studios', app.getVersion(), `${process.platform} ${process.arch}`, errors?.recent() ?? '')))
  // Settings sync: editor preferences and the extension list only; never keys, endpoints or MCP settings.
  handle(IPC.syncPush, async () => {
    const s = store.settings()
    const payload = { editorTheme: s.editorTheme, iconTheme: s.iconTheme, vimMode: s.vimMode, keybindings: s.keybindings, extensions: extensions.list().map((e) => e.id), syncedAt: Date.now() }
    await auth.saveSyncedData({ ventrieeSync: payload })
    return payload.syncedAt
  })
  handle(IPC.syncPull, async () => {
    const data = (await auth.syncedData()).ventrieeSync as { editorTheme?: unknown; iconTheme?: unknown; vimMode?: unknown; keybindings?: unknown; extensions?: unknown; syncedAt?: number } | undefined
    if (!data) return null
    const keybindings = Array.isArray(data.keybindings) ? data.keybindings.filter((b): b is { key: string; command: string } => typeof b?.key === 'string' && typeof b?.command === 'string').slice(0, 500) : []
    store.saveSettings({ ...(typeof data.editorTheme === 'string' ? { editorTheme: data.editorTheme } : {}), ...(typeof data.iconTheme === 'string' ? { iconTheme: data.iconTheme } : {}), vimMode: data.vimMode === true, keybindings })
    debouncedNotify()
    const have = new Set(extensions.list().map((e) => e.id))
    return { syncedAt: Number(data.syncedAt ?? 0), missingExtensions: (Array.isArray(data.extensions) ? data.extensions : []).filter((x): x is string => typeof x === 'string' && !have.has(x)).slice(0, 100) }
  })
  handle(IPC.github, (event, id: string, action: GithubAction) => github(projectRoot(event, id), action))
  handle(IPC.githubReview, async (event, id: string, number: number) => {
    const root = projectRoot(event, id)
    capCheck(id)
    const diff = String(await github(root, { kind: 'diff', number }))
    const clipped = diff.length > 59_000 ? `${diff.slice(0, 59_000)}\n… (diff cut at 59,000 characters)` : diff
    return askCode(store.project(id)!, { path: `pull request #${Number(number)}`, code: clipped, mode: 'ask',
      question: 'Review this pull request diff. List real problems first (bugs, security, data loss, missing tests), each with file and line, then smaller suggestions. Say plainly if it looks good.' }, store.settings(), creds)
  })
  // Tests run the owner's project code with their permissions, like a terminal, only when they press Run.
  handle(IPC.testsRunners, (event, id: string) => detectRunners(projectRoot(event, id), catalog()).map((r) => ({ id: r.id, name: r.name })))
  handle(IPC.testsRun, (event, id: string, runnerId: string, target: { file?: string; name?: string }) => {
    const sender = event.sender
    const root = projectRoot(event, id)
    const runner = detectRunners(root, catalog()).find((r) => r.id === runnerId)
    if (!runner) throw new Error('That test runner is not used by this project')
    const file = typeof target?.file === 'string' && target.file ? target.file : undefined
    if (file) workspacePath(root, file)
    return tests.run(sender.id, root, runner, { file, name: typeof target?.name === 'string' ? target.name.slice(0, 300) : undefined }, (e) => { if (!sender.isDestroyed()) sender.send(IPC.testsEvent, e) })
  })
  handle(IPC.testsStop, (event) => tests.stop(event.sender.id))
  // Open VSX extensions: only their data (themes, snippets, languages, grammars) is used; their code never runs.
  const extensions = new ExtensionService(join(app.getPath('userData'), 'extensions'))
  handle(IPC.extSearch, (_e, query: string) => extensions.search(String(query)))
  handle(IPC.extDetails, (_e, id: string) => extensions.details(String(id)))
  handle(IPC.extInstall, (_e, id: string) => extensions.install(String(id)))
  handle(IPC.extUninstall, (_e, id: string) => extensions.uninstall(String(id)))
  handle(IPC.extSetEnabled, (_e, id: string, enabled: boolean) => extensions.setEnabled(String(id), enabled === true))
  handle(IPC.extList, () => extensions.list())
  handle(IPC.extUpdates, () => extensions.updates())
  handle(IPC.extContributions, () => extensions.contributions())
  handle(IPC.extIconTheme, (_e, id: string) => extensions.iconTheme(String(id)))
  // Language servers are the owner's installed tools (found on PATH), run in the project folder like a terminal.
  handle(IPC.lspEnsure, (event, id: string, language: string) => {
    const sender = event.sender
    return lsp.ensure(sender.id, projectRoot(event, id), String(language), (e) => { if (!sender.isDestroyed()) sender.send(IPC.lspEvent, e) })
  })
  handle(IPC.lspRequest, (event, id: string, language: string, method: string, params: unknown) => lsp.request(event.sender.id, projectRoot(event, id), String(language), String(method), params))
  handle(IPC.lspNotify, (event, id: string, language: string, method: string, params: unknown) => lsp.notify(event.sender.id, projectRoot(event, id), String(language), String(method), params))
  handle(IPC.authStatus, async (event) => {
    const session = await auth.restore(event.sender.id)
    debouncedNotify()
    return session
  })
  handle(IPC.authSignIn, async (event, input: { email: string; password: string }, signup = false) => {
    const result = await auth.signIn(event.sender.id, input, signup === true)
    debouncedNotify()
    return result
  })
  handle(IPC.authClear, async () => {
    const signingOut = auth.signOut()
    terminals.closeAll()
    for (const owner of [...debugSessions.keys()]) stopDebug(owner)
    lsp.closeAll()
    for (const project of store.projects()) {
      orchestrator.stopRun(project.id)
      preview.stop(project.id)
    }
    for (const { win } of windows.values()) {
      if (!win.isDestroyed()) win.webContents.send(IPC.authLocked)
    }
    refreshTray()
    await signingOut
  })
  handle(IPC.snapshot, async (event) => {
    await refreshProviders()
    const win = BrowserWindow.fromWebContents(event.sender)
    const projectId = win ? windowProject(win) : store.activeProjectId()
    const project = projectId ? store.project(projectId) : null
    return store.snapshot(lastProviders, preview.get(project?.id ?? null, project?.path), lastModels, project?.id ?? null)
  })

  handle(IPC.testEngine, async (_e, engine: EngineKind, model: string, endpoint: string) => {
    const result = await testEngine(engine, model, endpoint, creds)
    await refreshProviders()
    debouncedNotify()
    return result
  })

  handle(IPC.createProject, async (event, input: { name: string; path: string; description: string; template?: TemplateId }) => {
    const path = input.path.trim()
    if (!path) throw new Error('A project workspace path is required')
    if (!existsSync(path)) mkdirSync(path, { recursive: true })
    const brief = applyTemplate(path, input.template ?? 'empty')
    const description = [input.description?.trim(), brief].filter(Boolean).join('\n\n')
    const project = store.createProject({ name: input.name.trim() || 'Untitled project', path, description })
    store.setActiveProject(project.id)
    // The window that created it switches to it; other windows keep theirs.
    const entry = windows.get(event.sender.id)
    if (entry) entry.projectId = project.id
    memory.bootstrap(project)
    orchestrator.ensureRoster(project, creds)
    preview.rescan(project)
    await refreshProviders()
    debouncedNotify()
    return project
  })

  handle(IPC.pickFolder, async (event) => {
    const parent = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(parent ?? undefined!, { properties: ['openDirectory', 'createDirectory'] })
    return result.canceled ? null : result.filePaths[0] ?? null
  })

  handle(IPC.selectProject, async (event, id: string) => {
    store.setActiveProject(id)
    // The window that asked switches project; other windows keep theirs.
    const win = BrowserWindow.fromWebContents(event.sender)
    const entry = win ? windows.get(win.webContents.id) : null
    if (entry) entry.projectId = id
    const project = store.project(id)
    if (project) {
      memory.bootstrap(project)
      orchestrator.ensureRoster(project, creds)
      preview.rescan(project)
    }
    debouncedNotify()
  })

  handle(IPC.openProjectWindow, async (_e, projectId: string) => {
    const project = store.project(projectId)
    if (!project) throw new Error('Project not found')
    memory.bootstrap(project)
    orchestrator.ensureRoster(project, creds)
    preview.rescan(project)
    createWindow(projectId)
    debouncedNotify()
  })

  handle(IPC.updateProject, async (_e, id: string, patch: Partial<Project>) => {
    store.updateProject(id, patch)
    debouncedNotify()
  })

  handle(IPC.deleteProject, async (_e, id: string) => {
    store.deleteProject(id)
    memory.archive(id)
    debouncedNotify()
  })

  handle(IPC.createAgent, async (_e, input: CreateAgentInput) => {
    const agents = store.agents(input.projectId)
    const agent = {
      ...input,
      id: newId('agt'),
      endpoint: input.endpoint || defaultEndpoint(input.engine),
      skills: input.skills ?? [],
      concurrency: 1,
      desk: agents.length,
      enabled: true,
      status: 'idle' as const,
      currentTaskId: null,
      lastError: null,
      createdAt: Date.now()
    }
    store.insertAgent(agent)
    memory.bootstrapAgent(agent, store.project(input.projectId) ?? null)
    debouncedNotify()
    return agent
  })

  handle(IPC.updateAgent, async (_e, id: string, patch: Partial<Agent>) => {
    store.updateAgent(id, patch)
    debouncedNotify()
    return store.agent(id)
  })

  handle(IPC.deleteAgent, async (_e, id: string) => {
    orchestrator.stopAgent(id)
    store.deleteAgent(id)
    memory.deleteFilesFor(join('agents', id))
    debouncedNotify()
  })

  handle(IPC.duplicateAgent, async (_e, id: string) => {
    const source = store.agent(id)
    if (!source) throw new Error('Worker not found')
    const agents = store.agents(source.projectId)
    const copy = { ...source, id: newId('agt'), name: `${source.name} II`, desk: agents.length, status: 'idle' as const }
    store.insertAgent(copy)
    memory.bootstrapAgent(copy, store.project(source.projectId) ?? null)
    debouncedNotify()
    return copy
  })

  handle(IPC.transcribe, (_e, audio: Uint8Array) => transcribe(audio, creds))
  handle(IPC.screenshots, (event, id: string) => recentScreenshots(projectRoot(event, id)))
  handle(IPC.attachmentSave, (event, id: string, name: string, data: Uint8Array) => saveAttachment(projectRoot(event, id), name, data))
  handle(IPC.startRun, async (_e, input: { projectId: string; instruction: string; attachments?: string[] }) => {
    await refreshProviders()
    const project = store.project(input.projectId)
    if (project) preview.rescan(project)
    const jobId = await orchestrator.startRun(input.projectId, input.instruction, project ? attachmentPaths(project.path, input.attachments) : [])
    debouncedNotify()
    return { jobId }
  })

  handle(IPC.previewStart, async (_e, projectId: string) => {
    const project = store.project(projectId)
    if (!project) throw new Error('Project not found')
    // The owner clicked Start: from now on this project's dev script may auto-start
    // on open. Until this kv flag exists, rescan shows the manual state instead.
    store.db.kvSet(`preview:autoapproved:${projectId}`, '1')
    const state = await preview.start(project)
    debouncedNotify()
    return state
  })

  handle(IPC.previewInstall, async (_e, projectId: string) => {
    const project = store.project(projectId)
    if (!project) throw new Error('Project not found')
    const state = await preview.install(project)
    debouncedNotify()
    return state
  })

  handle(IPC.previewStop, async (_e, projectId: string) => {
    preview.stop(projectId)
    debouncedNotify()
    const project = store.project(projectId)
    return project ? preview.stateForProject(project) : preview.get(projectId)
  })

  handle(IPC.previewRefresh, async (_e, projectId: string) => {
    const project = store.project(projectId)
    if (!project) throw new Error('Project not found')
    preview.rescan(project)
    const state = preview.stateForProject(project)
    debouncedNotify()
    return state
  })

  handle(IPC.previewArtifact, async (_e, projectId: string, path: string) => {
    const project = store.project(projectId)
    if (!project) throw new Error('Project not found')
    return preview.readArtifact(project, path)
  })

  handle(IPC.previewApiRequest, async (_e, input: {
    baseUrl: string
    method: string
    path: string
    body?: string
    timeoutMs?: number
  }) => {
    const method = String(input.method ?? 'GET').toUpperCase()
    const url = `${input.baseUrl.replace(/\/+$/, '')}/${String(input.path ?? '').replace(/^\/+/, '')}`
    // Only loopback targets: the preview harness must not be usable as a proxy
    // to arbitrary internet hosts from the renderer.
    if (!/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?/i.test(url)) {
      return { ok: false, error: 'Only loopback preview URLs are allowed' }
    }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? 15000)
    try {
      const res = await fetch(url, {
        method,
        signal: controller.signal,
        headers: input.body ? { 'content-type': 'application/json' } : undefined,
        body: input.body ? input.body : undefined
      })
      const text = await res.text()
      return {
        ok: true,
        status: res.status,
        statusText: res.statusText,
        contentType: res.headers.get('content-type') ?? '',
        body: text.slice(0, 200_000)
      }
    } catch (error) {
      return { ok: false, error: (error as Error).message }
    } finally {
      clearTimeout(timer)
    }
  })

  handle(IPC.stopRun, async (_e, projectId: string) => {
    orchestrator.stopRun(projectId)
    debouncedNotify()
  })

  handle(IPC.approveTask, async (_e, taskId: string) => {
    orchestrator.approveTask(taskId)
    debouncedNotify()
  })

  handle(IPC.rejectTask, async (_e, taskId: string, reason: string) => {
    orchestrator.rejectTask(taskId, reason)
    debouncedNotify()
  })

  handle(IPC.retryTask, async (_e, taskId: string) => {
    orchestrator.retryTask(taskId)
    debouncedNotify()
  })

  handle(IPC.deleteTask, async (_e, taskId: string) => {
    const task = store.task(taskId)
    if (!task) return
    // Refuse to delete a task that is actively running.
    if (task.status === 'running') throw new Error('Stop the worker before deleting a running task')
    store.deleteTask(taskId)
    debouncedNotify()
  })

  handle(IPC.stopAgent, async (_e, agentId: string) => {
    orchestrator.stopAgent(agentId)
    debouncedNotify()
  })

  handle(IPC.pauseAgent, async (_e, agentId: string) => {
    orchestrator.pauseAgent(agentId)
    debouncedNotify()
  })

  handle(IPC.resumeAgent, async (_e, agentId: string) => {
    orchestrator.resumeAgent(agentId)
    debouncedNotify()
  })

  handle(IPC.instructAgent, async (_e, agentId: string, text: string) => {
    await orchestrator.instruct(agentId, text)
    debouncedNotify()
  })

  handle(IPC.saveMemory, async (_e, input: Partial<MemoryDoc> & { path: string; title: string; body: string }) => {
    const doc = memory.save(input)
    debouncedNotify()
    return doc
  })

  handle(IPC.deleteMemory, async (_e, id: string) => {
    const doc = store.memory(id)
    store.deleteMemory(id)
    if (doc) memory.deleteFilesFor(doc.path)
    debouncedNotify()
  })

  handle(IPC.pinMemory, async (_e, id: string) => {
    const doc = store.memory(id)
    if (!doc) return
    memory.save({ ...doc, pinned: !doc.pinned })
    debouncedNotify()
  })

  handle(IPC.searchMemory, async (event, query: string) => {
    const active = projectOf(event)
    const local = store.searchMemory(query, active)
    if (local.length) return local
    return memory.retrieve(active ?? '', query, 8)
  })

  handle(IPC.importSkill, async (event) => {
    const parent = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(parent ?? undefined!, { properties: ['openDirectory'] })
    if (result.canceled || !result.filePaths[0]) return null
    const installed = skills.installFrom(result.filePaths[0])
    if (!installed.skill && !installed.removed) throw new Error('That folder has no SKILL.md')
    debouncedNotify()
    return { skill: installed.skill, report: installed.report, removed: installed.removed }
  })

  handle(IPC.toggleSkill, async (_e, id: string) => {
    const skill = skills.scan().find((s) => s.id === id)
    if (!skill) return
    store.setSkillEnabled(id, !skill.enabled)
    debouncedNotify()
  })

  handle(IPC.refreshSkills, async () => {
    const list = skills.scan()
    debouncedNotify()
    return list
  })

  handle(IPC.saveSettings, async (_e, patch: Partial<AppSettings>) => {
    if (patch && 'mcpServers' in patch) patch = { ...patch, mcpServers: validMcpServers(patch.mcpServers) }
    for (const key of ['dailyBudgetUsd', 'projectBudgetUsd'] as const) if (patch && key in patch) patch = { ...patch, [key]: Math.min(100_000, Math.max(0, Number(patch[key]) || 0)) }
    const next = store.saveSettings(patch)
    debouncedNotify()
    return next
  })

  handle(IPC.saveCredential, async (event, engine: EngineKind, value: string) => {
    creds.set(engine, value.trim())
    await refreshProviders()
    // A new key can unlock models, so rediscover before the picker is opened again.
    await refreshModels(projectOf(event))
    debouncedNotify()
  })

  handle(IPC.clearCredential, async (event, engine: EngineKind) => {
    creds.clear(engine)
    await refreshProviders()
    await refreshModels(projectOf(event))
    debouncedNotify()
  })

  handle(IPC.credentials, async () => creds.list())

  handle(IPC.addAutomation, async (_e, input: { projectId: string; name: string; instruction: string; intervalMinutes: number }) => {
    const interval = Math.max(5, Math.round(input.intervalMinutes))
    const automation = {
      id: newId('aut'),
      projectId: input.projectId,
      name: input.name,
      instruction: input.instruction,
      intervalMinutes: interval,
      enabled: true,
      lastRunAt: null,
      nextRunAt: Date.now() + interval * 60_000
    }
    store.addAutomation(automation)
    debouncedNotify()
    return automation
  })

  handle(IPC.toggleAutomation, async (_e, id: string) => {
    const current = store.automations().find((a) => a.id === id)
    if (!current) return
    store.updateAutomation(id, {
      enabled: !current.enabled,
      nextRunAt: !current.enabled ? Date.now() + current.intervalMinutes * 60_000 : null
    })
    debouncedNotify()
  })

  handle(IPC.deleteAutomation, async (_e, id: string) => {
    store.deleteAutomation(id)
    debouncedNotify()
  })

  handle(IPC.openPath, async (_e, path: string) => {
    if (!isSafePath(path)) throw new Error('Path is outside the permitted workspace')
    await shell.openPath(path)
  })

  handle(IPC.openExternal, async (_e, url: string) => {
    if (!/^https?:\/\//.test(url)) throw new Error('Only http(s) links can be opened')
    await shell.openExternal(url)
  })

  handle(IPC.revealFile, async (_e, path: string) => {
    if (!isSafePath(path)) throw new Error('Path is outside the permitted workspace')
    shell.showItemInFolder(path)
  })

  // ---------------------------------------------------------------- planning
  handle(IPC.chatSessionNew, (_e, projectId: string) => {
    if (!store.project(projectId)) throw new Error('Project not found')
    store.createConversation(projectId)
    debouncedNotify()
  })
  handle(IPC.chatSessionSelect, (_e, projectId: string, conversationId: string) => {
    store.setActiveConversation(projectId, conversationId)
    debouncedNotify()
  })
  handle(IPC.chatSend, async (_e, input: { projectId: string; text: string; engine: EngineKind; model: string; endpoint: string; images?: string[] }) => {
    const project = store.project(input.projectId)
    if (!project) throw new Error('Project not found')
    capCheck(project.id)
    const result = await planning.sendChat(project, input.text, input, attachmentPaths(project.path, input.images))
    debouncedNotify()
    return result.assistant
  })

  handle(IPC.promptCreate, async (_e, input: { projectId: string; engine: EngineKind; model: string; endpoint: string }) => {
    const project = store.project(input.projectId)
    if (!project) throw new Error('Project not found')
    const doc = await planning.createPrompt(project, input)
    debouncedNotify()
    return doc
  })

  handle(IPC.promptEnhance, async (_e, input: { projectId: string; promptId: string; engine: EngineKind; model: string; endpoint: string }) => {
    const project = store.project(input.projectId)
    if (!project) throw new Error('Project not found')
    const s = store.settings()
    const optimizer = s.optimizerModel ? { engine: s.optimizerEngine, model: s.optimizerModel, endpoint: s.optimizerEndpoint } : input
    const doc = await planning.enhancePrompt(project, input.promptId, optimizer)
    debouncedNotify()
    return doc
  })

  handle(IPC.promptSave, async (_e, input: { projectId: string; promptId: string; body: string; source: 'edited' | 'restored' }) => {
    const project = store.project(input.projectId)
    if (!project) throw new Error('Project not found')
    if (!input.body.trim()) throw new Error('A prompt cannot be saved empty')
    const doc = planning.savePromptEdit(project, { id: input.promptId, body: input.body, source: input.source })
    debouncedNotify()
    return doc
  })

  handle(IPC.assignPrompt, async (_e, input: AssignPromptInput) => {
    const result = await orchestrator.assignPrompt(input)
    debouncedNotify()
    return result
  })

  /**
   * Advisor side-chat: answers on the planner engine, with a summary of the
   * current project so it can give concrete improvement advice.
   */
  handle(IPC.chatAdvisor, async (_e, input: { projectId: string; text: string; history?: Array<{ role: 'user' | 'assistant'; text: string }>; images?: string[] }) => {
    const project = store.project(input.projectId)
    if (!project) throw new Error('Project not found')
    const tasks = store.tasks(project.id).slice(-12).map((t) => `- [${t.status}] ${t.title} (${t.role}${t.attempts ? `, attempt ${t.attempts}` : ''})`)
    const latestPrompt = store.prompts(project.id).at(-1)
    const job = store.runningJob(project.id)
    const system = `You are the side chat inside Ventriee Studios, a local multi-agent AI studio. The owner can talk to you about anything: what to build or do next, ideas, how something works, or general questions. You also know the state of their current project "${project.name}" (${project.description || 'no description'}) and can advise on prompts, splitting tasks, choosing models or reading failures. Be concrete and brief. You cannot start work or change files; say so if asked. Do not invent credentials or claim things ran that did not.

Current project state:
- Active run: ${job ? 'running' : 'none'}
- Tasks:${tasks.length ? '\n' + tasks.join('\n') : ' none yet'}
- Latest prompt revision: ${latestPrompt ? `"${latestPrompt.title}" (v${latestPrompt.version})` : 'none'}

Answer the owner's question directly.`
    const settings = store.settings()
    const result = await runEngine(
      {
        engine: settings.plannerEngine,
        model: settings.plannerModel,
        endpoint: settings.plannerEndpoint,
        system,
        prompt: [...(Array.isArray(input.history) ? input.history.slice(-12) : []).map((m) => `${m.role === 'user' ? 'Owner' : 'You'}: ${String(m.text).slice(0, 4000)}`), `Owner: ${input.text}`].join('\n\n') + '\n\nReply to the Owner\'s last message.',
        cwd: project.path,
        maxTokens: 8000,
        timeoutMs: 120_000,
        reasoning: 'auto',
        images: attachmentPaths(project.path, input.images)
      },
      creds
    )
    if (!result.ok) throw new Error(result.error ?? 'Advisor request failed')
    return { reply: result.text, model: settings.plannerModel || 'default' }
  })

  handle(IPC.modelsDiscover, async (_e, projectId: string | null) => {
    return refreshModels(projectId ?? store.activeProjectId())
  })

  handle(IPC.modelPrefs, async (_e, patch: Partial<ModelPrefs>) => {
    const next = store.saveModelPrefs(patch)
    debouncedNotify()
    return next
  })

  handle(IPC.addProvider, async (_e, input: {
    label: string
    kind: 'openai' | 'anthropic' | 'gemini'
    engine: EngineKind
    baseUrl: string
    apiKey: string
    models: string[]
  }) => {
    const label = input.label.trim()
    if (!label) throw new Error('Give the provider a name')
    const config: ProviderConfig = {
      id: newId('prv'),
      label,
      kind: input.kind,
      engine: input.engine,
      baseUrl: input.baseUrl.trim() || defaultEndpoint(input.engine),
      models: input.models,
      createdAt: Date.now()
    }
    store.addProvider(config)
    // The key is stored under the provider id and never returned to the renderer.
    if (input.apiKey.trim()) {
      creds.setKey(`cred:provider:${config.id}`, input.apiKey.trim())
      // Execution resolves a key by engine, so mirror it into that slot too.
      // shortcut: two custom providers on the same engine share the last key, split per-provider if that matters
      creds.set(config.engine, input.apiKey.trim())
    }
    await refreshProviders()
    await refreshModels(store.activeProjectId())
    debouncedNotify()
    return config
  })

  handle(IPC.updateProvider, async (_e, id: string, patch: Partial<ProviderConfig> & { apiKey?: string }) => {
    const existing = store.providers().find((p) => p.id === id)
    if (!existing) throw new Error('Provider not found')
    store.updateProvider(id, patch)
    if (patch.apiKey !== undefined) {
      creds.setKey(`cred:provider:${id}`, patch.apiKey.trim())
    }
    await refreshModels(store.activeProjectId())
    debouncedNotify()
    return store.providers().find((p) => p.id === id)!
  })

  handle(IPC.deleteProvider, async (_e, id: string) => {
    store.deleteProvider(id)
    await refreshModels(store.activeProjectId())
    debouncedNotify()
  })

  handle(IPC.testProvider, async (_e, input: {
    id?: string
    engine: EngineKind
    baseUrl: string
    apiKey?: string
    model: string
  }) => {
    const key = input.apiKey?.trim() || (input.id ? creds.getKey(`cred:provider:${input.id}`) : undefined)
    const result = await planning.testProviderConfig({
      engine: input.engine,
      baseUrl: input.baseUrl,
      apiKey: key ?? undefined
    })
    return result
  })
}

let patchAgentShape: unknown

/** Renderer-supplied paths must sit inside an authorized project workspace. */
function isSafePath(target: string) {
  return store.projects().some((p) => isInside(p.path, target))
}

function startScheduler() {
  if (scheduler) clearInterval(scheduler)
  scheduler = setInterval(() => {
    if (!auth.hasSession()) return
    const now = Date.now()
    for (const automation of store.automations()) {
      if (!automation.enabled || !automation.nextRunAt || automation.nextRunAt > now) continue
      const project = store.project(automation.projectId)
      if (!project) {
        store.updateAutomation(automation.id, { enabled: false, nextRunAt: null })
        continue
      }
      if (store.runningJob(project.id)) continue
      store.updateAutomation(automation.id, {
        lastRunAt: now,
        nextRunAt: now + automation.intervalMinutes * 60_000
      })
      store.addEvent({
        projectId: project.id,
        agentId: null,
        taskId: null,
        type: 'automation',
        message: `Scheduled run started: ${automation.name}`
      })
      void orchestrator.startRun(project.id, automation.instruction).catch((error) => {
        store.addEvent({
          projectId: project.id,
          agentId: null,
          taskId: null,
          type: 'error',
          message: `Automation failed: ${(error as Error).message}`
        })
      })
    }
    debouncedNotify()
  }, 30_000)
  scheduler.unref?.()
}

function bootstrapData() {
  const userData = app.getPath('userData')
  mkdirSync(userData, { recursive: true })
  store = new Store(join(userData, 'ventriee.db'))
  creds = new Credentials(store.db)
  memory = new MemoryService(store, userData)
  skills = new SkillService(store, userData)
  checkpoints = new CheckpointService(userData)
  preview = new PreviewService(debouncedNotify, (projectId) => store.db.kvGet(`preview:autoapproved:${projectId}`) === '1')
  planning = new PlanningService(
    store,
    creds,
    memory,
    debouncedNotify,
    (payload) => {
      sendToProject(payload.projectId, IPC.chatChunk, payload)
    }
  )

  const bundledSkills = isDev
    ? join(app.getAppPath(), 'resources', 'skills')
    : join(process.resourcesPath, 'skills')
  skills.seedBundled(bundledSkills)
  skills.scan()
  memory.reindex()

  const activeProject = store.activeProjectId() ? store.project(store.activeProjectId()!) : null
  memory.bootstrap(activeProject ?? null)
  if (activeProject) preview.rescan(activeProject)

  orchestrator = new Orchestrator({
    store,
    memory,
    creds,
    emit: bus,
    notify: debouncedNotify,
    isProjectOpen: () => true,
    models: () => lastModels,
    providerConfigs: () => store.providers(),
    checkpoints,
    mcpConfig: () => writeMcpConfig(userData, store.settings().mcpServers),
    previewUrl: (id) => { const p = store.project(id); const s = p ? preview.stateForProject(p) : null; return s?.status === 'ready' || s?.status === 'external' ? s.url : null }
  })

  // Mark anything that was mid-flight at shutdown, so the UI never shows a stale spinner.
  for (const session of store.sessions()) {
    if (session.status === 'running') {
      store.updateSession(session.id, { status: 'failed', endedAt: Date.now(), exitCode: null })
    }
  }
  for (const project of store.projects()) {
    for (const agent of store.agents(project.id)) {
      if (agent.status === 'working' || agent.status === 'waiting') {
        store.updateAgent(agent.id, { status: 'idle', currentTaskId: null })
      }
    }
    for (const task of store.tasks(project.id)) {
      if (task.status === 'running' || task.status === 'review' || task.status === 'approval') {
        store.updateTask(task.id, { status: 'rework', review: 'Interrupted. The app restarted mid-task; retry when ready.' })
      }
    }
    for (const job of store.jobs(project.id)) {
      if (job.status === 'running') store.updateJob(job.id, { status: 'failed', error: 'Interrupted by app restart' })
    }
  }
}

app.whenReady().then(async () => {
  // Ties the window to the installed shortcut so the taskbar shows our icon, not Electron's.
  if (process.platform === 'win32') app.setAppUserModelId('com.ventriee.studios')
  if (!(isDev && process.env.ELECTRON_RENDERER_URL)) registerRendererProtocol(join(__dirname, '../renderer'), supabaseUrl)
  try {
    bootstrapData()
  } catch (error) {
    // Opening the data failed (newer data, or a migration that could not finish): say so and stop before anything writes.
    const dataDir = app.getPath('userData')
    dialog.showErrorBox('Ventriee Studios cannot open your data', `${(error as Error).message}\n\nYour data folder is ${dataDir}. Backups taken before each update are next to ventriee.db (ventriee.db.v<N>.bak).`)
    app.quit()
    return
  }
  errors = new ErrorLog(join(app.getPath('userData'), 'errors.log'), () => store.settings().errorReports, () => creds.secretValues().filter((v): v is string => Boolean(v)))
  // Observe only: these listeners record, they do not change how errors are handled.
  process.on('uncaughtExceptionMonitor', (error) => errors?.record('main', error.message, error.stack))
  process.on('unhandledRejection', (reason) => errors?.record('main-promise', reason instanceof Error ? reason.message : String(reason), reason instanceof Error ? reason.stack : ''))
  app.on('render-process-gone', (_e, _contents, details) => errors?.record('renderer-gone', `${details.reason} (exit ${details.exitCode})`))
  app.on('child-process-gone', (_e, details) => errors?.record('process-gone', `${details.type} ${details.reason} (exit ${details.exitCode})`))
  registerIpc()
  bus.on('output', (payload: { sessionId: string; agentId: string; taskId: string | null; chunk: string }) => {
    // Only windows showing that project need the chunk.
    const agent = store.agents().find((a) => a.id === payload.agentId)
    sendToProject(agent?.projectId ?? null, IPC.output, payload)
  })
  await refreshProviders()
  createWindow()
  updater.start()
  createTray()
  startScheduler()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  // With a tray the app keeps running until Quit is chosen there.
  if (process.platform === 'darwin' || !quitting) return
  app.quit()
})

app.on('before-quit', () => {
  quitting = true
  terminals.closeAll()
  for (const owner of [...debugSessions.keys()]) stopDebug(owner)
  lsp.closeAll()
  tests?.stopAll()
  if (scheduler) clearInterval(scheduler)
  tray?.destroy()
  for (const project of store?.projects?.() ?? []) {
    orchestrator?.stopRun(project.id)
    preview?.unwatch(project.id)
  }
})

export type { SessionRecord, SkillRecord }
