-- Permission assignments are read and written by the SPA only after login.
-- Remove direct PostgREST access for anonymous visitors; authenticated access
-- still needs a separate, role-aware RLS redesign.
begin;

revoke all privileges on table public.roles_permissions from anon;

commit;