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
| W16 | Requirements clarification before planning (§8) | - | Done | `src/main/clarify.ts` (prompt, defensive parse capped at 5, fold answers into a "Clarifications" block); `Orchestrator.clarify` + IPC `run:clarify`; question panel in Simple mode, Assign dialog (orchestrator mode) and command bar; setting "Ask clarifying questions"; `tests/clarify.test.ts` (6 tests) |
| W17 | Agent catalogue with departments + importable manifests (§9) | - | Done | branch `claude/w17-agent-catalogue-7ba21e`: `src/shared/agents.ts` (template format, manifest validation), catalogue in the app DB (`Store.agentCatalogue`), planner/hiring read enabled templates, Agents panel; `tests/agents-catalogue.test.ts` (18 tests) |

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
- 2026-11-26: W16. Planning went straight from brief to plan, so vague briefs
  got invented requirements (§8). Before planning, the UI now asks the
  orchestrator agent (same engine/model and availability check as `makePlan`)
  for 0–5 questions that would materially change the result, each with a
  suggested default. A clear brief returns none and the run starts exactly as
  before. The owner edits answers or clicks "Use defaults"; answers are appended
  to the brief as a "Clarifications" block, which is what the planner sees and
  what the job's `instruction` records, so they stay visible on the run. The
  check returns no questions when the setting is off, no orchestrator is
  enabled (heuristic planner), the engine is unavailable, or the call fails or
  answers junk, so it never blocks a run. Remote/voice/automation runs skip it.
  Known limit: the saved prompt revision is not changed, only the run's brief.
- 2026-11-26: W17. Built-in roles were a fixed list in `roles.ts`; §9 wants a
  user-editable catalogue. Agent templates now carry name, title, description,
  role key, department, instructions, preferred engine/model, skills, MCP
  servers, writesCode, budget, approval requirement and enabled. The 16 built-ins
  are seeded from `ROLE_TEMPLATES` into seven default departments (Project
  Management, Frontend, Backend, Quality, Security, Research, DevOps). Only the
  owner's own templates and edits to built-ins are stored (kv `agentCatalogue`),
  so unedited built-ins keep following the code. Built-ins can be edited,
  disabled or reset, never deleted, so the planner's role keys stay valid.
  The orchestrator's role lookup (`plannableRoles`, `hire`, writesCode, skill
  fallback, planner titles) reads the catalogue: an enabled custom template is
  scheduled and hired with its engine, model, budget, MCP servers and skills; a
  disabled one is neither planned nor hired. `requiresApproval` sends the
  worker's finished task to owner approval (same path as deploy approval).
  Export writes one agent or a department as a `ventriee-agents` v1 JSON
  manifest; import rejects unknown fields, bad role keys, unknown engines and
  unlisted departments, names missing skills/MCP servers, and brings new agents
  in switched off. Manifests are data only. New Agents sidebar panel; the
  Resource Library lists enabled catalogue agents. Limits: the deterministic
  fallback planner still only knows built-in roles; custom roles get the default
  write scope (`scopeFor`); not clicked through in the running app.
