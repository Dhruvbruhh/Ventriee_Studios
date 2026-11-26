// Remote-control command queue client + payload building.
//
// The mobile app enqueues a command (status 'pending'); the desktop (W5) drains the
// queue, runs it, and writes back status + result. We only insert and read here.
//
// TODO(W5): confirm column names against 0002_remote_control.sql. See src/types.ts.
import type { Command } from './types'

/** Column names assumed for the `commands` table. Adjust here if W5 differs. */
export const COMMAND_TABLE = 'commands'

export type CommandType = 'ask_project_status' | 'start_agent_run' | 'stop_agent_run'

export interface CommandSpec {
  type: CommandType
  label: string
  /** Human summary of what the desktop will do. */
  description: string
  /** Whether this command targets a specific project. */
  needsProject: boolean
}

export const COMMAND_SPECS: CommandSpec[] = [
  { type: 'ask_project_status', label: 'Ask project status', description: 'Request a status summary for a project.', needsProject: true },
  { type: 'start_agent_run', label: 'Start agent run', description: 'Tell the desktop agent to begin a run.', needsProject: true },
  { type: 'stop_agent_run', label: 'Stop agent run', description: 'Ask the desktop agent to stop the current run.', needsProject: false },
]

export interface BuildCommandInput {
  type: CommandType
  deviceId: string
  orgId?: string | null
  projectId?: string | null
  /** Extra free-form args merged into the payload (e.g. a prompt). */
  args?: Record<string, unknown>
}

/** The row inserted into the commands table. New commands always start 'pending'. */
export interface NewCommandRow {
  device_id: string
  org_id: string | null
  type: CommandType
  payload: Record<string, unknown>
  status: 'pending'
}

/**
 * Build the insert row for a command. Validates that a project-scoped command
 * carries a projectId, so we never enqueue a command the desktop can't act on.
 */
export function buildCommandRow(input: BuildCommandInput): NewCommandRow {
  if (!input.deviceId) throw new Error('Pick a device to send the command to')
  const spec = COMMAND_SPECS.find((s) => s.type === input.type)
  if (!spec) throw new Error(`Unknown command type: ${input.type}`)
  if (spec.needsProject && !input.projectId) throw new Error(`"${spec.label}" needs a project`)

  const payload: Record<string, unknown> = { ...(input.args ?? {}) }
  if (input.projectId) payload.project_id = input.projectId

  return {
    device_id: input.deviceId,
    org_id: input.orgId ?? null,
    type: input.type,
    payload,
    status: 'pending',
  }
}

/** A short one-line summary of a command for list rows. */
export function describeCommand(command: Pick<Command, 'type' | 'payload'>): string {
  const spec = COMMAND_SPECS.find((s) => s.type === command.type)
  const base = spec?.label ?? command.type
  const project = command.payload?.project_id
  return typeof project === 'string' ? `${base}` : base
}
