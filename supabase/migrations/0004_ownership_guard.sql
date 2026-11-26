-- Ventriee Studios ownership integrity guard (follow-up to W8).
--
-- Two gaps left by 0001:
--   1. An owner could delete their own membership row (or demote themselves) and
--      leave the organization with no owner: nobody could administer it ever
--      again, because owner_id is immutable through the API.
--   2. The single `for all` membership policy used only USING for DELETE, so an
--      admin could delete an owner's membership row (WITH CHECK does not apply
--      to DELETE).
--
-- Fix: keep an "at least one owner" trigger, and split membership writes into
-- per-command policies where owner rows may only be touched by an owner.

create or replace function public.keep_org_owner()
  returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Only a change that removes this row from the owner set can break the invariant.
  if old.role = 'owner' and (tg_op = 'DELETE' or new.role <> 'owner') then
    if not exists (
      select 1 from public.memberships
      where org_id = old.org_id and id <> old.id and role = 'owner'
    ) then
      raise exception 'An organization must keep at least one owner';
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists memberships_keep_owner on public.memberships;
create trigger memberships_keep_owner
  before update of role or delete on public.memberships
  for each row execute function public.keep_org_owner();

drop policy if exists memberships_write on public.memberships;

create policy memberships_insert on public.memberships for insert
  with check (
    public.has_org_role(org_id, array['owner','admin'])
    and (role <> 'owner' or public.has_org_role(org_id, array['owner']))
  );

-- USING also guards the existing row, so an admin cannot demote or delete an owner.
create policy memberships_update on public.memberships for update
  using (
    public.has_org_role(org_id, array['owner','admin'])
    and (role <> 'owner' or public.has_org_role(org_id, array['owner']))
  )
  with check (
    public.has_org_role(org_id, array['owner','admin'])
    and (role <> 'owner' or public.has_org_role(org_id, array['owner']))
  );

create policy memberships_delete on public.memberships for delete
  using (
    public.has_org_role(org_id, array['owner','admin'])
    and (role <> 'owner' or public.has_org_role(org_id, array['owner']))
  );
