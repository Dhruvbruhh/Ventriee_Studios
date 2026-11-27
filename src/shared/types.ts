export type EngineKind =
  | 'cli-opencode'
  | 'cli-claude'
  | 'cli-codex'
  | 'cli-gemini'
  | 'cli-ollama'
  | 'cli-custom'
  | 'api-openai'
  | 'api-anthropic'
  | 'api-gemini'
  | 'api-openrouter'
  | 'api-deepseek'
  | 'api-mistral'
  | 'api-deploy'
  | 'api-inception'
  | 'api-ollama'
  | 'api-lmstudio'
  | 'api-vllm'
  | 'api-custom'

export const ENGINE_LABELS: Record<EngineKind, string> = {
  'cli-opencode': 'OpenCode CLI',
  'cli-claude': 'Claude Code CLI',
  'cli-codex': 'Codex CLI',
  'cli-gemini': 'Gemini CLI',
  'cli-ollama': 'Ollama CLI',
  'cli-custom': 'Custom CLI',
  'api-openai': 'OpenAI API',
  'api-anthropic': 'Anthropic API',
  'api-gemini': 'Google Gemini API',
  'api-openrouter': 'OpenRouter',
  'api-deepseek': 'DeepSeek API',
  'api-mistral': 'Mistral API',
  'api-deploy': 'Deploy (DeepSeek V4.1)',
  'api-inception': 'Inception (Mercury)',
  'api-ollama': 'Ollama HTTP',
  'api-lmstudio': 'LM Studio',
  'api-vllm': 'vLLM',
  'api-custom': 'Custom OpenAI-compatible'
}

/** Default base URL per provider. Shared so the renderer and the runner agree. */
export const ENGINE_ENDPOINTS: Partial<Record<EngineKind, string>> = {
  'api-openai': 'https://api.openai.com/v1',
  'api-anthropic': 'https://api.anthropic.com/v1',
  'api-gemini': 'https://generativelanguage.googleapis.com/v1beta',
  'api-openrouter': 'https://openrouter.ai/api/v1',
  'api-deepseek': 'https://api.deepseek.com/v1',
  'api-mistral': 'https://api.mistral.ai/v1',
  'api-deploy': 'https://api-sf1-cdn.deploy.com/api/v1',
  'api-inception': 'https://api.inceptionlabs.ai/v1',
  'api-ollama': 'http://127.0.0.1:11434/v1',
  'api-lmstudio': 'http://127.0.0.1:1234/v1',
  'api-vllm': 'http://127.0.0.1:8000/v1'
}

/** Providers on this machine (no key) and hosted ones (need a key), both read from ENGINE_ENDPOINTS. */
const API_ENGINES = Object.keys(ENGINE_ENDPOINTS) as EngineKind[]
export const LOCAL_API_ENGINES = API_ENGINES.filter((e) => ENGINE_ENDPOINTS[e]!.startsWith('http://127.0.0.1'))
export const KEYED_API_ENGINES = API_ENGINES.filter((e) => !LOCAL_API_ENGINES.includes(e))

export type Autonomy = 'ask' | 'scoped' | 'autonomous'

/**
 * How much the model may think before it answers. 'auto' sends nothing and lets the model
 * decide; the rest map onto the provider's own knob (OpenAI `reasoning_effort`, Anthropic
 * thinking budget). CLI engines get it on the command line.
 */
export type ReasoningEffort = 'auto' | 'none' | 'low' | 'medium' | 'high'

/** Manual: every model is chosen. Automatic: the router picks. Hybrid: defaults, router may override. */
export type RoutingMode = 'manual' | 'automatic' | 'hybrid'

export type CostPreference = 'cheap' | 'balanced' | 'quality'

export type Difficulty = 'low' | 'medium' | 'high'

export interface UpdateState {
  status: 'unsupported' | 'idle' | 'checking' | 'current' | 'downloading' | 'ready' | 'manual' | 'error'
  current: string
  version?: string
  percent?: number
  message?: string
  /** Release page, for builds that cannot update themselves (portable). */
  url?: string
}

export interface McpServer {
  name: string
  /** Program for a local (stdio) server; empty for a remote one. */
  command: string
  args: string[]
  enabled: boolean
  env?: Record<string, string>
  /** A remote server's address; set instead of command. */
  url?: string
  transport?: 'http' | 'sse'
  headers?: Record<string, string>
  /** Where it came from: a registry name, or plugin:<id>. */
  source?: string
}

/** What a live handshake with an MCP server returned. */
export interface McpInspectResult {
  ok: boolean
  serverName: string
  serverVersion: string
  tools: Array<{ name: string; description: string }>
  resources?: Array<{ name: string; uri: string }>
  prompts?: Array<{ name: string; description: string }>
  ms: number
  error?: string
}

export interface RegistryInput { name: string; description: string; required: boolean; secret: boolean; /** Header template such as "Bearer {token}". */ template?: string }
export interface RegistryInstall {
  kind: 'npm' | 'pypi' | 'oci' | 'remote'
  label: string
  identifier: string
  version: string
  url?: string
  transport: 'stdio' | 'http' | 'sse'
  env: RegistryInput[]
  headers: RegistryInput[]
}
export interface RegistryServer {
  name: string
  title: string
  description: string
  version: string
  repository: string
  website: string
  publishedAt: string
  status: string
  installs: RegistryInstall[]
}

export interface VoiceSettings {
  /** cloud: the planner engine; local: the Ollama model below. */
  source: 'cloud' | 'local'
  localModel: string
  localEndpoint: string
  /** An OpenAI-compatible /audio/transcriptions server on this computer (whisper.cpp, faster-whisper); '' uses the built-in transcriber. */
  sttEndpoint: string
  sttModel: string
  tts: 'system' | 'openai'
  ttsModel: string
  /** System voice name, or an OpenAI voice id such as "alloy". */
  voiceName: string
  rate: number
  volume: number
  /** Language hint for speech recognition; auto lets Whisper detect Hindi, English or a mix. */
  language: 'auto' | 'en' | 'hi'
  /** Let the owner talk over the assistant to cut it off. */
  bargeIn: boolean
  /** Silence that ends a turn. */
  endSilenceMs: number
}

export type WorkflowNodeKind = 'trigger' | 'ai' | 'agent' | 'shell' | 'http' | 'condition' | 'notify' | 'wait' | 'workflow' | 'browser' | 'approval' | 'switch' | 'loop' | 'parallel'
export interface WorkflowNode { id: string; kind: WorkflowNodeKind; x: number; y: number; label: string; config: Record<string, string> }
export interface WorkflowEdge { id: string; from: string; to: string; branch?: 'true' | 'false'; /** For switch nodes: take this edge only when output contains this value. */ case?: string }
export interface Workflow {
  id: string
  projectId: string | null
  name: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  /** 0 = manual only. */
  scheduleMinutes: number
  enabled: boolean
  lastRunAt: number | null
  createdAt: number
  updatedAt: number
}
export interface PluginAgentTemplate { role: string; name: string; title: string; instructions: string; skills: string[] }
export interface PluginTheme { id: string; name: string; base: 'dark' | 'light'; colors: Record<string, string> }
export interface PluginCommand { id: string; title: string; prompt: string }
export interface PluginInfo {
  id: string
  name: string
  version: string
  description: string
  author: string
  source: { type: 'folder' | 'git'; value: string }
  installedAt: number
  dependencies: Record<string, string>
  /** What it can do, in plain words, shown before install. */
  permissions: string[]
  agents: PluginAgentTemplate[]
  themes: PluginTheme[]
  commands: PluginCommand[]
  /** Agent role → face sheet path inside the installed plugin folder. */
  faces?: Record<string, string>
  /** What it added, so removal takes exactly that back. */
  added: { skills: string[]; mcpServers: string[]; workflows: string[]; agents?: string[] }
  errors: string[]
}

export interface RemoteJobInput {
  provider?: 'ssh' | 'e2b'
  /** user@host, or an alias from ~/.ssh/config; optional :port. For E2B, leave empty. */
  host: string
  repo: string
  branch: string
  setup: string
  /** Runs inside the checkout; the task is in $VENTRIEE_TASK. */
  agentCommand: string
  task: string
  env: Record<string, string>
  timeoutMinutes: number
  memoryMb: number
  push: boolean
}
export interface RemoteJob extends RemoteJobInput {
  id: string
  provider: 'ssh' | 'e2b'
  workBranch: string
  status: 'starting' | 'running' | 'done' | 'failed' | 'cancelled' | 'lost' | 'cleaned'
  exitCode: number | null
  log: string
  createdAt: number
  updatedAt: number
  error?: string
}

/** Workflow webhooks listen here, on 127.0.0.1 only. */
export const WEBHOOK_PORT = 47615

export interface BrowserLog { at: number; level: 'info' | 'warn' | 'error'; text: string }
export interface BrowserStepResult { line: number; action: string; ok: boolean; output: string; ms: number; /** PNG data URL preview for screenshot steps. */ image?: string }
export interface BrowserRunResult { ok: boolean; results: BrowserStepResult[]; error?: string }

export interface WorkflowVersion {
  id: string
  workflowId: string
  name: string
  graph: string
  createdAt: number
}

export interface McpToolCall {
  id: string
  sessionId: string
  toolName: string
  argsSummary: string
  durationMs: number | null
  createdAt: number
}

export interface WorkflowRunEvent {
  workflowId: string
  runId: string
  nodeId: string | null
  status: 'running' | 'done' | 'failed' | 'skipped' | 'finished'
  output: string
  at: number
}

export interface UsageRow { name: string; sessions: number; inputTokens: number; outputTokens: number; costUsd: number; seconds: number }

export interface AnalyticsDayBucket { date: string; costUsd: number; inputTokens: number; outputTokens: number; sessions: number }
export interface AnalyticsOverview {
  totalCostUsd: number
  totalSessions: number
  totalInputTokens: number
  totalOutputTokens: number
  successRate: number
  byModel: UsageRow[]
  byProject: Array<{ id: string; name: string; sessions: number; costUsd: number }>
  daily: AnalyticsDayBucket[]
}
export interface RunSummary {
  jobId: string
  instruction: string
  status: string
  startedAt: number
  endedAt: number | null
  sessions: number
  inputTokens: number
  outputTokens: number
  costUsd: number
  /** False when no engine in the run reported a price; the cost is then unknown, not zero. */
  costReported: boolean
  byModel: UsageRow[]
  byAgent: UsageRow[]
  /** A pre-run snapshot exists, so the run can be undone. */
  checkpoint: boolean
}

/** A planning conversation message. Separate from worker mail. */
export interface ChatMessage {
  id: string
  projectId: string
  conversationId: string
  role: 'owner' | 'assistant'
  content: string
  /** Model that produced an assistant turn, so the transcript stays honest. */
  model: string
  status: 'done' | 'streaming' | 'error'
  createdAt: number
}

export interface Conversation {
  id: string
  projectId: string
  /** Empty shows as "Session N" by creation order. */
  title: string
  createdAt: number
  updatedAt: number
}

export type PromptSource = 'generated' | 'enhanced' | 'edited' | 'restored'

/** Every prompt revision is a row. Nothing is overwritten in place. */
export interface PromptDoc {
  id: string
  projectId: string
  conversationId: string
  title: string
  body: string
  version: number
  source: PromptSource
  parentId: string | null
  createdAt: number
}

export interface ProviderConfig {
  id: string
  label: string
  kind: 'openai' | 'anthropic' | 'gemini'
  engine: EngineKind
  baseUrl: string
  models: string[]
  createdAt: number
}

export interface ModelOption {
  /** EngineKind for built-ins, provider id for configured ones. */
  provider: string
  providerLabel: string
  model: string
  /** null means the provider does not report pricing; never guessed. */
  free: boolean | null
  configured: boolean
  note?: string
}

/**
 * What a model can do, so routing can pick on capability instead of a name regex.
 * Derived from the model id (and the provider's `free` flag) by `deriveProfile`;
 * the owner may override any field per model in Settings.
 */
export interface ModelProfile {
  /** Tokens the model can take in one request. */
  contextWindow: number
  toolCalling: boolean
  vision: boolean
  /** 0-100 fit for writing/fixing code. */
  codingScore: number
  /** 0-100 fit for multi-step reasoning. */
  reasoningScore: number
  costTier: 'free' | 'low' | 'medium' | 'high'
  latencyTier: 'fast' | 'medium' | 'slow'
  /** 'unavailable' takes the model out of routing; 'degraded' deprioritises it. */
  availability: 'available' | 'degraded' | 'unavailable'
}

export interface ModelPrefs {
  /** `${provider}::${model}` */
  favorites: string[]
  recents: string[]
}

export interface Assignment {
  id: string
  projectId: string
  promptId: string
  jobId: string
  mode: 'orchestrator' | 'manual'
  agents: Array<{ agentId: string; name: string; model: string }>
  createdAt: number
}

export interface AssignPromptInput {
  projectId: string
  promptId: string
  mode: 'orchestrator' | 'manual'
  /** Manual mode: one task per entry, in this order. */
  agents?: Array<{
    agentId: string
    model?: string
    providerId?: string | null
    /** Built-in engines have no provider id, so the engine travels with the pick. */
    engine?: EngineKind
    endpoint?: string
  }>
  /** Extra instruction appended to every task, e.g. a phase hint. */
  note?: string
  /** Owner's answers to the planner's questions, folded into the brief. */
  clarifications?: Clarification[]
}

/** A planner question and the owner's answer (the model's suggested default until edited). */
export interface Clarification {
  question: string
  answer: string
}

export type AgentStatus = 'idle' | 'working' | 'waiting' | 'paused' | 'error' | 'offline'

export type TaskStatus =
  | 'todo'
  | 'ready'
  | 'running'
  | 'review'
  | 'rework'
  | 'blocked'
  | 'approval'
  | 'done'
  | 'failed'

export interface Project {
  id: string
  name: string
  path: string
  description: string
  /** Client this project was created for; null if internal or unlinked. */
  clientId: string | null
  /** Cloud org the project was created in; null for the personal workspace. Picks which org memory it sees. */
  orgId?: string | null
  createdAt: number
  updatedAt: number
}

export interface Agent {
  id: string
  projectId: string
  role: string
  name: string
  title: string
  engine: EngineKind
  model: string
  endpoint: string
  instructions: string
  autonomy: Autonomy
  /** How much the model may think per turn. Recorded on the session so a run can be explained. */
  reasoning: ReasoningEffort
  /** Skill ids offered to this worker. Empty means the skills of its role template. */
  skills: string[]
  /** MCP server names offered to this worker. Empty means all enabled servers. */
  mcpServers: string[]
  concurrency: number
  budgetUsd: number
  color: string
  desk: number
  enabled: boolean
  status: AgentStatus
  currentTaskId: string | null
  lastError: string | null
  createdAt: number
}

export interface Task {
  id: string
  projectId: string
  parentId: string | null
  title: string
  description: string
  acceptance: string
  role: string
  agentId: string | null
  status: TaskStatus
  dependsOn: string[]
  output: string
  review: string
  attempts: number
  phase: string
  /** Per-task routing override. Null means use the worker's own configuration. */
  engine: EngineKind | null
  model: string | null
  endpoint: string | null
  routedBy: RoutingMode | null
  /** Project-relative files the task's evidence check saw change or disappear. */
  changedFiles?: Array<{ path: string; removed: boolean }>
  /** Planner's estimate; null when the plan did not say. */
  difficulty?: Difficulty | null
  /** Specialist skill ids the planner picked for this task, added to the worker's own. */
  skills?: string[]
  createdAt: number
  updatedAt: number
}

export interface Message {
  id: string
  projectId: string
  taskId: string | null
  sender: string
  recipient: string
  type: 'note' | 'request' | 'blocker' | 'handover' | 'review' | 'owner'
  content: string
  status: 'unread' | 'read' | 'done'
  createdAt: number
}

export interface RunEvent {
  id: string
  projectId: string
  agentId: string | null
  taskId: string | null
  type: string
  message: string
  createdAt: number
}

export interface SessionRecord {
  id: string
  projectId: string
  agentId: string
  taskId: string | null
  engine: EngineKind
  model: string
  cwd: string
  /** Thinking budget the session actually ran with, so the record matches reality. */
  reasoning: ReasoningEffort
  status: 'running' | 'done' | 'failed' | 'stopped'
  exitCode: number | null
  inputTokens: number
  outputTokens: number
  costUsd: number
  externalId: string | null
  command: string
  startedAt: number
  endedAt: number | null
}

export interface MemoryDoc {
  id: string
  scope: 'global' | 'org' | 'project' | 'agent' | 'session' | 'skill'
  projectId: string | null
  /** Org this doc belongs to (scope 'org'); local only, never uploaded. */
  orgId?: string | null
  agentId: string | null
  path: string
  title: string
  body: string
  tags: string[]
  pinned: boolean
  confidence: number
  source: string
  evidence: string
  updatedAt: number
}

/** One saved state of a memory doc: who/what wrote it, and for which task. */
export interface MemoryVersion {
  id: string
  memoryId: string
  title: string
  body: string
  source: string
  taskId: string | null
  createdAt: number
}

/** Finished-task outcomes for one model × role × difficulty bucket, for measured routing. */
export interface ModelOutcomeStat {
  model: string
  role: string
  /** 'unrated' when the planner gave no difficulty. */
  difficulty: string
  samples: number
  passed: number
  rework: number
  failed: number
  avgTokens: number
  avgLatencyMs: number
}

export interface SkillScanReport {
  score: number
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  recommendation: 'SAFE' | 'CAUTION' | 'DO NOT INSTALL'
  executable: boolean
  findings: Array<{ id: string; severity: string; title: string; location: string; detail: string }>
}

export interface SkillRecord {
  id: string
  name: string
  description: string
  path: string
  enabled: boolean
  version: string
  uses: number
  successes: number
  source: string
  updatedAt: number
  /** SkillSpector-style scan result, present after the registry has scanned this skill. */
  scan?: SkillScanReport | null
}

export interface Automation {
  id: string
  projectId: string
  name: string
  instruction: string
  intervalMinutes: number
  enabled: boolean
  lastRunAt: number | null
  nextRunAt: number | null
}

export interface ProviderStatus {
  engine: EngineKind
  label: string
  kind: 'cli' | 'api'
  available: boolean
  detail: string
  configured: boolean
}

export interface AppSettings {
  defaultProjectId: string | null
  orchestratorEngine: EngineKind
  orchestratorModel: string
  maxConcurrentSessions: number
  sessionTimeoutMinutes: number
  autoExtractLessons: boolean
  /** Run each parallel code task in its own Git worktree and merge it back when it passes. */
  isolateCodeTasks: boolean
  requireDeployApproval: boolean
  reducedMotion: boolean
  plannerFallback: boolean
  /** https Git address of a private team pack (a plugin) kept installed and current; '' for none. */
  companyPack: string
  /** Ask the owner clarifying questions before planning a vague brief. */
  clarifyBrief: boolean
  /** Fetch reference URLs from the brief and give the planner the page text. */
  researchUrls: boolean
  /** Who picks models: the owner, the orchestrator, or both. */
  routingMode: RoutingMode
  costPreference: CostPreference
  /** Owner overrides for a model's capability profile, keyed by `${provider}::${model}`. Only the fields present override the derived defaults. */
  modelProfiles: Record<string, Partial<ModelProfile>>
  /** Engine used for planning chat, prompt generation and enhancement. */
  plannerEngine: EngineKind
  plannerModel: string
  plannerEndpoint: string
  /** sequential: one task at a time; hybrid: parallel where safe, chained where dependent; parallel: everything starts at once. */
  runMode: 'sequential' | 'hybrid' | 'parallel'
  /** MCP servers offered to Claude Code workers (passed with --mcp-config). */
  mcpServers: McpServer[]
  /** Model that runs Enhance (often a local Ollama model). Empty model means "use the planner". */
  optimizerEngine: EngineKind
  optimizerModel: string
  optimizerEndpoint: string
  /** Inline completions as you type; an empty model means off. API or local engines only. */
  completionEngine: EngineKind
  completionModel: string
  /** Monaco theme: 'ventriee' or an installed extension theme id. */
  editorTheme: string
  vimMode: boolean
  /** Save edited files a second after typing stops. */
  autoSave: boolean
  /** Format with the project's Prettier (or the language's formatter) before each save. */
  formatOnSave: boolean
  /** Anime impact effects (Sakuga VFX) on sends, confirms, finished tasks and notices. */
  effects: boolean
  /** Owner keyboard shortcuts: a Monaco/studio command id and a key chord like "ctrl+shift+k"; '-' before the id removes a default. */
  keybindings: Array<{ key: string; command: string }>
  /** Opt-in: keep a local log of crashes and errors for "Report a problem". */
  errorReports: boolean
  /** File icon theme from an installed extension (`<extension>/<theme>`); '' is the built-in look. */
  iconTheme: string
  /** Shell for the Terminal panel, an id from the detected list ('default', 'pwsh', 'git-bash', 'wsl:Ubuntu', …). */
  terminalShell: string
  /** Spending caps per day, across all projects and per project, in USD; 0 is off. */
  dailyBudgetUsd: number
  projectBudgetUsd: number
  completionEndpoint: string
  /** Set true once the first-run engine onboarding has been dismissed. */
  onboardingSeen?: boolean
  /** A built-in theme, or `plugin:<plugin id>:<theme id>`. */
  theme: 'dark' | 'light' | 'system' | `plugin:${string}`
  voice: VoiceSettings
  /** API keys for outbound services injected into agent environment. */
  connectors: {
    resendKey: string
    posthogKey: string
    posthogHost: string
    sentryDsn: string
    firecrawlKey: string
    stripeKey: string
    e2bKey: string
  }
  /** Chat-first surface for non-technical owners; false (default) keeps the full developer IDE. */
  simpleMode?: boolean
  /** Mirror projects and tasks to the cloud workspace while signed in; undefined means on. */
  cloudSync?: boolean
}

export type ArtifactKind =
  | 'web'
  | 'static'
  | 'node'
  | 'python'
  | 'image'
  | 'document'
  | 'data'
  | 'unknown'

export interface PreviewState {
  projectId: string | null
  kind: ArtifactKind
  label: string
  status: 'off' | 'starting' | 'ready' | 'error' | 'external' | 'manual'
  url: string | null
  command: string
  detail: string
  artifactPath: string | null
  artifactUrl: string | null
  /** Declared packages are missing from disk; start would fail without an install. */
  needsInstall: boolean
  /** The exact install command, shown before it runs. */
  installCommand: string | null
  logs: string[]
  revision: number
  startedAt: number | null
}

export interface Job {
  id: string
  projectId: string
  instruction: string
  status: 'running' | 'done' | 'failed' | 'stopped' | 'paused'
  planSource: 'model' | 'heuristic'
  createdAt: number
  updatedAt: number
  error: string | null
}

export interface Client {
  id: string
  name: string
  url: string
  niche: string
  status: 'prospect' | 'active' | 'review' | 'shipped'
  notes: string
  projectId: string | null
  createdAt: number
  updatedAt: number
}

export interface Snapshot {
  projects: Project[]
  activeProjectId: string | null
  agents: Agent[]
  tasks: Task[]
  messages: Message[]
  events: RunEvent[]
  sessions: SessionRecord[]
  memories: MemoryDoc[]
  modelOutcomes: ModelOutcomeStat[]
  skills: SkillRecord[]
  automations: Automation[]
  providers: ProviderStatus[]
  settings: AppSettings
  jobs: Job[]
  preview: PreviewState
  running: boolean
  /** Planning state for the active project. */
  conversation: Conversation | null
  conversations: Conversation[]
  sessionIndex: Array<{ id: string; projectId: string; title: string }>
  chat: ChatMessage[]
  prompts: PromptDoc[]
  providerConfigs: ProviderConfig[]
  assignments: Assignment[]
  modelPrefs: ModelPrefs
  /** Model options discovered from real providers; never a hardcoded catalogue. */
  models: ModelOption[]
  clients: Client[]
}

export interface StartRunInput {
  projectId: string
  instruction: string
  /** Project-relative paths of attached images (.ventriee/attachments/…). */
  attachments?: string[]
  /** Run profile picked in the command bar; 'website' runs the full client-website pipeline. */
  profile?: RunProfile
  /** Owner's answers to the planner's questions, folded into the brief. */
  clarifications?: Clarification[]
}

export type RunProfile = 'website'

export interface CreateAgentInput {
  projectId: string
  role: string
  name: string
  title: string
  engine: EngineKind
  model: string
  endpoint: string
  instructions: string
  autonomy: Autonomy
  reasoning: ReasoningEffort
  skills?: string[]
  mcpServers?: string[]
  color: string
  budgetUsd: number
}

export interface ChatRequest {
  engine: EngineKind
  model: string
  endpoint: string
  system: string
  prompt: string
  maxTokens?: number
  signal?: AbortSignal
  onDelta?: (text: string) => void
}

/** A file the Project Intelligence Engine judged relevant to a task. */
export interface RetrievedFile {
  path: string
  score: number
}

/** What one incremental index sync changed. `indexed` excludes renames (content unchanged). */
export interface IndexSyncResult {
  indexed: string[]
  removed: string[]
  renamed: Array<{ from: string; to: string }>
  unchanged: number
  total: number
}

/** The bounded context package a worker receives: memory docs plus relevant code. */
export interface CompiledContext {
  files: RetrievedFile[]
  text: string
}
