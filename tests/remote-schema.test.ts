import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Reasoning guard over the 0002 migration (no Postgres here): the RLS invariants the
// remote-control security model depends on, so a future edit can't silently open the
// command bus to the whole org.
const sql = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'migrations', '0002_remote_control.sql'),
  'utf8'
).toLowerCase().replace(/--[^\n]*/g, '')

describe('remote-control migration', () => {
  it('enables RLS on the command bus and the grants table', () => {
    for (const t of ['commands', 'device_grants'])
      expect(sql).toMatch(new RegExp(`alter table public\\.${t}\\s+enable row level security`))
  })

  it('never leaves a policy world-open with using/with check (true)', () => {
    expect(sql).not.toMatch(/using\s*\(\s*true\s*\)/)
    expect(sql).not.toMatch(/with check\s*\(\s*true\s*\)/)
  })

  it('gates enqueue on explicit per-device control, not mere org membership', () => {
    // The insert check must call can_control_device (owner or explicit grant), and
    // the schema must NOT fall back to is_org_member for command inserts.
    const insert = sql.slice(sql.indexOf('create policy commands_insert'))
    const clause = insert.slice(0, insert.indexOf(';'))
    expect(clause).toContain('can_control_device')
    expect(clause).not.toContain('is_org_member')
  })

  it('only the device owner process may claim/update command rows', () => {
    const start = sql.indexOf('create policy commands_update')
    const clause = sql.slice(start, sql.indexOf(';', start))
    expect(clause).toContain('owns_device')
  })

  it('requires confirmation and expiry to exist on the queue', () => {
    expect(sql).toContain('requires_confirmation')
    expect(sql).toMatch(/expires_at\s+timestamptz\s+not null/)
  })

  it('constrains status to the known lifecycle set', () => {
    expect(sql).toMatch(/status in \('queued','claimed','running','done','failed','expired'\)/)
  })

  it('defaults remote control to off (least privilege)', () => {
    expect(sql).toMatch(/remote_enabled boolean not null default false/)
    // can_control_device must require the device be enabled.
    const open = sql.indexOf('function public.can_control_device')
    const body = sql.slice(sql.indexOf('as $$', open), sql.indexOf('$$;', open))
    expect(body).toContain('remote_enabled')
  })

  it('pins search_path on SECURITY DEFINER helpers so they cannot be hijacked', () => {
    const definers = sql.split('security definer').slice(1)
    expect(definers.length).toBeGreaterThanOrEqual(2)
    for (const d of definers) expect(d.slice(0, 80)).toContain("set search_path = ''")
  })

  it('does not let the queue be erased through the API (no delete policy)', () => {
    const commandsPolicies = sql.slice(sql.indexOf('create policy commands_select'))
    expect(commandsPolicies).not.toContain('for delete')
  })
})
