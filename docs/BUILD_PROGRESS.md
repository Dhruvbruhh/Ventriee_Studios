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
| W27 | Chat templates + conversation export (FEATURE_STATUS Phase 3) | - | Done | `chat_templates` table (global, SQLite migration 17); `Store.saveChatTemplate`/`deleteChatTemplate`; Templates picker in the planning composer (insert anywhere, save draft as template); `shared/transcript.ts` + `chatExport` IPC saving a session as Markdown; `tests/chat-templates.test.ts` (2 tests) |
| W20 | URL research gate + pre-run cost estimate (§8) | - | Done | `src/main/urlResearch.ts` (brief URLs fetched before planning, context block in the planner prompt, never blocks); `src/main/costEstimate.ts` (estimate from recorded per-role session costs, unknown roles named not priced); Settings toggle "Research reference URLs"; `tests/urlResearch.test.ts` (7), `tests/costEstimate.test.ts` (3) |
| W21 | Usage dashboard: per-worker breakdown (§22) | - | Done | `analyticsOverview` gains `byAgent` (sessions, cost, time per worker, deleted workers shown as unknown); Analytics panel adds a "By worker" table and the per-model time column; `tests/analytics-agents.test.ts` (2) |
| W22 | Workspace switching in the desktop topbar (§4) | W14, W18 | Done | The switch itself existed (IPC `cloudWorkspace` → `auth.setWorkspace` → `cloudSync.setSession`), but was only reachable in the Memory panel. New topbar `OrgPicker` (hidden when signed out or org-less): Personal or any org of the account, drives cloud-sync target and which org new projects join; `src/renderer/src/components/OrgPicker.tsx` |
| W26 | Workflow + provider manifests: export/import (§26) | - | Done | `src/shared/manifests.ts` (workflow + provider manifest validation, mirroring the agent manifest rules; provider manifests never carry keys); IPC `workflow:export/import`, `provider:export/import`; handlers in `src/main/index.ts` (2 MB cap, imports arrive switched off / keyless); Export + Import buttons in the Workflows panel and Settings › Engines; `tests/manifests.test.ts` (10 tests) |
| W28 | xAI (Grok) + Groq providers (FEATURE_STATUS Phase 2) | - | Done | `api-xai` + `api-groq` registered in `ENGINE_ENDPOINTS`/`ENGINE_LABELS` with env keys `XAI_API_KEY`/`GROQ_API_KEY`; both stream through the existing OpenAI-compatible adapter; `tests/routing.test.ts` asserts registration |
| W29 | Browser tabs (FEATURE_STATUS Phase 10) | - | Done | `browserAutomation.ts`: one sandboxed window per tab in the same session, only the active one visible; `tab new`/`tab <n>`/`tab close` steps in `browserSteps.ts` (1-12); new-tab links open a background tab without stealing focus; `tests/browser-steps.test.ts` (tab parsing) |
| W30 | Resizable panels: app sidebar, code sidebar, bottom panel (FEATURE_STATUS Phase 1) | - | Done | new `src/renderer/src/components/Resize.tsx`: `useDragSize` (pointer drag + arrow-key nudge + double-click reset, persisted in localStorage, min/max clamped), `ResizeHandle` (role=separator, aria-labelled), `sizeVar`; handles wired in `App.tsx` shell and `CodeWorkspace.tsx` (code sidebar x, bottom panel y with dynamic ceiling); sizes applied as CSS custom properties overriding the grid defaults (unlayered rules at the end of `styles.css`); `tests/resize.test.ts` (3 tests) |
| W31 | Accent picker (FEATURE_STATUS Phase 16) | - | Done | `settings.accent` (hex string, '' keeps the theme accent); validated in the saveSettings IPC handler by `normaliseAccent` (src/shared/accent.ts, hex-only, also exports 8 `ACCENT_PRESETS`); App.tsx applies it as `--accent` on `document.documentElement` on top of built-in and plugin themes (re-applied after plugin colours load, removed on cleanup); Settings → Appearance gains preset swatches, a custom colour input and Reset; `tests/accent.test.ts` (3 tests) |
| W32 | GitHub-event workflow triggers: PR list changes, CI failures (FEATURE_STATUS Phase 8) | - | Done | two new Start-step trigger kinds, `github_pr` (the project's PR list changes) and `github_ci` (a CI run fails), polled every 30 s on the existing scheduler tick via the owner's `gh` login (one `gh pr list` / `gh run list` call per tick); `prDigest` / `ciDigest` in `src/main/workflows.ts` turn the JSON into a change signature (PRs by number+updatedAt; CI by failed run ids only, so a run that stays red fires once) plus a readable trigger input; an empty payload (no gh, signed out, no repo) never fires, and the first observation only records the baseline; Workflows panel lists both options and demands a project like the other event triggers; `tests/workflows.test.ts` (+5 cases) |
| W33 | Main window `sandbox: true` (FINAL_AUDIT #9, P3) | - | Done | the preload only uses `contextBridge` + `ipcRenderer` (everything else is type-only imports), so it qualifies for the Chromium sandbox; electron-vite now emits the preload as CommonJS (`out/preload/index.cjs`, required for sandboxed preloads since the ESM loader is unavailable there) and the main window runs with `sandbox: true` while keeping `contextIsolation: true` and `nodeIntegration: false`; the automation browser window was already sandboxed with no preload; verified with a full `npm run build` and the whole vitest run |
| W34 | Remote commands target projects by their linked cloud id (FINAL_AUDIT #4, P2) | - | Done | cloud sync already stores the cloud project id per local project in the `cloud_sync` table, so no schema change was needed: `resolveRemoteProject` (src/main/remote.ts) now matches a phone's `projectId` against that link before falling back to the local id and a unique exact name; an ambiguous link (two local projects joined to one cloud row) throws instead of guessing; the main-process call site joins the link ids onto the project list it passes in; `tests/remote.test.ts` (+2 cases) |
| W35 | Ollama model profiles from `/api/show` (FINAL_AUDIT #5 P2) | - | Done | `cliModels` asks Ollama's `/api/show` for every listed local model (5 s timeout, failures ignored); the reported parameter size (`details.parameter_size`) and context length (`context_length` or `model_info.*.context_length`) ride on `ModelOption.paramsB`/`contextLength`; `deriveProfile` ranks by the real size (>=70b strong, <=8b fast) and uses the real context window, name regexes stay the fallback; `tests/routing.test.ts` (+1) |
| W36 | Per-project device grants (FINAL_AUDIT #6) | - | Done | Migration `0007_per_project_grants.sql`: `device_grants.project_id` (null = whole device, unchanged behavior); `can_control_device(device, project)` and the `commands_insert` policy pass `payload.projectId`, failing closed when absent or not a uuid; `CloudClient.grantDevice` accepts `projectId`; `tests/migrations.test.ts` (scoped-grant case: granted project enqueues, other project and unnamed target rejected) |
| W37 | Stemmed lexical retrieval (FINAL_AUDIT #10) | - | Done | Light suffix stemmer in the intelligence tokenizer (`src/main/intelligence/index.ts`): ing/ed/s/e/doubled-consonant stripping above a length floor, applied identically to index and query sides; `INDEX_VERSION` 1→2 so stale indexes rebuild; `tests/intelligence.test.ts` (the audit's "git commit staging" query now ranks `git.ts` first) |
| W38 | Web forgot-password (FINAL_AUDIT #7, client half) | - | Done | `resetPassword` in `web/src/lib/api.ts` (supabase `resetPasswordForEmail`, redirect to the app origin); "Forgot password?" mode on `SignIn.tsx` with a confirmation state and a back link; `.link` button style in `web/src/index.css`. Email invitations stay out of scope: they need an Edge Function with the service key. Web typecheck + vitest green |
| W41 | Terminal environment variables (Phase 14) | - | Done | Per-project env vars: Project settings → "Environment variables" (`NAME=value` lines, validated and stored as JSON in `projects.envVars`); `TerminalService.open` gained `extraEnv`, merged over `process.env` for new sessions in that project. Values whose name suggests a secret (key/secret/token/password) or that are long are masked in the UI behind a Show values toggle. `tests/project-env.test.ts`: persistence round trip and invalid-name filtering |

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
- 2026-11-27: W20. Two §8 gaps were left after W16's clarifying questions: the
  brief's reference URLs were never looked at, and runs started with no idea of
  what they would cost. When a brief contains http(s) URLs, up to two are now
  fetched before planning (10 s timeout each); title, description and readable
  text become a background block in the planner prompt next to stored memory. A
  failed fetch is logged and planning continues; the gate never blocks a run
  (setting "Research reference URLs", on by default). After planning, the plan
  note carries a cost estimate built from what this studio's past tasks really
  cost per role (sessions joined to tasks); roles with no history are named as
  unknown instead of priced, and a studio with no history gets no estimate at
  all — real spend still shows in Analytics when the run finishes. New files:
  `src/main/urlResearch.ts`, `src/main/costEstimate.ts`,
  `tests/urlResearch.test.ts` (7), `tests/costEstimate.test.ts` (3).
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
- 2026-11-27: W26. Workflow and provider manifests (§26). `src/shared/manifests.ts`
  validates both formats with the same strictness as the agent manifest: exact
  field sets, size caps (100 workflows / 50 providers per file, 200 nodes, 400
  edges), node kinds limited to the 14 real workflow steps, edge endpoints must
  reference known node ids, schedule minutes clamped to 0-43200. Provider
  manifests never carry keys: the parser refuses `apiKey`/`key` with a message
  telling the owner to enter the key in Settings after import. IPC adds
  `workflow:export/import` and `provider:export/import`; main handlers mirror the
  agent ones (2 MB file cap, JSON parse errors surfaced) and imports arrive
  switched off (workflows) or keyless (providers). The Workflows panel gets
  Export / Import buttons next to the template picker; Settings › Engines gets
  Export providers / Import providers. Known limits: workflow imports always
  arrive disabled and lose their project link (manifests carry no project ids);
  exported providers keep their model list but never their key.
- 2026-11-27: W27. Two Phase 3 gaps closed. Reusable templates: a global
  `chat_templates` table (SQLite migration 17) with a Templates picker in the
  planning composer; "Save current draft as template" names it from the draft's
  first line, picking a template inserts its text into the composer, and the
  trash icon deletes it. Templates are shared across projects on purpose (a
  good brief opener follows you around). Conversation export: "Export transcript"
  above the composer writes the active session to Markdown via a save dialog,
  one `## You` / `## Assistant (model)` heading per turn, `## Session N` title
  when the session has none; empty sessions refuse to export. Known limits: the
  picker lists every template with no search (fine at personal scale), and
  export saves only the active session (per-session export lives in the sidebar
  later if wanted). The UI was typechecked and tested at the store/IPC level
  but not clicked through (needs a signed-in session).
- 2026-11-27: W28. xAI (Grok) and Groq are registered hosted providers:
  `api-xai` (https://api.x.ai/v1) and `api-groq` (https://api.groq.com/openai/v1)
  in `ENGINE_ENDPOINTS`, labelled in `ENGINE_LABELS`, with `XAI_API_KEY` /
  `GROQ_API_KEY` as credential env fallbacks. Both speak the OpenAI chat
  protocol, so they stream through the existing OpenAI-compatible adapter with
  no new code; they appear in Settings > Engines, model discovery, routing and
  the pickers automatically. Known limit: live calls were not run (needs real
  API keys); the adapter path is identical to DeepSeek/Mistral, which do run.
- 2026-11-27: W29. The sandboxed browser is no longer one page per window.
  Each tab is its own sandboxed BrowserWindow in the same session, with only
  the active one visible. Steps gained `tab new`, `tab <n>` (1 to 12) and
  `tab close` (the last tab refuses to close); goto/click/type/screenshot and
  friends always act on the active tab. Links that open new windows
  (target=_blank, window.open) now open a background tab in the same session
  instead of navigating the current page away, and the running tab keeps focus.
  Closing a tab re-points the active tab and re-shows it. Known limits: the
  live watch window shows one tab at a time (switch with `tab <n>`); tab state
  is per run, not persisted between runs; only the parsing is covered by tests
  (driving real windows needs the app running).
- 2026-11-27: W30. The three main panels are drag-resizable: the app sidebar
  (200 to 480 px), the code workspace sidebar (180 to 520 px) and the editor's
  bottom panel (120 px up to the window minus 180 px, so it can never swallow
  the editor). Drag the edge, or focus it and use the arrow keys; double-click
  resets to the CSS default. New `src/renderer/src/components/Resize.tsx`
  exposes `useDragSize` (pointer drag with body-wide capture, keyboard nudges
  in 24 px steps, persisted per panel in localStorage under `ventriee.resize.*`
  and re-clamped to the current bounds on load) and `ResizeHandle`, a
  role=separator element labelled for screen readers. Sizes flow into the
  existing grids as CSS custom properties (`--shell-side-w`, `--code-side-w`,
  `--code-panel-h`), so every layout variant (three-column preview, narrow
  window, no-sidebar shell) keeps working with its old fallback when a panel
  was never resized. Handles are hidden when their panel is hidden (no-sidebar
  shell, closed bottom panel). `tests/resize.test.ts` (3 tests) covers the
  clamp, the CSS-variable helper and the handle markup; both tsconfigs and the
  full vitest run are green.
- 2026-11-27: W31. The accent colour is now owner-settable from Settings →
  Appearance instead of a CSS variable only the code could change. The choice
  is stored as `settings.accent` (#abc to #rrggbbaa hex, empty for the theme's
  own accent) and validated on the main side by `normaliseAccent`, so a stray
  value can never reach the style layer. App applies it by setting `--accent`
  on the document root, above built-in dark/light and plugin themes alike: the
  derived `--accent-soft/-faint/-glow` mixes keep working automatically because
  they are computed from `--accent`. A small palette of eight presets, a custom
  colour picker and a Reset chip cover the UI. `tests/accent.test.ts` (3 tests)
  covers validation and the preset list; both tsconfigs and the full vitest run
  are green.
- 2026-11-27: W32. Workflows can now start from GitHub events. A Start step
  gains two trigger kinds: `github_pr` fires when the project's open-PR list
  changes (new, closed or updated PR), `github_ci` fires when a GitHub Actions
  run fails. Both are polled on the existing 30-second scheduler tick through
  the owner's own `gh` CLI login, one `gh pr list` / `gh run list` call per
  interested project, so no extra credentials and no webhooks. The payload is
  reduced to a change signature: PRs by number and updatedAt, CI by the ids of
  failed runs only, which means a run that stays red does not re-fire on every
  tick, but a second failure does. Empty results (gh missing, signed out, no
  GitHub remote) and the first observation never fire, mirroring how the git
  commit trigger treats its baseline. The digest text ("GitHub PRs open now",
  "GitHub Actions failures" with ids and titles) becomes the workflow input, so
  an If step can branch on it and an AI step can summarise it. The Workflows
  panel lists both options and, like the file/git/run triggers, requires a
  project before the trigger can watch anything. Tests for both digests and the
  new trigger kinds were added to `tests/workflows.test.ts` (13 tests total);
  both tsconfigs and the full vitest run are green.
- 2026-11-27: W33. The main window now runs inside the Chromium sandbox
  (`sandbox: true`), closing the last open item from the security review. The
  gate was the preload: sandboxed renderers cannot use the ESM loader, so a
  preload must be CommonJS. Our preload only ever touched `contextBridge` and
  `ipcRenderer` (its other imports are TypeScript types, erased at build time),
  so the electron-vite preload build was switched to emit `index.cjs`, and the
  window's `webPreferences` point at the new file. `contextIsolation` stays on
  and `nodeIntegration` stays off, so the narrow `window.ventriee` bridge is
  unchanged for the renderer. The automation browser window was already
  sandboxed with no preload. Checked with a full `npm run build` (the CJS
  preload lands in `out/preload/`) and both tsconfigs plus the whole vitest run
  are green; the only risk left is a packaged-installer smoke test, which needs
  a Windows signing environment and is listed in the wrap-up.
- 2026-11-27: W34. A phone can now address a desktop project by its cloud id.
  Cloud sync already stored the cloud project id for every mirrored local
  project in its `cloud_sync` table, so the fix needed no schema change:
  `resolveRemoteProject` first tries the local id, then the linked cloud id
  (joined in by the main process from that table), then a unique exact name, in
  that order. A phone sending the cloud id of a linked project now reaches the
  right desktop project even when several projects share a name; an ambiguous
  link (two local projects joined to the same cloud row) is refused rather
  than guessed, as is an unknown id. Unlinked projects keep working exactly as
  before, so this is purely additive. Two new cases in `tests/remote.test.ts`
  cover the cloud-id match and the ambiguity refusal; both tsconfigs and the
  full vitest run are green.
- 2026-11-27: W35. Local model profiles now come from Ollama itself instead of
  the model name alone. When the model list is built, every Ollama model gets a
  5-second `/api/show` probe; a failure or a server that does not answer is
  ignored and the name-based guess stands. When the probe answers, the reported
  parameter size and context length ride on `ModelOption.paramsB` /
  `contextLength` and drive the capability profile: 70b and above counts as a
  strong model, 8b and below as fast, and the real context window replaces the
  guessed one. This fixes the audit finding that all local models tied because
  Ollama names like `llama3.1:latest` carry no size hint. A reported size
  always outranks the name, so a 70b model named without "70b" is no longer
  treated as a 7b one. `tests/routing.test.ts` (+1) covers strong, fast,
  mid-size and unreported sizes; both tsconfigs and the full vitest run are
  green.
- 2026-11-27: W36. Scoped device grants per project (FINAL_AUDIT #6). Until now
  a device grant authorized the grantee against every project on the device.
  Migration 0007 adds `device_grants.project_id`: null keeps the old whole-device
  meaning (existing rows untouched), a uuid limits the grant to that cloud
  project. `can_control_device` takes the target project and the commands_insert
  policy passes `payload.projectId`; a missing or non-uuid project id fails
  closed (only a whole-device grant or ownership authorizes it). Enforcement
  stays in RLS, so every client (desktop, web, mobile) is covered by the same
  rule. `CloudClient.grantDevice` accepts an optional `projectId`; the desktop
  UI does not yet offer a project picker when granting. Proven on PGlite: the
  granted project enqueues, another project and an unnamed target are refused.
- 2026-11-27: W37. Stemmed lexical retrieval (FINAL_AUDIT #10). The engine was
  BM25 over exact tokens, so inflected queries missed: "git commit staging"
  ranked `plugins.ts` above `git.ts` because the code says "stage"/"commit".
  The shared tokenizer now applies a light suffix stemmer (ing/ed/s/e and a
  doubled final consonant, each above a length floor so short tokens survive)
  identically to the index and query sides; INDEX_VERSION is bumped 1 -> 2 so
  existing indexes rebuild once. Known limit: this fixes inflection, not
  synonyms ("commit code changes" still will not find `git.ts`); that needs
  embeddings, which stay out of scope for the dependency-free engine.
- 2026-11-27: W38. Forgot-password on the web dashboard (FINAL_AUDIT #7, client
  half). "Forgot password?" on the sign-in card switches to a reset mode: one
  email field, a Supabase `resetPasswordForEmail` send with the app origin as
  the redirect, and a confirmation state with a back link. Supabase delivers
  the email and hosts the update form; no server code is involved, so this
  works with the public key. Email invitations remain open: adding a user by
  email needs an Edge Function holding the service key, which cannot ship from
  the client. The reset flow was typechecked and built but not exercised with
  a real inbox (needs a configured Supabase project).
- 2026-11-27: Integration of PRs #54-#70 onto `integration/w20-w38` (merges
  #54..#70, HEAD e553cd1) plus a per-PR bug review. Proof every PR's added
  lines survive the merge: 17/17 OK. Gates: node+web tsc clean, vitest 525
  passed/1 skipped, desktop + web builds green, mobile typecheck + 17 tests
  green. Windows installer built (Ventriee-Studios-0.3.7-setup.exe + portable);
  the packaged app launches, restores the session, and writes nothing to the
  error log. Review fixes committed (7953aee): OrgPicker now re-reads the
  workspace every 15 s and on focus with an unknown-workspace fallback;
  URL-research blocks are explicitly framed as untrusted background, never
  instructions (regression test added); accent validation rejects 5/7-digit
  hex; `checkEventTriggers` is re-entrancy guarded so a hung `gh` call cannot
  double-fire triggers; remote project resolution filters cloud_sync links by
  the signed-in user; W30 drag handles align with the 220px narrow-layout
  sidebar and `.shell` is a positioning context.
- 2026-11-27: Review fixes continued (bf5698d, bca00c4). W35: ollamaShow now
  calls the native `/api/show` root instead of the `/v1` compat layer (the old
  URL 404ed and every model silently fell back to name guesses; regression
  test pins the URL). W38 web: a recovery link now lands on a set-new-password
  screen (ResetPassword.tsx, PASSWORD_RECOVERY event) instead of silently
  signing the user in with the old password still valid. W26: manifest edge
  ids append the branch/case so two edges between the same pair cannot collide
  (deleting one branch no longer deletes both), oversized node/edge lists are
  rejected instead of silently truncated, and provider manifests accept only
  hosted engines (api-custom plus KEYED_API_ENGINES). W29: tab close splices
  the tab out synchronously and destroys the window, so the next step cannot
  hit a dying window. W27: canceling the export dialog no longer toasts
  success, and exporting a fresh project no longer leaves a stray empty
  session. W36: the CloudClient interface gained the projectId field the
  implementation already had. Gates after all fixes: both tsc clean, vitest
  526 passed/1 skipped, desktop + web builds green, web tests 2 passed.
