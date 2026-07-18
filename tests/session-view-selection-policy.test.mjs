import assert from "node:assert/strict";
import test from "node:test";

import {
  ALL_SESSION_CLUBS,
  getSessionClubOptions,
  getSessionViewShots,
  makeSessionAnalysisKey,
  resolveSessionViewSelection,
} from "../lib/session-view-selection-policy.mjs";

const sevenClubSession = {
  id: "session-7-club",
  shots: [
    { id: "driver-1", club: "Driver", carry: 238 },
    { id: "driver-2", club: "Driver", carry: 242 },
    { id: "iron-8-1", club: "8-Iron", carry: 151 },
    { id: "iron-8-2", club: "8-Iron", carry: 154 },
    { id: "wedge-56-1", club: "56° Wedge", carry: 87 },
  ],
};

test("multi-club session defaults to All Clubs when opened directly", () => {
  const selection = resolveSessionViewSelection(sevenClubSession);
  assert.equal(selection.club, ALL_SESSION_CLUBS);
  assert.equal(selection.shotId, null);
  assert.equal(getSessionViewShots(sevenClubSession, selection).length, 5);
});

test("single-club session selects its only club", () => {
  const selection = resolveSessionViewSelection({
    id: "single",
    shots: [
      { id: "one", club: "7-Iron", carry: 145 },
      { id: "two", club: "7-Iron", carry: 147 },
    ],
  });
  assert.equal(selection.club, "7-Iron");
});

test("requested club filters the visible shot set", () => {
  const selection = resolveSessionViewSelection(sevenClubSession, { club: "8 Iron" });
  assert.equal(selection.club, "8-Iron");
  assert.deepEqual(getSessionViewShots(sevenClubSession, selection).map((shot) => shot.id), ["iron-8-1", "iron-8-2"]);
});

test("invalid URL club falls back safely to all clubs", () => {
  const selection = resolveSessionViewSelection(sevenClubSession, { club: "2-Iron" });
  assert.equal(selection.club, ALL_SESSION_CLUBS);
  assert.equal(getSessionViewShots(sevenClubSession, selection).length, 5);
});

test("shot selection keeps the shot's club active", () => {
  const selection = resolveSessionViewSelection(sevenClubSession, { shotId: "iron-8-2" });
  assert.equal(selection.club, "8-Iron");
  assert.equal(selection.shotId, "iron-8-2");
});

test("deleting the selected shot clears only the shot selection", () => {
  const selection = resolveSessionViewSelection(
    {
      id: "session-7-club",
      shots: sevenClubSession.shots.filter((shot) => shot.id !== "iron-8-2"),
    },
    { club: "8-Iron", shotId: "iron-8-2" },
  );
  assert.equal(selection.club, "8-Iron");
  assert.equal(selection.shotId, null);
});

test("club options only include clubs in the session in bag order", () => {
  assert.deepEqual(
    getSessionClubOptions(sevenClubSession, ["Driver", "3-Wood", "8-Iron", "56° Wedge"]),
    ["Driver", "8-Iron", "56° Wedge"],
  );
});

test("club-specific analysis cache keys are distinct from all-club analysis", () => {
  assert.equal(makeSessionAnalysisKey("session-7-club", { club: "all" }), "session-7-club");
  assert.equal(makeSessionAnalysisKey("session-7-club", { club: "8-Iron" }), "session-7-club::club=8-Iron");
});
