import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Reasoning guard over the 0001 multi-tenant migration (no Postgres here): the
// least-privilege invariants the org security model depends on, so a future edit
// can't silently open an escalation path (admin self-promotion, ownership
// transfer, or parking a device in an org you don't belong to).
const sql = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'migrations', '0001_multitenant_foundation.sql'),
  'utf8'
).toLowerCase().replace(/--[^\n]*/g, '')

/** One policy clause: from its `create policy` line to the statement's `;`. */
const clauseOf = (name: string) => {
  const start = sql.indexOf(`create policy ${name}`)
  expect(start).toBeGreaterThan(-1)
  return sql.slice(start, sql.indexOf(';', start))
}

describe('multi-tenant migration hardening', () => {
  it('lets only the owner grant or change owner-role memberships', () => {
    const clause = clauseOf('memberships_write')
    expect(clause).toContain("role <> 'owner'")
    expect(clause).toContain('has_org_role(org_id, array[\'owner\'])')
  })

  it('keeps organization ownership immutable through the API', () => {
    const fn = sql.indexOf('function public.no_owner_transfer()')
    expect(fn).toBeGreaterThan(-1)
    const body = sql.slice(sql.indexOf('as $$', fn), sql.indexOf('$$;', fn) + 3)
    expect(body).toContain('new.owner_id is distinct from old.owner_id')
    const start = sql.indexOf('create trigger organizations_no_owner_transfer')
    const trigger = sql.slice(start, sql.indexOf(';', start))
    expect(trigger).toContain('before update on public.organizations')
    expect(trigger).toContain('execute function public.no_owner_transfer()')
  })

  it('requires org membership before a device can be placed in an org', () => {
    const clause = clauseOf('devices_write')
    expect(clause).toContain('is_org_member(org_id)')
  })

  it('still scopes every policy to the caller (no world-open policy)', () => {
    expect(sql).not.toMatch(/using\s*\(\s*true\s*\)/)
    expect(sql).not.toMatch(/with check\s*\(\s*true\s*\)/)
  })
})
