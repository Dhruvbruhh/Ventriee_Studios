# Security Architecture

This document describes the security model of Ventriee Studios as of the
W8 Security & RBAC pass (26 Nov 2026). It complements the audits in
`docs/audits/AUDIT.md` (general studio audit, 2026-11-06) and
`docs/audits/ECOSYSTEM-AUDIT-2026-11-26.md` (ecosystem vision audit, whose §20
"Security & permission system" is the mandate for this pass). Where a limit is
known, it is stated as a residual risk rather than hidden.

## Trust boundaries

```
┌─────────────────────────────┐
│ Renderer (per window)       │  Untrusted: origin-locked, no node access
│   contextBridge preload     │  (contextIsolation + nodeIntegration off).
└──────────────┬──────────────┘
               │ IPC (invoke), gated by registerIpc()
┌──────────────▼──────────────┐
│ Main process (trusted)      │  Owns keys, sessions, files, processes.
│   StudioAuth / CloudClient  │  All Supabase calls carry the user token.
└──────────────┬──────────────┘
               │ HTTPS (PostgREST)
┌──────────────▼──────────────┐
│ Supabase (Postgres + RLS)   │  The authority on multi-tenant access.
│   RLS policies per table     │  A row you may not read is absent; a write
│   (migrations 0001-0002)    │  you may not do is rejected.
└──────────────┬──────────────┘
               │ outbound SSH / E2B (owner-configured provider)
┌──────────────▼──────────────┐
│ Remote run hosts / sandboxes │  Trusted only as the owner configured them.
└─────────────────────────────┘
```

Third-party surfaces: Supabase (auth + data), SSH/E2B hosts, model providers.
Model/provider API keys live in the OS keychain via `Credentials` and are
redacted from logs/UI by `src/main/redact.ts` (see AUDIT.md).

## Authentication model

- `StudioAuth` (`src/main/auth.ts`) runs entirely in main. Passwords and
  refresh tokens never enter logs, snapshots, or the renderer.
- Tokens persist in the OS keychain (`cred:supabase:session`) and are restored
  only after Supabase verifies the access token (`GET /auth/v1/user`) and the
  local JWT expiry is confirmed. A forged/unverifiable token never unlocks a
  session.
- Sessions are tracked per window id with local expiry; `requireSession(id)`
  throws once a session is absent or past `expiresAt`.
- **One cloud identity per app instance.** The token store is a single object;
  a sign-in in any window replaces it. This is a deliberate simplification
  (see residual risks) — RLS is always keyed to the token actually presented.

## IPC gating

Every `handle(...)` registration in `src/main/index.ts` is wrapped by
`registerIpc()`:

1. **Window check** — the sender must be a known studio window, the main frame,
   and the renderer origin.
2. **Session check** — every channel except the five auth channels
   (`authStatus`, `authSignIn`, `authClear`, `authRecover`, `authReset`) calls
   `auth.requireSession(event.sender.id)`. A signed-out or expired window is
   rejected before its handler runs, for reads and writes alike.
3. **Remote-control ownership check** — `remoteStatus` and `remoteSetEnabled`
   additionally verify the calling window's session owns the currently attached
   device (`ownsAttachedDevice`). A window whose user differs from the device's
   owner gets an empty status (no leak) or an error on enable (no toggle).
   Remote-control commands cannot be issued with an expired/absent session
   because steps 1-2 fail first, and the underlying PATCH is further gated by
   RLS.

The preload surface (`src/preload/index.ts`) only exposes the typed
`VentrieeApi` — no raw `ipcRenderer` access.

## Cloud data layer (SupabaseCloudClient)

- Every PostgREST request uses the signed-in user's access token; with no
  token the client refuses (`Sign in ...`) before any network call.
- Error paths are deliberately generic: a 401/403 becomes "You do not have
  access to that workspace"; other failures surface only the status code.
  No response body, token, or key is ever included in an error.
- The Supabase `apikey` header carries the **publishable** key only; the app
  rejects administrative/service keys at startup (`isPublicSupabaseKey`).

## Row-Level Security summary (migrations 0001-0002)

All tables have RLS enabled; every policy is caller-scoped (no
`using (true)`). The security-definer helpers (`is_org_member`,
`has_org_role`, `can_control_device`, `owns_device`, `shares_org_with`) pin
`search_path = ''` to block function hijacking.

| Area | Policy essence |
| --- | --- |
| Organizations | members read; owner creates; owners/admins update; only owner deletes. **Ownership is immutable through the API** (`no_owner_transfer` trigger) — an admin cannot reassign `owner_id`. |
| Memberships | co-members read roster; owners/admins manage. **Only the owner may create/change rows with role `owner`** — no admin self-promotion (`role <> 'owner' or has_org_role(..., ['owner'])`). |
| Projects/Tasks | personal = own rows (`org_id null`); org = role-gated (manager+ write, employees read). Task updates by assigned employee allowed. |
| Task assignments | visible with the task; manager+ (or personal owner) assign. |
| Devices | a user manages their own; org owners/admins see org-registered devices. **A device may only be placed in (or moved to) an org the user belongs to.** |
| Audit log | append-only (no update/delete policies); personal actions visible to the actor, org trail to owners/admins. |
| Shared resources | personal = own; org = any member reads, manager+ writes/deletes. |
| Remote commands | enqueue only when `can_control_device` (owner or an unexpired explicit grant) **and** the device's `remote_enabled` is true; requester must be self; scope must match the device's org. Only the device-owner process may claim/update; no delete policy (queue is not erasable via API). |
| Device grants | only the device owner writes/revokes; a grantee may see their own grant; `expires_at` null = no expiry, past = inert. |
| Profiles | self + co-members (shared org) may read; only self updates (inserts happen via the definer trigger). |
| Task comments | visible with the task; author must be self; append-only. |

## Remote-control authorization (inbound "Jarvis")

- Opt-in per device: `remote_enabled` defaults false; while off, nothing can be
  enqueued.
- No open inbound ports: Supabase is the command bus, the desktop polls.
- The desktop executes commands only through a hard allowlist of capabilities
  (`remoteCapabilities`); no handler reaches a shell. High-risk capabilities
  reject commands without `requires_confirmation`.
- Commands expire (`expires_at`) and are re-checked after claim; a command is
  never run twice (atomic `queued → claimed` compare-and-set).
- The device's own process is the only writer of `status`/`result`.

## Dependency posture

`npm audit --omit=dev` — **0 vulnerabilities** in production dependencies
(2026-11-26). No version changes were needed. Note the pinned overrides
(`dompurify`, `minimatch`) in `package.json`.

## Residual risks

1. **Single cloud identity per app instance.** A sign-in in one window
   replaces the app-wide token; another window's session map can describe a
   different user than the token actually used for cloud calls. RLS still
   enforces the token's user, so nothing is exposed beyond that identity, but
   multi-window multi-user usage is unsupported. Supporting it properly would
   require per-window tokens — out of scope for this pass.
2. **Machine trust.** A local attacker with access to the logged-in session
   can do anything that session can do (by design; the studio is a local
   developer tool). The OS keychain is the boundary.
3. **Owner self-demotion.** An owner may delete their own membership row,
   leaving an org with no owner (availability/operations gap, not an
   escalation). Not prevented — flagged for a future pass.
4. **Admin rename still allowed.** Admins may edit org names (intended); only
   `owner_id` is immutable.
5. **E2B provider errors** echo up to 300 chars of the upstream response body.
   Never the API key, but body text crosses the IPC boundary; acceptable while
   the sandbox API is trusted.
6. **No server-side rate limiting** beyond Supabase's built-in 429 handling;
   the desktop maps 429 to a friendly retry message.
