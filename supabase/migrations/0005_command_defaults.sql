-- Clients (desktop cloud client, mobile app) insert commands without requested_by or
-- expires_at, and both columns were NOT NULL with no default, so every enqueue failed.
-- Fill them server-side. The commands_insert policy still requires
-- requested_by = auth.uid(), so a client cannot spoof another requester.
alter table public.commands alter column requested_by set default auth.uid();
alter table public.commands alter column expires_at   set default (now() + interval '1 day');
