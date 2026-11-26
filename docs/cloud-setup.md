# Cloud setup

How to apply the multi-tenant schema to a Supabase project. This is a one-time
step the project owner runs; the desktop app already signs in with Supabase Auth
(see [supabase-authentication.md](./supabase-authentication.md)).

The schema and access model are described in
[DATABASE_ARCHITECTURE.md](./DATABASE_ARCHITECTURE.md). The migrations live in
[`supabase/migrations/`](../supabase/migrations/) and must be applied in filename
order:

| File | Adds |
| --- | --- |
| `0001_multitenant_foundation.sql` | orgs, memberships, projects, tasks, assignments, devices, audit log, shared resources + RLS |
| `0002_remote_control.sql` | per-device remote control, grants, command queue |
| `0003_web_dashboard.sql` | profiles (names instead of UUIDs), task comments, task priority/deadline/description |
| `0004_ownership_guard.sql` | prevents an org ever losing its last owner; admins cannot remove or demote an owner |

## Prerequisites

- A Supabase project (the same one used for sign-in).
- Email auth enabled (already required for sign-in).
- The project's public values in the project-root `.env`:

  ```
  VITE_SUPABASE_URL=https://your-project.supabase.co
  VITE_SUPABASE_PUBLISHABLE_KEY=your-public-publishable-key
  ```

  The cloud data layer uses the **same public key and the signed-in user's token**
  as auth — no service-role or secret key is used by the app.

## Apply the migration

Pick one.

### Option A — Supabase SQL editor (no tooling)

1. Open your project → **SQL Editor** → **New query**.
2. Paste and run each file **in order**, `0001` through `0004`.
3. Tables use `if not exists`, so re-running is safe. Policies and triggers are not
   all idempotent on a second manual run: if you re-paste a file you already ran,
   `drop policy`/`create policy` pairs after `0001` will error. Use the CLI (below)
   for repeatable application, or only re-run files that have not been applied.

### Option B — Supabase CLI (recommended, version-controlled)

```bash
# one-time
supabase link --project-ref <your-project-ref>

# apply every file in supabase/migrations in order
supabase db push
```

Add later schema changes as new numbered files in `supabase/migrations/`
(`0005_*.sql`, …); `supabase db push` applies the ones not yet run. Never reuse a
version prefix: two files starting with the same number are treated as one
migration by the CLI.

## Verify locally first (no Supabase project needed)

`npm test` runs `tests/migrations.test.ts`, which applies all migrations to an
embedded PostgreSQL (PGlite) and signs in as test users to check the access rules
(cross-org isolation, ownership invariants, remote-control grants, audit log
append-only). Run just that file with:

```bash
npx vitest run tests/migrations.test.ts
```

## Verify the deployed project

After applying, confirm RLS is on and policies exist (SQL editor):

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;
-- rowsecurity must be true for all 12 public tables (organizations, memberships,
-- projects, tasks, task_assignments, devices, audit_log, shared_resources,
-- device_grants, commands, profiles, task_comments)

select tablename, count(*) as policies
from pg_policies
where schemaname = 'public'
group by tablename
order by tablename;
-- every table above must have at least one policy
```

A quick end-to-end check as a signed-in user (the app's `cloud:orgs` IPC does the
same): creating an organization should auto-create your `owner` membership.

```sql
-- run as an authenticated user, e.g. from the app or an authed client
insert into public.organizations (name, owner_id) values ('My Agency', auth.uid());
select o.name, m.role
from public.organizations o
join public.memberships m on m.org_id = o.id and m.user_id = auth.uid();
-- expect one row: My Agency | owner
```

## Notes

- **No destructive migrations here.** This migration only creates objects; it does
  not touch the local SQLite database the desktop app uses for projects today.
- **Realtime** (for the web/mobile clients) can be enabled per table in
  **Database → Replication** when those clients are built; it is not required for
  this foundation.
- Keep service-role/secret keys out of the app and out of `.env`. The build
  rejects administrator keys.
