import { withRules } from './rules'
import { spendBlock, startOfToday } from './spend'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { EventEmitter } from 'node:events'
import type { Store } from './store'
import type { MemoryService } from './memory'
import type { Credentials } from './credentials'
import { runEngine, isCliEngine, modelFor, detectProviders, connectorEnv } from './engines'
import { deliverFiles } from './deliver'
import { Mailbox, parseMessageBlocks } from './mailbox'
import type { CheckpointService } from './checkpoint'
import type { TaskWorktree, WorktreeService } from './worktrees'
import { parseVerdict } from './review'
import { roleByName, MANDATORY_SKILLS, WEBSITE_ROLES, type Phase } from './roles'
import { scopeToRole, DELIVERABLE_BY_ROLE } from './brief'
import { clarifyPrompt, foldClarifications, parseClarifyAnswer } from './clarify'
import { researchBriefUrls } from './urlResearch'
import { estimatePlanCost } from './costEstimate'
import { heuristicPlan, normalizeRole, orderTasks, parsePlanAnswer, pickSpecialists, type Plan } from './planner'
import { promotable } from './queue'
import { approvalTransition } from './approval'
import { routeModel, routeModels, type RouteChoice } from './routing'
import { newId } from './store'
import { redact } from './redact'
import { IntelligenceEngine } from './intelligence'
import { scanProject } from './securityScan'
import { securityDigest } from '../shared/security'
import { visualQa, type VisualQaResult, type VisualQaBrowser } from './visualQa'
import type {
  Clarification,
  Agent,
  RunProfile,
  AssignPromptInput,
  Assignment,
  EngineKind,
  Job,
  ModelOption,
  Project,
  ProviderConfig,
  ReasoningEffort,
  RoutingMode,
  SessionRecord,
  Task
} from '../shared/types'

const exec = promisify(execFile)

export interface OrchestratorDeps {
  store: Store
  memory: MemoryService
  creds: Credentials
  emit: EventEmitter
  notify: () => void
  isProjectOpen: (projectId: string) => boolean
  /** Discovered models, used only when the owner turned routing on. */
  models: () => ModelOption[]
  providerConfigs: () => ProviderConfig[]
  /** Pre-run snapshots; optional so tests can run without Git. */
  checkpoints?: CheckpointService
  /** Per-task Git worktrees for parallel code tasks; optional so tests can run without Git. */
  worktrees?: WorktreeService
  /** Path of the MCP servers file for Claude Code workers, or '' when none are enabled. */
  mcpConfig?: (filter?: string[]) => string
  /** The project's running preview URL, if any, so browser-capable workers can test it. */
  previewUrl?: (projectId: string) => string | null
  /** Sandboxed browser for the visual QA loop; optional so tests can run without Electron. */
  browser?: VisualQaBrowser
}

/** The real automation class satisfies the structural shape the QA loop needs. */

interface Runner {
  controller: AbortController
  sessionId: string
  startedAt: number
}

const STAR = '*'

/** Worker output cap, the larger cap a continuation gets, and how many are allowed. */
const WORKER_MAX_TOKENS = 16000
const WORKER_RETRY_TOKENS = 32000
const WORKER_CONTINUATIONS = 2

/**
 * Ask for the rest of an answer that ran out of room. Repeating the original prompt
 * hits the same wall at the same place: run #20 retried a designer at 16000 then
 * 32000 and both attempts were cut off, because the answer is longer than one reply.
 *
 * The continuation resumes at the exact character where the answer stopped instead of
 * re-sending the open file. Run #21 showed why re-sending cannot work: a single file
 * bigger than one reply restarts from its first line every round, so the answer grew
 * to 112k characters and was still unfinished, because each round had to pay for the
 * whole file again before adding anything. Appending only the new part is additive.
 *
 * shortcut: a break that lands mid-line loses that line's leading whitespace, because
 * replies are trimmed (engines.ts returns text.trim()). Fine for CSS/TS/JSON/HTML,
 * where indentation is cosmetic; if a Python worker ever matters, re-send the marker
 * line approach instead.
 */
function continuePrompt(base: string, sofar: string): string {
  return `${base}

## Continue the same answer, do not start over

Your previous reply was cut off by the output limit, mid-answer. These are its last characters (the studio already has everything before them):

--- BEGIN YOUR LAST WORDS ---
${sofar.slice(-1200)}
--- END YOUR LAST WORDS ---

Resume exactly where it stopped. Do not repeat text from before the cut. If you are continuing a line that had leading whitespace (indentation), reproduce that exact whitespace before your first character.

Resume at exactly the point where that text ends:
- Your reply begins with the characters that come immediately after those last words. Continue the same sentence, line or file.
- Never repeat, re-send or re-open anything you already wrote. Do not print a === FILE: === header for a file that is already open.
- Then finish the file and send any files you had not started yet.
- No preamble, no apology, no summary.`
}

/**
 * Join a continuation onto the answer so far. Two things a model does when told to
 * resume: it continues exactly (append), or it re-echoes the tail it was shown
 * (append, minus the overlap). A model that ignores the instruction and restarts the
 * open file from its header gets the old replace behaviour, so a second `=== FILE: ===`
 * header never ends up buried in a body.
 */
function mergeAnswer(sofar: string, next: string): string {
  const headers = [...sofar.matchAll(/^=+\s*FILE:/gim)].map((m) => m.index ?? 0)
  const ends = [...sofar.matchAll(/^=+\s*END FILE/gim)].map((m) => m.index ?? 0)
  const openAt = headers.length > ends.length ? headers[headers.length - 1] : -1
  const restarts = /^\s*=+\s*FILE:/im.test(next)
  if (openAt >= 0 && restarts) return sofar.slice(0, openAt) + next
  // Drop a repeated tail: the longest suffix of the answer that also opens the
  // continuation. A continuation normally starts with shown text of any length, so
  // the floor is low; it only guards against eating a one- or two-word coincidence.
  const max = Math.min(400, sofar.length, next.length)
  for (let n = max; n >= 8; n--) {
    if (sofar.endsWith(next.slice(0, n))) return sofar + next.slice(n)
  }
  return sofar + next
}

/**
 * Top-level directories each role owns. Two writers may run at once only when
 * their claims share no top-level path; a '*' claim (fixer, deploy) is exclusive.
 * Top-level granularity is deliberate: package.json, tsconfig and lockfiles are
 * shared by everything inside the repo root.
 */
const WRITE_SCOPE: Record<string, string[]> = {
  architect: ['docs'],
  designer: ['docs', 'public', 'styles', 'assets'],
  frontend: ['client', 'web', 'src', 'app', 'pages', 'components', 'public', 'index.html'],
  integration: ['client', 'web', 'src', 'middleware', 'config'],
  backend: ['server', 'api', 'db', 'prisma', 'migrations', 'worker'],
  qa: ['tests', 'e2e', 'test'],
  seo: ['public', 'docs'],
  aeo: ['public', 'docs'],
  fixer: [STAR],
  deployment: [STAR]
}

const scopeFor = (role: string): string[] => WRITE_SCOPE[role] ?? [STAR]

/** Pipeline phase a role naturally belongs to, for manual assignment. */
const ROLE_PHASE: Record<string, string> = {
  researcher: 'research',
  architect: 'architecture',
  designer: 'design',
  frontend: 'build',
  backend: 'build',
  integration: 'integration',
  reviewer: 'review',
  qa: 'qa',
  fixer: 'fix',
  seo: 'seo',
  aeo: 'seo',
  deployment: 'deploy',
  monitoring: 'monitor',
  orchestrator: 'build'
}

const phaseForRole = (role: string): string => ROLE_PHASE[role] ?? 'build'

const topLevel = (p: string) => p.split('/')[0].toLowerCase()

const pathsOverlap = (a: string[], b: string[]) =>
  a.some((x) => b.some((y) => x === STAR || y === STAR || topLevel(x) === topLevel(y)))


export class Orchestrator {
  // shortcut: a run's images live in memory (one active run per project); a retry after an app restart runs without them.
  private images = new Map<string, string[]>()
  private profiles = new Map<string, RunProfile | undefined>()
  private runners = new Map<string, Runner>()
  private paused = new Set<string>()
  private stopping = new Set<string>()
  private mailboxes = new Map<string, Mailbox>()

  private mailbox(project: Project): Mailbox {
    const box = this.mailboxes.get(project.id) ?? new Mailbox(project.path)
    this.mailboxes.set(project.id, box)
    return box
  }

  /** Worker-to-worker mail: from mailbox files (live) or MESSAGE TO blocks (on finish). */
  private relayMail(project: Project, mails: Array<{ to: string; from: string; text: string }>, taskId: string | null = null) {
    if (!mails.length) return
    const team = this.deps.store.agents(project.id)
    const find = (name: string) => team.find((a) => a.name.toLowerCase() === name.toLowerCase() || a.name.replace(/[^A-Za-z0-9_-]/g, '_').toLowerCase() === name.toLowerCase())
    for (const mail of mails.slice(0, 20)) {
      const to = find(mail.to)
      const from = find(mail.from)
      const content = this.safe(mail.text).slice(0, 2000)
      this.deps.store.addMessage({ projectId: project.id, taskId, sender: from?.id ?? mail.from, recipient: to?.id ?? mail.to, type: 'note', content, status: 'unread' })
      this.log(project.id, from?.id ?? null, taskId, 'mail', `${from?.name ?? mail.from} → ${to?.name ?? mail.to}: ${content.slice(0, 160)}`)
    }
  }
  /** Decrypting every stored key on every streamed chunk would be wasteful. */
  private secretCache: { at: number; values: string[] } | null = null

  /** Incremental code index + retrieval; stateless across projects, keyed by project path. */
  private intel = new IntelligenceEngine()

  constructor(private deps: OrchestratorDeps) {}

  private secrets(): string[] {
    const now = Date.now()
    if (!this.secretCache || now - this.secretCache.at > 60_000) {
      this.secretCache = { at: now, values: this.deps.creds.secretValues() }
    }
    return this.secretCache.values
  }

  /** Everything a worker produces passes through here before it is shown or stored. */
  private safe(text: string): string {
    // CLI tools colour their output; those escapes were landing in stored verdicts.
    return redact(text.replace(/\u001b\[[0-9;?]*[A-Za-z]/g, ''), this.secrets())
  }

  /** A new project starts with the orchestrator only; everyone else is hired when a task needs them. */
  ensureRoster(project: Project, _creds?: Credentials): Agent[] {
    const existing = this.deps.store.agents(project.id)
    if (existing.length) return existing
    const orchestrator = this.hire(project, 'orchestrator', existing)
    return orchestrator ? [orchestrator] : []
  }

  /** A role's catalogue template (built-in or the owner's own), enabled or not. */
  private template(role: string) {
    return this.deps.store.agentCatalogue().templates.find((t) => t.role === role)
  }

  private writesCode(role: string): boolean {
    return this.template(role)?.writesCode ?? false
  }

  /** Roles the planner may schedule: enabled workers plus any enabled catalogue template the owner has not switched off in this project. */
  private plannableRoles(roster: Agent[], website = false): string[] {
    const disabled = new Set(roster.filter((a) => !a.enabled).map((a) => a.role))
    const enabled = new Set(roster.filter((a) => a.enabled).map((a) => a.role))
    const hireable = this.deps.store.agentCatalogue().templates.filter((t) => t.enabled).map((t) => t.role).filter((role) => (website || !WEBSITE_ROLES.has(role)) && (!disabled.has(role) || enabled.has(role)))
    return [...new Set([...enabled, ...hireable])]
  }

  /** Create a worker for a template role, on the engine and model the owner configured in Settings. */
  private hire(project: Project, role: string, roster: Agent[]): Agent | null {
    const tpl = this.template(role)
    if (!tpl?.enabled) return null
    const settings = this.deps.store.settings()
    const agent: Agent = {
      id: newId('agt'),
      projectId: project.id,
      role: tpl.role,
      name: tpl.name,
      title: tpl.title,
      engine: tpl.engine || settings.orchestratorEngine,
      model: tpl.engine ? tpl.model : settings.orchestratorModel,
      endpoint: '',
      instructions: tpl.instructions,
      autonomy: tpl.requiresApproval ? 'ask' : 'scoped',
      reasoning: 'auto',
      skills: [...new Set([...tpl.skills, ...MANDATORY_SKILLS])],
      mcpServers: tpl.mcpServers,
      concurrency: 1,
      budgetUsd: tpl.budgetUsd,
      color: tpl.color,
      desk: roster.reduce((max, a) => Math.max(max, a.desk + 1), 0),
      enabled: true,
      status: 'idle',
      currentTaskId: null,
      lastError: null,
      createdAt: Date.now()
    }
    this.deps.store.insertAgent(agent)
    this.deps.memory.bootstrapAgent(agent, project)
    this.log(project.id, agent.id, null, 'plan', `Hired ${agent.name} (${agent.title}) for this run`)
    return agent
  }

  // ------------------------------------------------------------------ planning
  private planningPrompt(project: Project, instruction: string, roster: Agent[], memoryBlock: string, researchBlock = '') {
    const website = this.profiles.get(project.id) === 'website'
    const roles = this.plannableRoles(roster, website).filter((role) => role !== 'orchestrator')
      .map((role) => `${role} (${roster.find((a) => a.role === role)?.title ?? this.template(role)?.title ?? role})`).join(', ')
    const specialists = pickSpecialists(instruction, this.deps.store.skills().filter((s) => s.enabled))
      .map((s) => `- ${s.id}: ${s.description.slice(0, 140)}`).join('\n')
    return `You are planning work for a real software project. Respond with JSON only, no prose.

Project: ${project.name}
Workspace: ${project.path}
Brief from the owner: ${instruction}

Available roles (use these exact role keys): ${roles}

Rules:
- Schedule the smallest team that can actually deliver this brief. Skip roles that add nothing.
- Every task must have testable acceptance criteria.
- Frontend and backend may run in parallel only after the architecture/contract task completes.
- Always end with review, then QA. Add deployment only when the brief implies shipping.
${website ? '- Client website profile: use this order: researcher, then architect (stack recommendation, folder structure, contract), then designer, then database (when there is persistent data), then backend and frontend, then integration, then security, then reviewer, qa and fixer, then seo, then deployment.\n' : ''}- dependsOn uses the task "key" values you define (t1, t2, ...).
- 4 to 12 tasks. Each description is an instruction to a worker, concrete and self-contained.
- Do not include a task for the owner.
- difficulty: "low" for small or mechanical work (copy, docs, simple pages, renames), "high" for architecture, tricky logic, security or review, otherwise "medium". Low tasks may run on cheaper models.
- skills: optional, up to 3 specialist ids from the list below that fit the task; the worker gets their playbooks. Use [] when none fit.

Specialists matching this brief (id: what it does):
${specialists || '(none installed)'}

Relevant stored memory:
${memoryBlock}
${researchBlock ? `\n${researchBlock}\n` : ''}
JSON shape:
{"summary":"one line","tasks":[{"key":"t1","title":"...","description":"...","acceptance":"...","role":"researcher","phase":"research","difficulty":"low","skills":[],"dependsOn":[]}]}`
  }

  private async makePlan(project: Project, instruction: string, roster: Agent[]): Promise<Plan> {
    const orchestrator = roster.find((a) => a.role === 'orchestrator' && a.enabled)
    const website = this.profiles.get(project.id) === 'website'
    const validRoles = this.plannableRoles(roster, website)
    const fallback = this.deps.store.settings().plannerFallback
    const noPlan = (reason: string): Plan => {
      // the fallback names the classic squad's roles; map each onto a role this studio actually has
      if (fallback) { const plan = heuristicPlan(instruction, website); return { ...plan, tasks: plan.tasks.map((t) => ({ ...t, role: normalizeRole(t.role, validRoles) })) } }
      throw new Error(
        `${reason}. The fallback planner is switched off, so nothing was queued. Turn "Fallback planner" on in Settings to let the deterministic planner take over.`
      )
    }
    if (!orchestrator) return noPlan('No enabled orchestrator to plan with')
    const providers = await detectProviders(this.deps.creds)
    const provider = providers.find((p) => p.engine === orchestrator.engine)
    const usable = provider?.available && (isCliEngine(orchestrator.engine) ? true : this.deps.creds.configured(orchestrator.engine))
    if (!usable) {
      this.log(project.id, orchestrator.id, null, 'plan', `Orchestrator engine ${orchestrator.engine} unavailable`)
      return noPlan(`Orchestrator engine ${orchestrator.engine} is unavailable`)
    }
    const memoryDocs = this.deps.memory.retrieve(project.id, instruction, 5)
    const research = this.deps.store.settings().researchUrls
      ? await researchBriefUrls(instruction)
      : { block: '', note: '' }
    if (research.note) this.log(project.id, orchestrator.id, null, 'plan', research.note)
    const result = await runEngine(
      {
        engine: orchestrator.engine,
        model: orchestrator.model,
        endpoint: orchestrator.endpoint,
        system: withRules(orchestrator.instructions, project.path),
        prompt: this.planningPrompt(project, instruction, roster, this.deps.memory.promptBlock(memoryDocs), research.block),
        images: this.images.get(project.id),
        cwd: project.path,
        maxTokens: 3000,
        timeoutMs: 4 * 60 * 1000,
        reasoning: orchestrator.reasoning ?? 'auto'
      },
      this.deps.creds
    )
    if (result.ok) {
      const parsed = parsePlanAnswer(result.text, validRoles)
      if (parsed && parsed.tasks.length) {
        this.log(project.id, orchestrator.id, null, 'plan', `Plan created by ${orchestrator.engine} with ${parsed.tasks.length} tasks`)
        return { ...parsed, summary: parsed.summary }
      }
      this.log(project.id, orchestrator.id, null, 'plan', 'Model plan was unusable')
      return noPlan('The planner answered, but its reply was not a usable plan')
    }
    this.log(project.id, orchestrator.id, null, 'plan', `Planner failed (${result.error ?? 'unknown'})`)
    return noPlan(`The planner failed (${result.error ?? 'unknown error'})`)
  }

  /**
   * Questions the planner wants answered before it plans. Never blocks a run: off,
   * no usable orchestrator (the heuristic planner would plan) or any failure means [].
   */
  async clarify(projectId: string, brief: string): Promise<Clarification[]> {
    const project = this.deps.store.project(projectId)
    if (!project || !brief.trim() || !this.deps.store.settings().clarifyBrief) return []
    const orchestrator = this.ensureRoster(project, this.deps.creds).find((a) => a.role === 'orchestrator' && a.enabled)
    if (!orchestrator) return []
    try {
      const provider = (await detectProviders(this.deps.creds)).find((p) => p.engine === orchestrator.engine)
      if (!provider?.available || !(isCliEngine(orchestrator.engine) || this.deps.creds.configured(orchestrator.engine))) return []
      const result = await runEngine(
        {
          engine: orchestrator.engine,
          model: orchestrator.model,
          endpoint: orchestrator.endpoint,
          system: withRules(orchestrator.instructions, project.path),
          prompt: clarifyPrompt(brief),
          cwd: project.path,
          maxTokens: 800,
          timeoutMs: 90 * 1000,
          reasoning: orchestrator.reasoning ?? 'auto'
        },
        this.deps.creds
      )
      return result.ok ? parseClarifyAnswer(result.text) : []
    } catch {
      return []
    }
  }

  // ------------------------------------------------------------------ run
  async startRun(projectId: string, instruction: string, images: string[] = [], profile?: RunProfile): Promise<string> {
    const project = this.deps.store.project(projectId)
    if (!project) throw new Error('Project not found')
    if (this.deps.store.runningJob(projectId)) throw new Error('A run is already active for this project')
    if (!existsSync(project.path)) throw new Error(`Project workspace does not exist: ${project.path}`)
    // Stopping belongs to one run. A stop that lands while nothing is active (or
    // just after the previous queue drained) must not poison the next run: run #23
    // left the flag set and the following assignment queued work that never started.
    this.stopping.delete(projectId)
    this.images.set(projectId, images)
    this.profiles.set(projectId, profile)

    const roster = this.ensureRoster(project, this.deps.creds)
    const job: Job = {
      id: newId('job'),
      projectId,
      instruction,
      status: 'running',
      planSource: 'heuristic',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      error: null
    }
    this.deps.store.insertJob(job)
    this.deps.notify()
    void this.executeJob(job, project, roster, instruction)
    return job.id
  }

  private async executeJob(job: Job, project: Project, roster: Agent[], instruction: string) {
    try {
      const plan = await this.makePlan(project, instruction, roster)
      this.deps.store.updateJob(job.id, { planSource: plan.source })
      const assigned = this.persistPlan(project, plan, roster)
      this.deps.store.addMessage({
        projectId: project.id,
        taskId: null,
        sender: 'orchestrator',
        recipient: 'owner',
        type: 'note',
        content: `${plan.summary}\n\n${assigned} tasks queued (${plan.source} plan).${plan.skipped.length ? `\nSkipped: ${plan.skipped.join('; ')}` : ''}\n\n${estimatePlanCost(plan.tasks, this.deps.store.roleCostStats()).text}`.trimEnd(),
        status: 'read'
      })
      const ended = await this.runQueue(job, project)
      const failed = this.deps.store.tasks(project.id).filter((t) => t.status === 'failed' || t.status === 'rework')
      this.deps.store.updateJob(job.id, {
        status: this.stopping.has(project.id)
          ? 'stopped'
          : failed.length
            ? 'failed'
            : ended === 'paused'
              ? 'paused'
              : 'done',
        error: failed.length ? `${failed.length} task(s) need attention` : ended === 'paused' ? 'Remaining tasks belong to paused workers' : null
      })
      if (!failed.length && ended !== 'paused' && this.deps.store.settings().autoExtractLessons) this.extractLessons(project)
      this.deps.store.addMessage({
        projectId: project.id,
        taskId: null,
        sender: 'orchestrator',
        recipient: 'owner',
        type: 'note',
        content: failed.length
          ? `Run finished with ${failed.length} unfinished task(s): ${failed.map((t) => t.title).join('; ')}`
          : ended === 'paused'
            ? 'Run paused: every remaining task belongs to a paused worker.'
            : 'Run complete. Every task passed its evidence check.',
        status: 'read'
      })
    } catch (error) {
      this.deps.store.updateJob(job.id, { status: 'failed', error: (error as Error).message })
      this.log(job.projectId, null, null, 'error', `Run failed: ${(error as Error).message}`)
    } finally {
      this.stopping.delete(project.id)
      for (const agent of this.deps.store.agents(project.id)) {
        if (agent.status === 'working') this.deps.store.updateAgent(agent.id, { status: 'idle', currentTaskId: null })
      }
      this.deps.notify()
    }
  }

  private persistPlan(project: Project, plan: Plan, roster: Agent[]): number {
    const ordered = orderTasks(plan.tasks)
    const keyToId = new Map<string, string>()
    for (const planned of ordered) {
      let agent = roster.find((a) => a.role === planned.role && a.enabled)
      if (!agent && !roster.some((a) => a.role === planned.role)) {
        agent = this.hire(project, planned.role, roster) ?? undefined
        if (agent) roster.push(agent)
      }
      const id = newId('tsk')
      keyToId.set(planned.key, id)
      this.deps.store.insertTask({
        id,
        projectId: project.id,
        parentId: null,
        title: planned.title,
        description: planned.description,
        acceptance: planned.acceptance,
        role: planned.role,
        agentId: agent?.id ?? null,
        status: planned.dependsOnKeys.length && this.deps.store.settings().runMode !== 'parallel' ? 'blocked' : 'ready',
        dependsOn: [],
        output: '',
        review: '',
        attempts: 0,
        phase: planned.phase ?? 'build',
        engine: null,
        model: null,
        endpoint: null,
        routedBy: null,
        difficulty: planned.difficulty ?? null,
        skills: planned.skills ?? [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      })
    }
    for (const planned of ordered) {
      const id = keyToId.get(planned.key)
      if (!id) continue
      const deps = planned.dependsOnKeys.map((k) => keyToId.get(k)).filter((v): v is string => Boolean(v))
      this.deps.store.updateTask(id, {
        dependsOn: deps,
        status: deps.length ? 'blocked' : 'ready'
      })
    }
    return ordered.length
  }

  private async runQueue(job: Job, project: Project): Promise<'done' | 'paused'> {
    // Snapshot the folder before any worker touches it, once per run, so the owner can undo the run.
    const checkpoints = this.deps.checkpoints
    if (checkpoints) {
      try {
        if (!(await checkpoints.has(project.id, project.path, job.id))) {
          await checkpoints.create(project.id, project.path, job.id, `Before run: ${job.instruction.slice(0, 120)}`)
          this.log(project.id, null, null, 'checkpoint', 'Saved a checkpoint of the project; this run can be undone from Runs')
        }
      } catch (error) {
        this.log(project.id, null, null, 'error', `Could not save a checkpoint, so this run cannot be undone automatically: ${(error as Error).message}`)
      }
    }
    const settings = this.deps.store.settings()
    // Sequential runs one task at a time in plan order; the other modes share the session limit.
    const maxSessions = settings.runMode === 'sequential' ? 1 : Math.max(1, settings.maxConcurrentSessions)
    const inflight = new Map<string, Promise<void>>()
    /** Path claims of the writers currently running; an isolated writer works in its own worktree. */
    const claims: Array<{ taskId: string; scope: string[]; isolated: boolean }> = []
    // Writers in their own worktrees can run at once whatever they touch; without one they share the folder and wait on path claims.
    let isolate = false
    if (this.deps.worktrees && settings.isolateCodeTasks && maxSessions > 1) {
      const why = await this.deps.worktrees.unavailable(project.path).catch((error: Error) => error.message)
      isolate = !why
      this.log(project.id, null, null, 'note', why ? `Code tasks share the project folder and run one at a time where they overlap: ${why}` : 'Parallel code tasks each run in their own Git worktree and merge back once they pass')
    }
    let outcome: 'done' | 'paused' = 'done'

    for (;;) {
      if (this.stopping.has(project.id)) break
      try { this.relayMail(project, this.mailbox(project).collect()) } catch { /* mail is best effort; the run goes on */ }
      const tasks = this.deps.store.tasks(project.id)

      // Promote satisfied dependencies before reading the queue: a task whose
      // deps just finished must be schedulable in this same pass, otherwise a
      // chain ends when its first task completes.
      for (const task of promotable(tasks)) {
        this.deps.store.updateTask(task.id, { status: 'ready' })
        task.status = 'ready'
        this.deps.notify()
      }

      const pending = tasks.filter(
        (t) =>
          (t.status === 'ready' || t.status === 'todo' || t.status === 'rework') &&
          t.attempts < 3 &&
          // brief cooldown so a failing engine is not retried in a tight loop
          (t.status !== 'rework' || Date.now() - t.updatedAt > 4000)
      )
      const exhausted = tasks.filter((t) => t.status === 'rework' && t.attempts >= 3)
      for (const task of exhausted) {
        this.deps.store.updateTask(task.id, { status: 'failed', review: `Retry limit reached. ${task.review}` })
        this.log(project.id, task.agentId, task.id, 'error', `"${task.title}" hit the retry limit and needs the owner`)
      }
      const active = tasks.filter((t) => ['running', 'review', 'approval'].includes(t.status))

      // A rework still in its cooldown is not finished: without this a lone conflict rework ended the run instead of retrying.
      const cooling = tasks.some((t) => t.status === 'rework' && t.attempts < 3)
      if (!pending.length && !active.length && !cooling && inflight.size === 0) break

      for (const task of pending) {
        if (inflight.size >= maxSessions) break
        if (inflight.has(task.id)) continue
        const agent = task.agentId ? this.deps.store.agent(task.agentId) : null
        if (!agent || !agent.enabled) {
          this.deps.store.updateTask(task.id, {
            status: 'failed',
            review: agent ? 'Assigned worker is disabled' : 'No worker available for this role'
          })
          this.log(project.id, null, task.id, 'error', `No enabled worker for role "${task.role}"`)
          continue
        }
        if (this.paused.has(agent.id)) continue
        if (agent.status === 'working' || this.runners.has(agent.id)) continue
        const cap = spendBlock((p) => this.deps.store.spendSince(startOfToday(), p), this.deps.store.settings(), project.id)
        if (cap) {
          this.deps.store.updateTask(task.id, { status: 'failed', review: cap })
          this.log(project.id, agent.id, task.id, 'error', cap)
          continue
        }
        // Budget is a hard stop on reported spend. Engines that do not report
        // cost leave it at 0, so this gates Claude/OpenAI-style runs only.
        if (agent.budgetUsd > 0) {
          const spent = this.deps.store.agentSpend(agent.id)
          if (spent >= agent.budgetUsd) {
            this.deps.store.updateTask(task.id, {
              status: 'failed',
              review: `Budget reached: $${spent.toFixed(2)} of $${agent.budgetUsd.toFixed(2)} spent by ${agent.name}. Raise the budget or reassign.`
            })
            this.deps.store.updateAgent(agent.id, {
              status: 'error',
              lastError: `Budget of $${agent.budgetUsd.toFixed(2)} reached`
            })
            this.log(project.id, agent.id, task.id, 'error', `${agent.name} hit its $${agent.budgetUsd.toFixed(2)} budget`)
            continue
          }
        }
        const scope = scopeFor(agent.role)
        const writes = this.writesCode(agent.role)
        let workspace: TaskWorktree | null = null
        if (writes && isolate) {
          try {
            workspace = await this.deps.worktrees!.create(project.id, project.path, task.id)
          } catch (error) {
            isolate = false
            this.log(project.id, agent.id, task.id, 'error', `Could not create a worktree, so the remaining code tasks run in the project folder: ${(error as Error).message}`)
          }
        }
        // An in-place writer would dirty the folder isolated work merges into, so it waits for those too.
        if (writes && !workspace && claims.some((c) => c.isolated || pathsOverlap(c.scope, scope))) continue
        // Non-writing roles still read the whole tree; they never block a writer.
        const claim = writes ? { taskId: task.id, scope, isolated: Boolean(workspace) } : null
        if (claim) claims.push(claim)
        const depTasks = task.dependsOn.map((d) => this.deps.store.task(d)).filter((t): t is Task => Boolean(t))
        const context = depTasks.map((d) => `- ${d.title}: ${d.output ? d.output.slice(0, 600) : '(delivered)'}`).join('\n')
        const promise = this.runTask(project, task, agent, context, workspace)
          .catch((error) => {
            this.deps.store.updateTask(task.id, { status: 'failed', review: (error as Error).message })
            this.log(project.id, agent.id, task.id, 'error', (error as Error).message)
          })
          .finally(async () => {
            if (workspace) await this.releaseWorktree(project, workspace)
            inflight.delete(task.id)
            const index = claims.findIndex((c) => c.taskId === task.id)
            if (index >= 0) claims.splice(index, 1)
            this.deps.notify()
          })
        inflight.set(task.id, promise)
      }

      if (!inflight.size && pending.length) {
        // nothing schedulable and nothing running: prevent a silent stall
        const stillReady = this.deps.store.tasks(project.id).filter((t) => ['ready', 'rework', 'todo'].includes(t.status))
        if (stillReady.length) {
          const pausedOnly = stillReady.every((t) => (t.agentId ? this.paused.has(t.agentId) : false))
          if (pausedOnly) {
            outcome = 'paused'
            break
          }
        }
      }
      await Promise.race([...inflight.values(), delay(400)])
    }

    await Promise.allSettled([...inflight.values()])
    return outcome
  }

  /** Relay mail a worker left in its worktree, then delete the worktree (and its branch unless kept). */
  private async releaseWorktree(project: Project, workspace: TaskWorktree) {
    try { this.relayMail(project, new Mailbox(workspace.path).collect(), workspace.taskId) } catch { /* mail is best effort */ }
    try {
      await this.deps.worktrees!.remove(project.path, workspace)
      this.log(project.id, null, workspace.taskId, 'note', workspace.keepBranch ? `Removed worktree; the work stays on branch ${workspace.branch}` : `Removed worktree and branch ${workspace.branch}`)
    } catch (error) {
      this.log(project.id, null, workspace.taskId, 'error', `Could not remove worktree ${workspace.path}: ${(error as Error).message}`)
    }
  }

  // ------------------------------------------------------------------ task execution
  private async runTask(project: Project, task: Task, agent: Agent, dependencyContext: string, workspace: TaskWorktree | null = null) {
    // Where this task's worker reads and writes: its own worktree, or the project folder.
    const cwd = workspace?.path ?? project.path
    if (workspace) this.log(project.id, agent.id, task.id, 'note', `"${task.title}" runs in worktree ${workspace.path} on branch ${workspace.branch}`)
    this.deps.store.updateTask(task.id, {
      status: 'running',
      agentId: agent.id,
      attempts: task.attempts + 1
    })
    this.deps.store.updateAgent(agent.id, { status: 'working', currentTaskId: task.id, lastError: null })
    this.deps.notify()

    const memoryDocs = this.deps.memory.retrieve(project.id, `${task.title} ${task.description}`, 6)
    // Project Intelligence: index the workspace and fold the minimum relevant code
    // into the memory block, so the worker gets real context, not just memory docs.
    let contextBlock = memoryDocs.length ? this.deps.memory.promptBlock(memoryDocs) : ''
    try {
      this.intel.sync(project.path)
      const compiled = this.intel.compile(project.path, {
        query: `${task.title} ${task.description} ${task.acceptance}`,
        memoryBlock: contextBlock
      })
      contextBlock = compiled.text
    } catch (error) {
      // Retrieval is an enhancement, never a gate: a worker still runs on memory alone.
      this.log(project.id, agent.id, task.id, 'error', `Code retrieval skipped: ${(error as Error).message}`)
    }
    const team = this.deps.store.agents(project.id).filter((a) => a.enabled && a.id !== agent.id)
    const inbox = this.deps.store.messages(project.id).filter((m) => m.recipient === agent.id && m.status === 'unread').slice(-8)
    // Offer this worker the skills bound to it, not the first N of the registry.
    // An empty binding means "use the role template's list", so a new worker is
    // useful before the owner touches its config.
    const wanted = new Set([...MANDATORY_SKILLS, ...(agent.skills.length ? agent.skills : this.template(agent.role)?.skills ?? []), ...(task.skills ?? [])])
    const skills = this.deps.store.skills().filter((s) => s.enabled && wanted.has(s.id))
    const before = await this.evidenceDigest(cwd)
    const sessionId = newId('ses')
    const controller = new AbortController()
    this.runners.set(agent.id, { controller, sessionId, startedAt: Date.now() })

    // Automatic routing picks per task, so an easy task can run on a cheaper model than a hard one.
    const run = { engine: agent.engine, model: agent.model, endpoint: agent.endpoint }
    const settings = this.deps.store.settings()
    // The ranked candidate chain; the run loop below escalates to the next entry when a model fails.
    const runFromChoice = (choice: RouteChoice) => {
      const config = this.deps.providerConfigs().find((p) => p.id === choice.option.provider)
      return { engine: (config?.engine ?? choice.option.provider) as EngineKind, model: choice.option.model, endpoint: config?.baseUrl ?? '' }
    }
    let chain: RouteChoice[] = []
    if (settings.routingMode === 'automatic' || (settings.routingMode === 'hybrid' && !agent.model.trim())) {
      try {
        chain = routeModels({ role: task.role, models: this.deps.models(), costPreference: settings.costPreference, difficulty: task.difficulty, profiles: settings.modelProfiles, outcomes: this.deps.store.modelOutcomeStats() })
      } catch (err) {
        // Fail fast: burning three retries on a model that cannot code helps nobody.
        const message = err instanceof Error ? err.message : 'Routing failed'
        this.deps.store.updateTask(task.id, { status: 'blocked' })
        this.deps.store.updateAgent(agent.id, { status: 'idle', currentTaskId: null, lastError: message })
        this.log(project.id, agent.id, task.id, 'error', message)
        this.deps.notify()
        return
      }
      if (chain[0]) {
        Object.assign(run, runFromChoice(chain[0]))
        this.deps.store.updateTask(task.id, { ...run, routedBy: settings.routingMode })
        this.log(project.id, agent.id, task.id, 'plan', `Routed "${task.title}" to ${run.model}: ${chain[0].reason}${chain.length > 1 ? ` (+${chain.length - 1} fallback${chain.length > 2 ? 's' : ''})` : ''}`)
      }
    }

    const session: SessionRecord = {
      id: sessionId,
      projectId: project.id,
      agentId: agent.id,
      taskId: task.id,
      engine: run.engine,
      model: run.model,
      cwd,
      reasoning: agent.reasoning ?? 'auto',
      status: 'running',
      exitCode: null,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      externalId: null,
      command: '',
      startedAt: Date.now(),
      endedAt: null
    }
    this.deps.store.insertSession(session)
    this.deps.notify()

    const timeoutMs = Math.max(2, this.deps.store.settings().sessionTimeoutMinutes) * 60 * 1000
    // Security workers get real scanner findings, so they verify patterns instead of guessing.
    let securityBlock = ''
    if (agent.role === 'security') {
      try {
        securityBlock = `## Read-only security scan (already run for you)\n${securityDigest(await scanProject(cwd))}\n\nVerify each finding, fix the real ones, and extend this list with what patterns cannot catch. Do not treat an empty list as proof the project is secure.\n\n`
      } catch (error) {
        this.log(project.id, agent.id, task.id, 'error', `Security scan skipped: ${(error as Error).message}`)
      }
    }
    let prompt = this.taskPrompt({ ...project, path: cwd }, task, { ...agent, ...run }, team, contextBlock, dependencyContext, inbox, skills, securityBlock)
    const url = this.deps.previewUrl?.(project.id)
    if (url && run.engine === 'cli-claude' && this.deps.store.settings().mcpServers.some((m) => m.name === 'playwright' && m.enabled)) {
      prompt += `\n\nThe app is running at ${url}. If you change anything visible, open it with the Playwright browser tools, click through what you changed, and take a screenshot of the result before you finish.`
    }

    const effort = agent.reasoning ?? 'auto'
    // The cap the last attempt actually ran with, for the failure messages below.
    let capUsed = WORKER_MAX_TOKENS
    // One attempt per session row, so a retry is visible in history instead of hidden.
    const runOnce = async (runSessionId: string, reasoning: ReasoningEffort, cap: number, ask = prompt) => {
      capUsed = cap
      const outcome = await runEngine(
        {
          engine: run.engine,
          model: run.model,
          endpoint: run.endpoint,
          mcpConfig: run.engine === 'cli-claude' ? this.deps.mcpConfig?.(agent.mcpServers?.length ? agent.mcpServers : undefined) || undefined : undefined,
          env: connectorEnv(this.deps.store.settings().connectors),
          system: withRules(agent.instructions, project.path),
          prompt: ask,
          images: this.images.get(project.id),
          cwd,
          // Room for a thinking model to plan before it writes, and for a
          // file-heavy deliverable to finish. Probes: 8000 produced nothing on a
          // full brief; 16000 is enough for a light one but a design system still
          // exhausts it. Treat as headroom, not a fix. Re-probe before changing.
          maxTokens: cap,
          timeoutMs,
          reasoning,
          signal: controller.signal,
          onChunk: (chunk) => {
            this.deps.emit.emit('output', { sessionId: runSessionId, agentId: agent.id, taskId: task.id, chunk: this.safe(chunk) })
          }
        },
        this.deps.creds
      )
      this.deps.store.updateSession(runSessionId, {
        // A reasoning-only reply is a plan, not a delivery: never record it as done.
        // A truncated reply is half a file: also not a delivery.
        status:
          outcome.ok && !outcome.reasoningOnly && !outcome.truncated
            ? 'done'
            : controller.signal.aborted
              ? 'stopped'
              : 'failed',
        exitCode: outcome.ok && !outcome.reasoningOnly && !outcome.truncated ? 0 : 1,
        inputTokens: outcome.inputTokens,
        outputTokens: outcome.outputTokens,
        costUsd: outcome.costUsd,
        externalId: outcome.externalId,
        command: this.safe(outcome.command),
        endedAt: Date.now()
      })
      return outcome
    }

    // Try the routed candidates in order, escalating to the next only when a model
    // hard-fails (engine error, model unavailable). The reasoning-off and truncation
    // retries below stay per-model, so one model is never retried more than before.
    let result!: Awaited<ReturnType<typeof runOnce>>
    let whole = ''
    const attempts = Math.max(chain.length, 1)
    for (let ci = 0; ci < attempts; ci++) {
      let attemptSessionId = sessionId
      if (ci > 0) {
        Object.assign(run, runFromChoice(chain[ci]!))
        attemptSessionId = newId('ses')
        this.deps.store.insertSession({ ...session, id: attemptSessionId, engine: run.engine, model: run.model, startedAt: Date.now() })
        this.deps.store.updateTask(task.id, { ...run, routedBy: settings.routingMode })
        this.log(project.id, agent.id, task.id, 'plan', `Escalated "${task.title}" to fallback ${run.model}: ${chain[ci]!.reason}`)
      }

      result = await runOnce(attemptSessionId, effort, WORKER_MAX_TOKENS)
      // Probes on Deploy: 'none' delivers files in seconds, while low/minimal/absent all
      // burn the whole budget thinking. Some models keep thinking even with it off (a
      // probe of Deploy's GLM 5.3 flash: 50 of 53 tokens were reasoning), so the one
      // automatic retry also gets twice the output room: the thinking fits and the answer
      // still comes after it. It runs even when the worker is already set to Off. CLI
      // engines are skipped: they manage their own loop and the flag differs per tool.
      if (result.ok && result.reasoningOnly && !isCliEngine(run.engine)) {
        const retryId = newId('ses')
        this.deps.store.insertSession({ ...session, id: retryId, engine: run.engine, model: run.model, reasoning: 'none', startedAt: Date.now() })
        this.log(
          project.id,
          agent.id,
          task.id,
          'note',
          `${agent.name}'s model spent its budget reasoning; retrying once with thinking off and ${WORKER_RETRY_TOKENS} tokens of room`
        )
        this.deps.store.addMessage({
          projectId: project.id,
          taskId: task.id,
          sender: agent.id,
          recipient: 'orchestrator',
          type: 'note',
          content: `${agent.name}'s first attempt produced only reasoning. Retried with thinking off and a ${WORKER_RETRY_TOKENS}-token output limit.${effort === 'none' ? ' This model thinks even when told not to; a model without built-in thinking avoids the extra session.' : ' Set "Off" on this worker in Settings to avoid the extra session.'}`,
          status: 'read'
        })
        result = await runOnce(retryId, 'none', WORKER_RETRY_TOKENS)
      }
      // A reply cut off at the cap is half a deliverable. Repeating the prompt just hits
      // the same wall, and a bigger budget only moves it: run #20 retried a designer at
      // 16000 then 32000 and both were cut off. So ask for the remainder instead and
      // stitch the parts together, keeping every finished file. CLI engines run their own
      // loop and their own budget.
      whole = result.text
      for (
        let part = 0;
        result.ok && result.truncated && !result.reasoningOnly && !isCliEngine(run.engine) && part < WORKER_CONTINUATIONS;
        part++
      ) {
        const retryId = newId('ses')
        this.deps.store.insertSession({ ...session, id: retryId, engine: run.engine, model: run.model, reasoning: effort, startedAt: Date.now() })
        this.log(
          project.id,
          agent.id,
          task.id,
          'note',
          `${agent.name}'s reply was cut off; asking for the rest (${part + 1} of ${WORKER_CONTINUATIONS})`
        )
        this.deps.store.addMessage({
          projectId: project.id,
          taskId: task.id,
          sender: agent.id,
          recipient: 'orchestrator',
          type: 'note',
          content: `${agent.name}'s reply was cut off at the ${capUsed}-token output limit. Asked it to continue from where it stopped, keeping the ${whole.length} characters already produced.`,
          status: 'read'
        })
        result = await runOnce(retryId, effort, WORKER_RETRY_TOKENS, continuePrompt(prompt, whole))
        if (!result.reasoningOnly) whole = mergeAnswer(whole, result.text)
      }

      // A clean run, or no fallback left: stop here and let the handling below decide.
      if (result.ok || ci >= attempts - 1) break
      if (!controller.signal.aborted) this.deps.store.recordModelOutcome(task.id, agent.id, 'failed')
      this.log(project.id, agent.id, task.id, 'note', `${agent.name}'s model ${run.model} failed (${this.safe(result.error ?? 'engine error')}); escalating to the next routed model`)
    }
    // Redact once: everything downstream (task output, mail, review) reads this.
    // A continued answer is only whole when its parts are joined: the last reply is
    // the remainder, not the deliverable.
    const text = this.safe(whole)
    // HTTP models never touched disk; the studio did, so record what it wrote.
    // Reasoning text is a plan and a truncated reply is half a file: never write either.
    const written =
      result.ok && !result.reasoningOnly && !result.truncated && !isCliEngine(run.engine)
        ? deliverFiles(cwd, text)
        : []

    this.runners.delete(agent.id)

    if (!result.ok) {
      const error = this.safe(result.error ?? 'Session failed')
      this.deps.store.updateAgent(agent.id, { status: 'error', lastError: error, currentTaskId: null })
      this.deps.store.updateTask(task.id, {
        status: 'rework',
        review: `Worker reported failure: ${error}. ${text.slice(-800)}`
      })
      if (!controller.signal.aborted) this.deps.store.recordModelOutcome(task.id, agent.id, 'failed')
      this.deps.store.addMessage({
        projectId: project.id,
        taskId: task.id,
        sender: agent.id,
        recipient: 'orchestrator',
        type: 'blocker',
        content: `Task "${task.title}" failed: ${error}. Output tail: ${text.slice(-500)}`,
        status: 'unread'
      })
      this.log(project.id, agent.id, task.id, 'error', `${agent.name} failed: ${error}`)
      this.deps.notify()
      return
    }

    // A thinking model that spent its whole budget planning produced no deliverable.
    // Retrying the same config just burns another session, so fail with the cause.
    if (result.reasoningOnly) {
      const why = `${agent.name}'s model spent its whole ${capUsed}-token output budget reasoning and never produced an answer. Pick a model without extended thinking for worker roles, or split the brief into smaller tasks.`
      this.deps.store.updateAgent(agent.id, { status: 'error', lastError: why, currentTaskId: null })
      this.deps.store.updateTask(task.id, { status: 'failed', review: `No answer: ${why}` })
      this.deps.store.recordModelOutcome(task.id, agent.id, 'failed')
      this.deps.store.addMessage({
        projectId: project.id,
        taskId: task.id,
        sender: agent.id,
        recipient: 'orchestrator',
        type: 'blocker',
        content: `Task "${task.title}" got no answer. ${why}`,
        status: 'unread'
      })
      this.log(project.id, agent.id, task.id, 'error', `${agent.name} produced reasoning but no answer`)
      this.deps.notify()
      return
    }

    // A reply that stopped at the output cap is half a deliverable. Writing it would
    // put a syntactically broken file in the workspace and call it done (a real run
    // shipped a 1061-byte styles.css with an unterminated `:root {`), so fail here.
    if (result.truncated) {
      const why = `${agent.name}'s model stopped at its ${capUsed}-token output limit, so its reply is incomplete and was not written. Split the task into smaller pieces.`
      this.deps.store.updateAgent(agent.id, { status: 'error', lastError: why, currentTaskId: null })
      this.deps.store.updateTask(task.id, { status: 'failed', review: `Incomplete answer: ${why}` })
      this.deps.store.recordModelOutcome(task.id, agent.id, 'failed')
      this.deps.store.addMessage({
        projectId: project.id,
        taskId: task.id,
        sender: agent.id,
        recipient: 'orchestrator',
        type: 'blocker',
        content: `Task "${task.title}" was cut off mid-answer. ${why}`,
        status: 'unread'
      })
      this.log(project.id, agent.id, task.id, 'error', `${agent.name} hit the output limit mid-answer`)
      this.deps.notify()
      return
    }

    const after = await this.evidenceDigest(cwd)
    const evidence = this.checkEvidence(task, before, after, text, written)
    const outgoing = parseMessageBlocks(text).map((m) => ({ ...m, from: agent.name }))
    this.relayMail(project, outgoing, task.id)
    for (const mail of outgoing) { try { this.mailbox(project).deliver(mail) } catch { /* the Mail tab still has it */ } }
    if (written.length) {
      evidence.summary = `${evidence.summary} (studio wrote ${written.slice(0, 5).join(', ')})`
    }

    this.deps.store.updateTask(task.id, {
      output: text.slice(-6000),
      changedFiles: [...evidence.changed.map((path) => ({ path, removed: false })), ...evidence.removed.map((path) => ({ path, removed: true }))]
        .slice(0, 500).map((f) => ({ ...f, path: f.path.replace(/\\/g, '/') }))
    })
    this.deps.store.addMessage({
      projectId: project.id,
      taskId: task.id,
      sender: agent.id,
      recipient: 'orchestrator',
      type: 'handover',
      content: `Delivered "${task.title}".\nEvidence: ${evidence.summary}\n\n${text.slice(-1200)}`,
      status: 'unread'
    })

    for (const msg of inbox) this.deps.store.db.run('UPDATE messages SET status = ? WHERE id = ?', 'read', msg.id)

    this.deps.store.updateAgent(agent.id, { status: 'idle', currentTaskId: null })
    this.log(project.id, agent.id, task.id, 'task', `${agent.name} delivered "${task.title}" (${evidence.summary})`)

    if (this.writesCode(agent.role) && !evidence.passed) {
      const how = isCliEngine(run.engine)
        ? `Produce the actual deliverable in ${cwd}, then report back.`
        : 'Reply with the deliverable as === FILE: … === blocks and nothing else outside them.'
      this.deps.store.updateTask(task.id, { status: 'rework', review: `Evidence check failed: ${evidence.summary}` })
      this.deps.store.recordModelOutcome(task.id, agent.id, 'rework')
      this.deps.store.addMessage({
        projectId: project.id,
        taskId: task.id,
        sender: 'orchestrator',
        recipient: agent.id,
        type: 'request',
        content: `Evidence check failed: ${evidence.summary}. ${how}`,
        status: 'unread'
      })
      return
    }

    // Merge before deploy approval, visual QA and review: the preview, the reviewer and the owner all look at the project folder.
    if (workspace) {
      const merge = await this.deps.worktrees!.integrate(project.path, workspace, task.title)
      this.log(project.id, agent.id, task.id, merge.ok ? 'task' : 'error', `Worktree ${workspace.branch}: ${merge.detail}`)
      if (!merge.ok) {
        const review = merge.conflicts.length
          ? `Merge conflict with work already integrated, in ${merge.conflicts.join(', ')}. Nothing was forced; redo the task on top of the latest project.`
          : `Not merged: ${merge.detail}`
        this.deps.store.updateTask(task.id, { status: merge.conflicts.length ? 'rework' : 'failed', review })
        this.deps.store.addMessage({ projectId: project.id, taskId: task.id, sender: 'orchestrator', recipient: merge.conflicts.length ? agent.id : 'owner', type: 'request', content: review, status: 'unread' })
        return
      }
    }

    const approval = task.phase === 'deploy' && this.deps.store.settings().requireDeployApproval
    if (approval || this.template(agent.role)?.requiresApproval) {
      this.deps.store.updateTask(task.id, { status: 'approval', review: `Awaiting owner approval. ${evidence.summary}` })
      this.log(project.id, agent.id, task.id, 'approval', approval ? `Deployment staged, waiting for owner approval` : `${agent.name}'s work is waiting for owner approval`)
      return
    }

    // Visual QA: frontend deliverables are judged on the rendered app, not the diff.
    let visual: VisualQaResult | null = null
    if (agent.role === 'frontend') {
      const url = this.deps.previewUrl?.(project.id)
      if (url && this.deps.browser) {
        try {
          visual = await visualQa(this.deps.browser, url, '')
          this.log(project.id, agent.id, task.id, 'review', `Visual QA: ${visual.summary}`)
          if (!visual.ok) {
            const detail = visual.problems.slice(0, 4).join(' | ')
            this.deps.store.updateTask(task.id, { status: 'rework', review: `Visual QA failed: ${detail}. ${evidence.summary}` })
            this.deps.store.recordModelOutcome(task.id, agent.id, 'rework')
            this.deps.store.addMessage({
              projectId: project.id,
              taskId: task.id,
              sender: 'orchestrator',
              recipient: agent.id,
              type: 'request',
              content: `The rendered app has problems: ${detail}. Fix them in the workspace and deliver again.`,
              status: 'unread'
            })
            return
          }
        } catch (error) {
          this.log(project.id, agent.id, task.id, 'error', `Visual QA skipped: ${(error as Error).message}`)
        }
      } else {
        this.log(project.id, agent.id, task.id, 'review', 'Visual QA skipped: no running preview or browser')
      }
    }

    this.deps.store.updateTask(task.id, { status: 'review', review: visual?.ok ? `Visual QA passed: ${visual.summary}` : undefined })
    await this.reviewTask(project, task.id, agent, {
      ...evidence,
      // The reviewer judges the rendered app too, not just the diff.
      summary: visual?.ran ? `${evidence.summary} Visual QA: ${visual.summary}` : evidence.summary
    })
    this.deps.notify()
  }

  private taskPrompt(
    project: Project,
    task: Task,
    agent: Agent,
    team: Agent[],
    memoryBlock: string,
    dependencyContext: string,
    inbox: Array<{ sender: string; content: string }>,
    skills: Array<{ name: string; description: string; path: string }>,
    securityBlock = ''
  ) {
    const roster = team.map((a) => `- ${a.name} (${a.role}, ${a.title})`).join('\n')
    // A CLI session edits the workspace itself; an HTTP model cannot reach disk,
    // so its deliverable is the file-block contract and the studio writes the files.
    // Saying "create files" to an HTTP model produced prose about files and no files.
    const cli = isCliEngine(agent.engine)
    const rules = cli
      ? `1. Work inside ${project.path}. Do not touch anything outside it.
2. Actually create or modify files. Do not describe what you would do.
3. Verify your own work by running the project's typecheck, build or tests when they exist.
4. Never print, log or commit secrets. Never run destructive commands (rm -rf, format, force push).
5. When finished, answer with: what you changed (file paths), how you verified it, and anything the next worker needs.`
      : `1. You cannot run commands or touch disk. The studio writes your files for you.
2. Deliver every file as a block in this exact form, and nothing else inside the block:
=== FILE: path/relative/to/workspace ===
<complete file content>
=== END FILE ===
3. Emit the complete file, never a diff, an excerpt or a description of it.
4. Use only relative paths inside ${project.path}. Never absolute paths, never ..
5. Never include secrets. Never propose destructive operations.
6. Do not expand the task. Deliver the file named in the acceptance criteria and what it directly needs, then stop.
7. After the blocks, state what each file is for and anything the next worker needs.`
    const mailPath = (name: string) => `.ventriee/mail/${name.replace(/[^A-Za-z0-9_-]/g, '_')}.md`
    const talking = cli
      ? `Teammates may be working at the same time as you. Your mailbox is ${mailPath(agent.name)}: read it before you start and again between steps, and act on what it says. To tell a teammate something they need (a changed contract, a file you own, a question), append one line to their mailbox, for example ${mailPath(team[0]?.name ?? 'Kai')}, in exactly this form:
- from ${agent.name}: <one-line message>
Only message when it changes their work. Never edit anything else under .ventriee.`
      : `To tell a teammate something they need, add this block after your files (they get it when you finish):
=== MESSAGE TO: <teammate name> ===
<message>
=== END MESSAGE ===
Only message when it changes their work.`

    return `# Task: ${task.title}

You are ${agent.name}, ${agent.title} at Ventriee Studios, working on the project "${project.name}" inside ${project.path}.

## Task
${task.description}

## Acceptance criteria
${task.acceptance}

## Phase
${task.phase}

## Prior deliverables
${dependencyContext || '(this is the first task in the chain)'}

## Teammates (use them instead of guessing)
${roster || '(none)'}

## Talking to teammates
${team.length ? talking : '(you are working alone)'}

## Available skills
${skills.length ? skills.map((s) => `- ${s.name}: ${s.description} (${s.path})`).join('\n') + '\n\nRead a skill\'s SKILL.md before you rely on it. It holds the rules and examples; this line is only a pointer.' : '(none installed)'}

## Owner/project memory and relevant code
${memoryBlock || '(none)'}

## Unread messages addressed to you
${inbox.length ? inbox.map((m) => `- from ${m.sender}: ${m.content.slice(0, 600)}`).join('\n') : '(none)'}

${securityBlock}
## Rules
${rules}
`
  }

  // ------------------------------------------------------------------ evidence
  private async evidenceDigest(root: string): Promise<{ files: Map<string, number>; git: string }> {
    const files = new Map<string, number>()
    const walk = (dir: string, depth: number) => {
      if (depth > 6) return
      let entries: string[]
      try {
        entries = readdirSync(dir)
      } catch {
        return
      }
      for (const entry of entries) {
        if (entry === 'node_modules' || entry === '.git' || entry === '.ventriee' || entry === 'dist' || entry === 'build' || entry === '.next') continue
        const full = join(dir, entry)
        try {
          const stat = statSync(full)
          if (stat.isDirectory()) walk(full, depth + 1)
          else files.set(relative(root, full), stat.mtimeMs)
        } catch {
          /* unreadable entries are not evidence */
        }
      }
    }
    if (existsSync(root)) walk(root, 0)
    let git = ''
    try {
      const { stdout } = await exec('git', ['status', '--porcelain'], { cwd: root, timeout: 8000 })
      git = stdout.trim()
    } catch {
      git = ''
    }
    return { files, git }
  }

  private checkEvidence(
    task: Task,
    before: { files: Map<string, number>; git: string },
    after: { files: Map<string, number>; git: string },
    output: string,
    written: string[] = []
  ): { passed: boolean; summary: string; changed: string[]; removed: string[] } {
    // Files the studio wrote from this task's own answer are this task's, whatever folder they are in.
    const own = new Set(written.map((w) => w.replace(/\\/g, '/')))
    const changedAll: string[] = []
    for (const [file, mtime] of after.files) {
      const prev = before.files.get(file)
      if (!prev || prev !== mtime) changedAll.push(file.replace(/\\/g, '/'))
    }
    const removedAll = [...before.files.keys()].filter((f) => !after.files.has(f)).map((f) => f.replace(/\\/g, '/'))
    const writes = this.writesCode(task.role)
    // With concurrent writers on disjoint scopes, the workspace changes during this
    // task's window include other workers' files. Count only files this role owns,
    // plus root-level shared files (package.json, tsconfig, lockfiles).
    const scope = scopeFor(task.role)
    const inScope = (file: string) => {
      if (scope.includes(STAR) || own.has(file.replace(/\\/g, '/'))) return true
      const sepIdx = file.search(/[\\/]/)
      if (sepIdx < 0) return true
      return scope.includes(file.slice(0, sepIdx))
    }
    const changed = writes ? changedAll.filter(inScope) : changedAll
    const removed = writes ? removedAll.filter(inScope) : removedAll
    if (output.trim().length < 40) {
      return { passed: false, summary: 'Worker produced no meaningful output', changed, removed }
    }
    if (!writes) {
      return {
        passed: true,
        summary: `Analysis delivered (${output.length} chars, ${changed.length} file(s) touched)`,
        changed,
        removed
      }
    }
    if (!changed.length && !removed.length && before.git === after.git) {
      return { passed: false, summary: 'No files changed in the workspace', changed, removed }
    }
    const shown = changed.slice(0, 5).join(', ')
    return {
      passed: true,
      summary: `${changed.length} file(s) changed${removed.length ? `, ${removed.length} removed` : ''}${shown ? `: ${shown}` : ''}`,
      changed,
      removed
    }
  }

  // ------------------------------------------------------------------ review
  private async reviewTask(
    project: Project,
    taskId: string,
    worker: Agent,
    evidence: { passed: boolean; summary: string; changed: string[]; removed: string[] }
  ) {
    const tasks = this.deps.store.tasks(project.id)
    const task = tasks.find((t) => t.id === taskId)
    if (!task) return
    const reviewer = this.deps.store.agents(project.id).find((a) => a.role === 'reviewer' && a.enabled)
    const providers = await detectProviders(this.deps.creds)
    const reviewerUsable = reviewer && providers.find((p) => p.engine === reviewer.engine)?.available
    if (!reviewer || !reviewerUsable) {
      // Be explicit: this task passed the mechanical evidence check, but no
      // independent review happened. The owner must be able to see that.
      const reason = !reviewer ? 'no reviewer worker is enabled' : `${reviewer.name}'s engine is unavailable`
      const note = `Evidence pass only — independent review did not run (${reason}). ${evidence.summary}`
      this.deps.store.updateTask(taskId, { status: 'done', review: note })
      this.deps.memory.recordTaskOutcome(task, worker, project, true, evidence.summary)
      this.deps.store.recordModelOutcome(taskId, worker.id, 'passed')
      this.log(project.id, worker.id, taskId, 'review', `Accepted on evidence alone: ${reason}`)
      return
    }

    this.deps.store.updateAgent(reviewer.id, { status: 'working', currentTaskId: taskId })
    this.deps.store.updateTask(taskId, { status: 'review' })
    this.deps.notify()
    const memoryDocs = this.deps.memory.retrieve(project.id, `review ${task.title}`, 4)
    const sessionId = newId('ses')
    const controller = new AbortController()
    this.runners.set(reviewer.id, { controller, sessionId, startedAt: Date.now() })
    this.deps.store.insertSession({
      id: sessionId,
      projectId: project.id,
      agentId: reviewer.id,
      taskId,
      engine: reviewer.engine,
      model: reviewer.model,
      cwd: project.path,
      reasoning: reviewer.reasoning ?? 'auto',
      status: 'running',
      exitCode: null,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      externalId: null,
      command: '',
      startedAt: Date.now(),
      endedAt: null
    })

    const result = await runEngine(
      {
        engine: reviewer.engine,
        model: reviewer.model,
        endpoint: reviewer.endpoint,
        system: withRules(reviewer.instructions, project.path),
        prompt: `Review the delivered work for this task inside ${project.path}.

Task: ${task.title}
Requirements: ${task.description}
Acceptance criteria: ${task.acceptance}
Worker: ${worker.name} (${worker.role})
Reported evidence: ${evidence.summary}
Files this task changed: ${evidence.changed.length ? evidence.changed.join(', ') : 'none'}
Files this task removed: ${evidence.removed.length ? evidence.removed.join(', ') : 'none'}

Judge only what this task was asked to deliver. Read those files and check them against the
acceptance criteria. Other workers own other parts of this project: a failure elsewhere (a
broken build caused by files this task did not touch, an unfinished feature) is not this
task's failure, so do not fail it for one. If the task itself is incomplete or wrong, fail
it and name the file and the problem.
Answer with a JSON object only: {"verdict":"pass"|"fail","reasoning":"...","blockers":["..."]}`,
        cwd: project.path,
        maxTokens: 16000,
        // A CLI reviewer reads files and runs the project's checks; 8 minutes cut
        // Vera off mid-transcript and lost the verdict. Honour the owner's
        // session timeout, the same one workers get.
        timeoutMs: Math.max(2, this.deps.store.settings().sessionTimeoutMinutes) * 60 * 1000,
        reasoning: reviewer.reasoning ?? 'auto',
        signal: controller.signal,
        onChunk: (chunk) =>
          this.deps.emit.emit('output', { sessionId, agentId: reviewer.id, taskId, chunk: this.safe(chunk) })
      },
      this.deps.creds
    )
    const reviewText = this.safe(result.text)
    this.runners.delete(reviewer.id)
    this.deps.store.updateSession(sessionId, {
      status: result.ok ? 'done' : 'failed',
      exitCode: result.ok ? 0 : 1,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      costUsd: result.costUsd,
      command: this.safe(result.command),
      endedAt: Date.now()
    })
    this.deps.store.updateAgent(reviewer.id, { status: 'idle', currentTaskId: null })

    // The reviewer answers with one JSON object; a CLI reviewer wraps it in its
    // transcript. Keep the verdict's reasoning, not the transcript head, or the
    // owner is shown the shell commands the reviewer ran instead of its finding.
    const parsed = parseVerdict(reviewText)
    const blockers = parsed.blockers.length ? ` Blockers: ${parsed.blockers.join('; ')}` : ''

    if (!result.ok || parsed.verdict === null) {
      // The owner stopped the run mid-review: the verdict is void, and the task
      // goes back for rework instead of being accepted on evidence alone.
      if (controller.signal.aborted) {
        this.deps.store.updateTask(taskId, { status: 'rework', review: 'Stopped by owner during review' })
        this.log(project.id, reviewer.id, taskId, 'review', 'Stopped by owner during review')
        this.deps.notify()
        return
      }
      // The reviewer ran but returned no usable verdict. Accepting it silently
      // would claim an independent review that did not happen, so say so.
      const reason = !result.ok ? 'the reviewer session failed' : `${reviewer.name} returned no JSON verdict`
      const note = `Evidence pass only — independent review did not run (${reason}). ${evidence.summary}`
      this.deps.store.updateTask(taskId, { status: 'done', review: note.slice(0, 900) })
      this.deps.memory.recordTaskOutcome(task, worker, project, true, evidence.summary)
      this.deps.store.recordModelOutcome(taskId, worker.id, 'passed')
      this.deps.store.addMessage({
        projectId: project.id,
        taskId,
        sender: reviewer.id,
        recipient: worker.id,
        type: 'review',
        content: `No verdict for "${task.title}" (${reason}). Raw output:\n${reviewText.slice(-1500)}`,
        status: 'unread'
      })
      this.log(project.id, reviewer.id, taskId, 'review', `Accepted on evidence alone: ${reason}`)
      this.deps.notify()
      return
    }

    const passed = parsed.verdict === 'pass'
    this.deps.store.updateTask(taskId, {
      status: passed ? 'done' : 'rework',
      review: `Reviewer ${reviewer.name}: ${passed ? 'pass' : 'fail'} — ${parsed.reasoning}${blockers}`.slice(0, 900)
    })
    this.deps.memory.recordTaskOutcome(task, worker, project, passed, evidence.summary)
    this.deps.store.recordModelOutcome(taskId, worker.id, passed ? 'passed' : 'rework')
    this.deps.store.addMessage({
      projectId: project.id,
      taskId,
      sender: reviewer.id,
      recipient: passed ? 'orchestrator' : worker.id,
      type: 'review',
      content: `${passed ? 'PASS' : 'FAIL'} for "${task.title}"\n${parsed.reasoning}${blockers}\n\n${reviewText.slice(0, 1500)}`,
      status: 'unread'
    })
    this.log(project.id, reviewer.id, taskId, 'review', `Review ${passed ? 'passed' : 'failed'} for "${task.title}"`)
    this.deps.notify()
  }

  // ------------------------------------------------------------------ controls
  stopAgent(agentId: string) {
    const runner = this.runners.get(agentId)
    runner?.controller.abort()
    this.deps.store.updateAgent(agentId, { status: 'idle', currentTaskId: null })
    this.deps.notify()
  }

  pauseAgent(agentId: string) {
    this.paused.add(agentId)
    this.deps.store.updateAgent(agentId, { status: 'waiting' })
    this.deps.notify()
  }

  resumeAgent(agentId: string) {
    this.paused.delete(agentId)
    this.deps.store.updateAgent(agentId, { status: 'idle' })
    this.deps.notify()
  }

  stopRun(projectId: string) {
    this.stopping.add(projectId)
    for (const agent of this.deps.store.agents(projectId)) {
      this.runners.get(agent.id)?.controller.abort()
    }
    for (const task of this.deps.store.tasks(projectId)) {
      if (task.status === 'running' || task.status === 'review') {
        this.deps.store.updateTask(task.id, { status: 'rework', review: 'Stopped by owner' })
      }
    }
    this.log(projectId, null, null, 'stop', 'Owner stopped the run')
    this.deps.notify()
  }

  approveTask(taskId: string) {
    const task = this.deps.store.task(taskId)
    if (!task) return
    const project = this.deps.store.project(task.projectId)
    // The gate is a state machine: only a task in `approval` moves, and approve
    // finishes it so the run's loop no longer counts it as active.
    const patch = approvalTransition(task, true)
    if (!patch) return
    this.deps.store.updateTask(taskId, patch)
    if (project) this.deps.memory.appendProgress(project.id, `Owner approved "${task.title}"`)
    this.log(task.projectId, task.agentId, taskId, 'approval', `"${task.title}" approved by owner`)
    this.deps.notify()
  }

  rejectTask(taskId: string, reason: string) {
    const task = this.deps.store.task(taskId)
    if (!task) return
    const patch = approvalTransition(task, false, reason)
    if (!patch) return
    this.deps.store.updateTask(taskId, patch)
    if (task.agentId) {
      this.deps.store.addMessage({
        projectId: task.projectId,
        taskId,
        sender: 'owner',
        recipient: task.agentId,
        type: 'request',
        content: `Rejected "${task.title}": ${reason.trim() || 'no reason given'}`,
        status: 'unread'
      })
    }
    this.log(task.projectId, task.agentId, taskId, 'approval', `"${task.title}" rejected by owner: ${reason.trim() || 'no reason given'}`)
    this.deps.notify()
  }

  retryTask(taskId: string) {
    const task = this.deps.store.task(taskId)
    if (!task) return
    // The queue only picks tasks under the retry cap, so a manual retry must reset
    // attempts or an exhausted task is set ready and silently ignored (run #27).
    this.deps.store.updateTask(taskId, { status: 'ready', attempts: 0, review: 'Retry requested by owner' })
    this.deps.store.updateAgent(task.agentId ?? '', { status: 'idle' })
    // A retry after the job closed needs a fresh job to drive the queue, or the
    // ready task never runs (run #28). Run the existing queue directly: re-planning
    // (executeJob) would duplicate the whole pipeline.
    const project = task.projectId ? this.deps.store.project(task.projectId) : null
    if (project && !this.deps.store.runningJob(project.id)) {
      const job: Job = {
        id: newId('job'),
        projectId: project.id,
        instruction: `Retry: ${task.title}`,
        status: 'running',
        planSource: 'heuristic',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        error: null
      }
      this.deps.store.insertJob(job)
      this.stopping.delete(project.id)
      void this.runQueue(job, project).then(() => {
        const failed = this.deps.store.tasks(project.id).filter((t) => t.status === 'failed' || t.status === 'rework')
        this.deps.store.updateJob(job.id, {
          status: this.stopping.has(project.id) ? 'stopped' : failed.length ? 'failed' : 'done',
          error: failed.length ? `${failed.length} task(s) need attention` : null
        })
        this.deps.notify()
      })
    }
    this.deps.notify()
  }

  /** Direct instruction to a single worker, outside the queue. */
  async instruct(agentId: string, text: string) {
    const agent = this.deps.store.agent(agentId)
    if (!agent) throw new Error('Worker not found')
    const project = this.deps.store.project(agent.projectId)
    if (!project) throw new Error('Project not found')
    this.deps.store.addMessage({
      projectId: project.id,
      taskId: agent.currentTaskId,
      sender: 'owner',
      recipient: agentId,
      type: 'owner',
      content: text,
      status: 'unread'
    })
    const existing = this.deps.store.tasks(project.id).find(
      (t) => t.agentId === agentId && ['running', 'ready', 'rework'].includes(t.status)
    )
    if (existing && existing.status !== 'running') {
      this.deps.store.updateTask(existing.id, {
        description: `${existing.description}\n\nOwner instruction: ${text}`
      })
      this.deps.notify()
      return
    }
    const task: Task = {
      id: newId('tsk'),
      projectId: project.id,
      parentId: null,
      title: `Direct instruction: ${text.slice(0, 60)}`,
      description: text,
      acceptance: 'Owner instruction carried out and reported with evidence.',
      role: agent.role,
      agentId,
      status: 'ready',
      dependsOn: [],
      output: '',
      review: '',
      attempts: 0,
      phase: 'build',
      engine: null,
      model: null,
      endpoint: null,
      routedBy: null,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    this.deps.store.insertTask(task)
    this.deps.notify()
    const job = this.deps.store.runningJob(project.id)
    if (job && this.stopping.has(project.id)) {
      // The stopping run's queue is about to exit, so a task inserted now would
      // never be scheduled. Refuse loudly instead of stranding it.
      throw new Error('A run is stopping. Wait a moment and try again.')
    }
    if (!job) {
      const jobRecord: Job = {
        id: newId('job'),
        projectId: project.id,
        instruction: text,
        status: 'running',
        planSource: 'heuristic',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        error: null
      }
      this.deps.store.insertJob(jobRecord)
      void this.runQueue(jobRecord, project).then(() => {
        this.deps.store.updateJob(jobRecord.id, { status: 'done' })
        this.deps.notify()
      })
    }
  }

  /** Manual or orchestrator assignment of an approved prompt. */
  async assignPrompt(input: AssignPromptInput): Promise<{ jobId: string; taskCount: number }> {
    const project = this.deps.store.project(input.projectId)
    if (!project) throw new Error('Project not found')
    if (this.deps.store.runningJob(project.id)) throw new Error('A run is already active for this project')
    const stored = this.deps.store.prompt(input.promptId)
    if (!stored) throw new Error('Prompt not found')
    // Answers ride on the brief (and so on the job record), not the saved prompt revision.
    const prompt = { ...stored, body: foldClarifications(stored.body, input.clarifications) }
    if (!existsSync(project.path)) throw new Error(`Project workspace does not exist: ${project.path}`)
    // Same reason as startRun: a stop recorded while no run was active must not
    // make this new run exit on its first queue check without doing anything.
    this.stopping.delete(project.id)

    const roster = this.ensureRoster(project, this.deps.creds)
    const settings = this.deps.store.settings()
    const routed: Array<{ agent: Agent; engine: EngineKind; model: string; endpoint: string; routedBy: RoutingMode }> = []

    for (const pick of input.agents ?? []) {
      const agent = roster.find((a) => a.id === pick.agentId && a.enabled)
      if (!agent) throw new Error('One of the selected workers is missing or disabled')
      const config = this.configFor(agent, pick, settings.routingMode, routed.map((r) => r.model))
      routed.push({ agent, ...config })
      // Persisting the choice is the difference between a label and real routing.
      this.deps.store.updateAgent(agent.id, { engine: config.engine, model: config.model, endpoint: config.endpoint })
    }

    const job: Job = {
      id: newId('job'),
      projectId: project.id,
      instruction: foldClarifications(stored.body.slice(0, 2000), input.clarifications),
      status: 'running',
      planSource: 'heuristic',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      error: null
    }
    this.deps.store.insertJob(job)

    const assignment: Assignment = {
      id: newId('asg'),
      projectId: project.id,
      promptId: prompt.id,
      jobId: job.id,
      mode: input.mode,
      agents: routed.map((r) => ({ agentId: r.agent.id, name: r.agent.name, model: `${r.engine} ${r.model}`.trim() })),
      createdAt: Date.now()
    }
    this.deps.store.addAssignment(assignment)
    this.deps.notify()

    if (input.mode === 'orchestrator') {
      void this.executeAssignedJob(job, project, roster, prompt.body, input.note, routed)
    } else {
      this.queueAssignedTasks(project, job, routed, prompt, input.note)
      void this.runQueue(job, project)
        .then(() => {
          const failed = this.deps.store.tasks(project.id).filter((t) => t.status === 'failed' || t.status === 'rework')
          this.deps.store.updateJob(job.id, {
            status: this.stopping.has(project.id) ? 'stopped' : failed.length ? 'failed' : 'done',
            error: failed.length ? `${failed.length} task(s) need attention` : null
          })
        })
        .catch((error) => {
          this.deps.store.updateJob(job.id, { status: 'failed', error: (error as Error).message })
          this.log(project.id, null, null, 'error', `Assigned run failed: ${(error as Error).message}`)
        })
        // Without this a single stop left the flag set forever, so every later
        // manual assignment queued work that never started (run #23: task left
        // ready, zero sessions, job closed clean).
        .finally(() => {
          this.stopping.delete(project.id)
          this.deps.notify()
        })
    }
    return { jobId: job.id, taskCount: input.mode === 'manual' ? routed.length : 0 }
  }

  /** Orchestrator mode: the planner breaks the approved prompt into tasks. */
  private async executeAssignedJob(
    job: Job,
    project: Project,
    roster: Agent[],
    brief: string,
    note: string | undefined,
    routed: Array<{ agent: Agent; engine: EngineKind; model: string; endpoint: string; routedBy: RoutingMode }>
  ) {
    try {
      const plan = await this.makePlan(project, note ? `${brief}\n\nOwner note: ${note}` : brief, roster)
      this.deps.store.updateJob(job.id, { planSource: plan.source })
      const assigned = this.persistPlan(project, plan, roster)
      // Only the workers the owner actually picked participate.
      if (routed.length) {
        const allowed = new Set(routed.map((r) => r.agent.role))
        for (const task of this.deps.store.tasks(project.id)) {
          const workers = roster.filter((a) => a.role === task.role && allowed.has(a.role))
          if (!allowed.has(task.role) || !workers.length) {
            this.deps.store.updateTask(task.id, {
              status: 'blocked',
              review: 'Not in the selected team. Assign it manually or add this role.'
            })
          }
        }
      }
      this.deps.store.addMessage({
        projectId: project.id,
        taskId: null,
        sender: 'orchestrator',
        recipient: 'owner',
        type: 'note',
        content: `${plan.summary}\n\n${assigned} tasks queued from the approved prompt (${plan.source} plan).\n\n${estimatePlanCost(plan.tasks, this.deps.store.roleCostStats()).text}`.trimEnd(),
        status: 'read'
      })
      await this.runQueue(job, project)
      const failed = this.deps.store.tasks(project.id).filter((t) => t.status === 'failed' || t.status === 'rework')
      this.deps.store.updateJob(job.id, {
        status: this.stopping.has(project.id) ? 'stopped' : failed.length ? 'failed' : 'done',
        error: failed.length ? `${failed.length} task(s) need attention` : null
      })
    } catch (error) {
      this.deps.store.updateJob(job.id, { status: 'failed', error: (error as Error).message })
      this.log(project.id, null, null, 'error', `Assigned run failed: ${(error as Error).message}`)
    } finally {
      this.stopping.delete(project.id)
      for (const agent of this.deps.store.agents(project.id)) {
        if (agent.status === 'working') this.deps.store.updateAgent(agent.id, { status: 'idle', currentTaskId: null })
      }
      this.deps.notify()
    }
  }

  /** Manual mode: one real task per selected worker, no planner involved. */
  private queueAssignedTasks(
    project: Project,
    job: Job,
    routed: Array<{ agent: Agent; engine: EngineKind; model: string; endpoint: string; routedBy: RoutingMode }>,
    prompt: { id: string; title: string; body: string },
    note?: string
  ) {
    const previousTask: string | null = null
    for (const [index, item] of routed.entries()) {
      const task: Task = {
        id: newId('tsk'),
        projectId: project.id,
        parentId: null,
        title: `${prompt.title || 'Approved prompt'}: ${item.agent.title}`,
        // Each worker gets the part of the brief its role owns, not the whole
        // document: a designer answering the auth and billing sections burns its
        // budget on other people's work and gets it wrong.
        description: `${scopeToRole(prompt.body, item.agent.role)}${note ? `\n\nOwner note: ${note}` : ''}`,
        // Naming the deliverable makes "finished" reachable. Without it a worker
        // decides for itself how much work the brief implies and never stops.
        acceptance: `Deliver ${DELIVERABLE_BY_ROLE[item.agent.role] ?? 'your part of the approved prompt'} with evidence in the workspace. Stop when that is complete; do not expand into other roles' work.`,
        role: item.agent.role,
        agentId: item.agent.id,
        status: index === 0 ? 'ready' : 'blocked',
        dependsOn: previousTask ? [previousTask] : [],
        output: '',
        review: '',
        attempts: 0,
        phase: phaseForRole(item.agent.role),
        engine: item.engine,
        model: item.model,
        endpoint: item.endpoint,
        routedBy: item.routedBy,
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
      this.deps.store.insertTask(task)
      // Ordering is explicit: the team works through the prompt in the order picked.
      if (index > 0) this.deps.store.updateTask(task.id, { dependsOn: [previousTask!] })
    }
    this.deps.store.addMessage({
      projectId: project.id,
      taskId: null,
      sender: 'orchestrator',
      recipient: 'owner',
      type: 'note',
      content: `Approved prompt assigned manually to ${routed.map((r) => r.agent.name).join(', ')}.`,
      status: 'read'
    })
    void job
  }

  /**
   * Resolve the engine/model a worker will actually run with. In manual mode the
   * worker's own configuration wins; in automatic mode the router picks; in
   * hybrid mode the worker default wins unless it has none.
   */
  private configFor(
    agent: Agent,
    pick: { model?: string; providerId?: string | null; engine?: EngineKind; endpoint?: string },
    mode: RoutingMode,
    inUse: string[]
  ): { engine: EngineKind; model: string; endpoint: string; routedBy: RoutingMode } {
    const providerId = pick.providerId ?? null
    const model = pick.model
    const fromProvider = providerId ? this.deps.providerConfigs().find((p) => p.id === providerId) : null
    if (providerId && !fromProvider) throw new Error('The chosen provider no longer exists')

    // A pick always carries its own engine, because built-in providers (Ollama,
    // OpenAI, ...) have no provider row. Without this an Ollama model name
    // would be handed to whichever engine the worker happened to use before.
    if (model?.trim()) {
      return {
        engine: (fromProvider?.engine ?? pick.engine ?? agent.engine) as EngineKind,
        model: model.trim(),
        endpoint: fromProvider?.baseUrl ?? pick.endpoint ?? agent.endpoint,
        routedBy: mode
      }
    }
    if (fromProvider) {
      return { engine: fromProvider.engine, model: fromProvider.models[0] ?? '', endpoint: fromProvider.baseUrl, routedBy: mode }
    }
    if (mode === 'manual' || (mode === 'hybrid' && agent.model.trim())) {
      return { engine: agent.engine, model: agent.model, endpoint: agent.endpoint, routedBy: mode }
    }
    const choice = routeModel({
      role: agent.role,
      models: this.deps.models(),
      costPreference: this.deps.store.settings().costPreference,
      inUse,
      profiles: this.deps.store.settings().modelProfiles,
      outcomes: this.deps.store.modelOutcomeStats()
    })
    if (!choice) {
      // No discovered models: keep the worker's own config rather than guessing.
      return { engine: agent.engine, model: agent.model, endpoint: agent.endpoint, routedBy: 'manual' }
    }
    const config = this.deps.providerConfigs().find((p) => p.id === choice.option.provider)
    return {
      engine: (config?.engine ?? choice.option.provider) as EngineKind,
      model: choice.option.model,
      endpoint: config?.baseUrl ?? '',
      routedBy: mode
    }
  }

  /** Lessons come from accepted work, never from a worker's own claim. */
  private extractLessons(project: Project) {
    const done = this.deps.store.tasks(project.id).filter((t) => t.status === 'done')
    if (!done.length) return
    const summary = done
      .slice(-6)
      .map((t) => `${t.title} (${t.role})`)
      .join('; ')
    this.deps.memory.appendProgress(project.id, `Run closed with verified work: ${summary}`)
    const skillPath = `skills/verified-${project.id}.md`
    this.deps.memory.save({
      path: skillPath,
      title: `Verified workflow: ${project.name}`,
      body: `# Verified workflow\n\nProject: ${project.name}\n\n## Proven steps\n${done.map((t) => `- ${t.title} — ${t.review.slice(0, 200)}`).join('\n')}\n\n## Reuse\nReuse this sequence for similar briefs. Only keep steps whose evidence passed.\n`,
      scope: 'skill',
      projectId: project.id,
      tags: ['workflow', 'verified'],
      confidence: 0.8,
      source: 'orchestrator',
      evidence: 'tasks accepted after evidence check'
    })
    this.deps.store.upsertSkill({
      id: `skill_${project.id}`,
      name: `verified-workflow-${project.id}`,
      description: `Proven delivery sequence from ${project.name}`,
      path: skillPath,
      enabled: true,
      version: '1.0.0',
      uses: 0,
      successes: 0,
      source: 'auto-extracted',
      updatedAt: Date.now()
    })
    this.log(project.id, null, null, 'memory', 'Verified lessons and a reusable workflow skill were recorded')
  }

  private log(projectId: string, agentId: string | null, taskId: string | null, type: string, message: string) {
    this.deps.store.addEvent({ projectId, agentId, taskId, type, message: this.safe(message) })
    this.deps.notify()
  }

  isRunning(projectId: string) {
    return Boolean(this.deps.store.runningJob(projectId))
  }
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export function phaseLabel(phase: string): string {
  const map: Record<string, string> = {
    research: 'Research',
    requirements: 'Requirements',
    architecture: 'Architecture',
    design: 'Design',
    build: 'Build',
    integration: 'Integration',
    review: 'Review',
    qa: 'QA',
    fix: 'Bug fixing',
    seo: 'SEO',
    deploy: 'Deploy',
    monitor: 'Monitoring'
  }
  return map[phase] ?? (phase as Phase)
}

export { roleByName, modelFor, newId }
