-- Anonymous visitors use the public Supabase key but do not need direct
-- PostgREST access to core app tables. The SPA loads these tables only after
-- a Supabase Auth session exists; Auth signup/login endpoints are unaffected.
-- This is a containment step, not the complete role/venture RLS policy set.
begin;

revoke all privileges on table public.users, public.ventures, public.tasks
  from anon;

commit;