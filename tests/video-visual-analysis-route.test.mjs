import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../app/api/video-visual-analysis/route.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

function route(role, update) {
  const exports = {};
  const dependencies = {
    "@/lib/server/platform": {
      requireIdentity: async () => ({ id: "viewer", role }),
      responseFromError: (error) => error instanceof Response ? error : new Response("Unexpected error", { status: 500 }),
    },
    "@/lib/server/video-visual-analysis": { updateVideoVisualAnalysisState: update },
  };
  new Function("require", "exports", compiled)((id) => dependencies[id], exports);
  return exports;
}

function request(body) {
  return new Request("https://example.test/api/video-visual-analysis", { method: "PATCH", body });
}

test("students cannot trigger visual processing even with a direct request", async () => {
  let calls = 0;
  const api = route("member", async () => { calls++; });
  assert.equal((await api.PATCH(request('{"action":"request"}'))).status, 403);
  assert.equal(calls, 0);
});

test("invalid and oversized swing review payloads never reach processing", async () => {
  let calls = 0;
  const api = route("coach", async () => { calls++; });
  for (const body of ["null", "[]", "invalid"]) assert.equal((await api.PATCH(request(body))).status, 400);
  assert.equal((await api.PATCH(request("x".repeat(5_000_001)))).status, 413);
  assert.equal(calls, 0);
});

test("coach requests forward the selected frames and preserve server errors", async () => {
  const payload = { action: "request", videoId: "video", frames: [{ timestampSeconds: 1, base64: "/9j/AA==" }] };
  const api = route("coach", async (identity, received) => {
    assert.equal(identity.role, "coach");
    assert.deepEqual(received, payload);
    throw new Response("You cannot analyze this video.", { status: 403 });
  });
  const response = await api.PATCH(request(JSON.stringify(payload)));
  assert.equal(response.status, 403);
  assert.equal(await response.text(), "You cannot analyze this video.");
});
