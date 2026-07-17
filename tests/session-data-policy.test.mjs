import assert from "node:assert/strict";
import test from "node:test";

import {
  hasMeaningfulShotMetrics,
  sanitizeSessionList,
  summarizeShotDataQuality,
} from "../lib/session-data-policy.mjs";

test("demo sessions are removed before account storage or practice analysis", () => {
  const sessions = sanitizeSessionList([
    {
      id: "s1",
      title: "Driver start-line block",
      date: "2026-06-22",
      source: "TrackMan",
      focus: "Tee accuracy",
      shots: [{ id: "demo-shot", club: "Driver", carry: 220, ballSpeed: 140 }],
    },
    {
      id: "import-real",
      title: "Real upload",
      date: "2026-07-17",
      source: "CSV Upload",
      focus: "Wedge control",
      shots: [{ id: "real-shot", club: "SW", carry: 88, launch: 29 }],
    },
  ]);

  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].id, "import-real");
});

test("empty and metric-free shot rows are not treated as golf evidence", () => {
  assert.equal(hasMeaningfulShotMetrics({ club: "7-Iron" }), false);
  assert.equal(hasMeaningfulShotMetrics({ club: "7-Iron", offline: 0 }), false);
  assert.equal(hasMeaningfulShotMetrics({ club: "7-Iron", carry: 146 }), true);

  const sessions = sanitizeSessionList([
    {
      id: "bad-import",
      title: "Bad import",
      date: "2026-07-17",
      source: "CSV Upload",
      focus: "Import",
      shots: [
        { id: "empty", club: "7-Iron" },
        { id: "nulls", club: "7-Iron", carry: null, ballSpeed: Number.NaN },
      ],
    },
  ]);

  assert.deepEqual(sessions, []);
});

test("shot data quality marks small samples as low confidence", () => {
  const quality = summarizeShotDataQuality([
    {
      id: "small",
      title: "Small sample",
      date: "2026-07-17",
      source: "Manual",
      focus: "Contact",
      shots: [
        { id: "one", club: "8-Iron", carry: 135 },
        { id: "two", club: "8-Iron", carry: 138 },
      ],
    },
  ]);

  assert.equal(quality.confidence, "low");
  assert.equal(quality.shotCount, 2);
  assert.match(quality.warnings.join(" "), /Fewer than five usable shots/);
});
