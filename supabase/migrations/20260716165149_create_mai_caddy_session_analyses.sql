-- MAI Coach stored session analysis records.
--
-- Current repository note:
-- The application currently stores golf sessions and shots in the Cloudflare D1
-- `golf_session_snapshots.sessions_json` model, not in Supabase public tables.
-- This migration therefore does not create duplicate session/profile/shot
-- tables. `session_id` stores the existing application session identifier, and
-- `player_id` is constrained to Supabase Auth users for ownership. When a
-- Supabase session table is introduced, add a session foreign key and tighten
-- the RLS policies with an ownership EXISTS check against that table.

create extension if not exists pgcrypto with schema extensions;

do $$
begin
  create type public.mai_caddy_analysis_status as enum (
    'pending',
    'processing',
    'completed',
    'failed'
  );
exception
  when duplicate_object then null;
end;
$$;

create table if not exists public.mai_caddy_session_analyses (
  id uuid primary key default extensions.gen_random_uuid(),
  session_id text not null,
  player_id uuid not null references auth.users(id) on delete cascade,
  status public.mai_caddy_analysis_status not null default 'pending',
  analysis jsonb not null default '{}'::jsonb,
  calculated_metrics jsonb not null default '{}'::jsonb,
  model text,
  prompt_version text not null default 'mai-caddy-v1',
  analysis_version integer not null default 1 check (analysis_version > 0),
  is_current boolean not null default true,
  error_code text,
  error_message text,
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint mai_caddy_session_analyses_session_id_not_blank check (length(btrim(session_id)) > 0),
  constraint mai_caddy_session_analyses_completed_at_check check (
    status <> 'completed' or completed_at is not null
  ),
  constraint mai_caddy_session_analyses_failed_error_check check (
    status <> 'failed' or error_code is not null or error_message is not null
  )
);

comment on table public.mai_caddy_session_analyses is
  'MAI Coach AI analysis records for stored golf sessions. Session records currently live in the application D1 session snapshot model.';
comment on column public.mai_caddy_session_analyses.session_id is
  'Existing application session identifier from stored session JSON. Add a foreign key when sessions are represented as Supabase rows.';
comment on column public.mai_caddy_session_analyses.player_id is
  'Supabase Auth user that owns the session analysis request.';
comment on column public.mai_caddy_session_analyses.analysis is
  'Structured MAI Coach analysis output. Tour Twin data is intentionally out of scope.';
comment on column public.mai_caddy_session_analyses.calculated_metrics is
  'Server-calculated launch-monitor summaries used by MAI Coach.';
comment on column public.mai_caddy_session_analyses.is_current is
  'Marks the current analysis for a player/session while preserving room for historical analysis versions.';

create index if not exists mai_caddy_session_analyses_player_idx
  on public.mai_caddy_session_analyses (player_id, created_at desc);

create index if not exists mai_caddy_session_analyses_session_idx
  on public.mai_caddy_session_analyses (session_id);

create index if not exists mai_caddy_session_analyses_status_idx
  on public.mai_caddy_session_analyses (status, created_at desc);

create unique index if not exists mai_caddy_session_analyses_version_unique
  on public.mai_caddy_session_analyses (player_id, session_id, prompt_version, analysis_version);

-- Prevents more than one active/current analysis for the same player/session.
-- Older analyses can be kept by setting is_current = false before inserting a
-- new current row.
create unique index if not exists mai_caddy_session_analyses_one_current_unique
  on public.mai_caddy_session_analyses (player_id, session_id)
  where is_current;

create or replace function public.mai_caddy_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists mai_caddy_session_analyses_updated_at on public.mai_caddy_session_analyses;

create trigger mai_caddy_session_analyses_updated_at
before update on public.mai_caddy_session_analyses
for each row
execute function public.mai_caddy_touch_updated_at();

alter table public.mai_caddy_session_analyses enable row level security;

revoke all on public.mai_caddy_session_analyses from anon;
revoke all on public.mai_caddy_session_analyses from authenticated;

grant select, insert on public.mai_caddy_session_analyses to authenticated;
grant select, insert, update, delete on public.mai_caddy_session_analyses to service_role;

drop policy if exists "Players can read own MAI Coach analyses"
  on public.mai_caddy_session_analyses;

create policy "Players can read own MAI Coach analyses"
on public.mai_caddy_session_analyses
for select
to authenticated
using (player_id = auth.uid());

drop policy if exists "Players can create own pending MAI Coach analyses"
  on public.mai_caddy_session_analyses;

create policy "Players can create own pending MAI Coach analyses"
on public.mai_caddy_session_analyses
for insert
to authenticated
with check (
  player_id = auth.uid()
  and status = 'pending'
);
