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
| W15 | Isolated Git worktrees for parallel code tasks (§9/§16) | - | Done | `src/main/worktrees.ts`: in a clean Git project with parallel runs on, each code task runs in its own worktree (branch `ventriee/task-<id>`, under the app data dir); after its evidence check it is committed and merged `--no-ff` one at a time; a conflict is aborted and the task goes to rework with the files listed; a dirty project is never merged into (branch kept). Falls back to in-place serialized work for non-git, uncommitted or setting-off projects. Boot recovery removes orphans and keeps unmerged branches. Setting "Isolate parallel code tasks". `tests/worktrees.test.ts` (5), `tests/orchestrator-worktrees.test.ts` (3) |
| W18 | Org memory layer, memory version history, measured model routing (§12/§13) | W1, W2 | Done | branch `claude/w18-intel-upgrades-a5183a`; `tests/memory-layers.test.ts` (8 tests) |
| W14 | Desktop↔cloud sync for projects, tasks and run status (§19) | W3, W4 | Done (PR open) | `src/main/cloud/sync.ts` mirrors projects/tasks (metadata only) into the active workspace via a local `cloud_sync` outbox with per-row backoff; compare-and-set on `updated_at` records conflicts instead of overwriting; new cloud tasks arrive as owner inbox messages; Settings toggle + header status dot; migration `0005_desktop_sync.sql` (updated_at, run_status/model/agent, fix for recursive `tasks_update` RLS); `tests/cloud-sync.test.ts` (7 tests) |
| W19 | Planning chat: edit a message / regenerate the last reply (FEATURE_STATUS Phase 3) | - | Done | `Store.rewindChat` + `replaceFrom` on `chatSend`; Edit / Regenerate controls in `Workspace.tsx`; `tests/sessions.test.ts` (rewind case) |

## Verification baseline (master, after W19)
- typecheck: clean (node + web tsconfigs); mobile `tsc --noEmit` clean
- vitest: 485 passed, 1 skipped (92 files), including 18 executable migration/RLS tests, 12 resource-library tests, 12 security-scanner tests and 4 visual-QA tests
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
- 2026-11-26: W15. Parallel code tasks wrote straight into the project folder, so
  writers whose role scopes overlapped had to wait for each other. Now, when the
  project is a Git repository with a commit, no uncommitted owner changes, the
  run allows more than one session and the new "Isolate parallel code tasks"
  setting is on (default), each code-writing task gets its own `git worktree` on
  branch `ventriee/task-<id>` under `<userData>/worktrees/<project>/<task>`
  (node_modules is linked in, never committed). After the evidence check passes
  the task's changes are committed and merged into the checked-out branch, one
  merge at a time per project, before deploy approval, visual QA and review (so
  the preview and the reviewer see the merged result). A conflict is aborted
  and the task goes to rework with the conflicting files; the rework starts
  from the merged project. If the owner has edited the project meanwhile, the
  merge is skipped and the task's branch is kept (task failed, owner told).
  Worktrees and branches are removed on success, failure and stop; at boot,
  orphans are removed and branches with unmerged commits are kept and reported.
  The run log records which worktree a task used and the merge result. Also
  fixed in `runQueue`: a lone task cooling down in rework ended the run
  instead of retrying. Known limits: stashing uncommitted owner work (with
  approval) is not built, so a dirty project falls back to in-place work;
  intelligence retrieval still indexes the project folder, not the worktree.
- 2026-11-26: W18. Memory gains an organization layer: docs under
  `memory/orgs/<orgId>/` (scope `org`, local to this desktop, never uploaded) are
  visible only to projects whose new `projects.org_id` names that org. A project
  takes the org active in the window that created it; the Memory panel can switch
  the window's org workspace and add the open project to it. Every content change
  to a memory doc (lessons/progress from finished tasks, owner edits, restores)
  writes a `memory_versions` row with time, source and task id; a doc that predates
  history saves its prior state on its first change. The Memory panel shows each
  doc's history and restores any version (restore is itself a new version).
  Routing: finished tasks record model × role × difficulty outcomes
  (`model_outcomes`: passed / rework / failed, tokens, latency) from the worker's
  last session; hard failures before a fallback escalation count against that
  model. `routeModels` adds a measured term once a bucket has 5+ samples: the pass
  rate shrunk toward 50% by 4 phantom samples, ×10, so 5/5 is +2.8 and the cap is
  ±5 (capability fit alone spans ~10). The route reason states it ("measured 5/5
  passed (+2.8)" or "3 measured (<5, ignored)"); Settings' routing preview gains a
  role picker and the measured table. Stats key on the model id, so one model served
  by two providers shares its record. The migration is appended to `db.ts`: a
  sibling migration merged first must stay ahead of it.
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
- 2026-11-27: W19. Reconciled FEATURE_STATUS with the code: "Fallback models"
  and "Intelligent model routing" were stale (W1 shipped capability profiles and
  a fallback chain that escalates a failed task); both are now ✅. The other
  🟡/❌ entries were checked and still hold. Added message edit / regenerate to
  the planning chat: `chatSend` takes an optional `replaceFrom` owner-message id,
  and `Store.rewindChat` deletes that message and every later turn in the same
  session (refused while a reply is streaming, or for a message outside the
  active session). Edit loads the text into the composer with a Cancel banner;
  Regenerate resends the last owner turn. Known limits: old turns are discarded,
  not branched; images attached to the original message are not resent. The UI
  was typechecked and built but not clicked through (needs a signed-in session).
