-- Trusted write helpers for MAI Caddy analysis status transitions.
--
-- These functions are intentionally executable only by service_role. The Edge
-- Function still reads sessions and shots with the caller's JWT so RLS verifies
-- access, then uses these helpers only to persist trusted server-generated
-- analysis records.

create or replace function public.mai_caddy_start_session_analysis(
  p_session_id text,
  p_player_id uuid,
  p_prompt_version text default 'mai-caddy-v1',
  p_model text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_analysis_id uuid;
  v_analysis_version integer;
begin
  if p_player_id is null then
    raise exception 'player id is required' using errcode = '22023';
  end if;

  if p_session_id is null or length(btrim(p_session_id)) = 0 then
    raise exception 'session id is required' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_player_id::text || ':' || p_session_id, 0));

  update public.mai_caddy_session_analyses
  set is_current = false
  where player_id = p_player_id
    and session_id = p_session_id
    and is_current;

  select coalesce(max(analysis_version), 0) + 1
  into v_analysis_version
  from public.mai_caddy_session_analyses
  where player_id = p_player_id
    and session_id = p_session_id
    and prompt_version = coalesce(nullif(btrim(p_prompt_version), ''), 'mai-caddy-v1');

  insert into public.mai_caddy_session_analyses (
    session_id,
    player_id,
    status,
    model,
    prompt_version,
    analysis_version,
    is_current,
    started_at
  )
  values (
    p_session_id,
    p_player_id,
    'processing',
    nullif(btrim(p_model), ''),
    coalesce(nullif(btrim(p_prompt_version), ''), 'mai-caddy-v1'),
    v_analysis_version,
    true,
    now()
  )
  returning id into v_analysis_id;

  return v_analysis_id;
end;
$$;

create or replace function public.mai_caddy_complete_session_analysis(
  p_analysis_id uuid,
  p_player_id uuid,
  p_analysis jsonb,
  p_calculated_metrics jsonb,
  p_model text,
  p_prompt_version text default 'mai-caddy-v1'
)
returns public.mai_caddy_session_analyses
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_row public.mai_caddy_session_analyses;
begin
  if p_analysis_id is null or p_player_id is null then
    raise exception 'analysis id and player id are required' using errcode = '22023';
  end if;

  if p_analysis is null or jsonb_typeof(p_analysis) <> 'object' then
    raise exception 'analysis must be a json object' using errcode = '22023';
  end if;

  if p_calculated_metrics is null or jsonb_typeof(p_calculated_metrics) <> 'object' then
    raise exception 'calculated metrics must be a json object' using errcode = '22023';
  end if;

  update public.mai_caddy_session_analyses
  set status = 'completed',
      analysis = p_analysis,
      calculated_metrics = p_calculated_metrics,
      model = nullif(btrim(p_model), ''),
      prompt_version = coalesce(nullif(btrim(p_prompt_version), ''), 'mai-caddy-v1'),
      error_code = null,
      error_message = null,
      completed_at = now()
  where id = p_analysis_id
    and player_id = p_player_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'analysis record not found' using errcode = 'P0002';
  end if;

  return v_row;
end;
$$;

create or replace function public.mai_caddy_fail_session_analysis(
  p_analysis_id uuid,
  p_player_id uuid,
  p_error_code text,
  p_error_message text
)
returns public.mai_caddy_session_analyses
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_row public.mai_caddy_session_analyses;
begin
  if p_analysis_id is null or p_player_id is null then
    raise exception 'analysis id and player id are required' using errcode = '22023';
  end if;

  update public.mai_caddy_session_analyses
  set status = 'failed',
      error_code = left(coalesce(nullif(btrim(p_error_code), ''), 'analysis_failed'), 80),
      error_message = left(coalesce(nullif(btrim(p_error_message), ''), 'The analysis could not be completed.'), 500),
      completed_at = now()
  where id = p_analysis_id
    and player_id = p_player_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'analysis record not found' using errcode = 'P0002';
  end if;

  return v_row;
end;
$$;

revoke all on function public.mai_caddy_start_session_analysis(text, uuid, text, text) from public;
revoke all on function public.mai_caddy_start_session_analysis(text, uuid, text, text) from anon;
revoke all on function public.mai_caddy_start_session_analysis(text, uuid, text, text) from authenticated;
grant execute on function public.mai_caddy_start_session_analysis(text, uuid, text, text) to service_role;

revoke all on function public.mai_caddy_complete_session_analysis(uuid, uuid, jsonb, jsonb, text, text) from public;
revoke all on function public.mai_caddy_complete_session_analysis(uuid, uuid, jsonb, jsonb, text, text) from anon;
revoke all on function public.mai_caddy_complete_session_analysis(uuid, uuid, jsonb, jsonb, text, text) from authenticated;
grant execute on function public.mai_caddy_complete_session_analysis(uuid, uuid, jsonb, jsonb, text, text) to service_role;

revoke all on function public.mai_caddy_fail_session_analysis(uuid, uuid, text, text) from public;
revoke all on function public.mai_caddy_fail_session_analysis(uuid, uuid, text, text) from anon;
revoke all on function public.mai_caddy_fail_session_analysis(uuid, uuid, text, text) from authenticated;
grant execute on function public.mai_caddy_fail_session_analysis(uuid, uuid, text, text) to service_role;

comment on function public.mai_caddy_start_session_analysis(text, uuid, text, text) is
  'Creates the current processing MAI Caddy analysis record after the Edge Function has verified user-scoped session access.';
comment on function public.mai_caddy_complete_session_analysis(uuid, uuid, jsonb, jsonb, text, text) is
  'Marks a MAI Caddy analysis completed with validated structured output and deterministic calculated metrics.';
comment on function public.mai_caddy_fail_session_analysis(uuid, uuid, text, text) is
  'Marks a MAI Caddy analysis failed with a safe error code and safe message.';
