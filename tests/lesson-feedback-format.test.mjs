import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import ts from "typescript";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import * as format from "../lib/lesson-feedback-format.mjs";

const require = createRequire(import.meta.url);
const source = await readFile(new URL("../components/lesson-feedback.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const exports = {};
new Function("require", "exports", compiled)(id => id.includes("lesson-feedback-format") ? format : require(id), exports);
const render = text => renderToStaticMarkup(createElement(exports.LessonFeedback, { text }));

test("existing paragraphs retain every sentence and numeric coaching target", () => {
  const text = "Grip: Hold securely without squeezing. Keep your thumbs along the grip. Turn slowly. Stay balanced. Rehearse 2.5 seconds per turn.";
  const bullets = format.lessonFeedbackSections(text)[0].bullets;
  assert.equal(bullets.length, 3);
  assert.equal(bullets.join(" "), text);
  assert.equal(format.lessonFeedbackInline(bullets[0])[0].text, "Grip:");
});

test("MAI Markdown and Coach plain headings render as the same note sections", () => {
  const plain = "What We Worked On\n- Grip: Relax your hands.\nWhat to Remember\n- Stay balanced.";
  const markdown = "## What We Worked On\n- Grip: Relax your hands.\n**What to Remember**\n• Stay balanced.";
  assert.deepEqual(format.lessonFeedbackSections(plain), format.lessonFeedbackSections(markdown));
  assert.match(render(markdown), /<h3>What We Worked On<\/h3>/);
  assert.match(render(markdown), /<strong>Grip:<\/strong>/);
});

test("long feedback is available in an accessible disclosure without losing final cues", () => {
  const html = render(Array.from({ length: 9 }, (_, i) => `- Cue ${i + 1}: Keep this instruction.`).join("\n"));
  assert.equal((html.match(/<li>/g) || []).length, 9);
  assert.match(html, /<details[^>]*><summary>More lesson notes/);
  assert.match(html, /Cue 9:/);
});

test("feedback safely escapes HTML and renders only supported emphasis", () => {
  const html = render("- **Relax your grip.** <img src=x onerror=alert(1)>");
  assert.match(html, /<strong>Relax your grip\.<\/strong>/);
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img/);
  assert.deepEqual(format.lessonFeedbackSections("\n "), []);
});

test("exact duplicate bullets are suppressed but qualifications and opposite cues survive", () => {
  const notes = format.lessonFeedbackSections("- Stay balanced.\n- Stay balanced.\n- Do not stay rigid.");
  assert.deepEqual(notes[0].bullets, ["Stay balanced.", "Do not stay rigid."]);
});
