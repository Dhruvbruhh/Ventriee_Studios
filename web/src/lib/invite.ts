// Shared validation for the invite-member Edge Function. Kept as pure functions
// so the web tests can pin the rules without a Deno runtime; the function in
// supabase/functions/invite-member applies the same checks server-side.

export const INVITE_ASSIGNABLE_ROLES = ['admin', 'project_manager', 'employee'] as const
export const INVITE_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validInviteEmail(email: unknown): email is string {
  return typeof email === 'string' && email.length <= 320 && INVITE_EMAIL_RE.test(email.trim())
}

export function validInviteRole(role: unknown): role is (typeof INVITE_ASSIGNABLE_ROLES)[number] {
  return typeof role === 'string' && (INVITE_ASSIGNABLE_ROLES as readonly string[]).includes(role)
}

export function validOrgId(orgId: unknown): orgId is string {
  return typeof orgId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orgId)
}
