-- Same bug 0006 fixed for commands, on every other table: the desktop
-- CloudClient only holds a token, so it inserts organizations, projects, tasks,
-- devices, audit entries, shared resources and grants without the acting-user
-- column. Those are NOT NULL with no default, so the row was rejected (RLS saw
-- NULL <> auth.uid()). Fill them server-side; the insert policies still require
-- the value to equal auth.uid(), so a client cannot spoof another user.
alter table public.organizations    alter column owner_id   set default auth.uid();
alter table public.projects         alter column owner_id   set default auth.uid();
alter table public.tasks            alter column created_by set default auth.uid();
alter table public.devices          alter column user_id    set default auth.uid();
alter table public.audit_log        alter column actor_id   set default auth.uid();
alter table public.shared_resources alter column owner_id   set default auth.uid();
alter table public.device_grants    alter column granted_by set default auth.uid();
