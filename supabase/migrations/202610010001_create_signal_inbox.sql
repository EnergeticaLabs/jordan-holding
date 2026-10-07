-- Verify public.users.id/auth_id, public.ventures.id and public.tasks schema
-- in the target Supabase project before applying this additive migration.
begin;

create table if not exists public.signals (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 180),
  content text not null check (char_length(content) between 1 and 50000),
  source text,
  source_url text,
  signal_type text,
  status text not null default 'inbox' check (status in ('inbox', 'analyzed', 'archived')),
  created_at timestamptz not null default now(),
  analyzed_at timestamptz,
  analysis jsonb,
  created_by uuid not null
);

create index if not exists signals_owner_created_idx
  on public.signals (created_by, created_at desc);

alter table public.tasks
  add column if not exists signal_id uuid references public.signals(id) on delete set null,
  add column if not exists signal_proposal_id text;

create unique index if not exists tasks_signal_proposal_unique_idx
  on public.tasks (signal_id, signal_proposal_id)
  where signal_id is not null and signal_proposal_id is not null;

alter table public.signals enable row level security;

grant all on table public.signals to service_role;
revoke all privileges on table public.signals from anon, public;
grant select, insert, update, delete on table public.signals to authenticated;

drop policy if exists signals_owner_access on public.signals;
create policy signals_owner_access on public.signals
  for all to authenticated
  using (
    exists (
      select 1 from public.users u
      where u.auth_id = auth.uid()
        and u.rol = 'owner'
        and u.id = signals.created_by
    )
  )
  with check (
    exists (
      select 1 from public.users u
      where u.auth_id = auth.uid()
        and u.rol = 'owner'
        and u.id = signals.created_by
    )
  );

commit;