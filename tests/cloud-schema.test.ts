import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Reasoning guard over the migration: enforce the RLS invariants we rely on so a
// future edit can't silently make a tenant table world-readable. Not a Postgres
// run (no server here) — a structural check of the policy text.
const sql = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'migrations', '0001_multitenant_foundation.sql'),
  'utf8'
).toLowerCase().replace(/--[^\n]*/g, '') // drop comments so prose can't match policy checks

const tenantTables = [
  'organizations', 'memberships', 'projects', 'tasks',
  'task_assignments', 'devices', 'audit_log', 'shared_resources'
]

describe('multi-tenant migration', () => {
  it('enables RLS on every tenant table', () => {
    for (const t of tenantTables) expect(sql).toMatch(new RegExp(`alter table public\\.${t}\\s+enable row level security`))
  })

  it('gives every tenant table at least one policy', () => {
    for (const t of tenantTables) expect(sql).toMatch(new RegExp(`create policy \\w+ on public\\.${t}`))
  })

  it('never leaves a tenant policy world-open with using (true)', () => {
    expect(sql).not.toMatch(/using\s*\(\s*true\s*\)/)
    expect(sql).not.toMatch(/with check\s*\(\s*true\s*\)/)
  })

  it('every policy is scoped to auth.uid() or a membership check', () => {
    // Each policy clause must reference the caller identity, directly or via a helper.
    const policies = sql.split('create policy').slice(1)
    expect(policies.length).toBeGreaterThanOrEqual(tenantTables.length)
    for (const body of policies) {
      const clause = body.split(/create |;/)[0]
      // Either a direct identity/membership check, or a subquery against a parent
      // table whose own RLS re-applies (tasks -> projects, assignments -> tasks).
      expect(clause).toMatch(/auth\.uid\(\)|is_org_member|has_org_role|from public\.(projects|tasks)/)
    }
  })

  it('keeps audit_log append-only (no update or delete policy)', () => {
    const audit = sql.slice(sql.indexOf('create policy audit_log'))
    const auditPolicies = audit.slice(0, audit.indexOf('shared_resources'))
    expect(auditPolicies).toContain('for select')
    expect(auditPolicies).toContain('for insert')
    expect(auditPolicies).not.toContain('for update')
    expect(auditPolicies).not.toContain('for delete')
  })

  it('pins search_path on SECURITY DEFINER helpers so they cannot be hijacked', () => {
    const definers = sql.split('security definer').slice(1)
    expect(definers.length).toBeGreaterThanOrEqual(3)
    for (const d of definers) expect(d.slice(0, 80)).toContain("set search_path = ''")
  })
})
