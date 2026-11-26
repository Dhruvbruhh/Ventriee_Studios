// Role gating for the UI. The server's RLS is the real authority; this only
// decides what to render so owner-only controls never show for employees.
import type { MembershipRole } from './types'

const MANAGER_ROLES: MembershipRole[] = ['owner', 'admin', 'project_manager']
const ADMIN_ROLES: MembershipRole[] = ['owner', 'admin']

/** Owner/admin/project_manager see the management dashboard; employees do not. */
export function dashboardMode(role: MembershipRole): 'manager' | 'employee' {
  return MANAGER_ROLES.includes(role) ? 'manager' : 'employee'
}

/** Create/edit projects and create/assign tasks. */
export function canManageProjects(role: MembershipRole): boolean {
  return MANAGER_ROLES.includes(role)
}

/** Invite, remove, and change the role of members. Owner/admin only. */
export function canManageMembers(role: MembershipRole): boolean {
  return ADMIN_ROLES.includes(role)
}

/** Assign tasks to people. Same gate as managing projects. */
export function canAssignTasks(role: MembershipRole): boolean {
  return MANAGER_ROLES.includes(role)
}

export const ROLE_LABELS: Record<MembershipRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  project_manager: 'Project manager',
  employee: 'Employee',
}

/** Roles an owner/admin may assign to a member (not 'owner' — one owner only). */
export const ASSIGNABLE_ROLES: MembershipRole[] = ['admin', 'project_manager', 'employee']
