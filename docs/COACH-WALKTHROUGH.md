# Coach narration and annotated walkthrough

## Refined implementation brief

Let Coaches and Admins record a narrated walkthrough directly in the lesson's inline video editor. Capture the video as the Coach plays, pauses, scrubs, and draws annotations, preserving the walkthrough's real timing. Record microphone narration as the only audio in the finished walkthrough; mute and exclude the original video's audio.

After stopping, let the Coach preview, discard, download, or use the recording. Save an accepted recording as a new private narrated lesson draft for the same Student, preserving the original lesson and carrying forward its primary session link and private Coach Notes. Do not modify the original published video or send a notification during recording or upload.

Reuse private video storage, audio-sidecar upload, transcription, summary generation, lesson editing, and explicit publishing. MAI drafts one Coach Lesson Summary from the narration and Coach Notes. Fill only an untouched, empty narrated draft editor. Never replace Coach edits, cleared text, or an approved summary automatically. The Coach reviews, edits, previews, and explicitly publishes the narrated lesson.

Keep transcripts and notes private. Preserve ownership checks, Student isolation, existing lessons, annotation tools, and notification behavior. Provide clear microphone-denied, unavailable-browser, upload-retry, and processing-failure states.

## Implementation and limits

- Uses microphone capture plus a canvas video stream; source video audio is never connected to the output stream.
- Captures current frames and normalized annotations, including live drawing previews, at up to 30 fps and 1280 × 720 resolution.
- Recording is limited to ten minutes and stops when the tab is hidden. This avoids claiming to capture a walkthrough while background rendering is throttled.
- Saving creates a private lesson version through existing authenticated APIs. The original remains available; publishing the new draft does not archive the original.
- Upload retries reuse the new draft ID during the same open editing session. The local recording remains previewable/downloadable after an upload failure.
- Microphone-only audio is uploaded before the video starts the existing processing workflow. AI feedback appears in the empty draft editor when processing completes. Save Draft persists Coach edits; Publish remains separate.
- Narrated drawings are baked into the recording. Existing editable annotations on the source lesson remain in its annotation system.
- Requires a browser supporting microphone access, canvas capture, and compatible video/audio MediaRecorder formats. The controls report unsupported browsers without altering the source lesson.
- Automated tests cover stream composition, normalized drawing capture, microphone denial, stop/cancel cleanup, format negotiation, private-draft metadata, and summary edit protection. Actual microphone fidelity and provider-generated transcription still require a live narrated recording.

No database migration or production change is required.
