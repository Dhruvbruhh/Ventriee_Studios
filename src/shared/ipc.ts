import type {
  Agent,
  AppSettings,
  AssignPromptInput,
  Assignment,
  Automation,
  ChatMessage,
  CreateAgentInput,
  EngineKind,
  MemoryDoc,
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
  Task
} from './types'
import type { Catalog, LspEvent, LspStatus } from './catalog'
import type { FileEntry, TextFile, GitState, GitAction, LineChange, BlameLine, ProjectTypes, GithubAction, ProjectTask, TestEvent, ExtensionContributions, ExtensionInfo, ExtensionSearchHit, DebugEvent, DebugBreakpoint, DebugStartInput, DebugVariable, LintMessage, SearchResult, CodeAskInput, CodeAskResult, CodeChangeInput, CodeChangeResult, CodeCompleteInput } from './workspace'

export const IPC = {
  filesList: 'files:list', filesRead: 'files:read', filesSave: 'files:save', filesCreate: 'files:create', filesRename: 'files:rename', filesTrash: 'files:trash', filesFind: 'files:find', filesSearch: 'files:search', projectTypes: 'files:project-types', toolsFormat: 'tools:format', toolsLint: 'tools:lint', codeAsk: 'code:ask', codeChange: 'code:change', codeComplete: 'code:complete', runsList: 'runs:list', spendToday: 'spend:today', runChanges: 'runs:changes', runUndo: 'runs:undo', updateState: 'update:state', updateCheck: 'update:check', updateInstall: 'update:install', updateChanged: 'update:changed',
  gitStatus: 'git:status', gitDiff: 'git:diff', gitAction: 'git:action', gitLineChanges: 'git:line-changes', gitBlame: 'git:blame',
  termOpen: 'term:open', termWrite: 'term:write', termResize: 'term:resize', termClose: 'term:close', termData: 'term:data', termExit: 'term:exit',
  debugStart: 'debug:start', debugConfigs: 'debug:configs', debugVariables: 'debug:variables', debugThread: 'debug:thread', debugCommand: 'debug:command', debugEvaluate: 'debug:evaluate', debugBreakpoints: 'debug:breakpoints', debugStop: 'debug:stop', debugEvent: 'debug:event',
  extSearch: 'ext:search', extDetails: 'ext:details', extInstall: 'ext:install', extUninstall: 'ext:uninstall', extSetEnabled: 'ext:enabled', extList: 'ext:list', extUpdates: 'ext:updates', extContributions: 'ext:contributions',
  testsRunners: 'tests:runners', testsRun: 'tests:run', testsStop: 'tests:stop', testsEvent: 'tests:event',
  tasksList: 'tasks:list', filesReadLarge: 'files:read-large', toolsDetect: 'tools:detect', errorReport: 'errors:report', errorLog: 'errors:log', errorClear: 'errors:clear', reportProblem: 'errors:issue', syncPush: 'sync:push', syncPull: 'sync:pull', github: 'github:run', githubReview: 'github:review', historyList: 'history:list', historyRead: 'history:read',
  toolCatalog: 'tools:catalog', lspEnsure: 'lsp:ensure', lspRequest: 'lsp:request', lspNotify: 'lsp:notify', lspEvent: 'lsp:event',
  authStatus: 'auth:status',
  authSignIn: 'auth:signIn',
  authClear: 'auth:clear',
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
  promptCreate: 'prompt:create',
  promptEnhance: 'prompt:enhance',
  promptSave: 'prompt:save',
  assignPrompt: 'prompt:assign',
  chatAdvisor: 'chat:advisor',
  attachmentSave: 'attachment:save',
  screenshots: 'screenshots:list',
  modelsDiscover: 'models:discover',
  modelPrefs: 'models:prefs',
  addProvider: 'provider:add',
  updateProvider: 'provider:update',
  deleteProvider: 'provider:delete',
  testProvider: 'provider:test',
  graphifyStatus: 'graphify:status',
  graphifyBuild: 'graphify:build',
  graphifyQuery: 'graphify:query'
} as const

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
  termOpen(projectId: string, cols: number, rows: number): Promise<string>
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
  authStatus(): Promise<{ userId: string; sessionId: string; email: string; expiresAt: number } | null>
  authSignIn(input: { email: string; password: string }, signup?: boolean): Promise<{ session: { userId: string; sessionId: string; email: string; expiresAt: number } | null; message: string }>
  authClear(): Promise<void>
  onAuthLocked(cb: () => void): () => void
  snapshot(): Promise<Snapshot>
  onPatch(cb: (patch: Snapshot) => void): () => void
  onOutput(cb: (payload: { sessionId: string; agentId: string; taskId: string | null; chunk: string }) => void): () => void
  testEngine(engine: EngineKind, model: string, endpoint: string): Promise<{ ok: boolean; detail: string }>
  createProject(input: { name: string; path: string; description: string; template?: 'empty' | 'static' | 'react-vite' | 'express-api' | 'fastapi' }): Promise<Project>
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
  chatSend(input: { projectId: string; text: string; engine: EngineKind; model: string; endpoint: string }): Promise<ChatMessage>
  chatSessionNew(projectId: string): Promise<void>
  chatSessionSelect(projectId: string, conversationId: string): Promise<void>
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
}

export type TaskPatch = Partial<Task>
export type MessageInput = Omit<Message, 'id' | 'createdAt'>
