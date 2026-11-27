# Final build status — persistent checklist

Last verified: 2026-11-26, branch `final-audit` (from master `0f1a7fb`).
On resume: read this file, `git status`, `git log`, rerun the commands in
FINAL_TEST_REPORT.md, then continue at the first unchecked item.

Legend: [x] verified working · [~] implemented, not fully verified · [B] blocked by an
external requirement · [ ] not done / not implemented

## Release verdict: NOT READY — no open P0; signed-in flows unverified (P1)

## Builds
- [x] Desktop: `npm run typecheck`, `npm run build`, packaged smoke boot (no console errors)
- [x] Web: `npm run build` (tsc + vite)
- [x] Mobile: `tsc --noEmit`, `expo export --platform android` (3.3 MB Hermes bundle)
- [B] Mobile device/emulator run: no Android/iOS device or emulator used

## Tests
- [x] Desktop vitest: 435 passed, 1 skipped (86 files)
- [x] Cloud schema + RLS on real Postgres (PGlite): 19/19 incl. new requested_by spoof test
- [x] Web vitest: 2/2
- [x] Mobile jest: 17/17

## Cloud
- [x] Live schema: 0001–0005 were applied by the cloud-sync work (its 0005 is
      `desktop_sync`); this audit's fix was renumbered `0006_command_defaults` and
      pushed 2026-11-26 (`supabase db push`, owner-approved). Anonymous REST reads of
      `projects`/`tasks`/`commands`/`devices` return `[]` (RLS), not PGRST205.
      Live column defaults confirmed: `requested_by = auth.uid()`, `expires_at = now() + 1 day`.
- [x] Migrations apply in order on PostgreSQL; cross-org isolation, owner guard,
      append-only audit, remote-command authorization proven (PGlite)
- [x] Fixed: `commands.requested_by` / `expires_at` had no default → every client enqueue failed (0006)

## Remote Jarvis
- [x] Fixed P0: mobile used command types/status the desktop and RLS reject
- [x] Fixed: desktop silently ran phone commands on the first local project
- [x] Allowlist only (no shell), claim-once, expiry, high-risk needs confirmation (unit tests)
- [x] No inbound ports: desktop polls Supabase outbound
- [B] Live phone → cloud → laptop round trip: needs the P0 schema + two signed-in accounts

## Desktop IDE
- [x] Boots to sign-in with real config; every IPC except auth is gated on a session in main
- [B] Signed-in UI (chat, agents, editor, terminal, git…): no test account on the live project
- [x] Live model call: Ollama `granite3.2-vision:2b` answered through the routed pick
- [x] Project intelligence on this repo: index 169 files 315 ms, correct retrieval, incremental resync of 1 changed file 198 ms, bounded context (~6.5k chars)
- [~] Multi-agent run: orchestrator unit/evidence tests pass; no live run (behind sign-in)

## Web dashboard
- [x] Sign-in renders at desktop and 375 px, no console errors; `?surface=` works
- [x] Every web query matches the schema (tables/columns cross-checked)
- [B] Owner/employee flows: need the P0 schema + two accounts
- [ ] Email invitations: not implemented (adds existing users by id only)

## Mobile
- [x] Fixed P1: task statuses now match the web board (`completed`, `in_review`…)
- [ ] Push notifications: needs EAS projectId + a push_tokens table (not implemented)

## Security
- [x] No secrets in tracked files (only test fixtures); `.env` files ignored
- [x] npm audit: desktop 0, web 0, mobile 3 moderate (Expo/Jest build tooling only)
- [x] Electron main window runs `sandbox: true` with a CJS preload (fixed in W33)
