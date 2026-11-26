# Ventriee AI — Ecosystem build progress

Program tracker for the "Master System Build Prompt". Audit: see
`docs/audits/ECOSYSTEM-AUDIT-2026-11-26.md`. Each workstream is a separate
session producing its own PR. This file is the index; each session keeps its own
detail.

## Status legend
Not started · In progress · In review (PR open) · Done (merged) · Blocked

## Workstreams

| # | Workstream | Depends on | Status | PR / branch |
|---|---|---|---|---|
| W1 | Model routing v2 — capability profiles + fallback chain (§12) | — | Done (merged) | PR #41 |
| W2 | Project Intelligence Engine v1 — incremental index + retrieval + context compiler (§13) | — | Done (merged) | PR #38 |
| W3 | Cloud backend + multi-tenant data model — orgs, roles, projects, tasks, devices, audit, RLS (§3B/4/19/20) | — | Done (merged) | PR #39; schema verified locally by `tests/migrations.test.ts`, not yet applied to a Supabase project |
| W4 | Web agency dashboard — owner + employee (§5/6) | W3 | Done (integrated on master) | branch `claude/web-agency-dashboard-68675a` merged directly (web/ package; Cloudflare Pages deploy steps in web/README.md) |
| W5 | Inbound remote control / Jarvis — device registry, heartbeat, command queue (§17) | W3 | Done (merged) | integrated from branch `claude/jarvis-remote-control-b9a5f3`; verified locally, not yet applied to a Supabase project |
| W6 | Mobile app — monitoring, approvals, voice (§18) | W3, W5 | Done (merged) | `mobile/` Expo app integrated from branch `claude/mobile-jarvis-app-769e08`; jest 18 tests green |
| W7 | Simple mode — chat-first desktop surface (§7) | — | Done (merged) | PR #40 |
| W8 | Security & RBAC hardening pass (§20) | W3, W4, W5 | Done (merged) | `w8-security-rbac` (RLS fixes: admin self-promotion, owner transfer, device org scoping; IPC session-gating; SECURITY_ARCHITECTURE.md; npm audit 0) |
| W9 | Help Center (§24) | W4 | Done (merged) | `w9-help-center` (14 topics, sidebar panel, help content tests) |
| W10 | Cloud schema verification + ownership guard (§20/21/32) | W3, W5, W8 | Done | migration `0004_ownership_guard.sql`; `tests/migrations.test.ts` runs all migrations on embedded PostgreSQL and exercises RLS as real users |
| W11 | Unified resource library + natural-language discovery (§14) | - | Done | registry in `src/shared/resources.ts` + `src/main/resources.ts`; IPC `resources:list`; `ResourcesPanel` rewritten over real sources; `tests/resources.test.ts` (12 tests) |
| W12 | Security Master tooling (§11) | - | Done | read-only scan in `src/shared/security.ts` + `src/main/securityScan.ts` (secrets, code patterns, .env hygiene, npm audit); IPC `security:scan`; Security panel; scan results injected into the security worker's prompt; `tests/security.test.ts` (12 tests) |
| W13 | Frontend Master visual QA loop (§10) | - | Done | `src/main/visualQa.ts`: after a frontend worker delivers, the sandboxed browser renders the running preview at desktop + 390px mobile, screenshots both, and collects console errors; failures send the task to rework with the specific problems; the reviewer receives the rendered-check summary; `tests/visualQa.test.ts` (4 tests) |
| W14 | Desktop↔cloud sync for projects, tasks and run status (§19) | W3, W4 | Done (PR open) | `src/main/cloud/sync.ts` mirrors projects/tasks (metadata only) into the active workspace via a local `cloud_sync` outbox with per-row backoff; compare-and-set on `updated_at` records conflicts instead of overwriting; new cloud tasks arrive as owner inbox messages; Settings toggle + header status dot; migration `0005_desktop_sync.sql` (updated_at, run_status/model/agent, fix for recursive `tasks_update` RLS); `tests/cloud-sync.test.ts` (7 tests) |

## Verification baseline (master, after W13)
- typecheck: clean (node + web tsconfigs); mobile `tsc --noEmit` clean
- vitest: 431 passed, 1 skipped (86 files), including 18 executable migration/RLS tests, 12 resource-library tests, 12 security-scanner tests and 4 visual-QA tests
- desktop build: `npm run build` green
- web build: `cd web && npm run build` green
- mobile: `npm ci && npm run typecheck && npm test` green (18 jest tests)
- CI (`.github/workflows/ci.yml`) runs desktop on Windows+Linux, plus separate `web` and `mobile` jobs
- Supabase migrations: apply cleanly, in order, to real PostgreSQL (`0001`–`0004`); not yet applied to a hosted project (external credential)

## Rules for every workstream (from §28)
- Build on existing code; don't rebuild the desktop or replace auth/DB.
- Keep the app buildable: typecheck + vitest pass before a PR.
- No mock data presented as complete; verify the real workflow.
- One reviewable PR per slice; update this table when a PR opens or merges.

## Log
- 2026-11-26: Audit done. W1/W2/W3 launched as parallel sessions. W4–W9 queued
  behind the backend.
- 2026-11-26: W4 scope set: Studios `web/` stays separate from the Agency repo and
  deploys to Cloudflare Pages on workspace/dashboard/app.ventriee.in (one build,
  hostname picks the surface). Deploy steps in `web/README.md`.
- 2026-11-26: W10. Fixed two migrations sharing version `0002` (the Supabase CLI
  treats them as one): `0002_web_dashboard.sql` is now `0003_web_dashboard.sql`.
  Removed the `pgcrypto` extension line (unused; `gen_random_uuid()` is core in
  PG13+), so the schema applies on any modern PostgreSQL. Added
  `0004_ownership_guard.sql`: an org can never lose its last owner, and an admin
  cannot demote or delete an owner row (the old single `for all` policy only
  applied USING to DELETE). Replaced the text-matching schema tests with
  `tests/migrations.test.ts`, which runs all migrations on PGlite and signs in as
  three users to prove cross-org isolation, ownership invariants, audit-log
  append-only, comment access, and remote-command authorization. CI now also
  builds `web/` and typechecks+tests `mobile/`.
- 2026-11-26: W11. The Resource Library was a hardcoded 26-entry list in the
  renderer, which §14 forbids and which could not show installed state. It now
  reads a real registry: skills (enabled = Installed, disabled = Available),
  plugins, MCP servers, workflows, the 16 built-in worker roles, and a curated
  catalogue of external libraries. Library state is read from the open project's
  `package.json` (scoped packages by prefix); with no project open nothing is
  claimed as installed. `discoverResources` ranks by name/capability/description
  with a small intent-to-capability synonym map and shows the matched terms
  ("Matches animation, motion, scroll"). The panel groups by state with counts,
  links installed resources to the panel that manages them, and shows the exact
  install command for a missing library; nothing is executed automatically. New
  files: `src/shared/resources.ts`, `src/main/resources.ts`,
  `tests/resources.test.ts`. Also added a Help topic (`resources`).
- 2026-11-26: W12. The security role relied on prompt instructions alone; §11
  wants AI reasoning combined with real tools. Added a deterministic, read-only
  scanner (`scanProject`): nine secret formats with masked evidence, five
  dangerous-code rules (disabled TLS verification, eval/new Function, raw HTML
  injection, wildcard CORS), .env hygiene (real values and not gitignored),
  and the real `npm audit --json` parsed into findings. Walks up to 800 files,
  skips node_modules/dist/data blobs, and says when the report is partial. The
  report's own limits state that a clean result is not proof of security. New
  Security panel (sidebar) shows findings with severity/impact/fix; the security
  worker receives the digest in its task prompt. No writing, fixing or deleting
  is ever performed automatically.
- 2026-11-26: W13. Frontend work was judged only on source text; §10 requires
  evaluation of the rendered interface. After a frontend worker delivers, the
  orchestrator now renders the project's running preview in the sandboxed
  automation browser, screenshots it at desktop and 390×844 mobile widths, and
  collects the page's console errors. Problems (console errors, a failed
  screenshot, a nearly empty page body) send the task straight to rework with
  the specific findings; a pass is recorded in the task review and given to the
  reviewer. Skips are logged explicitly (no preview running, no browser). The
  loop never throws and never fixes anything itself. New files:
  `src/main/visualQa.ts`, `tests/visualQa.test.ts`; orchestrator deps gained an
  optional structural `browser`. Known limit: screenshots live in the browser
  screens folder and the run log; the task review stores the summary, not the
  image.
- 2026-11-26: W14. Desktop work never reached the cloud, so the web dashboard
  and mobile app had nothing real to show. `CloudSync` (`src/main/cloud/sync.ts`)
  listens to store writes of projects and tasks (`Store.onChange`, not the
  orchestrator) and only marks a row dirty in a local `cloud_sync` table, which
  holds the desktop↔cloud id mapping, the outbox, per-row backoff and conflicts.
  A debounced flush, plus a 60 s tick while signed in, pushes projects first,
  then tasks (title, mapped board status, raw desktop status, model, worker
  name), redacted and checked against a column allowlist; paths, descriptions,
  output, code and memory never leave. Updates are compare-and-set on the new
  `updated_at` column, so a row edited on the web is recorded as a conflict and
  shown in Settings until the owner keeps the desktop version. Tasks created in
  the cloud on a linked project arrive once as an unread owner message, never
  as a runnable task. Migration `0005_desktop_sync.sql` also fixes a 0001 bug:
  any user UPDATE on `tasks` failed with infinite RLS recursion (tasks_update →
  task_assignments → tasks); a definer `is_task_assignee()` replaces the
  subquery. Known limits: deleting a desktop project does not delete its cloud
  copy; there is no "take cloud version" (only keep desktop); a project already
  linked stays in the workspace it was first pushed to.
