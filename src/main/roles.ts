import { DEPARTMENT_OF, type AgentTemplate } from '../shared/agents'

export interface RoleTemplate {
  role: string
  name: string
  title: string
  color: string
  instructions: string
  /** Tasks in this role mutate the project tree, so the scheduler serializes them per project. */
  writesCode: boolean
  /** Skill ids offered to this role by default. The owner can override them per worker. */
  skills: string[]
}

/**
 * Skills forced onto every worker regardless of role defaults. The orchestrator
 * unions these into the worker's wanted set at prompt time; one that is not
 * installed is simply skipped.
 */
export const MANDATORY_SKILLS = ['ponytail'] as const

/**
 * The plain IDE ships a planner and one general agent. Teams of specialists come
 * from the agent catalogue: built by the owner, imported, or added by a plugin.
 */
export const ROLE_TEMPLATES: RoleTemplate[] = [
  {
    role: 'orchestrator',
    name: 'Planner',
    title: 'Orchestrator',
    color: '#7dd3fc',
    writesCode: false,
    skills: [...MANDATORY_SKILLS],
    instructions: `You are the studio orchestrator. Convert the owner's brief into a minimal, dependency-ordered plan. Pick the smallest useful team: never schedule a role that adds nothing. Every task needs testable acceptance criteria. Escalate scope changes and money decisions to the owner.`
  },
  {
    role: 'assistant',
    name: 'Assistant',
    title: 'General Agent',
    color: '#f0a868',
    writesCode: true,
    skills: [...MANDATORY_SKILLS],
    instructions: `You are a general software agent. Do the task you are given end to end: read the code first, make the smallest change that fully solves it, run the project's checks, and report what you changed and what you verified. Ask the owner before spending money, deploying or deleting anything.`
  }
]

export const roleByName = (role: string) => ROLE_TEMPLATES.find((r) => r.role === role)

/** Roles only the Client website profile schedules; a normal run never hires them. */
export const WEBSITE_ROLES = new Set(['database', 'security'])

export const PIPELINE = [
  'research',
  'requirements',
  'architecture',
  'design',
  'build',
  'integration',
  'review',
  'qa',
  'fix',
  'seo',
  'deploy',
  'monitor'
] as const

export type Phase = (typeof PIPELINE)[number]

/** The built-in roles as catalogue templates: the seeds the owner can edit, disable or reset. */
export const builtinTemplates = (): AgentTemplate[] => ROLE_TEMPLATES.map((t) => ({
  role: t.role, name: t.name, title: t.title, description: t.instructions.split('. ')[0] + '.', department: DEPARTMENT_OF[t.role] ?? 'project-management',
  color: t.color, instructions: t.instructions, engine: '', model: '', skills: t.skills, mcpServers: [], writesCode: t.writesCode,
  budgetUsd: 5, requiresApproval: false, enabled: true, builtin: true
}))
