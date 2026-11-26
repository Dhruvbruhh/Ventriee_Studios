import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'

// Runs the real migrations against an embedded PostgreSQL (PGlite, WASM) and
// exercises the Row-Level Security model as signed-in users. This is the only
// automated proof that the cloud schema and its access rules behave as designed;
// text-matching tests cannot catch a policy that is syntactically right but
// semantically open.
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const migrationsDir = join(root, 'supabase', 'migrations')
const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()

const U1 = '11111111-1111-4111-8111-111111111111'
const U2 = '22222222-2222-4222-8222-222222222222'
const OUTSIDER = '33333333-3333-4333-8333-333333333333'

let db: PGlite
let orgId: string
let u1Project: string
let u1Task: string
let deviceId: string
let commandId: string

// Minimal stand-in for the Supabase environment the migrations expect: the auth
// schema, auth.uid() reading the JWT claims GUC, and the API roles. Tables stay
// owned by postgres, so RLS applies once a query switches to `authenticated`.
const SUPABASE_SHIM = `
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid
$$;
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin; exception when duplicate_object then null; end $$;
grant usage on schema public, auth to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`

// Act as a signed-in user: RLS applies exactly as it does behind PostgREST.
async function as(user: string, sql: string, params: unknown[] = []) {
  await db.exec('reset role')
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: user })])
  await db.exec('set role authenticated')
  return db.query(sql, params)
}

// Setup / assertions with RLS bypassed, like the dashboard or a migration would.
async function seed<T>(sql: string, params: unknown[] = []) {
  await db.exec('reset role')
  return db.query<T>(sql, params)
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(SUPABASE_SHIM)
  for (const f of files) await db.exec(readFileSync(join(migrationsDir, f), 'utf8'))
  await seed(`insert into auth.users (id, email) values ($1, 'one@example.com'), ($2, 'two@example.com'), ($3, 'three@example.com')`, [U1, U2, OUTSIDER])

  // U1 creates an organization: the trigger must make them owner.
  const org = await as(U1, `insert into public.organizations (name, owner_id) values ('Agency', $1) returning id`, [U1])
  orgId = (org.rows[0] as { id: string }).id
  // U2 is an ordinary employee of that org.
  await seed(`insert into public.memberships (org_id, user_id, role) values ($1, $2, 'employee')`, [orgId, U2])

  const project = await as(U1, `insert into public.projects (org_id, owner_id, name) values ($1, $2, 'Client site') returning id`, [orgId, U1])
  u1Project = (project.rows[0] as { id: string }).id
  const task = await as(U1, `insert into public.tasks (project_id, title, created_by) values ($1, 'Build hero', $2) returning id`, [u1Project, U1])
  u1Task = (task.rows[0] as { id: string }).id
  await as(U1, `insert into public.task_assignments (task_id, user_id) values ($1, $2)`, [u1Task, U2])

  const device = await as(U1, `insert into public.devices (user_id, name) values ($1, 'Laptop') returning id`, [U1])
  deviceId = (device.rows[0] as { id: string }).id
}, 60000)

afterAll(async () => {
  await db?.close()
})

describe('cloud migrations', () => {
  it('applies every migration file in version order', () => {
    expect(files).toEqual([
      '0001_multitenant_foundation.sql',
      '0002_remote_control.sql',
      '0003_web_dashboard.sql',
      '0004_ownership_guard.sql',
      '0005_desktop_sync.sql',
      '0006_command_defaults.sql',
    ])
  })

  it('enables RLS on every public table', async () => {
    const res = await db.query<{ tablename: string; rowsecurity: boolean }>(
      `select tablename, rowsecurity from pg_tables where schemaname = 'public' order by tablename`
    )
    expect(res.rows.length).toBe(12)
    for (const r of res.rows) expect(r.rowsecurity, r.tablename).toBe(true)
  })

  it('makes the org creator the owner member', async () => {
    const res = await seed(`select role from public.memberships where org_id = $1 and user_id = $2`, [orgId, U1])
    expect(res.rows).toEqual([{ role: 'owner' }])
  })

  it('mirrors new auth users into profiles', async () => {
    const res = await seed(`select display_name from public.profiles where user_id = $1`, [U1])
    expect(res.rows).toEqual([{ display_name: 'one' }])
  })

  it('blocks ownership transfer through the API', async () => {
    await expect(
      as(U1, `update public.organizations set owner_id = $1 where id = $2`, [U2, orgId])
    ).rejects.toThrow(/cannot be transferred/)
  })

  it('does not let an employee promote themselves', async () => {
    await as(U2, `update public.memberships set role = 'admin' where org_id = $1 and user_id = $2`, [orgId, U2])
    const res = await seed(`select role from public.memberships where org_id = $1 and user_id = $2`, [orgId, U2])
    expect(res.rows).toEqual([{ role: 'employee' }])
  })

  it('keeps personal workspaces private', async () => {
    const personal = await as(U2, `insert into public.projects (owner_id, name) values ($1, 'My notes') returning id`, [U2])
    const id = (personal.rows[0] as { id: string }).id
    const seenByU1 = await as(U1, `select id from public.projects where id = $1`, [id])
    expect(seenByU1.rows).toEqual([])
    const own = await as(U2, `select id from public.projects where id = $1`, [id])
    expect(own.rows).toEqual([{ id }])
  })

  it('blocks writing tasks into a project you cannot see', async () => {
    await expect(
      as(U2, `insert into public.tasks (project_id, title, created_by) values ($1, 'Sneaky', $2)`, [u1Project, U2])
    ).rejects.toThrow(/row-level security/)
  })

  it('shows the roster only to co-members', async () => {
    const u2Sees = await as(U2, `select user_id from public.memberships where org_id = $1 order by user_id`, [orgId])
    expect(u2Sees.rows.length).toBe(2)
    const outsiderSees = await as(OUTSIDER, `select user_id from public.memberships where org_id = $1`, [orgId])
    expect(outsiderSees.rows).toEqual([])
  })

  it('hides profiles from users who share no organization', async () => {
    const outsiderSees = await as(OUTSIDER, `select user_id from public.profiles order by user_id`)
    expect(outsiderSees.rows).toEqual([{ user_id: OUTSIDER }])
    const shared = await as(U2, `select user_id from public.profiles order by user_id`)
    expect(shared.rows.length).toBe(2)
  })

  it('lets an assigned employee comment on their task only', async () => {
    await as(U2, `insert into public.task_comments (task_id, author_id, body) values ($1, $2, 'Started')`, [u1Task, U2])
    await expect(
      as(OUTSIDER, `insert into public.task_comments (task_id, author_id, body) values ($1, $2, 'Hi')`, [u1Task, OUTSIDER])
    ).rejects.toThrow(/row-level security/)
  })

  it('keeps the audit log append-only', async () => {
    await as(U1, `insert into public.audit_log (org_id, actor_id, action) values ($1, $2, 'project.created')`, [orgId, U1])
    await as(U1, `update public.audit_log set action = 'tampered' where org_id = $1`, [orgId])
    await as(U1, `delete from public.audit_log where org_id = $1`, [orgId])
    const rows = await seed<{ action: string }>(`select action from public.audit_log where org_id = $1`, [orgId])
    expect(rows.rows).toEqual([{ action: 'project.created' }])
  })

  it('leaves remote control off, and refuses commands until the owner grants it', async () => {
    const off = await as(U1, `select remote_enabled from public.devices where id = $1`, [deviceId])
    expect(off.rows).toEqual([{ remote_enabled: false }])

    const enqueue = `insert into public.commands (device_id, type, requested_by, expires_at)
                     values ($1, 'agent.start', $2, now() + interval '5 minutes') returning id`
    await expect(as(U1, enqueue, [deviceId, U1])).rejects.toThrow(/row-level security/)

    await as(U1, `update public.devices set remote_enabled = true where id = $1`, [deviceId])
    await expect(as(U2, enqueue, [deviceId, U2])).rejects.toThrow(/row-level security/)

    await as(U1, `insert into public.device_grants (device_id, user_id, granted_by) values ($1, $2, $3)`, [deviceId, U2, U1])
    const queued = await as(U2, enqueue, [deviceId, U2])
    commandId = (queued.rows[0] as { id: string }).id
    expect(commandId).toBeTruthy()
  })

  it('only lets the device owner claim a command', async () => {
    const claim = `update public.commands set status = 'claimed', claimed_at = now() where id = $1`
    await as(U2, claim, [commandId])
    const stillQueued = await seed(`select status from public.commands where id = $1`, [commandId])
    expect(stillQueued.rows).toEqual([{ status: 'queued' }])

    await as(U1, claim, [commandId])
    const claimed = await seed(`select status from public.commands where id = $1`, [commandId])
    expect(claimed.rows).toEqual([{ status: 'claimed' }])
  })

  it('fills requested_by and expires_at for a client insert, and still blocks spoofing', async () => {
    // Shape the desktop and mobile clients actually send: no requester, no expiry.
    const res = await as(U2, `insert into public.commands (device_id, type, payload, requires_confirmation)
                              values ($1, 'run.start', '{"projectId":"p"}', true) returning requested_by, expires_at > now() as live`, [deviceId])
    expect(res.rows).toEqual([{ requested_by: U2, live: true }])
    await expect(as(U2, `insert into public.commands (device_id, type, requested_by) values ($1, 'run.start', $2)`, [deviceId, U1]))
      .rejects.toThrow(/row-level security/)
  })

  it('cannot enqueue a command for a device in another org scope', async () => {
    await expect(
      as(U1, `insert into public.commands (device_id, org_id, type, requested_by, expires_at)
              values ($1, $2, 'agent.start', $3, now() + interval '5 minutes')`, [deviceId, orgId, U1])
    ).rejects.toThrow(/row-level security/)
  })

  // Last two: these change or depend on U2 being an admin / U1 still owning.
  it('lets the owner promote an employee to admin', async () => {
    await as(U1, `update public.memberships set role = 'admin' where org_id = $1 and user_id = $2`, [orgId, U2])
    const res = await seed(`select role from public.memberships where org_id = $1 and user_id = $2`, [orgId, U2])
    expect(res.rows).toEqual([{ role: 'admin' }])
  })

  it('does not let an admin remove or demote the owner', async () => {
    await as(U2, `delete from public.memberships where org_id = $1 and user_id = $2`, [orgId, U1])
    await as(U2, `update public.memberships set role = 'employee' where org_id = $1 and user_id = $2`, [orgId, U1])
    const res = await seed(`select role from public.memberships where org_id = $1 and user_id = $2`, [orgId, U1])
    expect(res.rows).toEqual([{ role: 'owner' }])
  })

  it('refuses to remove the last owner', async () => {
    await expect(
      as(U1, `delete from public.memberships where org_id = $1 and user_id = $2`, [orgId, U1])
    ).rejects.toThrow(/at least one owner/)
    const res = await seed(`select role from public.memberships where org_id = $1 and user_id = $2`, [orgId, U1])
    expect(res.rows).toEqual([{ role: 'owner' }])
  })
})
