import type {
  Clarification,
  Agent,
  AppSettings,
  AssignPromptInput,
  Assignment,
  Automation,
  ChatMessage,
  ChatTemplate,
  CreateAgentInput,
  EngineKind,
  MemoryDoc,
  MemoryVersion,
  Message,
  ModelOption,
  ModelPrefs,
  PreviewState,
  Project,
  PromptDoc,
  ProviderConfig,
  ProviderStatus,
  SkillRecord,
  SkillScanReport,
  Snapshot,
  StartRunInput,
  RunSummary,
  UpdateState,
  Task,
  Client,
  AnalyticsOverview,
  McpInspectResult,
  McpServer,
  McpToolCall,
  RegistryServer,
  PluginInfo,
  RemoteJob,
  RemoteJobInput,
  BrowserLog,
  BrowserRunResult,
  BrowserStepResult,
  Workflow,
  WorkflowVersion,
  WorkflowRunEvent
} from './types'
import type { Resource } from './resources'
import type { SecurityReport } from './security'
import type { AgentCatalogue, AgentTemplate, Department } from './agents'
import type { Catalog, LspEvent, LspStatus } from './catalog'
import type { FileEntry, TextFile, GitState, GitAction, LineChange, BlameLine, ProjectTypes, GithubAction, ProjectTask, TestEvent, ExtensionContributions, FileIconTheme, NotebookEvent, ExtensionInfo, ExtensionSearchHit, DebugEvent, DebugBreakpoint, DebugStartInput, DebugVariable, LintMessage, SearchResult, CodeAskInput, CodeAskResult, CodeChangeInput, CodeChangeResult, CodeCompleteInput, EditorConfig } from './workspace'

export const IPC = {
  filesList: 'files:list', filesRead: 'files:read', filesSave: 'files:save', filesCreate: 'files:create', filesRename: 'files:rename', filesTrash: 'files:trash', filesFind: 'files:find', filesSearch: 'files:search', projectTypes: 'files:project-types', toolsFormat: 'tools:format', editorConfig: 'editor:config', toolsLint: 'tools:lint', codeAsk: 'code:ask', codeChange: 'code:change', codeComplete: 'code:complete', runsList: 'runs:list', spendToday: 'spend:today', runChanges: 'runs:changes', runUndo: 'runs:undo', updateState: 'update:state', updateCheck: 'update:check', updateInstall: 'update:install', updateChanged: 'update:changed',
  gitStatus: 'git:status', gitDiff: 'git:diff', gitAction: 'git:action', gitLineChanges: 'git:line-changes', gitBlame: 'git:blame',
  termOpen: 'term:open', termShells: 'term:shells', termWrite: 'term:write', termResize: 'term:resize', termClose: 'term:close', termData: 'term:data', termExit: 'term:exit',
  debugStart: 'debug:start', debugConfigs: 'debug:configs', debugVariables: 'debug:variables', debugThread: 'debug:thread', debugCommand: 'debug:command', debugEvaluate: 'debug:evaluate', debugBreakpoints: 'debug:breakpoints', debugStop: 'debug:stop', debugEvent: 'debug:event',
  extSearch: 'ext:search', extDetails: 'ext:details', extInstall: 'ext:install', extUninstall: 'ext:uninstall', extSetEnabled: 'ext:enabled', extList: 'ext:list', extUpdates: 'ext:updates', extContributions: 'ext:contributions', extIconTheme: 'ext:icon-theme',
  testsRunners: 'tests:runners', testsRun: 'tests:run', testsStop: 'tests:stop', testsEvent: 'tests:event',
  tasksList: 'tasks:list', filesReadLarge: 'files:read-large', toolsDetect: 'tools:detect', errorReport: 'errors:report', errorLog: 'errors:log', errorClear: 'errors:clear', reportProblem: 'errors:issue', syncPush: 'sync:push', syncPull: 'sync:pull', github: 'github:run', githubReview: 'github:review', historyList: 'history:list', historyRead: 'history:read',
  notebookStart: 'notebook:start', notebookExecute: 'notebook:execute', notebookInterrupt: 'notebook:interrupt', notebookRestart: 'notebook:restart', notebookShutdown: 'notebook:shutdown', notebookEvent: 'notebook:event',
  toolCatalog: 'tools:catalog', lspEnsure: 'lsp:ensure', lspRequest: 'lsp:request', lspNotify: 'lsp:notify', lspEvent: 'lsp:event',
  authStatus: 'auth:status',
  authSignIn: 'auth:signIn',
  authClear: 'auth:clear',
  authRecover: 'auth:recover',
  authReset: 'auth:reset',
  authLocked: 'auth:locked',
  snapshot: 'state:snapshot',
  patch: 'state:patch',
  output: 'agent:output',
  chatChunk: 'chat:chunk',
  testEngine: 'engine:test',
  createProject: 'project:create',
  selectProject: 'project:select',
  openProjectWindow: 'project:openWindow',
  updateProject: 'project:update',
  deleteProject: 'project:delete',
  pickFolder: 'project:pickFolder',
  createAgent: 'agent:create',
  updateAgent: 'agent:update',
  deleteAgent: 'agent:delete',
  duplicateAgent: 'agent:duplicate',
  startRun: 'run:start',
  clarifyBrief: 'run:clarify',
  stopRun: 'run:stop',
  approveTask: 'task:approve',
  rejectTask: 'task:reject',
  retryTask: 'task:retry',
  deleteTask: 'task:delete',
  stopAgent: 'agent:stop',
  pauseAgent: 'agent:pause',
  resumeAgent: 'agent:resume',
  instructAgent: 'agent:instruct',
  saveMemory: 'memory:save',
  deleteMemory: 'memory:delete',
  pinMemory: 'memory:pin',
  searchMemory: 'memory:search',
  memoryVersions: 'memory:versions',
  restoreMemoryVersion: 'memory:restore-version',
  importSkill: 'skill:import',
  toggleSkill: 'skill:toggle',
  refreshSkills: 'skill:refresh',
  saveSettings: 'settings:save',
  credentials: 'settings:credentials',
  saveCredential: 'settings:credential',
  clearCredential: 'settings:credentialClear',
  addAutomation: 'automation:add',
  toggleAutomation: 'automation:toggle',
  deleteAutomation: 'automation:delete',
  previewStart: 'preview:start',
  previewInstall: 'preview:install',
  previewStop: 'preview:stop',
  previewRefresh: 'preview:refresh',
  previewArtifact: 'preview:artifact',
  previewApiRequest: 'preview:apiRequest',
  openPath: 'shell:openPath',
  openExternal: 'shell:openExternal',
  revealFile: 'shell:reveal',
  chatSend: 'chat:send', chatSessionNew: 'chat:session-new', chatSessionSelect: 'chat:session-select',
  chatTemplateSave: 'chat:template-save', chatTemplateDelete: 'chat:template-delete', chatExport: 'chat:export',
  promptCreate: 'prompt:create',
  promptEnhance: 'prompt:enhance',
  promptSave: 'prompt:save',
  assignPrompt: 'prompt:assign',
  chatAdvisor: 'chat:advisor',
  attachmentSave: 'attachment:save',
  screenshots: 'screenshots:list',
  transcribe: 'voice:transcribe',
  modelsDiscover: 'models:discover',
  modelPrefs: 'models:prefs',
  addProvider: 'provider:add',
  updateProvider: 'provider:update',
  deleteProvider: 'provider:delete',
  testProvider: 'provider:test',
  graphifyStatus: 'graphify:status',
  graphifyBuild: 'graphify:build',
  graphifyQuery: 'graphify:query',
  clientList: 'client:list',
  clientCreate: 'client:create',
  clientUpdate: 'client:update',
  clientDelete: 'client:delete',
  analyticsOverview: 'analytics:overview',
  voiceAsk: 'voice:ask',
  voiceChunk: 'voice:chunk',
  voiceCancel: 'voice:cancel',
  voiceTranscribe: 'voice:transcribe-local',
  voiceSpeak: 'voice:speak',
  mcpInspect: 'mcp:inspect',
  workflowList: 'workflow:list',
  workflowSave: 'workflow:save',
  workflowDelete: 'workflow:delete',
  workflowRun: 'workflow:run',
  workflowStop: 'workflow:stop',
  workflowEvent: 'workflow:event',
  browserRun: 'browser:run',
  browserLogs: 'browser:logs',
  browserClose: 'browser:close',
  browserEvent: 'browser:event',
  mcpSearch: 'mcp:search',
  mcpInstall: 'mcp:install',
  githubAuth: 'github:auth',
  pluginList: 'plugin:list',
  agentFaces: 'agent:faces',
  pluginPreview: 'plugin:preview',
  pluginInstall: 'plugin:install',
  pluginDiscard: 'plugin:discard',
  pluginRemove: 'plugin:remove',
  resources: 'resources:list',
  securityScan: 'security:scan',
  agentCatalogue: 'agents:catalogue',
  agentTemplateSave: 'agents:save',
  agentTemplateDelete: 'agents:delete',
  agentDepartmentsSave: 'agents:departments',
  agentExport: 'agents:export',
  agentImport: 'agents:import',
  workflowExport: 'workflow:export',
  workflowImport: 'workflow:import',
  providerExport: 'provider:export',
  providerImport: 'provider:import',
  remoteList: 'remote:list',
  remoteTest: 'remote:test',
  remoteStart: 'remote:start',
  remoteRefresh: 'remote:refresh',
  remoteCancel: 'remote:cancel',
  remotePatch: 'remote:patch',
  remoteCleanup: 'remote:cleanup',
  remoteForget: 'remote:forget',
  workflowVersions: 'workflow:versions',
  workflowRestore: 'workflow:restore',
  workflowApprove: 'workflow:approve',
  skillRead: 'skill:read',
  skillWrite: 'skill:write',
  skillInstallUrl: 'skill:install-url',
  mcpToolCalls: 'mcp:tool-calls',
  cloudOrgs: 'cloud:orgs',
  cloudWorkspace: 'cloud:workspace',
  remoteStatus: 'remote:status',
  remoteSetEnabled: 'remote:set-enabled',
  cloudSyncStatus: 'cloud:sync-status',
  cloudSyncKeepDesktop: 'cloud:sync-keep-desktop'
} as const

/** Desktop <-> cloud project/task sync (main/cloud/sync.ts). */
export interface SyncConflict { kind: 'project' | 'task'; localId: string; title: string; reason: string }
export interface SyncStatus {
  state: 'off' | 'signed-out' | 'syncing' | 'synced' | 'pending' | 'error' | 'conflict'
  pending: number
  conflicts: SyncConflict[]
  lastSyncAt: number | null
  error: string
}

/** Inbound remote-control ("Jarvis") shapes surfaced to the renderer. */
export interface RemoteDevice { id: string; name: string; platform: string; remote_enabled: boolean; last_seen_at: string; org_id: string | null }
export interface RemoteCommandRow {
  id: string; type: string; status: 'queued' | 'claimed' | 'running' | 'done' | 'failed' | 'expired'
  requires_confirmation: boolean; error: string; created_at: string; finished_at: string | null
}
export interface RemoteStatus { device: RemoteDevice | null; enabled: boolean; commands: RemoteCommandRow[] }

export interface CredentialInfo {
  engine: EngineKind
  configured: boolean
  hint: string
}

export interface SkillImportResult {
  skill: SkillRecord | null
  report: SkillScanReport
  removed: boolean
}

export interface VentrieeApi {
  filesList(projectId: string, path?: string): Promise<FileEntry[]>
  filesFind(projectId: string, query: string): Promise<FileEntry[]>
  filesSearch(projectId: string, query: string, caseSensitive: boolean): Promise<SearchResult>
  projectTypes(projectId: string): Promise<ProjectTypes>
  toolsFormat(projectId: string, path: string, text: string): Promise<string | null>
  editorConfig(projectId: string, path: string): Promise<EditorConfig>
  toolsLint(projectId: string, path: string, text: string): Promise<LintMessage[]>
  codeAsk(projectId: string, input: CodeAskInput): Promise<CodeAskResult>
  codeChange(projectId: string, input: CodeChangeInput): Promise<CodeChangeResult>
  codeComplete(projectId: string, input: CodeCompleteInput): Promise<string>
  runsList(projectId: string): Promise<RunSummary[]>
  /** Reported spend today, everywhere and in this project, with the caps. */
  spendToday(projectId: string): Promise<{ all: number; project: number; dailyBudgetUsd: number; projectBudgetUsd: number }>
  runChanges(projectId: string, jobId: string): Promise<Array<{ path: string; status: 'added' | 'modified' | 'deleted' }>>
  runUndo(projectId: string, jobId: string): Promise<number>
  updateState(): Promise<UpdateState>
  updateCheck(): Promise<UpdateState>
  updateInstall(): Promise<void>
  onUpdate(cb: (state: UpdateState) => void): () => void
  filesRead(projectId: string, path: string): Promise<TextFile>
  filesSave(projectId: string, file: TextFile): Promise<TextFile>
  filesCreate(projectId: string, path: string, directory: boolean): Promise<void>
  filesRename(projectId: string, from: string, to: string): Promise<void>
  filesTrash(projectId: string, path: string): Promise<void>
  gitStatus(projectId: string): Promise<GitState>
  gitDiff(projectId: string, path: string, staged: boolean): Promise<{ original: string; modified: string; path: string }>
  gitAction(projectId: string, action: GitAction, path?: string, value?: string): Promise<void>
  gitLineChanges(projectId: string, path: string): Promise<LineChange[]>
  gitBlame(projectId: string, path: string, line: number): Promise<BlameLine | null>
  termOpen(projectId: string, cols: number, rows: number, shell?: string): Promise<string>
  /** Shells installed on this computer, the default first. */
  termShells(): Promise<Array<{ id: string; label: string }>>
  termWrite(id: string, data: string): Promise<void>
  termResize(id: string, cols: number, rows: number): Promise<void>
  termClose(id: string): Promise<void>
  onTermData(cb: (payload: { id: string; data: string }) => void): () => void
  onTermExit(cb: (payload: { id: string; code: number }) => void): () => void
  debugConfigs(projectId: string): Promise<Array<{ name: string; type: string; request: string }>>
  debugStart(projectId: string, input: DebugStartInput, breakpoints: Record<string, DebugBreakpoint[]>): Promise<void>
  debugVariables(ref: number): Promise<DebugVariable[]>
  debugThread(threadId: number): Promise<void>
  debugCommand(action: 'continue' | 'over' | 'into' | 'out' | 'pause'): Promise<void>
  debugEvaluate(expression: string): Promise<string>
  debugBreakpoints(path: string, breakpoints: DebugBreakpoint[]): Promise<void>
  debugStop(): Promise<void>
  onDebug(cb: (event: DebugEvent) => void): () => void
  extSearch(query: string): Promise<ExtensionSearchHit[]>
  extDetails(id: string): Promise<ExtensionSearchHit & { supported: string[]; needsRuntime: boolean; readme: string }>
  extInstall(id: string): Promise<ExtensionInfo>
  extUninstall(id: string): Promise<void>
  extSetEnabled(id: string, enabled: boolean): Promise<void>
  extList(): Promise<ExtensionInfo[]>
  extUpdates(): Promise<Array<{ id: string; version: string }>>
  extContributions(): Promise<ExtensionContributions>
  extIconTheme(id: string): Promise<FileIconTheme | null>
  testsRunners(projectId: string): Promise<Array<{ id: string; name: string }>>
  testsRun(projectId: string, runnerId: string, target: { file?: string; name?: string }): Promise<void>
  testsStop(): Promise<void>
  onTests(cb: (event: TestEvent) => void): () => void
  tasksList(projectId: string): Promise<ProjectTask[]>
  filesReadLarge(projectId: string, path: string): Promise<{ text: string; size: number; truncated: boolean }>
  toolsDetect(): Promise<{ tools: Array<{ name: string; found: boolean }>; languages: Array<{ id: string; name: string; server: string | null; install?: string }>; debuggers: Array<{ id: string; name: string; found: boolean; install?: string }> }>
  errorReport(message: string, stack: string): Promise<void>
  errorLog(): Promise<string>
  errorClear(): Promise<void>
  reportProblem(): Promise<void>
  syncPush(): Promise<number>
  syncPull(): Promise<{ syncedAt: number; missingExtensions: string[] } | null>
  github(projectId: string, action: GithubAction): Promise<unknown>
  githubReview(projectId: string, number: number): Promise<CodeAskResult>
  historyList(projectId: string, path: string): Promise<Array<{ id: string; time: number; size: number }>>
  historyRead(projectId: string, path: string, id: string): Promise<string>
  toolCatalog(): Promise<Catalog>
  lspEnsure(projectId: string, languageId: string): Promise<LspStatus>
  lspRequest(projectId: string, languageId: string, method: string, params: unknown): Promise<unknown>
  lspNotify(projectId: string, languageId: string, method: string, params: unknown): Promise<void>
  onLsp(cb: (event: LspEvent) => void): () => void
  /** Jupyter: one kernel per open notebook (project-relative path). */
  notebookStart(projectId: string, path: string): Promise<void>
  notebookExecute(projectId: string, path: string, cellId: string, code: string): Promise<void>
  notebookInterrupt(projectId: string, path: string): Promise<void>
  notebookRestart(projectId: string, path: string): Promise<void>
  notebookShutdown(projectId: string, path: string): Promise<void>
  onNotebook(cb: (event: NotebookEvent) => void): () => void
  authStatus(): Promise<{ userId: string; sessionId: string; email: string; expiresAt: number; activeOrgId: string | null } | null>
  authSignIn(input: { email: string; password: string }, signup?: boolean): Promise<{ session: { userId: string; sessionId: string; email: string; expiresAt: number; activeOrgId: string | null } | null; message: string }>
  authClear(): Promise<void>
  authRecover(email: string): Promise<{ message: string }>
  authReset(input: { email: string; code: string; password: string }): Promise<{ session: { userId: string; sessionId: string; email: string; expiresAt: number; activeOrgId: string | null } | null; message: string }>
  onAuthLocked(cb: () => void): () => void
  snapshot(): Promise<Snapshot>
  onPatch(cb: (patch: Snapshot) => void): () => void
  onOutput(cb: (payload: { sessionId: string; agentId: string; taskId: string | null; chunk: string }) => void): () => void
  testEngine(engine: EngineKind, model: string, endpoint: string): Promise<{ ok: boolean; detail: string }>
  createProject(input: { name: string; path: string; description: string; template?: 'empty' | 'static' | 'react-vite' | 'express-api' | 'fastapi'; clientId?: string | null }): Promise<Project>
  pickFolder(): Promise<string | null>
  selectProject(id: string): Promise<void>
  openProjectWindow(projectId: string): Promise<void>
  updateProject(id: string, patch: Partial<Project>): Promise<void>
  deleteProject(id: string): Promise<void>
  createAgent(input: CreateAgentInput): Promise<Agent>
  updateAgent(id: string, patch: Partial<Agent>): Promise<Agent>
  deleteAgent(id: string): Promise<void>
  duplicateAgent(id: string): Promise<Agent>
  startRun(input: StartRunInput): Promise<{ jobId: string }>
  /** Questions the planner wants answered before planning this brief; [] when clear, off or no engine. */
  clarifyBrief(input: { projectId: string; brief: string }): Promise<Clarification[]>
  stopRun(projectId: string): Promise<void>
  approveTask(taskId: string): Promise<void>
  rejectTask(taskId: string, reason: string): Promise<void>
  retryTask(taskId: string): Promise<void>
  deleteTask(taskId: string): Promise<void>
  stopAgent(agentId: string): Promise<void>
  pauseAgent(agentId: string): Promise<void>
  resumeAgent(agentId: string): Promise<void>
  instructAgent(agentId: string, text: string): Promise<void>
  saveMemory(input: Partial<MemoryDoc> & { path: string; title: string; body: string }): Promise<MemoryDoc>
  deleteMemory(id: string): Promise<void>
  pinMemory(id: string): Promise<void>
  searchMemory(query: string): Promise<MemoryDoc[]>
  memoryVersions(id: string): Promise<MemoryVersion[]>
  restoreMemoryVersion(versionId: string): Promise<MemoryDoc>
  importSkill(): Promise<SkillImportResult | null>
  toggleSkill(id: string): Promise<void>
  refreshSkills(): Promise<SkillRecord[]>
  saveSettings(patch: Partial<AppSettings>): Promise<AppSettings>
  saveCredential(engine: EngineKind, value: string): Promise<void>
  clearCredential(engine: EngineKind): Promise<void>
  credentials(): Promise<CredentialInfo[]>
  addAutomation(input: { projectId: string; name: string; instruction: string; intervalMinutes: number }): Promise<Automation>
  toggleAutomation(id: string): Promise<void>
  deleteAutomation(id: string): Promise<void>
  previewStart(projectId: string): Promise<PreviewState>
  previewInstall(projectId: string): Promise<PreviewState>
  previewStop(projectId: string): Promise<PreviewState>
  previewRefresh(projectId: string): Promise<PreviewState>
  previewArtifact(projectId: string, path: string): Promise<{ ok: boolean; data?: string; mime?: string; error?: string }>
  /** Fire a request from the main process (no CORS) against a preview service. */
  previewApiRequest(input: { baseUrl: string; method: string; path: string; body?: string; timeoutMs?: number }): Promise<{
    ok: boolean
    status?: number
    statusText?: string
    contentType?: string
    body?: string
    error?: string
  }>
  openPath(path: string): Promise<void>
  openExternal(url: string): Promise<void>
  revealFile(path: string): Promise<void>
  /** `replaceFrom`: an owner message id; it and everything after it are replaced (edit / regenerate). */
  chatSend(input: { projectId: string; text: string; engine: EngineKind; model: string; endpoint: string; images?: string[]; replaceFrom?: string }): Promise<ChatMessage>
  chatSessionNew(projectId: string): Promise<void>
  chatSessionSelect(projectId: string, conversationId: string): Promise<void>
  /** Save (create or update) a reusable chat template. */
  chatTemplateSave(input: { id?: string; name: string; content: string }): Promise<ChatTemplate>
  chatTemplateDelete(id: string): Promise<void>
  /** Writes the session transcript to a Markdown file via a save dialog; null when canceled. */
  chatExport(projectId: string, conversationId?: string): Promise<string | null>
  onChatChunk(cb: (payload: { projectId: string; messageId: string; chunk: string }) => void): () => void
  promptCreate(input: { projectId: string; engine: EngineKind; model: string; endpoint: string }): Promise<PromptDoc>
  promptEnhance(input: { projectId: string; promptId: string; engine: EngineKind; model: string; endpoint: string }): Promise<PromptDoc>
  promptSave(input: { projectId: string; promptId: string; body: string; source: 'edited' | 'restored' }): Promise<PromptDoc>
  assignPrompt(input: AssignPromptInput): Promise<{ jobId: string; taskCount: number }>
  /** Advisor side-chat: talk with a model that sees the current project state. */
  chatAdvisor(input: { projectId: string; text: string; history?: Array<{ role: 'user' | 'assistant'; text: string }>; images?: string[] }): Promise<{ reply: string; model: string }>
  /** Saves a pasted or dropped image in the project; returns its project-relative path. */
  attachmentSave(projectId: string, name: string, data: Uint8Array): Promise<string>
  /** Screenshots agents took of the app (.ventriee/screens), newest first. */
  screenshots(projectId: string): Promise<Array<{ name: string; time: number; url: string }>>
  /** Speech to text: a local Whisper, else an OpenAI or Mistral key the owner added. */
  transcribe(audio: Uint8Array): Promise<string>
  modelsDiscover(projectId: string | null): Promise<ModelOption[]>
  saveModelPrefs(patch: Partial<ModelPrefs>): Promise<ModelPrefs>
  addProvider(input: {
    label: string
    kind: 'openai' | 'anthropic' | 'gemini'
    engine: EngineKind
    baseUrl: string
    apiKey: string
    models: string[]
  }): Promise<ProviderConfig>
  updateProvider(id: string, patch: Partial<ProviderConfig> & { apiKey?: string }): Promise<ProviderConfig>
  deleteProvider(id: string): Promise<void>
  testProvider(input: {
    id?: string
    engine: EngineKind
    baseUrl: string
    apiKey?: string
    model: string
  }): Promise<{ ok: boolean; detail: string; models: string[] }>
  /** Knowledge-graph (graphify) status for this project: CLI present, graph built, node count. */
  graphifyStatus(projectId: string): Promise<{ installed: boolean; indexed: boolean; nodes: number }>
  /** Build a code-only knowledge graph for this project (minutes on big repos). */
  graphifyBuild(projectId: string): Promise<{ ok: boolean; out: string }>
  /** Ask the project's graph a question; returns the scoped subgraph answer. */
  graphifyQuery(projectId: string, question: string): Promise<{ ok: boolean; out: string }>
  clientList(): Promise<Client[]>
  clientCreate(input: { name: string; url: string; niche: string; notes: string }): Promise<Client>
  clientUpdate(id: string, patch: Partial<Client>): Promise<Client>
  clientDelete(id: string): Promise<void>
  analyticsOverview(sinceMs: number): Promise<AnalyticsOverview>
  /** One spoken turn: the reply streams through onVoiceChunk while this resolves with the whole text. */
  voiceAsk(input: { requestId: string; text: string; history: Array<{ role: 'user' | 'assistant'; text: string }> }): Promise<{ reply: string; model: string }>
  onVoiceChunk(cb: (payload: { requestId: string; chunk: string }) => void): () => void
  voiceCancel(requestId: string): Promise<void>
  /** 16 kHz mono WAV of one turn to text. */
  voiceTranscribe(audio: Uint8Array): Promise<string>
  /** One sentence as MP3 from the cloud voice. */
  voiceSpeak(text: string): Promise<Uint8Array>
  /** Handshake with a saved MCP server by name and list its tools. */
  mcpInspect(name: string): Promise<McpInspectResult>
  workflowList(): Promise<Workflow[]>
  workflowSave(input: Partial<Workflow> & { name: string }): Promise<Workflow>
  workflowDelete(id: string): Promise<void>
  /** Starts a run and returns its id; progress arrives through onWorkflowEvent. */
  workflowRun(id: string): Promise<{ runId: string }>
  workflowStop(id: string): Promise<void>
  onWorkflowEvent(cb: (e: WorkflowRunEvent) => void): () => void
  /** Run browser steps in the sandboxed automation window; each step also arrives through onBrowserEvent. */
  browserRun(script: string): Promise<BrowserRunResult>
  browserLogs(): Promise<{ console: BrowserLog[]; network: BrowserLog[]; url: string }>
  browserClose(): Promise<void>
  onBrowserEvent(cb: (r: BrowserStepResult) => void): () => void
  /** Search the official MCP registry. */
  mcpSearch(query: string, cursor?: string): Promise<{ servers: RegistryServer[]; nextCursor: string }>
  /** Add a registry server to the MCP list, switched off until the owner tests and enables it. */
  mcpInstall(server: RegistryServer, option: number, values: Record<string, string>): Promise<McpServer>
  /** GitHub CLI status: installed, signed in, account. */
  githubAuth(): Promise<{ installed: boolean; signedIn: boolean; account: string; detail: string }>
  pluginList(): Promise<PluginInfo[]>
  /** Agent role → face sheet data URL, from installed packs. */
  agentFaces(): Promise<Record<string, string>>
  /** Fetch and check a plugin without installing it; install with the returned token. */
  pluginPreview(source: { type: 'folder' | 'git'; value: string }): Promise<{ token: string; id: string; name: string; version: string; description: string; installed: string | null; permissions: string[]; errors: string[] }>
  pluginInstall(token: string): Promise<PluginInfo>
  pluginDiscard(token: string): Promise<void>
  pluginRemove(id: string): Promise<void>
  /** Unified resource library for the open project, with truthful installed/available/missing state. */
  resources(projectId: string | null): Promise<Resource[]>
  /** Read-only security scan of the project (secrets, patterns, npm audit, .env). */
  securityScan(projectId: string): Promise<SecurityReport>
  /** Agent catalogue: built-in and owner templates grouped by department. */
  agentCatalogue(): Promise<AgentCatalogue>
  /** Create (create=true) or edit a template. */
  agentTemplateSave(template: Omit<AgentTemplate, 'builtin'>, create: boolean): Promise<AgentTemplate>
  /** Delete an owner template, or reset a built-in to its default. */
  agentTemplateDelete(role: string): Promise<void>
  agentDepartmentsSave(departments: Department[]): Promise<Department[]>
  /** Save one agent or a whole department to a JSON manifest; null when cancelled. */
  agentExport(pick: { role?: string; department?: string }): Promise<string | null>
  /** Validate and import a manifest; imported agents arrive switched off. Null when cancelled. */
  agentImport(): Promise<{ added: string[]; missing: string[] } | null>
  /** Save saved workflows to a JSON manifest; null when cancelled. */
  workflowExport(): Promise<string | null>
  /** Validate and import a workflow manifest; imported workflows arrive switched off. Null when cancelled. */
  workflowImport(): Promise<{ added: string[] } | null>
  /** Save custom providers to a JSON manifest (never any key material); null when cancelled. */
  providerExport(): Promise<string | null>
  /** Validate and import a provider manifest; the owner enters each key afterwards. Null when cancelled. */
  providerImport(): Promise<{ added: string[] } | null>
  remoteList(): Promise<RemoteJob[]>
  /** Check the SSH connection and the tools a remote run needs. */
  remoteTest(host: string): Promise<string>
  remoteStart(input: RemoteJobInput): Promise<RemoteJob>
  remoteRefresh(id: string): Promise<RemoteJob>
  remoteCancel(id: string): Promise<RemoteJob>
  /** Saves the run's changes as a .patch file and returns its path. */
  remotePatch(id: string): Promise<string>
  remoteCleanup(id: string): Promise<RemoteJob>
  remoteForget(id: string): Promise<void>
  workflowVersions(id: string): Promise<WorkflowVersion[]>
  workflowRestore(id: string, versionId: string): Promise<Workflow>
  workflowApprove(runId: string, nodeId: string, approved: boolean): Promise<void>
  /** Read the raw SKILL.md content of an installed skill. */
  skillRead(id: string): Promise<string>
  /** Write updated SKILL.md content back to disk and re-register the skill. */
  skillWrite(id: string, content: string): Promise<void>
  /** Clone a skill from a Git URL, scan it, and install it. */
  skillInstallUrl(url: string): Promise<SkillImportResult>
  mcpToolCalls(sessionId: string): Promise<McpToolCall[]>
  /** Proof-of-use for the cloud data layer: the orgs the signed-in user belongs to. */
  cloudOrgs(): Promise<Array<{ id: string; name: string; owner_id: string; created_at: string }>>
  /** Switch this window between the personal workspace (null) and an org. */
  cloudSetWorkspace(orgId: string | null): Promise<{ userId: string; sessionId: string; email: string; expiresAt: number; activeOrgId: string | null }>
  /** This desktop's remote-control registration, enabled state, and recent commands. */
  remoteStatus(): Promise<RemoteStatus>
  /** Turn inbound remote control on/off for this device (default off). */
  remoteSetEnabled(on: boolean): Promise<{ device: RemoteDevice | null; enabled: boolean }>
  cloudSyncStatus(): Promise<SyncStatus>
  /** Resolve a sync conflict by overwriting the cloud row with this desktop's version. */
  cloudSyncKeepDesktop(kind: 'project' | 'task', localId: string): Promise<SyncStatus>
}

export type TaskPatch = Partial<Task>
export type MessageInput = Omit<Message, 'id' | 'createdAt'>
