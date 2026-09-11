import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import * as policy from "../lib/coach-roster-policy.mjs";
const source = await readFile(new URL("../components/coach-student-roster.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const exports = {};
new Function("require", "exports", compiled)(id => id === "react" ? React : id === "react/jsx-runtime" ? jsx : policy, exports);
const props = { members: [{ id: "a", name: "Alex Smith", email: "a@example.test" }], videos: [], loading: false, loadingLessons: false, error: "", lessonsError: "", disabled: false, onAdd() {}, onUpload() {}, onView() {}, onRetry() {}, avatar: () => null };
const render = values => renderToStaticMarkup(React.createElement(exports.CoachStudentRoster, { ...props, ...values }));

test("home shows Students and their lesson actions without competing dashboard content", () => {
  const html = render({});
  for (const label of ["My Students", "+ Add Student", "Alex Smith", "Upload Lesson", "View Lessons", "Needs Lesson", "Search Students", "Recently Active"]) assert.ok(html.includes(label), label);
  for (const label of ["Analytics", "Session imports", "Challenges", "Recent activity", "AI summary"]) assert.ok(!html.includes(label), label);
});
test("a lesson fetch failure preserves the roster without inventing a needs-lesson status", () => {
  const html = render({ lessonsError: "Failed" });
  assert.match(html, /Alex Smith/);
  assert.match(html, /Status unavailable/);
  assert.doesNotMatch(html, />Needs Lesson</);
});
test("loading and roster errors do not pretend there are no Students", () => {
  assert.match(render({ loading: true }), /Loading your Students/);
  assert.match(render({ error: "Students could not be loaded." }), /Retry loading Students/);
  assert.doesNotMatch(render({ error: "Failed" }), /Your first lesson starts/);
});
