-- W44: Expo push tokens for the mobile client, plus what the notify function
-- needs to find them. One row per (user, token): a device re-registering with
-- the same token updates its row in place (owner-scoped update policy below).
--
-- Access model:
--   * A user sees and manages ONLY their own token rows (select/insert/delete
--     plus a narrowly scoped update) on user_id = auth.uid(). The update policy
--     exists because clients re-register with an upsert (ON CONFLICT DO
--     UPDATE), and Postgres evaluates UPDATE policies on the conflict path.
--   * No org dimension: a token belongs to a person, and pushes are addressed to
--     a person, not a workspace.
--   * Nothing is world-readable. The notify Edge Function uses the service role,
--     which bypasses RLS, so no service policy is needed here.

create table if not exists public.push_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  token      text not null check (char_length(token) between 10 and 500),
  platform   text not null check (platform in ('ios', 'android', 'web')),
  created_at timestamptz not null default now(),
  unique (user_id, token)
);
create index if not exists push_tokens_user_idx on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;

create policy push_tokens_select on public.push_tokens for select
  using (user_id = (select auth.uid()));
create policy push_tokens_insert on public.push_tokens for insert
  with check (user_id = (select auth.uid()));
create policy push_tokens_delete on public.push_tokens for delete
  using (user_id = (select auth.uid()));
-- Re-registration upserts (ON CONFLICT DO UPDATE) need an update policy; kept
-- owner-scoped so a user can never touch another row.
create policy push_tokens_update on public.push_tokens for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
