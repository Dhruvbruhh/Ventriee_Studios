// Typed data-access over Supabase. Every call runs with the signed-in user's
// token, so Row-Level Security decides what each read/write may touch — a
// forbidden row is simply absent, and a forbidden write errors.
import { supabase } from './supabase'
import type {
  Membership, MembershipRole, Organization, Profile, Project, Task, TaskAssignment, TaskComment, Workspace,
} from './types'

/** Unwrap a Supabase `{ data, error }`, throwing a clean message on failure. */
function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data as T
}

// --- Auth -----------------------------------------------------------------

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw new Error(error.message)
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut()
}

// --- Workspaces -----------------------------------------------------------

/** Personal workspace plus every org the user belongs to, with their role. */
export async function listWorkspaces(userId: string): Promise<Workspace[]> {
  const rows = must(
    await supabase
      .from('memberships')
      .select('role, org_id, organizations(id, name)')
      .eq('user_id', userId),
    // Untyped client infers embeds as arrays; memberships→organizations is to-one, so PostgREST returns an object.
  ) as unknown as { role: MembershipRole; org_id: string; organizations: { id: string; name: string } | null }[]

  const orgs: Workspace[] = rows
    .filter((r) => r.organizations)
    .map((r) => ({ orgId: r.org_id, name: r.organizations!.name, role: r.role }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return [{ orgId: null, name: 'Personal', role: 'owner' }, ...orgs]
}

export async function createOrganization(name: string): Promise<Organization> {
  return must(await supabase.from('organizations').insert({ name }).select().single())
}

// --- Members / profiles ---------------------------------------------------

export async function listMembers(orgId: string): Promise<Membership[]> {
  return must(await supabase.from('memberships').select('*').eq('org_id', orgId))
}

export async function updateMemberRole(membershipId: string, role: MembershipRole): Promise<void> {
  must(await supabase.from('memberships').update({ role }).eq('id', membershipId).select().single())
}

export async function removeMember(membershipId: string): Promise<void> {
  const { error } = await supabase.from('memberships').delete().eq('id', membershipId)
  if (error) throw new Error(error.message)
}

/** Add an existing user to the org by their auth user id. Email invites need a
 *  server-side function (not possible with the public key) — see README TODO. */
export async function addMember(orgId: string, userId: string, role: MembershipRole): Promise<Membership> {
  return must(
    await supabase.from('memberships').insert({ org_id: orgId, user_id: userId, role }).select().single(),
  )
}

/** Profiles for the given user ids, as a map. Missing ids are simply absent. */
export async function getProfiles(userIds: string[]): Promise<Map<string, Profile>> {
  const ids = [...new Set(userIds)].filter(Boolean)
  if (ids.length === 0) return new Map()
  const rows = must(
    await supabase.from('profiles').select('user_id, email, display_name').in('user_id', ids),
  ) as Profile[]
  return new Map(rows.map((p) => [p.user_id, p]))
}

// --- Projects -------------------------------------------------------------

export async function listProjects(orgId: string | null): Promise<Project[]> {
  const q = supabase.from('projects').select('*').order('created_at', { ascending: true })
  return must(await (orgId === null ? q.is('org_id', null) : q.eq('org_id', orgId)))
}

export async function createProject(orgId: string | null, name: string, status = 'active'): Promise<Project> {
  const { data: auth } = await supabase.auth.getUser()
  const ownerId = auth.user?.id
  if (!ownerId) throw new Error('Not signed in')
  return must(
    await supabase.from('projects').insert({ name, status, org_id: orgId, owner_id: ownerId }).select().single(),
  )
}

export async function updateProjectStatus(projectId: string, status: string): Promise<void> {
  must(await supabase.from('projects').update({ status }).eq('id', projectId).select().single())
}

// --- Tasks ----------------------------------------------------------------

export async function listTasksForProjects(projectIds: string[]): Promise<Task[]> {
  if (projectIds.length === 0) return []
  return must(await supabase.from('tasks').select('*').in('project_id', projectIds))
}

export interface NewTask {
  projectId: string
  title: string
  description?: string
  status?: string
  priority?: string
  deadline?: string | null
}

export async function createTask(input: NewTask): Promise<Task> {
  const { data: auth } = await supabase.auth.getUser()
  const createdBy = auth.user?.id
  if (!createdBy) throw new Error('Not signed in')
  return must(
    await supabase
      .from('tasks')
      .insert({
        project_id: input.projectId,
        title: input.title,
        description: input.description ?? '',
        status: input.status ?? 'todo',
        priority: input.priority ?? 'medium',
        deadline: input.deadline ?? null,
        created_by: createdBy,
      })
      .select()
      .single(),
  )
}

export async function updateTask(taskId: string, patch: Partial<Pick<Task, 'status' | 'priority' | 'deadline' | 'title' | 'description'>>): Promise<Task> {
  return must(await supabase.from('tasks').update(patch).eq('id', taskId).select().single())
}

// --- Assignments ----------------------------------------------------------

export async function listAssignments(taskIds: string[]): Promise<TaskAssignment[]> {
  if (taskIds.length === 0) return []
  return must(await supabase.from('task_assignments').select('*').in('task_id', taskIds))
}

export async function assignTask(taskId: string, userId: string): Promise<TaskAssignment> {
  return must(await supabase.from('task_assignments').insert({ task_id: taskId, user_id: userId }).select().single())
}

export async function unassignTask(assignmentId: string): Promise<void> {
  const { error } = await supabase.from('task_assignments').delete().eq('id', assignmentId)
  if (error) throw new Error(error.message)
}

/** Task ids assigned to a user (for the employee "my tasks" view). */
export async function listMyAssignedTaskIds(userId: string): Promise<string[]> {
  const rows = must(
    await supabase.from('task_assignments').select('task_id').eq('user_id', userId),
  ) as { task_id: string }[]
  return rows.map((r) => r.task_id)
}

export async function listTasksByIds(taskIds: string[]): Promise<Task[]> {
  if (taskIds.length === 0) return []
  return must(await supabase.from('tasks').select('*').in('id', taskIds))
}

// --- Comments -------------------------------------------------------------

export async function listComments(taskId: string): Promise<TaskComment[]> {
  return must(
    await supabase.from('task_comments').select('*').eq('task_id', taskId).order('created_at', { ascending: true }),
  )
}

export async function addComment(taskId: string, body: string): Promise<TaskComment> {
  const { data: auth } = await supabase.auth.getUser()
  const authorId = auth.user?.id
  if (!authorId) throw new Error('Not signed in')
  return must(
    await supabase.from('task_comments').insert({ task_id: taskId, author_id: authorId, body }).select().single(),
  )
}
