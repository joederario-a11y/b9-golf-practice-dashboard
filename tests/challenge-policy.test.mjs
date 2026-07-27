import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  evaluateChallengeAttempt,
  evaluateShotForChallenge,
  sessionHasEligibleChallengeShots,
  SEVEN_IRON_PRECISION_TEMPLATE,
} from "../lib/challenge-policy.mjs";

test("7-Iron Precision completes when five measured shots qualify", () => {
  const session = {
    id: "session-7i",
    shots: Array.from({ length: 5 }, (_, index) => ({
      id: `shot-${index + 1}`,
      club: "7-Iron",
      carry: 146 + index,
      offline: index % 2 === 0 ? 3 : -4,
      metricSources: {
        carry: { kind: "measured" },
        offline: { kind: "measured" },
      },
    })),
  };

  const attempt = evaluateChallengeAttempt({ session });

  assert.equal(attempt.status, "completed");
  assert.equal(attempt.currentSuccessCount, 5);
  assert.deepEqual(JSON.parse(attempt.shotIdsJson), ["shot-1", "shot-2", "shot-3", "shot-4", "shot-5"]);
  assert.equal(JSON.parse(attempt.resultJson).unavailableShotCount, 0);
  assert.match(JSON.parse(attempt.resultJson).biggestWin, /5 measured 7-Iron shots/);
});

test("missing carry or offline is unavailable, not a qualifying estimate", () => {
  const attempt = evaluateChallengeAttempt({
    session: {
      id: "missing-data",
      shots: [
        { id: "shot-1", club: "7-Iron", carry: 174 },
        { id: "shot-2", club: "7-Iron", offline: 4 },
        { id: "shot-3", club: "7-Iron", carry: 175, offline: 12 },
      ],
    },
  });
  const result = JSON.parse(attempt.resultJson);

  assert.equal(attempt.status, "active");
  assert.equal(result.currentSuccessCount, 0);
  assert.equal(result.measuredShotCount, 1);
  assert.equal(result.unavailableShotCount, 2);
});

test("estimated carry or offline cannot qualify a shot", () => {
  const shot = {
    id: "shot-estimated",
    club: "7-Iron",
    carry: 174,
    offline: 2,
    metricSources: {
      carry: { kind: "estimated" },
      offline: { kind: "measured" },
    },
  };

  const result = evaluateShotForChallenge(shot, SEVEN_IRON_PRECISION_TEMPLATE);

  assert.equal(result.qualified, false);
  assert.equal(result.usable, false);
  assert.equal(result.reason, "estimated_metric");
  assert.equal(result.statusLabel, "Missing required data");
});

test("challenge evaluation labels wrong club, outside windows, and missing data", () => {
  const attempt = evaluateChallengeAttempt({
    session: {
      id: "mixed-session",
      shots: [
        { id: "driver-1", club: "Driver", carry: 150, offline: 1 },
        { id: "carry-long", club: "7-Iron", carry: 160, offline: 1 },
        { id: "offline-wide", club: "7-Iron", carry: 150, offline: -9 },
        { id: "missing-offline", club: "7-Iron", carry: 150 },
        { id: "qualified", club: "7-Iron", carry: 151, offline: 0 },
      ],
    },
  });
  const result = JSON.parse(attempt.resultJson);

  assert.equal(result.currentSuccessCount, 1);
  assert.deepEqual(result.shotResults.map((shot) => shot.statusLabel), [
    "Wrong club",
    "Outside carry window",
    "Outside target window",
    "Missing required data",
    "Qualified",
  ]);
});

test("challenge evaluation ignores duplicate, deleted, and AVG rows", () => {
  const attempt = evaluateChallengeAttempt({
    session: {
      id: "clean-session",
      shots: [
        { id: "avg-row", club: "7-Iron", carry: 150, offline: 0, sourceShotNumber: "AVG" },
        { id: "deleted-row", club: "7-Iron", carry: 150, deleted: true, offline: 0 },
        { id: "shot-1", club: "7-Iron", carry: 150, offline: 0 },
        { id: "shot-1", club: "7-Iron", carry: 150, offline: 0 },
      ],
    },
  });
  const result = JSON.parse(attempt.resultJson);

  assert.equal(result.totalAttemptedShotCount, 1);
  assert.equal(result.currentSuccessCount, 1);
  assert.deepEqual(result.evaluatedShotIds, ["shot-1"]);
});

test("eligible sessions require measured 7-Iron carry and offline data", () => {
  assert.equal(sessionHasEligibleChallengeShots({
    shots: [{ id: "driver", club: "Driver", carry: 150, offline: 0 }],
  }), false);
  assert.equal(sessionHasEligibleChallengeShots({
    shots: [{ id: "seven", club: "7-Iron", carry: 150, offline: 0 }],
  }), true);
});

test("offline derived from measured side total remains eligible measured session data", () => {
  const result = evaluateShotForChallenge({
    id: "side-total-shot",
    club: "7-Iron",
    carry: 150,
    offline: 4,
    sideTotal: 4,
    metricSources: {
      carry: { kind: "measured" },
      offline: { kind: "derived", inputMetrics: ["sideTotal"] },
      sideTotal: { kind: "measured" },
    },
  });

  assert.equal(result.usable, true);
  assert.equal(result.qualified, true);
  assert.equal(result.statusLabel, "Qualified");
});

test("challenge persistence uses dedicated D1 challenge tables and one open challenge guard", async () => {
  const platformSource = await readFile(new URL("../lib/server/platform.ts", import.meta.url), "utf8");
  const routeSource = await readFile(new URL("../app/api/challenges/route.ts", import.meta.url), "utf8");

  assert.match(platformSource, /CREATE TABLE IF NOT EXISTS challenge_templates/);
  assert.match(platformSource, /CREATE TABLE IF NOT EXISTS member_challenges/);
  assert.match(platformSource, /CREATE TABLE IF NOT EXISTS challenge_attempts/);
  assert.match(platformSource, /member_challenges_one_open_template_unique/);
  assert.match(platformSource, /challenge_attempts_one_open_unique/);
  assert.match(routeSource, /golf_session_snapshots/);
  assert.match(routeSource, /evaluateChallengeAttempt/);
  assert.match(routeSource, /challenge_completed/);
  assert.match(routeSource, /link_session/);
});
