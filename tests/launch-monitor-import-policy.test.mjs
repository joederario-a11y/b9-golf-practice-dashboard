import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  chooseClubForImportedSession,
  isLaunchMonitorSummaryRowLabel,
  normalizeImportHeader,
  normalizeLaunchMonitorClubName,
  parseLaunchMonitorCsv,
  UNKNOWN_IMPORT_CLUB,
} from "../lib/launch-monitor-import-policy.mjs";

const fixtureText = await readFile(new URL("./fixtures/full_swing_sample_session.csv", import.meta.url), "utf8");

function average(shots, metric) {
  const values = shots.map((shot) => shot[metric]).filter(Number.isFinite);
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function byClub(shots) {
  return shots.reduce((map, shot) => {
    map.set(shot.club, [...(map.get(shot.club) ?? []), shot]);
    return map;
  }, new Map());
}

test("normalizes launch-monitor CSV headers across punctuation, units, and casing", () => {
  assert.equal(normalizeImportHeader("\uFEFFcarryDistanceYards"), "carry_distance_yards");
  assert.equal(normalizeImportHeader("Total Distance (yd)"), "total_distance_yd");
  assert.equal(normalizeImportHeader("Face-To-Path °"), "face_to_path_deg");
});

test("maps Full Swing carry_distance_yd and total_distance_yd as measured values", () => {
  const { shots, metadata } = parseLaunchMonitorCsv(fixtureText, { sourceFileName: "full_swing_sample_session.csv" });
  const first = shots[0];

  assert.equal(shots.length, 105);
  assert.equal(first.carry, 235.3);
  assert.equal(first.total, 255);
  assert.equal(first.metricSources.carry.kind, "measured");
  assert.equal(first.metricSources.carry.originalColumn, "carry_distance_yd");
  assert.equal(first.metricSources.total.kind, "measured");
  assert.equal(first.metricSources.total.originalColumn, "total_distance_yd");
  assert.equal(metadata.mappedColumns.find((column) => column.sourceColumn === "carry_distance_yd").mapsTo, "carry");
  assert.equal(metadata.mappedColumns.find((column) => column.sourceColumn === "total_distance_yd").mapsTo, "total");
});

test("imports all fixture clubs and assigns fifteen shots to each club", () => {
  const { shots, metadata } = parseLaunchMonitorCsv(fixtureText);
  const clubs = byClub(shots);

  assert.deepEqual(metadata.clubs, ["Driver", "3-Wood", "5-Iron", "7-Iron", "9-Iron", "PW", "56° Wedge"]);
  assert.equal(metadata.clubCount, 7);
  for (const club of metadata.clubs) {
    assert.equal(clubs.get(club).length, 15, club);
  }
  assert.equal(new Set(shots.map((shot) => shot.sessionId)).size, 1);
});

test("fixture club averages keep measured Carry and Total intact", () => {
  const { shots } = parseLaunchMonitorCsv(fixtureText);
  const expected = {
    Driver: [238.12, 256.71],
    "3-Wood": [214.63, 226.95],
    "5-Iron": [175.51, 181.74],
    "7-Iron": [152.75, 158.51],
    "9-Iron": [131.98, 134.59],
    PW: [111.77, 113.51],
    "56° Wedge": [86.75, 87.43],
  };

  for (const [club, [carry, total]] of Object.entries(expected)) {
    const clubShots = shots.filter((shot) => shot.club === club);
    assert.ok(Math.abs(average(clubShots, "carry") - carry) < 0.01, `${club} carry`);
    assert.ok(Math.abs(average(clubShots, "total") - total) < 0.01, `${club} total`);
    assert.equal(clubShots.every((shot) => shot.metricSources.carry.kind === "measured"), true);
    assert.equal(clubShots.every((shot) => shot.metricSources.total.kind === "measured"), true);
  }
});

test("missing values stay unavailable and are excluded from averages", () => {
  const csv = [
    "club,shot_number,carry_distance_yd,total_distance_yd,ball_speed_mph",
    "7 Iron,1,150,,112",
    "7 Iron,2,,162,114",
    "7 Iron,3,,,116",
  ].join("\n");
  const { shots } = parseLaunchMonitorCsv(csv);

  assert.equal(shots.length, 3);
  assert.equal(shots[0].carry, 150);
  assert.equal(shots[0].total, undefined);
  assert.equal(shots[1].carry, undefined);
  assert.equal(shots[1].total, 162);
  assert.equal(average(shots, "carry"), 150);
  assert.equal(average(shots, "total"), 162);
});

test("derives exact smash when inputs are measured", () => {
  const csv = [
    "club,shot_number,ball_speed_mph,club_speed_mph",
    "Driver,1,150,100",
  ].join("\n");
  const { shots, metadata } = parseLaunchMonitorCsv(csv);

  assert.equal(shots[0].smash, 1.5);
  assert.equal(shots[0].metricSources.smash.kind, "derived");
  assert.deepEqual(shots[0].metricSources.smash.inputMetrics, ["ballSpeed", "clubSpeed"]);
  assert.deepEqual(metadata.derivedMetrics, ["smash"]);
});

test("estimates missing total from same-club measured rollout without replacing measured values", () => {
  const csv = [
    "club,shot_number,carry_distance_yd,total_distance_yd",
    "7 Iron,1,150,160",
    "7 Iron,2,151,161",
    "7 Iron,3,152,162",
    "7 Iron,4,153,163",
    "7 Iron,5,154,164",
    "7 Iron,6,155,",
  ].join("\n");
  const { shots, metadata } = parseLaunchMonitorCsv(csv);

  assert.equal(shots[0].total, 160);
  assert.equal(shots[0].metricSources.total.kind, "measured");
  assert.equal(shots[5].total, 165);
  assert.equal(shots[5].metricSources.total.kind, "estimated");
  assert.ok(shots[5].metricSources.total.confidence >= 0.8);
  assert.deepEqual(metadata.estimatedMetrics, ["total"]);
});

test("keeps low-confidence carry and total estimates as unavailable", () => {
  const csv = [
    "club,shot_number,carry_distance_yd,total_distance_yd",
    "7 Iron,1,150,160",
    "7 Iron,2,151,",
  ].join("\n");
  const { shots, metadata } = parseLaunchMonitorCsv(csv);

  assert.equal(shots[1].total, undefined);
  assert.deepEqual(metadata.estimatedMetrics, []);
});

test("converts measured units while keeping source kind measured", () => {
  const csv = [
    "club,shot_number,carry_distance_m,ball_speed_kph,apex_height_m",
    "Driver,1,200,240,30",
  ].join("\n");
  const { shots, metadata } = parseLaunchMonitorCsv(csv);

  assert.ok(Math.abs(shots[0].carry - 218.7) < 0.1);
  assert.ok(Math.abs(shots[0].ballSpeed - 149.1) < 0.1);
  assert.ok(Math.abs(shots[0].apex - 98.4) < 0.1);
  assert.equal(shots[0].metricSources.carry.kind, "measured");
  assert.equal(metadata.unitConversions.length, 3);
});

test("preserves unmapped source fields and supports review overrides", () => {
  const csv = [
    "club,shot_number,mystery_carry,player_name",
    "7 Iron,1,150,Sample Golfer",
  ].join("\n");
  const firstPass = parseLaunchMonitorCsv(csv);
  assert.equal(firstPass.shots.length, 0);
  assert.ok(firstPass.metadata.unmappedColumns.includes("mystery_carry"));

  const remapped = parseLaunchMonitorCsv(csv, { columnOverrides: { mystery_carry: "carry", player_name: "ignore" } });
  assert.equal(remapped.shots.length, 1);
  assert.equal(remapped.shots[0].carry, 150);
  assert.equal(remapped.shots[0].metricSources.carry.kind, "measured");
  assert.equal(remapped.shots[0].rawSourceData.player_name, "Sample Golfer");
});

test("normalizes supplied clubs and avoids stale imported-club selection", () => {
  assert.equal(normalizeLaunchMonitorClubName("3 Wood"), "3-Wood");
  assert.equal(normalizeLaunchMonitorClubName("5 Iron"), "5-Iron");
  assert.equal(normalizeLaunchMonitorClubName("Pitching Wedge"), "PW");
  assert.equal(normalizeLaunchMonitorClubName("56 Wedge"), "56° Wedge");
  assert.equal(normalizeLaunchMonitorClubName("56 degree wedge"), "56° Wedge");
  assert.equal(normalizeLaunchMonitorClubName("rescue"), "Hybrid");
  assert.equal(normalizeLaunchMonitorClubName("Other / Unknown"), UNKNOWN_IMPORT_CLUB);
  assert.equal(normalizeLaunchMonitorClubName(""), UNKNOWN_IMPORT_CLUB);

  const { shots } = parseLaunchMonitorCsv(fixtureText);
  assert.equal(chooseClubForImportedSession(shots, "8-Iron"), "Driver");
  assert.equal(chooseClubForImportedSession(shots, "7-Iron"), "7-Iron");
});

test("excludes AVG and summary rows from shot count and averages", () => {
  assert.equal(isLaunchMonitorSummaryRowLabel("AVG"), true);
  assert.equal(isLaunchMonitorSummaryRowLabel("Average"), true);
  assert.equal(isLaunchMonitorSummaryRowLabel("Mean"), true);
  assert.equal(isLaunchMonitorSummaryRowLabel("Summary"), true);

  const csv = [
    "shot,club,carry_distance_yd,total_distance_yd,ball_speed_mph",
    "AVG,8 Iron,999,999,999",
    "41,8 Iron,150,160,110",
    "42,8 Iron,152,162,112",
    "43,8 Iron,154,164,114",
    "44,8 Iron,156,166,116",
    "45,8 Iron,158,168,118",
  ].join("\n");
  const { shots, metadata } = parseLaunchMonitorCsv(csv);

  assert.equal(shots.length, 5);
  assert.equal(metadata.rowsDetected, 5);
  assert.equal(metadata.summaryRowsExcluded, 1);
  assert.equal(metadata.summaryRows[0].shot, "AVG");
  assert.equal(average(shots, "carry"), 154);
  assert.equal(average(shots, "ballSpeed"), 114);
});

test("missing club is saved as a warning rather than a blocking issue", () => {
  const csv = [
    "shot,carry_distance_yd,total_distance_yd,ball_speed_mph",
    "1,150,160,110",
    "2,152,162,112",
  ].join("\n");
  const { shots, metadata } = parseLaunchMonitorCsv(csv);

  assert.equal(shots.length, 2);
  assert.equal(shots.every((shot) => shot.club === UNKNOWN_IMPORT_CLUB), true);
  assert.deepEqual(metadata.blockingIssues, []);
  assert.equal(metadata.warnings.some((warning) => /missing a club/i.test(warning)), true);
});
