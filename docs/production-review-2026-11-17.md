# Production review — 17 November 2026

This report records the initial repair pass. Subsequent Supabase and Code workspace work is covered by `supabase-authentication.md` and `code-workspace.md`. Update, 18 November 2026: Monaco is installed and locked, both typechecks and the production build pass, all 147 tests pass with no exclusions, and the Electron smoke run reaches the sign-in screen. None of this is a release certification; see the remaining gates below.

This pass improves reliability and security but does not certify release readiness.

## Changes

- API requests now receive the configured timeout, combined with caller cancellation.
- SSE parsing handles CRLF boundaries, multiline events and final events without a trailing separator; reader locks are released on failures.
- Failed preview installs can be retried.
- Preview discovery respects the recorded automatic execution approval.
- Exit/error callbacks from stopped preview processes cannot overwrite replacement processes.
- Stopped web previews clear their URL; one-shot spawn errors become visible errors.
- Static preview rejects directories and handles read failures and server startup errors.
- Artifact size is checked before reading file contents.
- Path containment resolves directory links, including ancestors of files not yet created.
- IPC rejects callers outside registered studio main frames; studio document navigation and permission requests are denied.
- Memory searches use the requesting window's project.
- Saving credentials requires secure OS encryption; legacy plaintext is migrated when encryption is available. Without a keychain, configure credentials via environment variables. Existing legacy values are preserved if migration cannot run.

## Validation

- Type checking and production build pass.
- Regression tests cover stream framing, cancellation propagation, preview retry/replacement, credential storage and directory link traversal.
- The original 11 network-backed tests cannot connect to their loopback HTTP fixtures in this execution environment: a standalone Node fetch reproduces `connect EACCES 127.0.0.1`.
- Desktop smoke verification could not run: Electron exits with code 2147483651 before its DevTools target appears. The cause has not been established.

## Release gates, 18 November 2026 (Windows 11 Pro 26200, x64)

| Gate | Status | Evidence |
|---|---|---|
| 1 Install and lockfile | Pass | `npm install` resolved `monaco-editor` 0.55.1 into `package-lock.json` |
| 2 Typechecks | Pass | `npm run typecheck`, no dummy module declarations |
| 3 Full tests | Pass | 148/148, no skips or exclusions |
| 4 Live Supabase | Pass for signup, email confirmation, signin, restored session after restart | Real account in the dev app and the packaged app; explicit signout and token-refresh expiry not exercised |
| 5 Monaco from packaged origin | Pass | `ventriee-studios://renderer` opened a file in Monaco; editor, TypeScript, JSON, CSS and HTML workers start without errors |
| 6 File operations | Service tests pass | Interactive save/conflict in the desktop app not exercised |
| 7 Git lifecycle | Pass against a disposable local bare remote | Push with upstream, fetch, fast-forward pull, refusal to merge diverged history or force-push, rejection of credential URLs; no hosted remote used |
| 8 Preview and worker controls in the app | Not exercised | Office floor and task list render in the packaged app |
| 9 Packaged install | Pass | Silent NSIS install to a temp folder, launch to sign-in with a fresh profile, silent uninstall removes the app and keeps user data |
| 10 Product copy | Not reviewed | |

Still open: preview start/stop/install and live worker runs in the desktop app, interactive save conflicts, signout and multi-window isolation, a hosted Git remote, and code signing (the installer is unsigned and will trigger SmartScreen).

Dependency audit, 19 November 2026: `npm audit` reports 0 vulnerabilities. Monaco 0.55.1 vendors DOMPurify 3.2.7 inside its own source (and 0.57.0 vendors 3.4.15, still affected), so a package override alone would not change shipped code: `electron.vite.config.ts` resolves Monaco's vendored import to the patched `dompurify` 3.4.18 in both the production build and the dev prebundle, verified by the version string in each bundle. The build-only `minimatch` advisory is fixed by overriding the affected 7.x–11.0.0 range to 11.x; older 3.x/5.x copies are untouched and the installer still builds. Re-check the alias when upgrading Monaco. The existing README's claim that external CLI agents cannot access anything outside their project requires OS-level enforcement; cwd and application path checks alone do not establish that guarantee.

Existing user changes in scripts were left intact.
