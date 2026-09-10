import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { startCoachWalkthrough, walkthroughFormats, walkthroughDraftMetadata, canFillWalkthroughSummary, WALKTHROUGH_TAG } from "../lib/coach-walkthrough.mjs";

test("narrated uploads are private drafts with no public feedback or automatic notification", () => {
  const source = { id: "original", ownerId: "student-a", coachId: "coach-a", title: "Lesson", sessionId: "owned-session", club: "7 Iron", publicationStatus: "Published", lessonSummary: "Old approved guidance" };
  const result = walkthroughDraftMetadata(source, "Private Coach source", 23);
  assert.equal(result.memberId, "student-a");
  assert.equal(result.sessionId, "owned-session");
  assert.equal(result.publicationStatus, "Draft");
  assert.equal(result.lessonSummary, "");
  assert.equal(result.notifyMember, false);
  assert.equal(result.generateAiRecap, true);
  assert.equal(result.generateVisualAnalysis, false);
  assert.equal(result.coachPrivateNotes, "Private Coach source");
  assert.equal(source.publicationStatus, "Published");
  assert.equal(source.lessonSummary, "Old approved guidance");
});

test("narration draft cannot replace Coach edits, cleared edits, or published summaries", () => {
  const video = { tags: [WALKTHROUGH_TAG], publicationStatus: "Draft" };
  assert.equal(canFillWalkthroughSummary(video, false, ""), true);
  assert.equal(canFillWalkthroughSummary(video, true, ""), false);
  assert.equal(canFillWalkthroughSummary(video, false, "My wording"), false);
  assert.equal(canFillWalkthroughSummary({ ...video, coachPrivateNotes: 'MAI_COACH_LESSON_GUIDANCE_JSON:{"lessonSummary":"","summarySource":"coach_edited"}' }, false, ""), false);
  assert.equal(canFillWalkthroughSummary({ ...video, publicationStatus: "Published" }, false, ""), false);
  assert.equal(canFillWalkthroughSummary({ ...video, tags: [] }, false, ""), false);
});

test("recording format negotiation supports MP4 fallback and unavailable formats", () => {
  assert.deepEqual(walkthroughFormats(type => type.endsWith("mp4")), { video: "video/mp4", audio: "audio/mp4" });
  assert.deepEqual(walkthroughFormats(() => false), { video: undefined, audio: undefined });
});

function fixture(t, denied = false) {
  const added = {};
  const install = (name, value) => { added[name] = Object.getOwnPropertyDescriptor(globalThis, name); Object.defineProperty(globalThis, name, { value, configurable: true, writable: true }); };
  let stopped = 0, frame, captured, failure, muted = false;
  const videoTrack = { kind: "video", stop() { stopped++; } };
  const micTrack = { kind: "audio", stop() { stopped++; } };
  const mic = { getAudioTracks: () => [micTrack], getTracks: () => [micTrack] };
  const streams = [], recorders = [], draws = [], lines = [];
  const context = new Proxy({ drawImage: (...args) => draws.push(args), lineTo: (...args) => lines.push(args) }, { get(target, key) { return key in target ? target[key] : () => {}; } });
  class Stream { constructor(tracks) { this.tracks = tracks; streams.push(tracks); } }
  class Recorder {
    static isTypeSupported() { return true; }
    constructor(stream, options) { this.stream = stream; this.type = options.mimeType; this.state = "inactive"; recorders.push(this); }
    start() { this.state = "recording"; }
    stop() { this.state = "inactive"; this.ondataavailable({ data: new Blob(["recorded media"], { type: this.type }) }); queueMicrotask(() => this.onstop()); }
  }
  install("navigator", { mediaDevices: { getUserMedia: async constraints => { assert.equal(constraints.video, false); if (denied) throw Error("denied"); return mic; } } });
  install("document", { hidden: false, addEventListener() {}, removeEventListener() {}, createElement: () => ({ getContext: () => context, captureStream: () => ({ getVideoTracks: () => [videoTrack], getTracks: () => [videoTrack] }) }) });
  install("MediaStream", Stream); install("MediaRecorder", Recorder);
  install("requestAnimationFrame", callback => { frame = callback; return 1; }); install("cancelAnimationFrame", () => {});
  t.after(() => { for (const [key, descriptor] of Object.entries(added)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });
  const video = { videoWidth: 1280, videoHeight: 720, readyState: 4, volume: 0.8, currentTime: 3,
    get muted() { return muted; }, set muted(value) { muted = value; }, pause() {}, addEventListener() {}, removeEventListener() {} };
  let annotations = [];
  const options = { video, getAnnotations: () => annotations, getDisplayWidth: () => 1280, onTick() {}, onStopped: value => { captured = value; }, onFailure: value => { failure = value; } };
  return { options, recorders, streams, videoTrack, micTrack, draws, lines, frame: () => frame(), annotate: value => { annotations = value; }, captured: () => captured, failure: () => failure, stopped: () => stopped };
}

test("capture uses microphone-only audio, follows current frames and drawings, then cleans up", async t => {
  const f = fixture(t);
  const recorder = await startCoachWalkthrough(f.options);
  assert.deepEqual(f.streams[0], [f.videoTrack, f.micTrack]);
  assert.equal(f.options.video.muted, true);
  assert.equal(f.options.video.volume, 0);
  f.options.video.currentTime = 1; // Scrubbed backwards while narration continues.
  f.annotate([{ type: "line", color: "red", strokeWidth: 4, geometry: { points: [{ x: 0, y: 0 }, { x: 0.5, y: 0.5 }] } }]);
  f.frame();
  assert.ok(f.draws.length >= 3);
  assert.deepEqual(f.lines.at(-1), [640, 360]);
  recorder.stop();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.stopped(), 2);
  assert.equal(f.options.video.muted, false);
  assert.equal(f.options.video.volume, 0.8);
  assert.equal(f.captured().video.type, "video/webm");
  assert.equal(f.captured().audio.type, "audio/webm");
  assert.ok(f.captured().video.size > 0);
});

test("canceling stops microphone and discards unpublished recording", async t => {
  const f = fixture(t);
  const recorder = await startCoachWalkthrough(f.options);
  recorder.cancel();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.stopped(), 2);
  assert.equal(f.captured(), undefined);
});

test("microphone denial gives a retryable message without changing the lesson audio", async t => {
  const f = fixture(t, true);
  await assert.rejects(startCoachWalkthrough(f.options), /Microphone access is required/);
  assert.equal(f.options.video.muted, false);
  assert.equal(f.recorders.length, 0);
});

test("actual upload flow reuses its draft on retry, sends audio first, and never publishes", async () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const source = page.slice(page.indexOf("  async function saveNarratedWalkthrough("), page.indexOf("  async function updateVideo(videoId:"));
  const code = ts.transpileModule(source + "\nexports.save = saveNarratedWalkthrough;", { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const events = [], ref = { current: null };
  let failUpload = true, createCount = 0, selected;
  const deps = {
    viewerRole: "admin", walkthroughUploadRef: ref, walkthroughDraftMetadata,
    createVideoRecord: async metadata => { createCount++; assert.equal(metadata.publicationStatus, "Draft"); return { id: "narrated-draft" }; },
    uploadVideoAsset: async (id, file, asset) => { events.push(asset); assert.equal(id, "narrated-draft"); if (asset === "video" && failUpload) throw Error("Network unavailable"); },
    finalizeVideoRecord: async (id, metadata) => { assert.equal(metadata.notifyMember, false); assert.equal(metadata.lessonSummary, ""); assert.equal(metadata.publicationStatus, "Draft"); return { id, ...metadata }; },
    createVideoLibraryItem: value => value,
    setVideos: update => { assert.equal(update([{ id: "source" }]).length, 2); },
    setSelectedVideoId: id => { selected = id; }, setLibraryMessage() {},
  };
  const exports = {};
  new Function("exports", ...Object.keys(deps), code)(exports, ...Object.values(deps));
  const recording = { video: new File(["video"], "n.webm"), audio: new File(["audio"], "a.webm"), duration: 10 };
  const video = { id: "source", ownerId: "student", title: "Original" };
  await assert.rejects(exports.save(video, recording, "private notes"), /Network unavailable/);
  assert.equal(ref.current.id, "narrated-draft");
  failUpload = false;
  await exports.save(video, recording, "private notes");
  assert.equal(createCount, 1);
  assert.deepEqual(events, ["transcription-audio", "video", "transcription-audio", "video"]);
  assert.equal(selected, "narrated-draft");
  assert.equal(ref.current, null);
});
