-- Ventriee Studios "Jarvis" inbound remote control (workstream W5, ECOSYSTEM §17).
-- Lets an authorized user drive a signed-in desktop runtime from phone/web with no
-- open inbound ports: Supabase is the command bus. A phone/web client ENQUEUEs a
-- command row; the desktop that owns the target device CLAIMs and executes it, then
-- writes status + result back. Stacks on 0001_multitenant_foundation.sql (devices,
-- organizations, the is_org_member/has_org_role helpers).
--
-- Security model (least privilege, explicit per-device authorization):
--   * Being in an org does NOT grant control of another member's device. Control is
--     granted only to the device owner, or to a user the owner explicitly adds to
--     device_grants (optionally time-limited).
--   * Remote control is OFF by default per device (devices.remote_enabled=false);
--     while off, nothing can be enqueued to it.
--   * Only the device's own owner process may claim/update its command rows.
--
-- Apply with the Supabase CLI (`supabase db push`) or paste into the SQL editor.

-- Remote control is opt-in per device; default off.
alter table public.devices add column if not exists remote_enabled boolean not null default false;

-- ---------------------------------------------------------------------------
-- Explicit per-device control grants. Only the device owner writes these.
-- A grant with expires_at in the past is inert (see can_control_device).
-- ---------------------------------------------------------------------------
create table if not exists public.device_grants (
  id         uuid primary key default gen_random_uuid(),
  device_id  uuid not null references public.devices (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,  -- the grantee
  granted_by uuid not null references auth.users (id),
  expires_at timestamptz,                                                 -- null => no expiry
  created_at timestamptz not null default now(),
  unique (device_id, user_id)
);
create index if not exists device_grants_device_idx on public.device_grants (device_id);
create index if not exists device_grants_user_idx   on public.device_grants (user_id);

-- ---------------------------------------------------------------------------
-- The command queue (the bus). One row = one command addressed to one device.
-- ---------------------------------------------------------------------------
create table if not exists public.commands (
  id                    uuid primary key default gen_random_uuid(),
  device_id             uuid not null references public.devices (id) on delete cascade,
  org_id                uuid references public.organizations (id) on delete cascade,  -- scope; null => personal
  type                  text not null check (char_length(type) between 1 and 100),
  payload               jsonb not null default '{}'::jsonb,
  status                text not null default 'queued'
                          check (status in ('queued','claimed','running','done','failed','expired')),
  requires_confirmation boolean not null default false,  -- high-risk commands must set this true
  result                jsonb not null default '{}'::jsonb,
  error                 text not null default '',
  requested_by          uuid not null references auth.users (id),
  created_at            timestamptz not null default now(),
  claimed_at            timestamptz,
  finished_at           timestamptz,
  expires_at            timestamptz not null
);
create index if not exists commands_device_status_idx on public.commands (device_id, status);
create index if not exists commands_requester_idx     on public.commands (requested_by);

-- ---------------------------------------------------------------------------
-- Authorization helper. SECURITY DEFINER so it can read devices/grants without the
-- caller needing row access to them; search_path pinned to '' to block hijacking.
-- True iff the caller may send commands to p_device right now.
-- ---------------------------------------------------------------------------
create or replace function public.can_control_device(p_device uuid)
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
        )
      )
  );
$$;

-- True iff the caller is the owner process of p_device (may claim/update its rows).
create or replace function public.owns_device(p_device uuid)
  returns boolean language sql security definer stable set search_path = '' as $$
  select exists (
    select 1 from public.devices d
    where d.id = p_device and d.user_id = (select auth.uid())
  );
$$;

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------
alter table public.device_grants enable row level security;
alter table public.commands      enable row level security;

-- device_grants: the device owner manages grants; a grantee may see their own grant.
create policy device_grants_select on public.device_grants for select
  using (public.owns_device(device_id) or user_id = (select auth.uid()));
create policy device_grants_write on public.device_grants for all
  using (public.owns_device(device_id))
  with check (public.owns_device(device_id) and granted_by = (select auth.uid()));

-- commands:
--   select: the requester sees commands they sent; the device owner sees its queue.
--   insert: only an authorized caller, enqueuing as themselves, as 'queued'. The org
--           scope must match the device's org so scope can't be spoofed.
--   update: only the device's owner process (claim, run, write result).
--   (no delete policy: the queue is not erasable through the API; rows expire.)
create policy commands_select on public.commands for select
  using (requested_by = (select auth.uid()) or public.owns_device(device_id));
create policy commands_insert on public.commands for insert
  with check (
    requested_by = (select auth.uid())
    and status = 'queued'
    and public.can_control_device(device_id)
    and org_id is not distinct from (select d.org_id from public.devices d where d.id = device_id)
  );
create policy commands_update on public.commands for update
  using (public.owns_device(device_id))
  with check (public.owns_device(device_id));
