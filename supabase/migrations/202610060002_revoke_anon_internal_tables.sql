-- These tables are used by the authenticated Holding SPA or privileged
-- server endpoints. RLS currently denies anonymous access to some of them
-- because they have no applicable anon policy; revoking grants adds defense
-- in depth. Do not revoke the separate `postulaciones` table or
-- `venture_social_config` (which has an explicit anon policy) until their
-- intended use has been confirmed.
begin;

revoke all privileges on table
  public.absences,
  public.activity_log,
  public.cal_events,
  public.calendar_tokens,
  public.executor_goals,
  public.hour_bank,
  public.inbox_notes,
  public.presence_requests,
  public.projects,
  public.venture_metrics,
  public.venture_pub_schedule,
  public.work_schedule_blocks,
  public.workflow_state
from anon;

commit;