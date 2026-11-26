-- Desktop <-> cloud sync (workstream W14). Additive only.
--
-- updated_at on projects and tasks lets the desktop detect conflicts: it PATCHes
-- with `updated_at = <what it last saw>`, so a row changed elsewhere in between
-- matches nothing and is reported as a conflict instead of being overwritten.
-- The trigger keeps the column honest whichever client writes.
--
-- run_* carry the desktop's live agent activity (raw desktop status, model,
-- worker name) so the web/mobile "AI activity" view can show it. Metadata only:
-- no code, file contents or prompts are ever stored here.

alter table public.projects add column if not exists updated_at timestamptz not null default now();
alter table public.tasks    add column if not exists updated_at timestamptz not null default now();
alter table public.tasks    add column if not exists run_status text not null default '' check (char_length(run_status) <= 40);
alter table public.tasks    add column if not exists run_model  text not null default '' check (char_length(run_model) <= 200);
alter table public.tasks    add column if not exists run_agent  text not null default '' check (char_length(run_agent) <= 200);

create or replace function public.touch_updated_at()
  returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists projects_touch_updated_at on public.projects;
create trigger projects_touch_updated_at
  before update on public.projects
  for each row execute function public.touch_updated_at();

drop trigger if exists tasks_touch_updated_at on public.tasks;
create trigger tasks_touch_updated_at
  before update on public.tasks
  for each row execute function public.touch_updated_at();

-- Fix: the 0001 tasks_update policy read task_assignments, whose select policy
-- reads tasks again, so every UPDATE by a signed-in user failed with "infinite
-- recursion detected in policy for relation tasks". A definer helper checks
-- the assignment without re-entering RLS (search_path pinned, like 0001's).
create or replace function public.is_task_assignee(p_task uuid)
  returns boolean language sql security definer stable set search_path = '' as $$
  select exists (
    select 1 from public.task_assignments a
    where a.task_id = p_task and a.user_id = (select auth.uid())
  );
$$;

drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks for update
  using (
    project_id in (
      select p.id from public.projects p
      where (p.org_id is null and p.owner_id = (select auth.uid()))
        or (p.org_id is not null and public.has_org_role(p.org_id, array['owner','admin','project_manager']))
    )
    or public.is_task_assignee(id)
  );
