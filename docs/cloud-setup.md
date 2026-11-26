# Cloud setup

How to apply the multi-tenant schema to a Supabase project. This is a one-time
step the project owner runs; the desktop app already signs in with Supabase Auth
(see [supabase-authentication.md](./supabase-authentication.md)).

The schema and access model are described in
[DATABASE_ARCHITECTURE.md](./DATABASE_ARCHITECTURE.md). The migration lives in
[`supabase/migrations/0001_multitenant_foundation.sql`](../supabase/migrations/0001_multitenant_foundation.sql).

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
2. Paste the contents of `supabase/migrations/0001_multitenant_foundation.sql`.
3. Run it. It is idempotent (`if not exists`, `or replace`), so re-running is safe.

### Option B — Supabase CLI (recommended, version-controlled)

```bash
# one-time
supabase link --project-ref <your-project-ref>

# apply every file in supabase/migrations in order
supabase db push
```

Add later schema changes as new numbered files in `supabase/migrations/`
(`0002_*.sql`, …); `supabase db push` applies the ones not yet run.

## Verify

After applying, confirm RLS is on and policies exist (SQL editor):

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;
-- rowsecurity must be true for: organizations, memberships, projects, tasks,
-- task_assignments, devices, audit_log, shared_resources

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
