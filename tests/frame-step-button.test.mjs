import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";

const code = ts.transpileModule(readFileSync(new URL("../components/frame-step-button.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText;
function fixture() {
  const cleanups = [], timers = new Map(); let id = 0, calls = 0, resolveStep;
  const window = new EventTarget(), document = new EventTarget(); document.hidden = false;
  const hooks = { useRef: value => ({ current: value }), useEffect: effect => { const cleanup = effect(); if (cleanup) cleanups.push(cleanup); } };
  const exports = {};
  new Function("require", "exports", "window", "document", "setTimeout", "clearTimeout", code)(
    name => name === "react" ? hooks : jsx, exports, window, document,
    (callback, delay) => { const key = ++id; timers.set(key, { callback, delay }); return key; }, key => timers.delete(key),
  );
  const button = exports.FrameStepButton({ children: "Next", onStep: () => { calls++; return new Promise(resolve => { resolveStep = resolve; }); } }).props;
  const pointer = { button: 0, isPrimary: true, pointerId: 1, preventDefault() {}, currentTarget: { focus() {}, setPointerCapture() {} } };
  return { button, pointer, window, document, timers, calls: () => calls,
    resolve: async (moved = true) => { resolveStep(moved); await Promise.resolve(); },
    run: () => { const [key, { callback }] = timers.entries().next().value; timers.delete(key); callback(); },
    cleanup: () => cleanups.forEach(fn => fn()),
  };
}
test("click steps once without another step on pointer release/click", async () => {
  const f = fixture(); f.button.onPointerDown(f.pointer); f.button.onPointerUp(); f.button.onClick({ detail: 1 });
  await f.resolve(); assert.equal(f.calls(), 1); assert.equal(f.timers.size, 0); f.cleanup();
});
test("holding waits for the decoder, then repeats slowly until released", async () => {
  const f = fixture(); f.button.onPointerDown(f.pointer);
  assert.equal(f.timers.size, 0); await f.resolve();
  assert.equal([...f.timers.values()][0].delay, 300); f.run(); assert.equal(f.calls(), 2);
  assert.equal(f.timers.size, 0); await f.resolve(); assert.equal([...f.timers.values()][0].delay, 100);
  f.button.onPointerUp(); assert.equal(f.timers.size, 0); f.cleanup();
});
for (const stop of ["onPointerCancel", "onLostPointerCapture", "onBlur"]) {
  test(`${stop} stops a hold even while a seek is pending`, async () => {
    const f = fixture(); f.button.onPointerDown(f.pointer); f.button[stop](); await f.resolve();
    assert.equal(f.timers.size, 0); f.cleanup();
  });
}
test("window blur, hidden tab and unmount cancel scheduled repetition", async () => {
  for (const action of [f => f.window.dispatchEvent(new Event("blur")), f => { f.document.hidden = true; f.document.dispatchEvent(new Event("visibilitychange")); }, f => f.cleanup()]) {
    const f = fixture(); f.button.onPointerDown(f.pointer); await f.resolve(); action(f); assert.equal(f.timers.size, 0); f.cleanup();
  }
});
test("keyboard hold ignores OS repeats and stops on key release", async () => {
  const f = fixture(); const key = { key: " ", repeat: false, preventDefault() {} };
  f.button.onKeyDown(key); f.button.onKeyDown({ ...key, repeat: true }); assert.equal(f.calls(), 1);
  f.button.onKeyUp(key); await f.resolve(); assert.equal(f.timers.size, 0); f.cleanup();
});
