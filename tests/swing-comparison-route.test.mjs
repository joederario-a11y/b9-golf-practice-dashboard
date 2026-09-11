import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import ts from "typescript";
import * as policy from "../lib/swing-comparison-policy.mjs";
import * as videoPolicy from "../lib/video-policy.mjs";

const source = await readFile(new URL("../app/api/swing-comparisons/route.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function fixture() {
  const sql = new DatabaseSync(":memory:");
  sql.exec("CREATE TABLE lesson_videos (id TEXT PRIMARY KEY, member_id TEXT, coach_id TEXT, publication_status TEXT, upload_status TEXT, created_at TEXT, duration REAL)");
  for (const [id, member, date] of [["new", "student", "2026-09-11"], ["old", "student", "2026-09-01"], ["other", "stranger", "2026-09-01"]]) sql.prepare("INSERT INTO lesson_videos VALUES (?, ?, 'coach', 'Published', 'ready', ?, 8)").run(id, member, date);
  const db = { prepare(query) { let values = []; return { bind(...args) { values = args; return this; }, async first() { return sql.prepare(query).get(...values) || null; }, async run() { return sql.prepare(query).run(...values); } }; } };
  let identity = { id: "coach", role: "coach" };
  let aiCalls = 0;
  const deps = {
    "@/lib/video-policy.mjs": videoPolicy,
    "@/lib/swing-comparison-policy.mjs": policy,
    "@/lib/server/platform": { requireIdentity: async () => identity, getRequiredDatabase: () => db, getAssignedMemberIds: async () => [], responseFromError: error => error instanceof Response ? error : Response.json({ error: String(error) }, { status: 500 }) },
    "@/lib/server/swing-comparison": { analyzeSwingComparison: async () => { aiCalls++; return {}; } },
  };
  const api = {};
  new Function("require", "exports", compiled)(id => deps[id], api);
  return { api, sql, identity(value) { identity = value; }, calls: () => aiCalls };
}
const req = (action, comparison, extra = {}) => new Request("https://test/api/swing-comparisons", { method: "PATCH", body: JSON.stringify({ videoId: "new", action, comparison, ...extra }) });
const draft = { previousVideoId: "old", offset: 1, notes: "Original approved notes", approvedObservations: [], includeWithLesson: false };
const get = () => new Request("https://test/api/swing-comparisons?videoId=new");

test("published snapshots remain unchanged by private coach drafts", async () => {
  const f = fixture();
  try {
    assert.equal((await f.api.PATCH(req("publish", draft))).status, 200);
    assert.equal((await f.api.PATCH(req("save", { ...draft, notes: "Private edit" }))).status, 200);
    f.identity({ id: "student", role: "member" });
    assert.equal((await (await f.api.GET(get())).json()).comparison.notes, draft.notes);
    assert.equal((await f.api.PATCH(req("publish", draft))).status, 403);
    f.identity({ id: "coach", role: "coach" });
    assert.equal((await f.api.PATCH(req("unpublish"))).status, 200);
    f.identity({ id: "student", role: "member" });
    assert.equal((await (await f.api.GET(get())).json()).comparison, null);
  } finally { f.sql.close(); }
});
test("authorization and same-student checks occur before any AI processing", async () => {
  const f = fixture();
  try {
    assert.equal((await f.api.PATCH(req("analyze", null, { previousVideoId: "other" }))).status, 403);
    f.identity({ id: "stranger-coach", role: "coach" });
    assert.equal((await f.api.PATCH(req("analyze", null, { previousVideoId: "old" }))).status, 403);
    f.identity({ id: "student", role: "member" });
    assert.equal((await f.api.PATCH(req("analyze", null, { previousVideoId: "old" }))).status, 403);
    assert.equal(f.calls(), 0);
  } finally { f.sql.close(); }
});
test("lesson publish shares only a saved comparison explicitly selected by the coach", async () => {
  const f = fixture();
  try {
    await f.api.PATCH(req("save", draft));
    await f.api.PATCH(req("publishWithLesson"));
    assert.equal(f.sql.prepare("SELECT published_json FROM lesson_swing_comparisons").get().published_json, null);
    await f.api.PATCH(req("save", { ...draft, includeWithLesson: true }));
    assert.equal((await f.api.PATCH(req("publishWithLesson"))).status, 200);
    f.sql.prepare("UPDATE lesson_videos SET publication_status = 'Draft' WHERE id = 'old'").run();
    f.identity({ id: "student", role: "member" });
    assert.equal((await (await f.api.GET(get())).json()).comparison, null);
  } finally { f.sql.close(); }
});
