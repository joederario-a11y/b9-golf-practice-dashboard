# Lesson swing comparison

The Coach opens **Compare Swing** from a lesson and chooses an earlier playable lesson for the same Student. The existing library comparison entry uses the same workspace. No new video player or annotation engine is introduced.

## Review and publication

- Shared play, pause, timeline and frame-step controls preserve a time offset between the videos. Each video's native timeline remains available for manual positioning.
- **Adjust alignment** allows aligning two paused positions, nudging the previous video, and resetting. Current-only, previous-only and side-by-side layouts are available.
- **Annotate current/previous** opens the existing markup workspace at the selected time. Existing annotation save/publish controls remain authoritative. Comparison visibility switches expose only published markups to Students.
- Comparison drafts and published snapshots are stored separately. Coach notes and explicitly accepted/edited suggestions are the only feedback saved in a comparison. AI suggestions and confidence are never persisted as Student content.
- **Add Notes to Lesson Summary** appends the Coach-approved text to the existing editable summary; it does not replace Coach edits.
- To publish with a lesson, select **Include this saved comparison when I publish the lesson**, save the comparison, then use the existing lesson publication action. Both source lessons must be published. Existing published lessons also support **Publish Comparison** and **Make comparison private**.
- Both source lessons are reauthorized on every server read/write. Comparisons between different Students are rejected before AI processing.

## Auto Sync investigation and strategy

Current stored media metadata includes duration and codecs, but no exact frame index, source frame rate, or reliable swing-phase markers. The pre-existing browser frame capture and MAI vision configuration can supply ordered visual samples; neither is a validated motion-tracking system.

This release attempts alignment near the **top of backswing**. It is typically more visible across sampled frames than the instant of impact; address may be held for an ambiguous interval, and finish does not align the earlier motion. Auto Sync examines up to six seconds around each paused playhead (two seconds before, four after), using twelve samples per video. Longer lessons require positioning the playheads near the intended swing first. Incompatible views, unknown frame references, absent phases or low model confidence leave the existing alignment unchanged and show the manual fallback. Alignment is approximate and should be checked by the Coach. The confidence threshold is a conservative application gate, not a calibrated accuracy guarantee.

Frame stepping uses a selectable nominal rate, defaulting to 30 fps. Frame counts are explicitly approximate, particularly for variable-frame-rate recordings. Exact frame indexing would require additional media metadata or a decoding/indexing pipeline.

No overlay transparency, new infrastructure, or automatic AI processing on upload is added by the comparison feature. Vision requests reuse the existing OpenAI configuration and MAI core instructions, have a timeout, can be cancelled, and return private suggestions only. On-device capture sends sampled images, not the entire video, to the existing analysis provider.

## Storage and verification

`drizzle/0020_swing_comparisons.sql` defines the small comparison table; the route also follows the existing runtime schema initialization pattern. No changes to existing lesson or annotation storage are required.

Tests cover offset bounds, earlier/same-Student selection, confidence fallback, authorization before AI calls, private-versus-published snapshots, and explicit inclusion during lesson publication. Browser fixture checks cover linked playback/stepping, mobile layout, frame extraction and mocked AI fallback/approval. Live vision alignment accuracy still requires representative golf clips; fixture checks do not establish that accuracy.
