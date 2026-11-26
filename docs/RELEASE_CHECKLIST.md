# Release checklist

Do these in order. Steps 1–2 are owner actions this audit could not do for you.

## 1. Apply the cloud schema (done 2026-11-26)

Back up first: Supabase dashboard → Database → Backups (or `supabase db dump -f backup.sql`).

```powershell
npm i -g supabase
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

This applies `supabase/migrations/0001` to `0006` in order. Then check that
`<SUPABASE_URL>/rest/v1/projects?select=id&limit=1` with the anon key returns `[]`, not PGRST205.

## 2. Create two test accounts

One owner and one employee, on the same project. Use throwaway emails.

## 3. Manual signed-in pass (record results in FINAL_BUILD_STATUS.md)

- [ ] Desktop: sign in as owner → create project → chat with a configured model → start an agent run on a tiny test project → stop it → open the terminal (correct folder) → edit and save a file → git status shows it
- [ ] Desktop: Settings → Remote control → turn on for this device
- [ ] Web `workspace`: owner sees the project; create a task and assign it to the employee
- [ ] Web as employee: sees only their tasks; cannot open Team; `dashboard` surface shows "Managers only"
- [ ] Mobile as owner: device shows online; send "Ask project status" → result appears; send "Start agent run" with an instruction → confirm → the run starts on the laptop
- [ ] Mobile: approve an `in_review` task → web shows Completed
- [ ] Restart the desktop → it re-registers the same device (no duplicate) and drains anything queued
- [ ] Turn remote control off → mobile command is refused

## 4. Build and ship

```powershell
npm ci; npm run typecheck; npm test; npm run dist
```

```powershell
cd web; npm ci; npm run build
```

- Desktop: GitHub release workflow (`.github/workflows/release.yml`) needs the `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (or `_ANON_KEY`) repo secrets.
- Web: Cloudflare Pages, root `web`, build `npm run build`, output `dist`, custom domains workspace/dashboard/app.ventriee.in (full steps in `web/README.md`).
- Mobile: `cd mobile; npx expo start` for a dev build. Store builds need EAS (`eas build`), which is not set up yet.

## 5. Backup and recovery

- Database: Supabase daily backups (Pro plan) or a scheduled `supabase db dump`. Restore with `psql -f`.
- Desktop data stays local in the user-data folder (SQLite). Back it up by copying `%APPDATA%/Ventriee Studios`.
- Migrations are additive. To undo 0006: `alter table public.commands alter column requested_by drop default, alter column expires_at drop default;`

## Release gate

- [ ] No open P0
- [ ] Each P1 fixed or accepted in writing by the owner (FINAL_AUDIT.md open issues 2–3)
- [ ] Step 3 completed with no failures
