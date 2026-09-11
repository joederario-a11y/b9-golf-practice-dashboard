import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";

const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const source = page.slice(page.indexOf("function makeAnnotation("), page.indexOf("function VideoThumbnail("));
const code = ts.transpileModule(source + "\nexports.Component = VideoAnnotationWorkspace;", {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText;

// Run the real component's pointer handlers with deterministic hook state.
function harness() {
  const state = [];
  let cursor = 0;
  const useState = initial => {
    const i = cursor++;
    if (!(i in state)) state[i] = typeof initial === "function" ? initial() : initial;
    return [state[i], next => { state[i] = typeof next === "function" ? next(state[i]) : next; }];
  };
  const Overlay = () => null;
  const deps = {
    useState, useRef: initial => useState(() => ({ current: initial }))[0],
    useEffect: () => {}, useCallback: fn => fn, VideoAnnotationOverlay: Overlay,
    VideoReviewControls: () => null,
    VIDEO_ANNOTATION_COLORS: { red: "red" }, VIDEO_ANNOTATION_STROKES: { medium: 3 },
    normalizeVideoPoint: event => event.point, cls: (...values) => values.filter(Boolean).join(" "),
    formatAnnotationTime: String, annotationLabel: a => a.type,
  };
  const exports = {};
  new Function("require", "exports", ...Object.keys(deps), code)(() => jsx, exports, ...Object.values(deps));
  let tree;
  function nodes(node) {
    if (!node || typeof node !== "object") return [];
    if (Array.isArray(node)) return node.flatMap(nodes);
    return [node, ...nodes(node.props?.children)];
  }
  const render = () => { cursor = 0; tree = exports.Component({ annotationState: null, onClose() {}, onStateChange() {}, video: { id: "test", title: "Test", objectUrl: "video" } }); };
  const overlay = () => nodes(tree).find(node => node.type === Overlay).props;
  const button = label => nodes(tree).find(node => node.type === "button" && node.props.children === label).props;
  const event = (x, y) => ({ button: 0, pointerId: 1, point: { x, y }, currentTarget: { setPointerCapture() {} } });
  render();
  return { render, overlay, button, event, tree: () => tree };
}

for (const label of ["Draw Line", "Add Arrow", "Circle", "Rectangle", "Freehand Draw"]) {
  test(`${label} previews before release and commits one undoable shape`, () => {
    const h = harness();
    assert.equal(h.tree().props.className, "annotation-inline-editor");
    h.button(label).onClick(); h.render();
    h.overlay().onPointerDown(h.event(0.1, 0.2)); h.render();
    h.overlay().onPointerMove(h.event(0.6, 0.7)); h.render();
    assert.equal(h.overlay().annotations.length, 1);
    assert.equal(h.overlay().annotations[0].id, "drawing-preview");
    const first = h.overlay().annotations[0].geometry;
    h.overlay().onPointerMove(h.event(0.8, 0.9)); h.render();
    assert.notDeepEqual(h.overlay().annotations[0].geometry, first);
    assert.equal(h.button("Undo").disabled, true, "preview must not enter undo history");
    h.overlay().onPointerUp(h.event(0.8, 0.9)); h.render();
    assert.equal(h.overlay().annotations.length, 1);
    assert.notEqual(h.overlay().annotations[0].id, "drawing-preview");
    h.button("Undo").onClick(); h.render();
    assert.equal(h.overlay().annotations.length, 0);
    h.button("Redo").onClick(); h.render();
    assert.equal(h.overlay().annotations.length, 1);
  });
}

test("canceling a pointer gesture discards its preview without saving a shape", () => {
  const h = harness();
  h.overlay().onPointerDown(h.event(0.1, 0.2)); h.render();
  h.overlay().onPointerMove(h.event(0.6, 0.7)); h.render();
  h.overlay().onPointerCancel(); h.render();
  assert.equal(h.overlay().annotations.length, 0);
  assert.equal(h.button("Undo").disabled, true);
});
