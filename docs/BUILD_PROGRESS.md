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

## Verification baseline (master, after W10)
- typecheck: clean (node + web tsconfigs); mobile `tsc --noEmit` clean
- vitest: 403 passed, 1 skipped (83 files), including 18 executable migration/RLS tests
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
