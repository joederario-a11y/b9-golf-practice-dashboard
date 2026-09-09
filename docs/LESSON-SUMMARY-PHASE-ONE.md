# Phase 1 lesson publishing

## Existing systems reused

- `app/page.tsx`: CoachVideoWorkspace and staff VideosView upload, VideoDetailView review/publish, existing library navigation and emailed `?tab=videos&video=` deep links. StudentLessonContent is shared by preview and Student rendering.
- `/api/videos`: metadata, publishing, existing notification dispatch; `/api/videos/media`: authorized R2 streaming and upload remain unchanged.
- `/api/video-recaps`, `lib/server/video-ai-recap.ts`, and the existing Worker workflow: audio extraction, sidecar handling, transcription, retries, private AI revisions. Explicit `generateSummary` also works with Coach Notes and no audio.
- `/api/video-visual-analysis`: existing visual engine and Coach observation approvals. Only approved observations inform summary generation; coached Students receive the final summary rather than separate inferred advice.
- `/api/video-annotations`: unchanged drawing, persistence, overlays and publication. Both preview and Student view use the existing annotated player.
- `/api/lesson-session-links`, session snapshots and authorization: existing links and Student ownership validation. Lesson presentation shows only supported single-club carry/ball-speed measurements.
- `lib/server/video-email.ts`, existing email service and login tokens: notification audit records, provider status, deduplication and deep links retained. Email preview uses the approved summary.
- `docs/DEPLOYMENT.md`, guarded `deploy:dev` and `/api/version`: existing Dev provenance flow. Build cleanup is now portable to Windows.

## Storage and ownership

No schema migration is needed. `lesson_videos.coach_private_notes` already stores the structured private lesson document. It holds Coach Notes, editable summary and `summarySource`; existing legacy keys remain intact. The accepted private document limit is raised to 32,000 characters to avoid truncating valid structured notes plus summary; visible note and summary inputs are limited to 4,000 characters each.

`lesson_videos.lesson_summary` remains the approved public summary. Save Draft persists the private document and retains the existing public summary. Updating a published summary requires the explicit `approveSummary` publish request. Generation compares the private document at request start with its stored value before saving; concurrent Coach edits cause a conflict instead of overwriting them. Audio completion never automatically applies text to the primary editor. Applying an audio draft and regenerating a summary are explicit actions with replacement warnings. Unsaved editing triggers a browser leave warning.

The existing recap-draft revisions also record Coach ownership using their existing reviewer columns. Background generation cannot make a new revision current over a Coach-owned revision. No generation action publishes or sends an email.

## Privacy

Student video responses use an explicit field allowlist. Private notes, descriptions that may contain historical private context, legacy guidance, media probes and delivery errors are omitted. Student recap responses return only the public summary; transcript text/segments, evidence, confidence, jobs and provider details are excluded. Owner and publication checks precede the response. Session ownership is checked before storing a session ID, and linked rows are joined against the lesson's actual owner.

## Verification

Run `npm run lint`, `npm test`, `npm run build`, `npm run build:worker`, and `git diff --check`. Tests include actual handlers against in-memory SQLite, generated-content context with a stubbed AI provider, concurrent editing, session isolation, and server-rendered shared Student content. These are automated checks, not evidence of live provider calls, email delivery, or manual browser verification.

Manual Dev verification must cover upload/audio, summary editing and persistence, Student preview, publishing and notification status, deep links, playback/annotations, optional sessions, mobile controls and role isolation. Deployment must use the exact clean pushed `dev` commit and be checked against `/api/version`.

## Deferred, preserved systems

Practice-plan authoring, drills, practice volume, success criteria, cue grids, progress dashboards, Practice Intelligence, broader analytics, expanded swing recommendations and unrelated Student messaging remain outside the primary lesson flow. Their existing data, routes and backend systems are preserved. No new session infrastructure, notification redesign, annotation redesign, broad route changes or destructive cleanup is included.

## Rollback

Revert the focused commit and use the existing guarded Dev deployment process. Existing fields and records are retained, so no database rollback or production migration is required. Older UI versions may not honor the new explicit approval behavior; evaluate that privacy implication before reverting.
