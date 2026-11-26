-- Ventriee web agency dashboard additions (workstream W4).
-- Stacks on 0001_multitenant_foundation.sql. Additive only: new nullable task
-- columns, a profiles table so people show as names instead of raw UUIDs, and a
-- task_comments table for progress notes. Every new table has RLS enabled.

-- ---------------------------------------------------------------------------
-- Task metadata the dashboard needs: priority, deadline, description.
-- All optional, so existing rows and the desktop app are unaffected.
-- ---------------------------------------------------------------------------
alter table public.tasks add column if not exists description text not null default '';
alter table public.tasks add column if not exists priority text not null default 'medium';
alter table public.tasks add column if not exists deadline timestamptz;

-- ---------------------------------------------------------------------------
-- Profiles: a readable mirror of auth.users (which PostgREST does not expose),
-- so a roster, assignees and comment authors render as names/emails. A user
-- edits only their own; co-members (sharing any org) may read each other's.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  email        text not null default '',
  display_name text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Seed a row for every existing user, and keep one per new signup.
insert into public.profiles (user_id, email, display_name)
  select id, coalesce(email, ''), coalesce(raw_user_meta_data->>'display_name', split_part(coalesce(email, ''), '@', 1))
  from auth.users
  on conflict (user_id) do nothing;

create or replace function public.handle_new_user()
  returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id, email, display_name)
  values (new.id, coalesce(new.email, ''),
          coalesce(new.raw_user_meta_data->>'display_name', split_part(coalesce(new.email, ''), '@', 1)))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- True iff the signed-in user shares at least one org with p_user. Definer so it
-- does not recurse through the memberships RLS policy. search_path pinned.
create or replace function public.shares_org_with(p_user uuid)
  returns boolean language sql security definer stable set search_path = '' as $$
  select exists (
    select 1
    from public.memberships me
    join public.memberships them on them.org_id = me.org_id
    where me.user_id = (select auth.uid()) and them.user_id = p_user
  );
$$;

alter table public.profiles enable row level security;

create policy profiles_select on public.profiles for select
  using (user_id = (select auth.uid()) or public.shares_org_with(user_id));
create policy profiles_update on public.profiles for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
-- Inserts happen via the definer trigger above; no client insert policy needed.

-- ---------------------------------------------------------------------------
-- Task comments / progress notes. Visible with the task (reuses the tasks
-- policy via the subquery); any member who can see the task may add one,
-- attributed to themselves. Append-only: no update/delete policy.
-- ---------------------------------------------------------------------------
create table if not exists public.task_comments (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks (id) on delete cascade,
  author_id  uuid not null references auth.users (id),
  body       text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists task_comments_task_idx on public.task_comments (task_id, created_at);

alter table public.task_comments enable row level security;

create policy task_comments_select on public.task_comments for select
  using (task_id in (select id from public.tasks));
create policy task_comments_insert on public.task_comments for insert
  with check (
    author_id = (select auth.uid())
    and task_id in (select id from public.tasks)
  );
