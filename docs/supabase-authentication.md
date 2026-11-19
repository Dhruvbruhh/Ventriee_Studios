# Supabase authentication

The desktop app uses Supabase Auth's REST endpoints from Electron's main process. No administrator key or Supabase client SDK is needed in the renderer. The previous authentication provider has been removed.

## Configuration

Set these public values in the project-root `.env`:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-public-publishable-key
```

A legacy public anon key can instead be set as `VITE_SUPABASE_ANON_KEY`. The supplied public connection values have already been written to the local, Git-ignored `.env`. Never use a service-role key, secret key, or Supabase account access token here. The build rejects administrator keys.

Enable Email authentication and signups in the Supabase Dashboard. When email confirmation is enabled, signup shows a confirmation message; the user confirms their email in the browser and returns to the app to sign in. Configure a valid Site URL in Supabase for that confirmation page. Production email delivery requires the appropriate SMTP configuration and rate limits.

Run `npm install`, then `npm run dev`. Release builds read `.env.production` when present; Vite compiles the public settings into the app. This integration currently provides email/password signup, signin, encrypted session persistence, refresh, and signout. Social login, password recovery screens, and MFA challenges are not implemented.

## Session handling

- Only the main process calls the authentication endpoints. The renderer submits signin credentials through a narrow, origin-checked IPC bridge and receives a user identifier, email, and expiry; it never receives access or refresh tokens.
- Supabase's `/auth/v1/user` endpoint verifies sessions before studio access is granted. A locally decoded JWT is used only for expiry after server verification. Sessions are refreshed before expiry, with refresh calls shared across windows.
- Refresh tokens are encrypted using OS credential storage. Without secure storage, a session is kept in process memory only. No plaintext persistence fallback is enabled.
- Signing out clears local access immediately, stops agent runs/previews, locks all windows, and attempts remote logout. A temporary connection failure locks the UI while preserving in-memory editor buffers for reauthentication. Closing the app still loses unsaved buffers.
- Authentication gates access to the local OS profile. Different accounts using that same OS profile share the local project database; this is not a cloud multi-tenant database migration.

The live connection check could not complete here because DNS resolution is blocked (`ENOTFOUND`). No administrator credentials were stored or used. Privileged credentials pasted into a conversation should be revoked/rotated in Supabase.

References: [Supabase password auth](https://supabase.com/docs/guides/auth/passwords), [Auth API specification](https://github.com/supabase/auth/blob/master/openapi.yaml), [session verification](https://supabase.com/docs/reference/javascript/auth-getuser).
