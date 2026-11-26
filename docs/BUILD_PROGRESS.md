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
| W1 | Model routing v2 — capability profiles + fallback chain (§12) | — | In review | PR #41 |
| W2 | Project Intelligence Engine v1 — incremental index + retrieval + context compiler (§13) | — | In review | PR #38 |
| W3 | Cloud backend + multi-tenant data model — orgs, roles, projects, tasks, devices, audit, RLS (§3B/4/19/20) | — | In review | PR #39 (migration not applied) |
| W4 | Web agency dashboard — owner + employee (§5/6) | W3 | In progress | stacked on W3 branch |
| W5 | Inbound remote control / Jarvis — device registry, heartbeat, command queue (§17) | W3 | In progress | stacked on W3 branch |
| W6 | Mobile app — monitoring, approvals, voice (§18) | W3, W5 | In progress | stacked on W3 branch |
| W7 | Simple mode — chat-first desktop surface (§7) | — | In review | PR #40 |
| W8 | Security & RBAC hardening pass (§20) | W3, W4, W5 | Queued | starts when W4/W5 land |
| W9 | Help Center (§24) | W4 | Queued | starts when W4 lands |

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
