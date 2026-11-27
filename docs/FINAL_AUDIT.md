# Final audit — Ventriee AI ecosystem (2026-11-26)

## Verdict

**Not release-ready.** Each app builds and its own tests pass. The one open P0 is
outside the code: the live Supabase project has none of the cloud tables, so the web
dashboard, mobile app, remote control and cloud sync cannot work in production. Once
the migrations are applied, the signed-in flows still need one manual pass with two
test accounts before release.

## What exists (verified by running it)

| App | Location | State |
|---|---|---|
| Desktop IDE (Electron) | `src/` | Builds, boots, 435 tests green. Signed-in UI not exercised (no account). |
| Web dashboard (workspace / dashboard / app subdomains) | `web/` | Builds, sign-in renders on desktop + phone widths. Signed-in pages not exercised. |
| Mobile Jarvis (Expo) | `mobile/` | Typechecks, 17 tests, bundles for Android. Not run on a device. |
| Cloud schema | `supabase/migrations/0001–0006` | Correct on PostgreSQL (19 RLS tests) and applied to the live project. |

## Defects found and fixed in this audit

| # | Severity | Defect | Fix | Proof |
|---|---|---|---|---|
| 1 | P0 | Phone → laptop commands could never run: mobile sent `start_agent_run`/`ask_project_status`, status `pending`, no `requires_confirmation`; desktop accepts only `run.start`/`run.stop`/`project.status`, RLS only `queued`. | Mobile now speaks the desktop allowlist, confirms high-risk commands, and sends `projectId`, `projectName` and `instruction`. Start-run gained an instruction field. | `mobile/__tests__/commands.test.ts` |
| 2 | P0 | `commands.requested_by` and `expires_at` were NOT NULL with no default, and neither client sent them, so every enqueue (desktop and mobile) failed. | `0006_command_defaults.sql` (live): defaults `auth.uid()` and +1 day. RLS still rejects a spoofed requester. | `tests/migrations.test.ts` (new case) |
| 3 | P1 | Desktop ran a remote command on `projects()[0]` when the id did not match (always, since phones send cloud ids). | `resolveRemoteProject`: local id, then unique exact name, otherwise refuse. | `tests/remote.test.ts` |
| 4 | P1 | Mobile wrote `done`/`approved`/`rejected`; the web board only knows `completed`/`in_review`/…, so tasks done on the phone never completed for the owner. | Mobile uses the board's statuses; approve → `completed`, reject → `in_progress`. | `mobile/__tests__/status.test.ts` |
| 5 | P1 | (earlier this session, W4) Web build failed typecheck in `api.ts`, which would fail the Cloudflare build. | Cast fixed. | `web` build |
| 6 | P0 | Same as #2 on every other table: the desktop client inserts organizations, projects, tasks, devices and audit rows without `owner_id` / `created_by` / `user_id` / `actor_id`. With no default, RLS saw NULL and rejected the row, so cloud sync could not create a project or task and Jarvis could not register a device. | `0007_actor_defaults.sql` (**not yet applied live**): those columns default to `auth.uid()`; insert policies still reject a forged user. | `tests/migrations.test.ts` (new case, fails without 0007) |

## Open issues

| # | Sev | Issue | Owner action / next step |
|---|---|---|---|
| 1 | ~~P0~~ | ~~Live Supabase had no Ventriee tables.~~ Fixed 2026-11-26: 0001–0006 live. | — |
| 2 | P1 | No signed-in end-to-end pass of desktop, web or mobile, and no live owner-vs-employee check. | Create two test accounts after #1, then run the manual script in RELEASE_CHECKLIST.md. |
| 3 | P1 | Push notifications not implemented (no EAS projectId, no push_tokens table, nothing sends). Mobile shows statuses on refresh only. | Accept for v1, or implement push. |
| 4 | P2 | ~~Local and cloud projects are not linked; remote commands match by name. Duplicate names are refused, not guessed.~~ | Fixed (W34): cloud sync already stores the cloud project id per local project (cloud_sync table); remote commands now match a phone's projectId against that link first (unique match required, ambiguity throws), falling back to local id then unique name as before. |
| 5 | P2 | ~~Model profiles come from model-name patterns. Ollama's reported parameter size is ignored, so all local models here tie. Owner overrides exist in Settings.~~ | Fixed (W35): model discovery asks Ollama `/api/show` for each listed model; the reported parameter size (>=70b strong, <=8b fast) and context length drive the capability profile, name regexes stay the fallback when the server does not answer. |
| 6 | ~~P2~~ | ~~Device grants cover a whole device, not per project. A grantee can target any project on it.~~ Fixed (W36): `device_grants.project_id` scopes a grant to one cloud project (null still means the whole device), and the command insert policy passes `payload.projectId` to the check, failing closed when the target is missing or not a uuid. | `tests/migrations.test.ts` |
| 7 | P2 | ~~Web has no email invitations (adds existing users by id), and no forgot-password on web sign-in.~~ Forgot-password fixed (W38): a "Forgot password?" link on web sign-in sends a Supabase reset email. Email invitations remain: inviting by email needs a Supabase Edge Function holding the service key, which cannot ship from the client. | Deploy the Edge Function, then point Team → Add member at it. |
| 8 | P2 | Mobile: 3 moderate npm advisories (minimatch/glob in Expo/Jest tooling; not in the shipped bundle). The suggested fix is a downgrade. | Track upstream. |
| 9 | P3 | ~~Electron main window `sandbox: false` (contextIsolation on, nodeIntegration off, CSP set).~~ | Fixed (W33): `sandbox: true` with a CJS preload; the preload only uses contextBridge + ipcRenderer, so it ships as `out/preload/index.cjs` (electron-vite emits CJS for the sandboxed preload). |
| 10 | ~~P3~~ | ~~Intelligence is lexical (BM25). Synonym queries rank weaker (e.g. "git commit staging" put `plugins.ts` above `git.ts`).~~ Fixed (W37): light suffix stemming in the shared tokenizer ("staging" and "stage" both index as "stag", "commits" as "commit"; index version bumped so stale indexes rebuild). Inflected queries now hit; true synonym ranking still needs embeddings. | `tests/intelligence.test.ts` |
| 11 | P3 | ~~`web/src/lib/supabase.ts` used `??`, so an empty `VITE_SUPABASE_PUBLISHABLE_KEY=` blocked the ANON fallback.~~ | Fixed (`||`). |

## Areas inspected and judged sound (static + tests)

- Remote control desktop side: allowlist with no shell, claim-once (no duplicate runs), expiry before and after the claim, stale-claim recovery, high-risk confirmation, outbound-only polling.
- Auth: every desktop IPC except the auth calls requires a session in the main process. Session stored via the OS credential store.
- RLS: org isolation, project visibility, task/comment access, append-only audit log, owner cannot be demoted or removed. All proven on Postgres.
- Browser automation runs in a separate sandboxed partition with navigation limited to http(s).
- Project intelligence is a real index, not a placeholder: hashing, incremental, bounded.
