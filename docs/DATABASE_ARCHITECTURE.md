# Cloud database architecture

The desktop IDE is local-first: every project, agent run and memory doc lives in
the per-profile SQLite database (`src/main/store.ts`). This document describes a
**separate, additive** cloud layer that lets one identity work across the desktop
IDE, a web dashboard, a mobile app and remote control — the foundation for
workstreams W4–W6.

It does not replace the local database. It is the shared, multi-tenant data model
that those clients read and write through Supabase, using the same Supabase
identity the desktop app already signs in with (`src/main/auth.ts`).

Source of truth: the ordered files in [`supabase/migrations/`](../supabase/migrations/):
`0001_multitenant_foundation.sql` (tenancy, RLS), `0002_remote_control.sql`
(command bus), `0003_web_dashboard.sql` (profiles, comments, task metadata) and
`0004_ownership_guard.sql` (ownership integrity) and `0005_desktop_sync.sql`
(`updated_at` + desktop run status for sync, see `src/main/cloud/sync.ts`).
`tests/migrations.test.ts` applies all of them to an embedded PostgreSQL and exercises the policies as real
users, so the schema is verified locally without a Supabase project.

## Tenancy model

- **Personal workspace** — rows whose `org_id` is `NULL`, owned by the signed-in
  user. This is what a solo user gets with no organization at all.
- **Organization workspace** — rows whose `org_id` points at an `organizations`
  row. A user sees them only if they have a `memberships` row for that org.

A user belongs to any number of orgs. The desktop session tracks which workspace
a window is currently viewing (`StudioSession.activeOrgId`, `null` = personal);
switching is local state that scopes queries — access itself is enforced by RLS.

## Tables

| Table | Purpose | `org_id` NULL means |
| --- | --- | --- |
| `organizations` | An agency/tenant. Has one `owner_id`. | — |
| `memberships` | user ↔ org with a `role`. | — |
| `projects` | A project, personal or org-owned. | personal project |
| `tasks` | Work items under a project. | (via project) |
| `task_assignments` | task ↔ user assignment. | (via task) |
| `devices` | Desktop runtime registry — each IDE instance a user signs into. | personal device |
| `audit_log` | Append-only trail of actions. | personal action |
| `shared_resources` | Metadata for shared files/links/prompts. | personal resource |
| `device_grants` | Explicit per-device remote-control grants (`0002`). | — |
| `commands` | Durable remote command queue addressed to a device (`0002`). | — |
| `profiles` | Readable mirror of `auth.users` so rosters render names (`0003`). | — |
| `task_comments` | Append-only progress notes on a task (`0003`). | — |

### Roles

`membership_role` enum, from most to least privileged:

`owner` → `admin` → `project_manager` → `employee`

- **owner** — created the org; full control; the only role that can delete the org.
- **admin** — manage members, projects and settings.
- **project_manager** — create and manage projects and tasks, assign work.
- **employee** — read the org's projects/tasks; update tasks assigned to them.

When an org is created, a trigger (`add_owner_membership`) inserts the creator's
`owner` membership, so the org is never left with no members.

## Row-Level Security

RLS is **enabled on every table** and each has explicit policies — no table is
world-readable. Policies run with the caller's token (`auth.uid()`), so a
forbidden row is simply invisible and a forbidden write is rejected by Postgres.

Two `SECURITY DEFINER` helpers avoid the recursion of checking `memberships` from
within a `memberships` policy (their `search_path` is pinned to `''` to block
hijacking):

- `is_org_member(org)` — is the caller a member of `org`?
- `has_org_role(org, roles[])` — does the caller hold one of `roles` in `org`?

Access summary (read ⟶ write):

- **organizations** — members read; anyone can create an org they own;
  owner/admin update; only the owner deletes.
- **memberships** — co-members read the roster; owner/admin manage it.
- **projects** — personal (own, `org_id NULL`) or any project of an org you
  belong to; manager+ write org projects, the owner writes personal ones.
- **tasks** — visible iff their project is (the `projects` policy re-applies to
  the subquery, so there is one place that defines project visibility); manager+
  and personal owners write; an employee may update a task **assigned to them**.
- **task_assignments** — visible with the task; manager+/personal owner assign.
- **devices** — a user manages their own; org owner/admin can additionally see
  devices registered to their org.
- **audit_log** — read your personal actions, or (as owner/admin) your org's
  trail; inserts must be attributed to you. **No update/delete policy exists**, so
  the log cannot be altered or erased through the API.
- **shared_resources** — same shape as projects.

Design note: `tasks` and `task_assignments` derive visibility by subquery against
`projects`/`tasks` rather than by denormalizing `org_id`. Postgres re-applies the
parent table's RLS to those subqueries, so project visibility is defined once and
there is no denormalized column to keep in sync.

## How the desktop app talks to it

The app depends on the `CloudClient` interface
([`src/main/cloud/types.ts`](../src/main/cloud/types.ts)), not on Supabase. The
Supabase implementation (`SupabaseCloudClient`) calls PostgREST (`/rest/v1`) with
the signed-in user's access token, in the same raw-`fetch` style as `auth.ts` — no
Supabase SDK is added. Swapping the backend, or faking it in tests, means
providing another `CloudClient`.

This slice ships the data layer and one proof-of-use (listing the signed-in
user's orgs, IPC `cloud:orgs`). Wiring it into the IDE's panels is later work.
