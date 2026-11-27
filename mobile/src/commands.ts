// Remote-control command queue client + payload building.
//
// Contract (supabase/migrations/0002_remote_control.sql + 0005, desktop src/main/index.ts):
// the phone inserts a row into `commands`; status defaults to 'queued', requested_by to
// the caller and expires_at to +1 day server-side. The desktop only runs `type`s in its
// allowlist, and refuses high-risk ones unless requires_confirmation is true.
import type { Command } from './types'

export const COMMAND_TABLE = 'commands'

/** Must match the desktop's remoteCapabilities keys exactly. */
export type CommandType = 'project.status' | 'run.start' | 'run.stop'

export interface CommandSpec {
  type: CommandType
  label: string
  /** Human summary of what the desktop will do. */
  description: string
  /** Desktop refuses these unless the user confirmed on the phone. */
  highRisk: boolean
  /** Needs an instruction typed by the user. */
  needsInstruction: boolean
}

export const COMMAND_SPECS: CommandSpec[] = [
  { type: 'project.status', label: 'Ask project status', description: 'Ask the desktop whether this project has a run going.', highRisk: false, needsInstruction: false },
  { type: 'run.start', label: 'Start agent run', description: 'Tell the desktop to start an agent run with your instruction.', highRisk: true, needsInstruction: true },
  { type: 'run.stop', label: 'Stop agent run', description: 'Stop the run going on this project.', highRisk: true, needsInstruction: false },
]

export interface BuildCommandInput {
  type: CommandType
  deviceId: string
  orgId?: string | null
  /** Cloud project; the desktop matches it to its local project by id, then by name. */
  project: { id: string; name: string } | null
  instruction?: string
}

/** The row inserted into the commands table. */
export interface NewCommandRow {
  device_id: string
  org_id: string | null
  type: CommandType
  payload: Record<string, unknown>
  requires_confirmation: boolean
}

/** Build the insert row. Every command targets a project so nothing lands on the wrong one. */
export function buildCommandRow(input: BuildCommandInput): NewCommandRow {
  if (!input.deviceId) throw new Error('Pick a device to send the command to')
  const spec = COMMAND_SPECS.find((s) => s.type === input.type)
  if (!spec) throw new Error(`Unknown command type: ${input.type}`)
  if (!input.project) throw new Error(`"${spec.label}" needs a project`)
  const instruction = input.instruction?.trim() ?? ''
  if (spec.needsInstruction && !instruction) throw new Error(`"${spec.label}" needs an instruction`)

  const payload: Record<string, unknown> = { projectId: input.project.id, projectName: input.project.name }
  if (spec.needsInstruction) payload.instruction = instruction

  return {
    device_id: input.deviceId,
    org_id: input.orgId ?? null,
    type: input.type,
    payload,
    // Only reached after the user confirmed in the app (see command screen).
    requires_confirmation: spec.highRisk,
  }
}

/** A short one-line summary of a command for list rows. */
export function describeCommand(command: Pick<Command, 'type' | 'payload'>): string {
  const spec = COMMAND_SPECS.find((s) => s.type === command.type)
  const base = spec?.label ?? command.type
  const project = command.payload?.projectName
  return typeof project === 'string' && project ? `${base} · ${project}` : base
}
