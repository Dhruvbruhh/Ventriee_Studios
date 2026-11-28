-- Per-project device grants (FINAL_AUDIT open issue #6, W36).
-- Until now a device_grants row authorized the grantee against EVERY project on
-- the device. An owner handing a laptop to an employee for one project had no
-- smaller option. Grants gain an optional project scope:
--
--   project_id IS NULL  => whole device (unchanged; existing rows keep working)
--   project_id = <uuid> => only commands whose payload.projectId matches
--
-- Enforcement stays in RLS: can_control_device learns the target project and the
-- commands_insert policy reads payload.projectId. Fail closed: when the payload
-- names no parseable project id, only a whole-device grant (or device ownership)
-- authorizes the command.

alter table public.device_grants
  add column if not exists project_id uuid references public.projects (id) on delete cascade;

-- p_project null means "target unknown"; only a whole-device grant covers that.
create or replace function public.can_control_device(p_device uuid, p_project uuid default null)
  returns boolean language sql security definer stable set search_path = '' as $$
  select exists (
    select 1 from public.devices d
    where d.id = p_device and d.remote_enabled
      and (
        d.user_id = (select auth.uid())
        or exists (
          select 1 from public.device_grants g
          where g.device_id = d.id and g.user_id = (select auth.uid())
            and (g.expires_at is null or g.expires_at > now())
            and (p_project is not null or g.project_id is null)
            and (g.project_id is null or g.project_id = p_project)
        )
      )
  );
$$;

-- Same rules as 0002, now passing the command's target project. A non-uuid
-- projectId (or none) parses as null and falls back to whole-device grants.
drop policy if exists commands_insert on public.commands;
create policy commands_insert on public.commands for insert
  with check (
    requested_by = (select auth.uid())
    and status = 'queued'
    and public.can_control_device(
      device_id,
      case when payload->>'projectId' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
           then (payload->>'projectId')::uuid end
    )
    and org_id is not distinct from (select d.org_id from public.devices d where d.id = device_id)
  );

-- The one-argument version from 0002 is now unused; drop it so a one-argument
-- call can never be ambiguous with the two-argument one above.
drop function if exists public.can_control_device(uuid);
