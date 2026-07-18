import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

test("import front door keeps only API and file upload as primary paths", () => {
  assert.match(pageSource, /Connect your launch monitor/);
  assert.match(pageSource, /Let.s see your shots/);
  assert.match(pageSource, /Upload CSV or Photos/);
  assert.doesNotMatch(pageSource, /Load sample CSV rows/);
});
