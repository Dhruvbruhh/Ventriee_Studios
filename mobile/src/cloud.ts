// Typed data-access to the shared cloud layer, built on the signed-in user's session.
// Mirrors src/main/cloud/index.ts (the desktop's CloudClient) so both clients hit the
// same tables the same way. RLS is the real gate: a forbidden row is simply absent.
import { supabase } from './supabase'
import { COMMAND_TABLE, type NewCommandRow } from './commands'
import type { Command, Device, Organization, Project, Task } from './types'

/** Workspace filter: null = personal workspace (org_id IS NULL), a uuid = that org. */
export type Workspace = string | null

function unwrap<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message)
  return (result.data ?? []) as unknown as T
}

export async function listOrganizations(): Promise<Organization[]> {
  return unwrap(await supabase.from('organizations').select('*').order('created_at', { ascending: true }))
}

export async function listProjects(workspace: Workspace): Promise<Project[]> {
  const q = supabase.from('projects').select('*').order('created_at', { ascending: true })
  return unwrap(await (workspace === null ? q.is('org_id', null) : q.eq('org_id', workspace)))
}

export async function listTasks(projectId: string): Promise<Task[]> {
  return unwrap(await supabase.from('tasks').select('*').eq('project_id', projectId).order('created_at', { ascending: true }))
}

/** All tasks across a set of projects, newest first — used for the overview and approvals. */
export async function listTasksForProjects(projectIds: string[]): Promise<Task[]> {
  if (projectIds.length === 0) return []
  return unwrap(await supabase.from('tasks').select('*').in('project_id', projectIds).order('created_at', { ascending: false }))
}

export async function getTask(taskId: string): Promise<Task | null> {
  const { data, error } = await supabase.from('tasks').select('*').eq('id', taskId).maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

/** Update a task's status (also how approvals are approved/rejected). Returns the new row. */
export async function updateTaskStatus(taskId: string, status: string): Promise<Task> {
  const { data, error } = await supabase.from('tasks').update({ status }).eq('id', taskId).select('*').single()
  if (error) throw new Error(error.message)
  return data
}

export async function listDevices(workspace: Workspace): Promise<Device[]> {
  const q = supabase.from('devices').select('*').order('last_seen_at', { ascending: false })
  // Personal workspace: the user's own devices (RLS already restricts to them).
  return unwrap(await (workspace === null ? q : q.eq('org_id', workspace)))
}

// --- Remote-control command queue (W5 contract; see commands.ts/types.ts) ---

export async function listCommands(deviceId: string, limit = 20): Promise<Command[]> {
  return unwrap(await supabase.from(COMMAND_TABLE).select('*').eq('device_id', deviceId).order('created_at', { ascending: false }).limit(limit))
}

export async function enqueueCommand(row: NewCommandRow): Promise<Command> {
  const { data, error } = await supabase.from(COMMAND_TABLE).insert(row).select('*').single()
  if (error) throw new Error(error.message)
  return data as Command
}
