# Security review — 2026-11-26

This is a review, not a certification. Scope: this repository (desktop, web, mobile,
Supabase migrations). Nothing was tested against production systems except anonymous,
read-only REST probes that confirmed the schema is missing.

## Checks run

| Check | Result |
|---|---|
| Secret scan over all tracked files (Anthropic/OpenAI/AWS/GitHub/Google/Slack keys, private keys, JWT-shaped service keys) | Clean. Only intentional fake keys in `tests/redact.test.ts` and `tests/security.test.ts`. |
| Tracked `.env` files | Only `.env.example` ×3. `.env`, `web/.env` and `mobile/.env` are gitignored. |
| `npm audit` (production deps) | Desktop 0 · Web 0 · Mobile 3 moderate (minimatch/glob DoS in Expo/Jest tooling, not in the app bundle) |
| RLS on real PostgreSQL (PGlite, 3 simulated users) | Cross-org isolation, project/task/comment visibility, append-only audit log, owner cannot be removed/demoted, remote-command authorization: all pass |
| Requester spoofing on `commands` | Blocked: insert with `requested_by` of another user fails RLS (new test) |

## Findings

| Sev | Finding | Status |
|---|---|---|
| P0 | Live Supabase had no tables, so no RLS protections existed in production. | **Fixed** 2026-11-26: migrations 0001–0006 live; anonymous reads return `[]` |
| P1 | Remote commands could act on the wrong local project (silent fallback to the first one). | **Fixed**: exact match or refuse |
| P2 | Device grants are whole-device: a grantee can target any project on that laptop. Grants are off by default and created only by the device owner. | Open, documented |
| P2 | High-risk remote commands rely on the phone's confirmation dialog (`requires_confirmation`). The laptop does not ask again. The command allowlist has no shell access. | Accepted by design; revisit if more powerful commands are added |
| P3 | Electron main window `sandbox: false`. Mitigations in place: `contextIsolation: true`, `nodeIntegration: false`, CSP, `setWindowOpenHandler`, `will-navigate` guard, a narrow `contextBridge` API. | Open |
| Info | Desktop terminal and preview run user-chosen commands in the project folder. That is expected IDE behaviour and only reachable after sign-in. | — |
| Info | Agent workers run through external CLIs (OpenCode/Claude/Codex) with those tools' own permission models. | — |

## Verified controls

- **Auth boundary:** `src/main/index.ts` rejects every IPC channel except the five auth calls without a session for that window.
- **Remote control:** outbound polling only (no listening port). Per-device opt-in (`remote_enabled` default false). Explicit time-limited grants. Insert requires `can_control_device`. Only the owner process can claim or update a command. Claim is atomic (`status=eq.queued`), so there are no duplicate runs. Commands expire. Unknown types are refused.
- **Keys:** the build rejects admin/service keys (see `docs/supabase-authentication.md`). Only the public publishable/anon key ships to clients.

## Not done

- No dynamic tests (penetration testing, fuzzing) against a live deployment.
- No live two-account authorization test. The equivalent was run on PGlite.
- No rate-limit review: Supabase defaults apply, and the app adds no limits of its own.
