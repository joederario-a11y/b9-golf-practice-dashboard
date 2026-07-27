import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  evaluateChallengeAttempt,
  evaluateShotForChallenge,
  SEVEN_IRON_PRECISION_TEMPLATE,
} from "../lib/challenge-policy.mjs";

test("7-Iron Precision completes when five measured shots qualify", () => {
  const session = {
    id: "session-7i",
    shots: Array.from({ length: 5 }, (_, index) => ({
      id: `shot-${index + 1}`,
      club: "7-Iron",
      carry: 172 + index,
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
});

test("challenge persistence uses dedicated D1 challenge tables and one open challenge guard", async () => {
  const platformSource = await readFile(new URL("../lib/server/platform.ts", import.meta.url), "utf8");
  const routeSource = await readFile(new URL("../app/api/challenges/route.ts", import.meta.url), "utf8");

  assert.match(platformSource, /CREATE TABLE IF NOT EXISTS challenge_templates/);
  assert.match(platformSource, /CREATE TABLE IF NOT EXISTS member_challenges/);
  assert.match(platformSource, /CREATE TABLE IF NOT EXISTS challenge_attempts/);
  assert.match(platformSource, /member_challenges_one_open_template_unique/);
  assert.match(routeSource, /golf_session_snapshots/);
  assert.match(routeSource, /evaluateChallengeAttempt/);
});
