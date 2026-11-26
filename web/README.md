# Ventriee web (workspace · dashboard · app)

The Studios web app. It is separate from the Agency repo and talks to the same
Supabase project as the desktop app. One build serves three subdomains; the
hostname picks what is shown (`src/lib/surface.ts`):

| Host | Shows | Who |
|---|---|---|
| `workspace.ventriee.in` | Full workspace: overview, projects, task board, team, workload / my work | Everyone (by role) |
| `dashboard.ventriee.in` | Ops view: overview, projects, workload | Owner, admin, project manager |
| `app.ventriee.in` | Employee portal: my work + desktop app download | Everyone |

Access is enforced by Supabase RLS, not by the hostname — the subdomain only
decides which screens appear.

## Run locally

```powershell
cd web
copy .env.example .env   # fill in the two values
npm install
npm run dev              # http://localhost:5273
```

Preview another surface locally with `?surface=dashboard` or `?surface=app`.

## Deploy to Cloudflare Pages

One Pages project, three custom domains.

1. **Create the project.** Cloudflare dashboard → Workers & Pages → Create →
   Pages → Connect to Git → pick `Dhruvbruhh/Ventriee_Studios`.
2. **Build settings.**
   - Production branch: `master`
   - Framework preset: `Vite` (or None)
   - Root directory: `web`
   - Build command: `npm run build`
   - Build output directory: `dist`
3. **Environment variables** (Settings → Variables and Secrets, Production and Preview):
   - `VITE_SUPABASE_URL` = your Supabase project URL
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = the public publishable (or anon) key
   - `NODE_VERSION` = `20`

   Never put a service-role / secret key here — `VITE_` values are shipped to the browser.
4. **Deploy.** Save and deploy; check the `*.pages.dev` URL signs in.
5. **Custom domains.** Project → Custom domains → Set up a custom domain, three times:
   `workspace.ventriee.in`, `dashboard.ventriee.in`, `app.ventriee.in`.
   - If `ventriee.in` DNS is on Cloudflare, it adds the CNAME records for you.
   - If DNS is elsewhere, add at your DNS host for each:
     `CNAME  workspace  <project>.pages.dev` (same for `dashboard`, `app`),
     then click *Check DNS* in Cloudflare.
6. **Supabase auth.** Supabase → Authentication → URL Configuration: set Site URL
   to `https://workspace.ventriee.in` and add all three `https://…ventriee.in`
   URLs to Redirect URLs (needed once email links / password reset are used).
7. **Database.** Apply the migrations in `supabase/migrations/` (see
   `docs/cloud-setup.md`) before anyone signs in.

Every push to `master` redeploys all three subdomains; other branches get preview URLs.
