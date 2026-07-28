# MAI Coach Deployment

This repository currently uses Cloudflare Workers with vinext.

## Source of Truth

- Current development source branch: `dev`
- Current development Worker: `mai-coach-dev`
- Current development URL: `https://mai-coach-dev.b9-golf-practice-dashboard.workers.dev`
- Current production Worker: `b9-golf-practice-dashboard`

As of this deployment audit, `dev` contains the active MAI Coach product work. `main` is intentionally older and should not be used as the source of truth until the team explicitly promotes `dev`.

## Build Provenance

Every build includes:

- `COMMIT_SHA`
- `BRANCH_NAME`
- `BUILD_TIMESTAMP`
- `APP_ENVIRONMENT`

Verify the live build with:

```bash
curl -sS https://mai-coach-dev.b9-golf-practice-dashboard.workers.dev/api/version
```

Admins can also see the same information in the Admin workspace under **System / Build information**.

Public version responses intentionally expose only:

- `appName`
- `environment`
- `branch`
- `commitSha`
- `shortCommitSha`
- `buildTimestamp`

## Development Deployment

Use the guarded Dev deploy script:

```bash
npm run deploy:dev
```

That script verifies the source checkout, removes the previous build output, builds the Worker, and deploys with `wrangler.dev.jsonc`.

If you need to inspect the steps manually, the sequence is:

```bash
npm run assert:deploy:dev
rm -rf dist
npm run build:worker
npx wrangler deploy --config wrangler.dev.jsonc
```

Dev bindings from `wrangler.dev.jsonc`:

- Worker: `mai-coach-dev`
- D1 binding: `DB`
- D1 database: `mai-coach-dev-db`
- R2 binding: `VIDEO_STORAGE`
- R2 bucket: `mai-coach-video-storage-dev`
- Workflow binding: `VIDEO_LESSON_RECAP_WORKFLOW`
- Workflow: `mai-coach-video-recap-dev`
- Images binding: `IMAGES`
- Media binding: `MEDIA`

Dev secrets must be configured in Cloudflare, not committed:

- `OPENAI_API_KEY`
- `RESEND_API_KEY`

## Production Deployment

Use the production Wrangler config only after `main` has intentionally received the release commit:

```bash
npm run build:worker
npx wrangler deploy --config wrangler.jsonc
```

The convenience script does the same:

```bash
npm run deploy
```

Production bindings from `wrangler.jsonc`:

- Worker: `b9-golf-practice-dashboard`
- D1 binding: `DB`
- D1 database: `b9-golf-practice-dashboard-db`
- R2 binding: `VIDEO_STORAGE`
- R2 bucket: `b9-golf-video-storage`
- Workflow binding: `VIDEO_LESSON_RECAP_WORKFLOW`
- Workflow: `video-lesson-recap-workflow`
- Images binding: `IMAGES`
- Media binding: `MEDIA`

Production secrets must be configured in Cloudflare, not committed:

- `OPENAI_API_KEY`
- `RESEND_API_KEY`

## Pre-Deploy Checklist

Run:

```bash
git status --short
git branch --show-current
git rev-parse HEAD
git rev-parse origin/dev
npm run lint
npm test
npm run build
npm run build:worker
git diff --check
```

For Dev, deploy only when `HEAD` equals `origin/dev` and the branch is `dev`.
Commit first, then rebuild, then deploy. Build provenance is baked into the Worker bundle at build time, so rebuilding before the final commit will produce stale metadata.

After deploy:

```bash
curl -sS https://mai-coach-dev.b9-golf-practice-dashboard.workers.dev/api/version
curl -sS https://mai-coach-dev.b9-golf-practice-dashboard.workers.dev/api/dev/build-info
```

The returned `COMMIT_SHA` should match the pushed commit.

## Notes

- This checkout has no GitHub Actions workflow files; Dev deployments are currently manual Wrangler deployments.
- `wrangler.dev.jsonc` is the safest way to avoid accidentally deploying Dev changes to production.
- `wrangler.jsonc` contains both production config and an `env.dev` block, but this project currently uses the standalone `wrangler.dev.jsonc` for Dev.
