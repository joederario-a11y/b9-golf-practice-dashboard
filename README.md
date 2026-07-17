# MAI Coach Practice Dashboard

Full-stack golf practice and coach video software running on
[vinext](https://github.com/cloudflare/vinext), Cloudflare Workers, D1, R2,
and Drizzle.

## Prerequisites

- Node.js `>=22.13.0`

## Quick Start

```bash
npm install
npm run dev
npm run build
```

Production deployment is configured through `wrangler.jsonc`.

## Included Shape

- edit application code under `app/`
- `worker/index.ts` is the Cloudflare Worker entry point generated for vinext
- `wrangler.jsonc` declares Workers static assets, D1, R2, and Images bindings
- `vite.config.ts` simulates the same bindings for local vinext development
- `db/schema.ts` and `drizzle/*.sql` define the D1 schema

## Useful Commands

- `npm run dev`: start local development
- `npm run build`: verify the vinext build output
- `npm run build:worker`: clean and build the Worker output for deployment
- `npm run preview:worker`: run the built Worker locally with Wrangler
- `npm run deploy:dry-run`: compile the Worker deployment without publishing
- `npm run deploy`: build and deploy to Cloudflare Workers
- `npm run db:generate`: generate Drizzle migrations after schema changes

## Lesson Video Delivery

The coach-to-member loop uses the existing Cloudflare stack:

- Email/password login, magic links, and invitation tokens identify the signed-in account.
- D1-backed email magic links identify members who arrive from invitation or video-notification emails.
- D1 stores users, coach-member assignments, invitation records, video metadata, views, and email audit records.
- Private R2 stores video files and optional thumbnails.
- `/api/videos/media` checks ownership before streaming media and supports byte-range playback.
- Resend delivers member invitations, secure login links, and new-video notifications.

Authenticated accounts become coaches or admins when their email is included in
the matching comma-separated environment variable. All other authenticated
accounts are members unless their D1 user record already has a staff role.

```bash
COACH_EMAILS=zac@example.com
ADMIN_EMAILS=owner@example.com
```

Registration, login, invitation, and lesson notification email use Resend.
Configure these values before publishing from the coach workspace:

```bash
RESEND_API_KEY=re_...
VIDEO_EMAIL_FROM=MAI Coach <lessons@example.com>
APP_BASE_URL=https://your-site.example
```

`APP_BASE_URL` must be the deployed production URL. Registration, invitation,
login, and video email links use it to build one-time login URLs that set an
HTTP-only session cookie before opening the member video library.

Cloudflare bindings are declared in `wrangler.jsonc`:

- `DB`: Cloudflare D1 database
- `VIDEO_STORAGE`: private Cloudflare R2 bucket
- `ASSETS`: static asset binding for `dist/client`
- `IMAGES`: Cloudflare Images transform binding used by the vinext image endpoint

Apply the D1 migrations, including `drizzle/0002_useful_nomad.sql` and
`drizzle/0003_magic_link_auth.sql`, before using the production coach flow. The
API also creates missing tables during local development so a fresh local
binding can start cleanly.

If email delivery fails or is not configured, the stored video remains
published, the coach sees a delivery warning, and the failed attempt is logged
in `video_email_notifications`.

## Supabase Signup Email Notifications

This repository also includes a Supabase Edge Function for Supabase Auth signup
notifications:

- `supabase/functions/send-signup-email/index.ts` sends a welcome email through
  Resend when a new `auth.users` row is inserted.
- `supabase/migrations/20260716143921_send_signup_email_webhook.sql` creates the
  database trigger that calls the Edge Function asynchronously with `pg_net`.
- `supabase/config.toml` disables JWT verification for this one function because
  the database trigger authenticates with a shared secret header.

The Edge Function expects the database webhook header
`x-signup-webhook-secret` to match `SIGNUP_WEBHOOK_SECRET`. Email delivery
errors are logged and returned as non-blocking success responses so a signup is
not blocked by Resend downtime or missing email configuration.

Set Supabase secrets:

```bash
supabase secrets set RESEND_API_KEY=re_...
supabase secrets set RESEND_FROM=notifications@n3xconsulting.com
supabase secrets set SIGNUP_NOTIFY_TO=internal@example.com
supabase secrets set SIGNUP_WEBHOOK_SECRET=replace-with-a-long-random-secret
```

Deploy the function:

```bash
supabase login
supabase link --project-ref <PROJECT_REF>
supabase functions deploy send-signup-email
```

Apply the migration:

```bash
supabase db push
```

Then configure the webhook URL and shared secret in the database. Use the same
secret value that you set as `SIGNUP_WEBHOOK_SECRET`:

```sql
insert into app_private.signup_webhook_config (id, function_url, webhook_secret, enabled)
values (
  true,
  'https://<PROJECT_REF>.supabase.co/functions/v1/send-signup-email',
  '<SIGNUP_WEBHOOK_SECRET>',
  true
)
on conflict (id) do update set
  function_url = excluded.function_url,
  webhook_secret = excluded.webhook_secret,
  enabled = excluded.enabled,
  updated_at = now();
```

Supabase Dashboard setup:

1. Go to Project Settings > API and copy the project ref for
   `https://<PROJECT_REF>.supabase.co`.
2. Go to Edge Functions > Secrets and confirm `RESEND_API_KEY`, `RESEND_FROM`,
   `SIGNUP_NOTIFY_TO` if used, and `SIGNUP_WEBHOOK_SECRET` are present.
3. Go to Database > Extensions and confirm `pg_net` is enabled. The migration
   also attempts to enable it.
4. Go to SQL Editor and run the `insert into app_private.signup_webhook_config`
   statement above with your project ref and shared secret.
5. Create a test Auth user from Authentication > Users, then check Edge Function
   logs and the recipient inbox.

Do not also create a Dashboard Database Webhook if this migration is active, or
the user may receive duplicate welcome emails. If you prefer the Dashboard
instead of the migration trigger, create a Database Webhook on `auth.users` for
`INSERT`, set the URL to
`https://<PROJECT_REF>.supabase.co/functions/v1/send-signup-email`, and add
headers `Content-Type: application/json` and
`x-signup-webhook-secret: <SIGNUP_WEBHOOK_SECRET>`.

Local test:

```bash
cp supabase/functions/.env.example supabase/functions/.env.local
# Fill in RESEND_API_KEY and SIGNUP_WEBHOOK_SECRET in supabase/functions/.env.local.
supabase functions serve send-signup-email --env-file supabase/functions/.env.local --no-verify-jwt
```

In another terminal:

```bash
set -a
source supabase/functions/.env.local
set +a

curl -i -X POST 'http://127.0.0.1:54321/functions/v1/send-signup-email' \
  -H 'Content-Type: application/json' \
  -H "x-signup-webhook-secret: $SIGNUP_WEBHOOK_SECRET" \
  -d '{
    "type": "INSERT",
    "table": "users",
    "schema": "auth",
    "record": {
      "id": "00000000-0000-0000-0000-000000000001",
      "email": "test@example.com",
      "created_at": "2026-07-16T00:00:00Z",
      "raw_user_meta_data": {
        "first_name": "Test",
        "last_name": "Player"
      }
    },
    "old_record": null
  }'
```

### Authentication and invitations

Adding a member creates a real D1 `users` record, a `coach_members`
assignment, and a `member_invitations` audit row with a tokenized invite link.
The invite link accepts the invitation, creates a private HTTP-only session for
that member, and opens the video library. New-video notification emails include
a short-lived one-time login token and direct video link, so a member can click
from email, sign in, and watch the assigned video without seeing another
member's media.

Production role and ownership checks are enforced by the API:

- members can list and stream only their own published videos;
- coaches can upload only to assigned members and can manage assigned-member videos;
- admins can manage all members and videos;
- raw R2 keys are never returned to the browser.

### Local role testing

Set this only in an ignored local `.dev.vars` file:

```bash
DEV_AUTH_ENABLED=true
```

Then create or switch a local test identity:

```bash
curl -c /tmp/frg-cookies.txt \
  -H 'Content-Type: application/json' \
  -d '{"email":"zac@example.test","firstName":"Zac","lastName":"Coach","role":"coach"}' \
  http://localhost:3000/api/dev-auth
```

Repeat with two different `role: "member"` emails to test ownership isolation.
`DEV_AUTH_ENABLED` must remain disabled in production.

### Verification

```bash
npm test
npm run lint
npm run build
npm run deploy:dry-run
```

### Cloudflare Workers deployment

Create the Cloudflare resources once, then update `wrangler.jsonc` with the
real D1 database id and production URL.

```bash
npx wrangler login
npx wrangler d1 create b9-golf-practice-dashboard-db
npx wrangler r2 bucket create b9-golf-video-storage
for f in drizzle/*.sql; do npx wrangler d1 execute b9-golf-practice-dashboard-db --remote --file="$f"; done
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put OPENAI_API_KEY
npm run deploy:dry-run
npm run deploy
```

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)
