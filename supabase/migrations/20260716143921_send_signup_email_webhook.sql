-- Signup email webhook for Supabase Auth.
--
-- This uses pg_net directly so the webhook URL and shared secret can be
-- configured without committing secrets into a migration file.
--
-- After deploying the Edge Function, configure the singleton row with:
--
-- insert into app_private.signup_webhook_config (id, function_url, webhook_secret, enabled)
-- values (
--   true,
--   'https://<PROJECT_REF>.supabase.co/functions/v1/send-signup-email',
--   '<SIGNUP_WEBHOOK_SECRET>',
--   true
-- )
-- on conflict (id) do update set
--   function_url = excluded.function_url,
--   webhook_secret = excluded.webhook_secret,
--   enabled = excluded.enabled,
--   updated_at = now();

create extension if not exists pg_net with schema extensions;

create schema if not exists app_private;

create table if not exists app_private.signup_webhook_config (
  id boolean primary key default true,
  function_url text not null check (function_url ~ '^https://'),
  webhook_secret text not null check (length(webhook_secret) >= 24),
  enabled boolean not null default true,
  updated_at timestamp with time zone not null default now(),
  constraint signup_webhook_config_singleton check (id)
);

alter table app_private.signup_webhook_config enable row level security;

revoke all on schema app_private from anon, authenticated;
revoke all on all tables in schema app_private from anon, authenticated;

create or replace function app_private.touch_signup_webhook_config_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists signup_webhook_config_updated_at on app_private.signup_webhook_config;

create trigger signup_webhook_config_updated_at
before update on app_private.signup_webhook_config
for each row
execute function app_private.touch_signup_webhook_config_updated_at();

create or replace function app_private.send_signup_email_webhook()
returns trigger
language plpgsql
security definer
set search_path = public, auth, app_private, net, extensions
as $$
declare
  cfg app_private.signup_webhook_config%rowtype;
  payload jsonb;
  request_id bigint;
begin
  select *
  into cfg
  from app_private.signup_webhook_config
  where id is true and enabled is true
  limit 1;

  if not found then
    raise log 'Signup email webhook is not configured; skipping user %.', new.id;
    return new;
  end if;

  payload := jsonb_build_object(
    'type', 'INSERT',
    'table', 'users',
    'schema', 'auth',
    'record', jsonb_build_object(
      'id', new.id,
      'email', new.email,
      'created_at', new.created_at,
      'raw_user_meta_data', coalesce(new.raw_user_meta_data, '{}'::jsonb),
      'raw_app_meta_data', coalesce(new.raw_app_meta_data, '{}'::jsonb)
    ),
    'old_record', null
  );

  select net.http_post(
    url := cfg.function_url,
    body := payload,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-signup-webhook-secret', cfg.webhook_secret
    ),
    timeout_milliseconds := 5000
  )
  into request_id;

  raise log 'Queued signup email webhook request % for user %.', request_id, new.id;
  return new;
exception
  when others then
    raise log 'Failed to queue signup email webhook for user %: %.', new.id, sqlerrm;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created_send_signup_email on auth.users;

create trigger on_auth_user_created_send_signup_email
after insert on auth.users
for each row
execute function app_private.send_signup_email_webhook();
