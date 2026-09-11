import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as jsx from "react/jsx-runtime";
import * as summary from "../lib/lesson-summary-policy.mjs";
import * as recapPolicy from "../lib/video-ai-recap-policy.mjs";
import * as mediaPolicy from "../lib/video-media-processing-policy.mjs";
import * as videoPolicy from "../lib/video-policy.mjs";
import * as uploadPolicy from "../lib/video-upload-safety.mjs";
import * as feedbackFormat from "../lib/lesson-feedback-format.mjs";

const source = await readFile(new URL("../lib/server/video-ai-recap.ts", import.meta.url), "utf8");
const platform = await readFile(new URL("../lib/server/platform.ts", import.meta.url), "utf8");
const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const videoRouteSource = await readFile(new URL("../app/api/videos/route.ts", import.meta.url), "utf8");

function fixture(t, { role = "coach", id = "coach-a", publication = "Published", onGenerate } = {}) {
  const sqlite = new DatabaseSync(":memory:");
  t.after(() => sqlite.close());
  sqlite.exec("CREATE TABLE users (id TEXT PRIMARY KEY, first_name TEXT, last_name TEXT, email TEXT, skill_level TEXT)");
  for (const table of ["lesson_videos", "video_ai_processing_jobs", "video_transcripts", "video_lesson_recap_drafts", "video_visual_analyses", "video_visual_observation_reviews", "coach_feedback"]) {
    const schema = platform.match(new RegExp("CREATE TABLE IF NOT EXISTS " + table + " \\([\\s\\S]*?\\)`"))?.[0]?.slice(0, -1);
    assert.ok(schema, table);
    sqlite.exec(schema);
  }
  sqlite.exec("CREATE TABLE golf_session_snapshots (user_id TEXT, sessions_json TEXT)");
  const columns = new Set(sqlite.prepare("PRAGMA table_info(lesson_videos)").all().map(row => row.name));
  for (const name of ["next_session_goal", "source_storage_path", "source_file_name", "source_file_size", "source_mime_type", "source_media_probe_json", "playback_media_probe_json", "email_sent_at", "email_failure_reason"]) {
    if (!columns.has(name)) sqlite.exec(`ALTER TABLE lesson_videos ADD COLUMN ${name} TEXT DEFAULT ''`);
  }
  sqlite.exec("INSERT INTO users VALUES ('student-a','Student','A','a@example.test','beginner'), ('coach-a','Coach','A','coach@example.test','')");
  sqlite.prepare("INSERT INTO lesson_videos (id, member_id, coach_id, uploaded_by_role, title, storage_path, file_name, file_size, mime_type, publication_status, upload_status, lesson_summary, coach_private_notes) VALUES ('lesson-a','student-a','coach-a','coach','Lesson','private/object','video.mp4',100,'video/mp4',?,'ready','Approved summary',?)")
    .run(publication, summary.PRIVATE_LESSON_PREFIX + JSON.stringify({ privateCoachNote: "Maintain posture, as coached.", physicalConsideration: "PRIVATE MEDICAL DETAIL", lessonSummary: "Coach edited draft" }));
  const db = {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      let values = [];
      return {
        bind(...args) { values = args; return this; },
        async first() { return statement.get(...values) || null; },
        async all() { return { results: statement.all(...values) }; },
        async run() { const result = statement.run(...values); return { meta: { changes: Number(result.changes) } }; },
      };
    },
    async batch(statements) { return Promise.all(statements.map(statement => statement.run())); },
  };
  const requests = [];
  class OpenAI {
    responses = { create: async input => {
      requests.push(input);
      await onGenerate?.(sqlite);
      return { output_text: JSON.stringify({ lessonSummary: "Stay in posture during the takeaway.", needsCoachInput: false }) };
    } };
  }
  const exports = {};
  const dependencies = {
    "openai": { default: OpenAI, __esModule: true },
    "@/lib/lesson-summary-policy.mjs": summary,
    "@/lib/video-ai-recap-policy.mjs": recapPolicy,
    "@/lib/video-media-processing-policy.mjs": mediaPolicy,
    "@/lib/mai-caddy-instructions": { MAI_CADDY_CORE_INSTRUCTIONS: "Coach owns guidance." },
    "@/lib/server/video-email": {},
    "@/lib/server/platform": {
      ensurePlatformSchema: async () => {}, ensureUserDataOwnershipSchema: async () => {},
      ensureVideoAiProcessingSchema: async () => {}, ensureVideoVisualAnalysisSchema: async () => {},
      getAssignedMemberIds: async () => role === "coach" ? ["student-a"] : [],
      getRequiredDatabase: () => db,
      getPlatformEnvironment: () => ({ OPENAI_API_KEY: "test-only" }),
      getOpenAIConfigurationIssue: () => null, recordActivity: async () => {},
      requireIdentity: async () => ({ id, role }), ensureCoachFeedbackSchema: async () => {},
      responseFromError: error => error instanceof Response ? error : Response.json({ error: error.message }, { status: 500 }),
    },
  };
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  new Function("require", "exports", code)(name => { assert.ok(name in dependencies, name); return dependencies[name]; }, exports);
  const videoDeps = {
    ...dependencies,
    "@/lib/video-policy.mjs": videoPolicy,
    "@/lib/video-upload-safety.mjs": uploadPolicy,
    "@/lib/server/video-ai-recap": exports,
    "@/lib/server/video-visual-analysis": { retireMemberVisibleVisualAnalysisForLesson: async () => {} },
    "@/lib/server/lesson-session-links": {
      loadLessonSessionLinksForVideos: async () => new Map(),
      getStoredSession: async (_db, memberId, sessionId) => {
        const row = sqlite.prepare("SELECT sessions_json FROM golf_session_snapshots WHERE user_id=?").get(memberId);
        return row ? JSON.parse(row.sessions_json).find(session => session.id === sessionId) : null;
      },
    },
  };
  const routes = {};
  const routeCode = ts.transpileModule(videoRouteSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  new Function("require", "exports", routeCode)(name => { assert.ok(name in videoDeps, name); return videoDeps[name]; }, routes);
  const seed = (table, values) => {
    for (const column of sqlite.prepare(`PRAGMA table_info(${table})`).all()) {
      if (column.notnull && column.dflt_value === null && !(column.name in values)) values[column.name] = column.type === "TEXT" ? "fixture" : 1;
    }
    const keys = Object.keys(values);
    sqlite.prepare(`INSERT INTO ${table} (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`).run(...keys.map(key => values[key]));
  };
  return { sqlite, seed, routes, requests, api: exports, identity: { id, role }, row: () => sqlite.prepare("SELECT * FROM lesson_videos WHERE id='lesson-a'").get() };
}

test("actual video PATCH saves private edits without changing an approved summary until explicit publish", async t => {
  const f = fixture(t);
  const notes = summary.PRIVATE_LESSON_PREFIX + JSON.stringify({ privateCoachNote: "Private notes", lessonSummary: "Edited summary" });
  const patch = values => f.routes.PATCH(new Request("https://example.test/api/videos", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ videoId: "lesson-a", ...values }) }));
  let response = await patch({ coachPrivateNotes: notes, lessonSummary: "Edited summary", publicationStatus: "Published" });
  assert.equal(response.status, 200, await response.text());
  assert.equal(f.row().lesson_summary, "Approved summary");
  assert.equal(summary.privateLessonSummary(f.row().coach_private_notes), "Edited summary");
  response = await patch({ lessonSummary: "Edited summary", publicationStatus: "Published", approveSummary: true });
  assert.equal(response.status, 200, await response.text());
  assert.equal(f.row().lesson_summary, "Edited summary");
});

test("actual video PATCH rejects another Student's session before any lesson mutation", async t => {
  const f = fixture(t);
  f.sqlite.prepare("INSERT INTO golf_session_snapshots VALUES (?,?)").run("student-b", JSON.stringify([{ id: "foreign-session", shots: [] }]));
  const response = await f.routes.PATCH(new Request("https://example.test/api/videos", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ videoId: "lesson-a", sessionId: "foreign-session", title: "Should not change" }) }));
  assert.equal(response.status, 403);
  assert.equal(f.row().title, "Lesson");
  assert.equal(f.row().session_data_id, null);
});

test("summary context includes transcript, relevant owned measurements, and only approved visual findings", async t => {
  const f = fixture(t);
  f.seed("video_ai_processing_jobs", { id: "job", video_id: "lesson-a", member_id: "student-a", coach_id: "coach-a" });
  f.seed("video_transcripts", { id: "transcript", video_id: "lesson-a", member_id: "student-a", coach_id: "coach-a", processing_job_id: "job", transcript_text: "Keep your posture throughout the takeaway just as we practiced together today." });
  f.sqlite.exec("UPDATE lesson_videos SET session_data_id='session-a', club='7 Iron'");
  f.sqlite.prepare("INSERT INTO golf_session_snapshots VALUES (?,?)").run("student-a", JSON.stringify([{ id: "session-a", shots: [{ club: "7 Iron", carry: 125, ballSpeed: 101 }] }]));
  f.sqlite.prepare("INSERT INTO golf_session_snapshots VALUES (?,?)").run("student-b", JSON.stringify([{ id: "session-a", shots: [{ club: "7 Iron", carry: 999, ballSpeed: 999 }] }]));
  f.seed("video_visual_analyses", { id: "visual", video_id: "lesson-a", member_id: "student-a", coach_id: "coach-a", requested_by_user_id: "coach-a", requested_by_role: "coach", structured_result_json: JSON.stringify({ observations: [{ title: "Reviewed observation", explanation: "Consistent with Coach guidance" }, { title: "UNAPPROVED GUESS", explanation: "Do not use" }] }) });
  f.seed("video_visual_observation_reviews", { id: "review", analysis_id: "visual", video_id: "lesson-a", member_id: "student-a", coach_id: "coach-a", observation_id: "observation-1", review_status: "include_in_recap", reviewed_by: "coach-a" });
  await f.api.updateVideoRecapState(f.identity, { videoId: "lesson-a", action: "generateSummary" });
  const input = f.requests[0].input;
  assert.match(input, /Keep your posture throughout the takeaway/);
  assert.match(input, /125.0 yd/); assert.match(input, /Reviewed observation/);
  assert.doesNotMatch(input, /999|UNAPPROVED GUESS|PRIVATE MEDICAL DETAIL/);
});

test("actual recap handler exposes only the published summary to the owning Student", async t => {
  const f = fixture(t, { role: "member", id: "student-a" });
  const data = await (await f.api.readVideoRecapState(f.identity, "lesson-a")).json();
  assert.deepEqual(data, { canReview: false, draft: { lessonSummary: "Approved summary", status: "published" }, job: null, transcript: null });
  assert.doesNotMatch(JSON.stringify(data), /Coach edited draft|MEDICAL|posture|confidence|segments/);
});

test("actual video list response excludes private notes and draft summary", async t => {
  const f = fixture(t, { role: "member", id: "student-a" });
  const response = await f.routes.GET(new Request("https://example.test/api/videos"));
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.videos.length, 1);
  assert.equal(data.videos[0].lessonSummary, "Approved summary");
  assert.doesNotMatch(JSON.stringify(data), /Coach edited draft|MEDICAL|coachPrivateNotes|sourceMediaProbe|coachNotes/);
});

test("actual recap handler blocks cross-Student reads and unpublished deep links", async t => {
  const f = fixture(t, { role: "member", id: "student-b" });
  await assert.rejects(f.api.readVideoRecapState(f.identity, "lesson-a"), error => error.status === 403);
  f.sqlite.exec("UPDATE lesson_videos SET publication_status='Draft'");
  await assert.rejects(f.api.readVideoRecapState({ id: "student-a", role: "member" }, "lesson-a"), error => error.status === 403);
  await assert.rejects(f.api.updateVideoRecapState({ id: "student-a", role: "member" }, { videoId: "lesson-a", action: "generateSummary" }), error => error.status === 403);
});

for (const role of ["coach", "admin"]) test(`${role} can generate and persist one private summary from notes without audio`, async t => {
  const f = fixture(t, { role });
  const data = await (await f.api.updateVideoRecapState(f.identity, { videoId: "lesson-a", action: "generateSummary" })).json();
  assert.equal(data.summary, "Stay in posture during the takeaway.");
  assert.equal(f.row().lesson_summary, "Approved summary");
  assert.equal(f.row().publication_status, "Published");
  assert.equal(summary.privateLessonSummary(f.row().coach_private_notes), data.summary);
  assert.equal(summary.readPrivateLesson(f.row().coach_private_notes).summarySource, "ai_draft");
  assert.equal(f.requests.length, 1);
  assert.deepEqual(f.requests[0].text.format.schema.required, ["lessonSummary", "needsCoachInput"]);
  assert.match(f.requests[0].input, /Maintain posture, as coached/);
  assert.doesNotMatch(f.requests[0].input, /PRIVATE MEDICAL DETAIL/);
});

test("a concurrent saved Coach edit wins over a late summary response", async t => {
  const edited = summary.PRIVATE_LESSON_PREFIX + JSON.stringify({ privateCoachNote: "New notes", lessonSummary: "My newer words" });
  const f = fixture(t, { onGenerate: db => db.prepare("UPDATE lesson_videos SET coach_private_notes=? WHERE id='lesson-a'").run(edited) });
  await assert.rejects(f.api.updateVideoRecapState(f.identity, { videoId: "lesson-a", action: "generateSummary" }), error => error.status === 409);
  assert.equal(f.row().coach_private_notes, edited);
  assert.equal(f.row().lesson_summary, "Approved summary");
});

test("missing source guidance yields an honest empty private summary", async t => {
  const f = fixture(t);
  f.sqlite.exec("UPDATE lesson_videos SET coach_private_notes=''");
  const data = await (await f.api.updateVideoRecapState(f.identity, { videoId: "lesson-a", action: "generateSummary" })).json();
  assert.equal(data.summary, "");
  assert.equal(f.requests.length, 0);
});

test("private draft parsing preserves intentionally cleared text and legacy notes", () => {
  assert.equal(summary.privateLessonSummary(summary.PRIVATE_LESSON_PREFIX + '{"lessonSummary":""}', "Old approved text"), "");
  assert.equal(summary.readPrivateLesson("My private notes").privateCoachNote, "My private notes");
  assert.deepEqual(summary.readPrivateLesson(summary.PRIVATE_LESSON_PREFIX + "invalid"), {});
});

test("Student video boundary strips private, legacy, processing and newly-added internal fields", () => {
  const data = summary.studentLessonVideo({ id: "lesson", publicationStatus: "Published", lessonSummary: "Approved", coachPrivateNotes: "secret", coachNotes: "legacy secret", sourceMediaProbe: { debug: "secret" }, futurePrivateField: "secret", description: "private context", workedOn: "legacy", emailFailureReason: "provider" });
  assert.deepEqual(data, { id: "lesson", publicationStatus: "Published", lessonSummary: "Approved" });
  assert.equal(summary.studentLessonVideo({ publicationStatus: "Draft", lessonSummary: "unapproved" }).lessonSummary, "");
});

const componentSource = page.slice(page.indexOf("function StudentLessonContent("), page.indexOf("async function loadComparisonLessons("));
const feedbackSource = await readFile(new URL("../components/lesson-feedback.tsx", import.meta.url), "utf8");
const renderCode = ts.transpileModule(feedbackSource + "\n" + componentSource + "\nexports.Component = StudentLessonContent;", { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const componentExports = {};
new Function("require", "exports", "lessonSessionMetrics", "AnnotatedLessonVideoPlayer", "LessonSwingComparison", renderCode)(name => name.includes("lesson-feedback-format") ? feedbackFormat : jsx, componentExports, summary.lessonSessionMetrics, props => React.createElement("video", { controls: true, playsInline: true, src: props.src, "data-overlays": props.annotations.length }), () => null);
const render = (video, text = "", session) => renderToStaticMarkup(React.createElement(componentExports.Component, { video, summary: text, session, annotations: [{ id: "saved-markup" }] }));

test("Student and preview shared renderer shows video, summary, mobile controls and saved overlays", () => {
  const html = render({ objectUrl: "/api/videos/media?videoId=lesson" }, "Coach-approved wording");
  assert.match(html, /Lesson Video/); assert.match(html, /Lesson Feedback/); assert.match(html, /Coach-approved wording/);
  assert.match(html, /controls/); assert.match(html, /playsInline/); assert.match(html, /data-overlays="1"/);
  for (const forbidden of ["Session Data", "What to Work On", "Progress", "Student Message", "Private Coach", "Practice Intelligence", "confidence", "transcript"]) assert.ok(!html.includes(forbidden), forbidden);
  assert.match(render({ objectUrl: "video" }), /Coach feedback is not available yet\./);
  assert.equal((page.match(/<StudentLessonContent /g) || []).length, 2);
  assert.match(page, /canEditCoachNotes && !showPreview && <section className="coach-lesson-workspace"/);
});

test("session data is omitted unless linked, useful, single-club and supported", () => {
  const session = { id: "s", shots: [{ club: "7 Iron", carry: 120, ballSpeed: 100 }, { club: "7 Iron", carry: 130, ballSpeed: 102 }] };
  assert.doesNotMatch(render({ objectUrl: "v" }, "summary", session), /Session Data/);
  assert.doesNotMatch(render({ objectUrl: "v", sessionId: "other" }, "summary", session), /Session Data/);
  const html = render({ objectUrl: "v", sessionId: "s" }, "summary", session);
  assert.match(html, /Session Data/); assert.match(html, /125.0 yd/); assert.match(html, /101.0 mph/);
  assert.deepEqual(summary.lessonSessionMetrics({ shots: [{ club: "Driver", carry: 250 }, { club: "7 Iron", carry: 130 }] }), []);
  assert.deepEqual(summary.lessonSessionMetrics({ shots: [{ club: "7 Iron", carry: 130, reviewStatus: "Needs review" }] }), []);
  assert.deepEqual(summary.lessonSessionMetrics({ importMetadata: { blockingIssues: ["unverified"] }, ...session }), []);
});
