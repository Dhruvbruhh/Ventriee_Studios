-- Ventriee Studios cloud backend foundation (workstream W3).
-- Multi-tenant schema + Row-Level Security for the shared agency data layer.
-- Personal workspace = rows with org_id NULL owned by the signed-in user.
-- Every table below has RLS enabled and explicit policies; nothing is world-readable.
--
-- Apply with the Supabase CLI (`supabase db push`) or paste into the SQL editor.
-- See docs/cloud-setup.md. Needs Supabase's built-in auth schema (auth.users,
-- auth.uid()). gen_random_uuid() is core in PostgreSQL 13+, so no extension.

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.membership_role as enum ('owner', 'admin', 'project_manager', 'employee');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 1 and 200),
  owner_id   uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.memberships (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       public.membership_role not null default 'employee',
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);
create index if not exists memberships_user_idx on public.memberships (user_id);
create index if not exists memberships_org_idx  on public.memberships (org_id);

-- org_id NULL => personal workspace, owned by owner_id.
create table if not exists public.projects (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid references public.organizations (id) on delete cascade,
  owner_id   uuid not null references auth.users (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 200),
  status     text not null default 'active',
  created_at timestamptz not null default now()
);
create index if not exists projects_org_idx   on public.projects (org_id);
create index if not exists projects_owner_idx on public.projects (owner_id);

create table if not exists public.tasks (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title      text not null check (char_length(title) between 1 and 500),
  status     text not null default 'todo',
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);
create index if not exists tasks_project_idx on public.tasks (project_id);

create table if not exists public.task_assignments (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  assigned_at timestamptz not null default now(),
  unique (task_id, user_id)
);
create index if not exists task_assignments_task_idx on public.task_assignments (task_id);
create index if not exists task_assignments_user_idx on public.task_assignments (user_id);

-- Desktop runtime registry: each desktop IDE instance a user signs into.
-- org_id NULL => a personal device, not registered to any org.
create table if not exists public.devices (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  org_id       uuid references public.organizations (id) on delete set null,
  name         text not null check (char_length(name) between 1 and 200),
  platform     text not null default '',
  last_seen_at timestamptz not null default now(),
  created_at   timestamptz not null default now()
);
create index if not exists devices_user_idx on public.devices (user_id);
create index if not exists devices_org_idx  on public.devices (org_id);

-- Append-only audit trail. org_id NULL => a personal action.
create table if not exists public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid references public.organizations (id) on delete cascade,
  actor_id    uuid not null references auth.users (id),
  action      text not null check (char_length(action) between 1 and 200),
  target_type text not null default '',
  target_id   text not null default '',
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists audit_log_org_idx on public.audit_log (org_id, created_at desc);

-- Metadata for resources shared across a workspace (files, links, prompts...).
-- org_id NULL => a personal resource.
create table if not exists public.shared_resources (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid references public.organizations (id) on delete cascade,
  owner_id   uuid not null references auth.users (id) on delete cascade,
  kind       text not null check (char_length(kind) between 1 and 100),
  name       text not null check (char_length(name) between 1 and 300),
  uri        text not null default '',
  metadata   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists shared_resources_org_idx   on public.shared_resources (org_id);
create index if not exists shared_resources_owner_idx on public.shared_resources (owner_id);

-- ---------------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER so membership checks don't recurse through
-- the memberships RLS policy). search_path pinned to '' to block hijacking.
-- ---------------------------------------------------------------------------

create or replace function public.is_org_member(p_org uuid)
  returns boolean language sql security definer stable set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.org_id = p_org and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.has_org_role(p_org uuid, p_roles text[])
  returns boolean language sql security definer stable set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.org_id = p_org and m.user_id = (select auth.uid())
      and m.role::text = any (p_roles)
  );
$$;

-- When an org is created, its creator becomes the owner member. Runs as definer
-- so the very first insert succeeds before any membership row exists.
create or replace function public.add_owner_membership()
  returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.memberships (org_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (org_id, user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists organizations_add_owner on public.organizations;
create trigger organizations_add_owner
  after insert on public.organizations
  for each row execute function public.add_owner_membership();

-- Ownership is not transferable through the API: admins manage everything else,
-- but only the current owner column value may be preserved (never changed).
create or replace function public.no_owner_transfer()
  returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception 'Organization ownership cannot be transferred through the API';
  end if;
  return new;
end;
$$;
drop trigger if exists organizations_no_owner_transfer on public.organizations;
create trigger organizations_no_owner_transfer
  before update on public.organizations
  for each row execute function public.no_owner_transfer();

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------

alter table public.organizations   enable row level security;
alter table public.memberships      enable row level security;
alter table public.projects         enable row level security;
alter table public.tasks            enable row level security;
alter table public.task_assignments enable row level security;
alter table public.devices          enable row level security;
alter table public.audit_log        enable row level security;
alter table public.shared_resources enable row level security;

-- organizations: members read; anyone may create an org they own; owners/admins
-- edit; only the owner deletes.
create policy organizations_select on public.organizations for select
  using (owner_id = (select auth.uid()) or public.is_org_member(id));
create policy organizations_insert on public.organizations for insert
  with check (owner_id = (select auth.uid()));
create policy organizations_update on public.organizations for update
  using (public.has_org_role(id, array['owner','admin']))
  with check (public.has_org_role(id, array['owner','admin']));
create policy organizations_delete on public.organizations for delete
  using (owner_id = (select auth.uid()));

-- memberships: co-members read the roster; owners/admins manage it. Only the
-- owner may grant or change rows carrying the 'owner' role (no admin self-
-- promotion or handing the org away).
create policy memberships_select on public.memberships for select
  using (public.is_org_member(org_id));
create policy memberships_write on public.memberships for all
  using (public.has_org_role(org_id, array['owner','admin']))
  with check (
    public.has_org_role(org_id, array['owner','admin'])
    and (role <> 'owner' or public.has_org_role(org_id, array['owner']))
  );

-- projects: personal (own, org_id NULL) or any project of an org you belong to.
-- Managers+ write org projects; the owner writes their personal projects.
create policy projects_select on public.projects for select
  using (
    (org_id is null and owner_id = (select auth.uid()))
    or (org_id is not null and public.is_org_member(org_id))
  );
create policy projects_insert on public.projects for insert
  with check (
    owner_id = (select auth.uid()) and (
      org_id is null
      or public.has_org_role(org_id, array['owner','admin','project_manager'])
    )
  );
create policy projects_update on public.projects for update
  using (
    (org_id is null and owner_id = (select auth.uid()))
    or (org_id is not null and public.has_org_role(org_id, array['owner','admin','project_manager']))
  );
create policy projects_delete on public.projects for delete
  using (
    (org_id is null and owner_id = (select auth.uid()))
    or (org_id is not null and public.has_org_role(org_id, array['owner','admin']))
  );

-- tasks: visible iff their project is (the projects policy is re-applied to this
-- subquery, so no separate membership check is needed). Managers+ and personal
-- owners write; an employee may update a task assigned to them.
create policy tasks_select on public.tasks for select
  using (project_id in (select id from public.projects));
create policy tasks_insert on public.tasks for insert
  with check (
    created_by = (select auth.uid())
    and project_id in (
      select p.id from public.projects p
      where (p.org_id is null and p.owner_id = (select auth.uid()))
        or (p.org_id is not null and public.has_org_role(p.org_id, array['owner','admin','project_manager']))
    )
  );
create policy tasks_update on public.tasks for update
  using (
    project_id in (
      select p.id from public.projects p
      where (p.org_id is null and p.owner_id = (select auth.uid()))
        or (p.org_id is not null and public.has_org_role(p.org_id, array['owner','admin','project_manager']))
    )
    or id in (select a.task_id from public.task_assignments a where a.user_id = (select auth.uid()))
  );
create policy tasks_delete on public.tasks for delete
  using (
    project_id in (
      select p.id from public.projects p
      where (p.org_id is null and p.owner_id = (select auth.uid()))
        or (p.org_id is not null and public.has_org_role(p.org_id, array['owner','admin','project_manager']))
    )
  );

-- task_assignments: visible with the task; managers+ (or personal owner) assign.
create policy task_assignments_select on public.task_assignments for select
  using (task_id in (select id from public.tasks));
create policy task_assignments_write on public.task_assignments for all
  using (
    task_id in (
      select t.id from public.tasks t join public.projects p on p.id = t.project_id
      where (p.org_id is null and p.owner_id = (select auth.uid()))
        or (p.org_id is not null and public.has_org_role(p.org_id, array['owner','admin','project_manager']))
    )
  )
  with check (
    task_id in (
      select t.id from public.tasks t join public.projects p on p.id = t.project_id
      where (p.org_id is null and p.owner_id = (select auth.uid()))
        or (p.org_id is not null and public.has_org_role(p.org_id, array['owner','admin','project_manager']))
    )
  );

-- devices: a user manages their own; org owners/admins can see org-registered devices.
create policy devices_select on public.devices for select
  using (
    user_id = (select auth.uid())
    or (org_id is not null and public.has_org_role(org_id, array['owner','admin']))
  );
create policy devices_write on public.devices for all
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (org_id is null or public.is_org_member(org_id))
  );

-- audit_log: append-only. You read your personal actions and, as owner/admin,
-- your org's trail. Inserts must be attributed to you. No update/delete policy
-- exists, so the log cannot be altered or erased through the API.
create policy audit_log_select on public.audit_log for select
  using (
    (org_id is null and actor_id = (select auth.uid()))
    or (org_id is not null and public.has_org_role(org_id, array['owner','admin']))
  );
create policy audit_log_insert on public.audit_log for insert
  with check (
    actor_id = (select auth.uid())
    and (org_id is null or public.is_org_member(org_id))
  );

-- shared_resources: personal (own) or any resource of an org you belong to.
create policy shared_resources_select on public.shared_resources for select
  using (
    (org_id is null and owner_id = (select auth.uid()))
    or (org_id is not null and public.is_org_member(org_id))
  );
create policy shared_resources_insert on public.shared_resources for insert
  with check (
    owner_id = (select auth.uid())
    and (org_id is null or public.is_org_member(org_id))
  );
create policy shared_resources_update on public.shared_resources for update
  using (
    (org_id is null and owner_id = (select auth.uid()))
    or (org_id is not null and public.has_org_role(org_id, array['owner','admin','project_manager']))
  );
create policy shared_resources_delete on public.shared_resources for delete
  using (
    (org_id is null and owner_id = (select auth.uid()))
    or (org_id is not null and public.has_org_role(org_id, array['owner','admin']))
  );
