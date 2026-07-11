# vinext-starter

A clean full-stack starter running on
[vinext](https://github.com/cloudflare/vinext), with optional Cloudflare D1 and
Drizzle support.

## Prerequisites

- Node.js `>=22.13.0`

## Quick Start

```bash
npm install
npm run dev
npm run build
```

This starter does not use `wrangler.jsonc`.

## Included Shape

- edit site code under `app/`
- `.openai/hosting.json` declares optional Sites D1 and R2 bindings
- `vite.config.ts` simulates declared bindings for local development
- `db/schema.ts` starts intentionally empty
- `examples/d1/` contains an optional D1 example surface
- `drizzle.config.ts` supports local migration generation when needed

## Workspace Auth Headers

OpenAI workspace sites can read the current user's email from
`oai-authenticated-user-email`.

SIWC-authenticated workspace sites may also receive
`oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty
`name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by
`oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Useful Commands

- `npm run dev`: start local development
- `npm run build`: verify the vinext build output
- `npm run db:generate`: generate Drizzle migrations after schema changes

## Lesson Video Delivery

The coach-to-member loop uses the existing Cloudflare stack:

- Workspace authentication headers identify the signed-in account.
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
VIDEO_EMAIL_FROM=Back Nine Team <lessons@example.com>
APP_BASE_URL=https://your-site.example
```

`APP_BASE_URL` must be the deployed production URL. Registration, invitation,
login, and video email links use it to build one-time login URLs that set an
HTTP-only session cookie before opening the member video library.

The Sites binding names are declared in `.openai/hosting.json`:

```json
{
  "d1": "DB",
  "r2": "VIDEO_STORAGE"
}
```

Apply the D1 migrations, including `drizzle/0002_useful_nomad.sql` and
`drizzle/0003_magic_link_auth.sql`, before using the production coach flow. The
API also creates missing tables during local development so a fresh local
binding can start cleanly.

If email delivery fails or is not configured, the stored video remains
published, the coach sees a delivery warning, and the failed attempt is logged
in `video_email_notifications`.

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
```

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)
