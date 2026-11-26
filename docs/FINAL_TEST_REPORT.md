# Final test report — 2026-11-26

Everything below was run on Windows 11, Node 26.13, in the `final-audit` worktree.
Nothing here is inferred from code alone unless marked *static*.

## Automated suites

| Suite | Command | Result |
|---|---|---|
| Desktop typecheck | `npm run typecheck` | pass |
| Desktop unit/integration | `npx vitest run` | 435 passed, 1 skipped, 86 files |
| Cloud schema + RLS (real PostgreSQL via PGlite) | `npx vitest run tests/migrations.test.ts` | 19/19 |
| Desktop build | `npm run build` | pass |
| Web build | `cd web && npm run build` | pass |
| Web tests | `cd web && npx vitest run` | 2/2 |
| Mobile typecheck | `cd mobile && npx tsc --noEmit` | pass |
| Mobile tests | `cd mobile && npx jest` | 17/17 |
| Mobile bundle | `cd mobile && npx expo export --platform android` | pass, 3.3 MB Hermes bundle |

Mobile went from 18 to 17 tests because its command tests were rewritten for the real contract.

## Live runtime checks

| Check | How | Result |
|---|---|---|
| Desktop packaged boot | `node scripts/smoke.mjs` (real Electron, DevTools) | Sign-in screen renders; 0 console errors/exceptions |
| Desktop without `.env` | same | Shows "Connect Supabase" guidance, no crash |
| Live Supabase schema | anonymous REST `GET /rest/v1/<table>` | Before: all tables missing (PGRST205). After migrations: `[]` for projects/tasks/commands/devices (RLS); `commands` defaults confirmed live |
| Web sign-in | Vite dev + browser, 1280 px and 375 px | Renders, 0 console errors, `?surface=app` works |
| Model routing + live call | routed real Ollama model list, then `/api/chat` | Unconfigured cloud model excluded; `granite3.2-vision:2b` replied `VENTRIEE-OK` in 8.5 s |
| Project intelligence | engine on a copy of `src/` (169 files) | First index 315 ms; queries hit `remote.ts`, `auth.ts`, `git.ts`; edit 1 file → resync re-indexed exactly 1 file in 198 ms; compiled context ~6.5k chars, 6 files |

## Not tested, and why

| Area | Reason |
|---|---|
| Any signed-in desktop/web/mobile flow (projects, tasks, chat, agents, editor, terminal, git, settings) | No test account on the live Supabase project; creating one, or signing in with your account, is your decision. Every desktop IPC is gated on a session. |
| Desktop ↔ web ↔ mobile sync, owner vs employee isolation in the live system | Needs the P0 schema applied plus two accounts. Isolation **is** proven on real Postgres with three simulated users (migrations test). |
| Remote command round trip phone → laptop | Same as above. Every link is unit-tested; the DB policies are tested on Postgres. |
| Multi-agent run on a test project | Behind sign-in. OpenCode, Claude Code and Codex CLIs are installed, so it can run once signed in. |
| Cloud model providers (Anthropic, OpenAI…) | No API keys configured; not invented. |
| Mobile on a device/emulator, push notifications | No device/emulator; push is not wired (see FINAL_AUDIT.md). |
| Performance profiling (memory/CPU over time) | Not done beyond the startup and index timings above. |
