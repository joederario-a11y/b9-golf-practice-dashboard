"use client";

import { useMemo, useState } from "react";

type Tab = "dashboard" | "sessions" | "clubs" | "coach" | "practice" | "import";
type AccountMode = "pending" | "user" | "guest";

type Shot = {
  id: string;
  club: string;
  carry: number;
  total: number;
  ballSpeed: number;
  clubSpeed: number;
  smash: number;
  launch: number;
  spin: number;
  offline: number;
  shape: string;
  proximity?: number;
  apex?: number;
  spinAxis?: number;
  descent?: number;
  horizontalAngle?: number;
  faceAngle?: number;
  clubPath?: number;
  faceToPath?: number;
  sideCarry?: number;
  sideTotal?: number;
};

type Session = {
  id: string;
  title: string;
  date: string;
  source: string;
  focus: string;
  shots: Shot[];
};

type Insight = {
  id: string;
  title: string;
  club: string;
  severity: "high" | "medium" | "low";
  metric: string;
  value: string;
  target: string;
  evidence: string;
  action: string;
};

type ClubSummary = {
  club: string;
  shots: number;
  carry: number;
  dispersion: number;
  smash: number;
  launch: number;
  spin: number;
  total: number;
  ballSpeed: number;
  clubSpeed: number;
  proximity: number;
  apex: number;
  descent: number;
  spinAxis: number;
  faceToPath: number;
  sideCarry: number;
  quality: number;
};

type ClubMetricKey = "carry" | "total" | "spin" | "smash" | "ballSpeed" | "clubSpeed" | "launch" | "apex" | "descent";

type ClubMetricConfig = {
  key: ClubMetricKey;
  label: string;
  shortLabel: string;
  unit: string;
  decimals?: number;
};

type ProTourStats = {
  carry: number;
  total: number;
  ballSpeed: number;
  clubSpeed: number;
  smash: number;
  launch: number;
  spin: number;
  apex: number;
  descent: number;
};

type LastImport = {
  date: string;
  facilityName: string;
  simulator: string;
  submissionType: "API feed" | "CSV / Excel" | "Photo";
  shots: Shot[];
};

type CoachMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

const DEFAULT_FACILITY_NAME = "Back Nine Woodstock";
const DEFAULT_IMPORT_DATE = "2026-06-24";
const DEFAULT_SIMULATOR = "Full Swing";

const CLUB_METRIC_OPTIONS: ClubMetricConfig[] = [
  { key: "carry", label: "Carry", shortLabel: "Carry", unit: "yd", decimals: 1 },
  { key: "total", label: "Total Distance", shortLabel: "Total", unit: "yd", decimals: 1 },
  { key: "spin", label: "Spin", shortLabel: "Spin", unit: "rpm" },
  { key: "smash", label: "Smash Factor", shortLabel: "Smash", unit: "", decimals: 2 },
  { key: "ballSpeed", label: "Ball Speed", shortLabel: "Ball", unit: "mph", decimals: 1 },
  { key: "clubSpeed", label: "Club Speed", shortLabel: "Club", unit: "mph", decimals: 1 },
  { key: "launch", label: "Launch Angle", shortLabel: "Launch", unit: "deg", decimals: 1 },
  { key: "apex", label: "Apex", shortLabel: "Apex", unit: "ft" },
  { key: "descent", label: "Descent Angle", shortLabel: "Descent", unit: "deg", decimals: 1 },
];

const CLUB_TARGETS: Record<
  string,
  {
    carry: number;
    total: number;
    ballSpeed: number;
    clubSpeed: number;
    smash: number;
    launch: number;
    spin: number;
    apex: number;
    descent: number;
    proximity: number;
    spinAxis: number;
    faceToPath: number;
    sideCarry: number;
  }
> = {
  Driver: { carry: 238, total: 264, ballSpeed: 151, clubSpeed: 102, smash: 1.48, launch: 13, spin: 2550, apex: 92, descent: 37, proximity: 70, spinAxis: 4, faceToPath: 2.5, sideCarry: 14 },
  "3-Wood": { carry: 213, total: 232, ballSpeed: 139, clubSpeed: 94, smash: 1.48, launch: 13.5, spin: 3300, apex: 86, descent: 39, proximity: 58, spinAxis: 4, faceToPath: 2.4, sideCarry: 12 },
  "5-Wood": { carry: 196, total: 214, ballSpeed: 130, clubSpeed: 89, smash: 1.46, launch: 15, spin: 4000, apex: 84, descent: 41, proximity: 52, spinAxis: 4, faceToPath: 2.2, sideCarry: 11 },
  "5-Iron": { carry: 171, total: 184, ballSpeed: 118, clubSpeed: 82, smash: 1.44, launch: 17, spin: 5200, apex: 76, descent: 42, proximity: 45, spinAxis: 4, faceToPath: 2, sideCarry: 9 },
  "6-Iron": { carry: 176, total: 192, ballSpeed: 122, clubSpeed: 86.5, smash: 1.42, launch: 15, spin: 5740, apex: 82, descent: 39, proximity: 60, spinAxis: 3, faceToPath: 3.7, sideCarry: 6 },
  "7-Iron": { carry: 148, total: 158, ballSpeed: 106, clubSpeed: 74, smash: 1.43, launch: 19, spin: 6300, apex: 64, descent: 44, proximity: 38, spinAxis: 4, faceToPath: 2, sideCarry: 8 },
  "8-Iron": { carry: 136, total: 145, ballSpeed: 99, clubSpeed: 71, smash: 1.39, launch: 21, spin: 7000, apex: 58, descent: 46, proximity: 34, spinAxis: 4, faceToPath: 2, sideCarry: 7 },
  "9-Iron": { carry: 123, total: 131, ballSpeed: 93, clubSpeed: 68, smash: 1.36, launch: 23, spin: 7800, apex: 50, descent: 48, proximity: 30, spinAxis: 4, faceToPath: 2, sideCarry: 6 },
  PW: { carry: 110, total: 116, ballSpeed: 87, clubSpeed: 65, smash: 1.34, launch: 25, spin: 8500, apex: 44, descent: 50, proximity: 26, spinAxis: 4, faceToPath: 2, sideCarry: 6 },
  GW: { carry: 96, total: 101, ballSpeed: 80, clubSpeed: 60, smash: 1.33, launch: 27, spin: 9100, apex: 39, descent: 52, proximity: 22, spinAxis: 4, faceToPath: 2, sideCarry: 5 },
  SW: { carry: 82, total: 86, ballSpeed: 72, clubSpeed: 56, smash: 1.29, launch: 31, spin: 9800, apex: 33, descent: 54, proximity: 18, spinAxis: 4, faceToPath: 2, sideCarry: 5 },
  LW: { carry: 61, total: 64, ballSpeed: 62, clubSpeed: 50, smash: 1.24, launch: 35, spin: 10300, apex: 27, descent: 56, proximity: 14, spinAxis: 4, faceToPath: 2, sideCarry: 4 },
};

const PRO_REFERENCE_STATS: Record<string, { pga: ProTourStats; lpga: ProTourStats }> = {
  Driver: {
    pga: { carry: 285, total: 303, ballSpeed: 175, clubSpeed: 117, smash: 1.5, launch: 11, spin: 2700, apex: 100, descent: 37 },
    lpga: { carry: 221, total: 246, ballSpeed: 140, clubSpeed: 94, smash: 1.49, launch: 13, spin: 2600, apex: 78, descent: 34 },
  },
  "3-Wood": {
    pga: { carry: 243, total: 262, ballSpeed: 158, clubSpeed: 107, smash: 1.48, launch: 9, spin: 3650, apex: 88, descent: 39 },
    lpga: { carry: 195, total: 218, ballSpeed: 132, clubSpeed: 90, smash: 1.47, launch: 11, spin: 3650, apex: 72, descent: 38 },
  },
  "5-Wood": {
    pga: { carry: 230, total: 247, ballSpeed: 152, clubSpeed: 103, smash: 1.48, launch: 10, spin: 4350, apex: 86, descent: 42 },
    lpga: { carry: 185, total: 204, ballSpeed: 128, clubSpeed: 88, smash: 1.45, launch: 12, spin: 4300, apex: 70, descent: 40 },
  },
  "5-Iron": {
    pga: { carry: 194, total: 208, ballSpeed: 132, clubSpeed: 94, smash: 1.4, launch: 12, spin: 5360, apex: 82, descent: 45 },
    lpga: { carry: 161, total: 173, ballSpeed: 104, clubSpeed: 79, smash: 1.32, launch: 15, spin: 4600, apex: 67, descent: 43 },
  },
  "6-Iron": {
    pga: { carry: 186, total: 198, ballSpeed: 127, clubSpeed: 92, smash: 1.38, launch: 14, spin: 6230, apex: 83, descent: 47 },
    lpga: { carry: 152, total: 163, ballSpeed: 104, clubSpeed: 78, smash: 1.33, launch: 17, spin: 5600, apex: 68, descent: 45 },
  },
  "7-Iron": {
    pga: { carry: 176, total: 186, ballSpeed: 120, clubSpeed: 90, smash: 1.33, launch: 16, spin: 7100, apex: 85, descent: 50 },
    lpga: { carry: 145, total: 153, ballSpeed: 96, clubSpeed: 76, smash: 1.26, launch: 19, spin: 6700, apex: 70, descent: 47 },
  },
  "8-Iron": {
    pga: { carry: 160, total: 169, ballSpeed: 115, clubSpeed: 87, smash: 1.32, launch: 18, spin: 8000, apex: 83, descent: 51 },
    lpga: { carry: 130, total: 137, ballSpeed: 92, clubSpeed: 74, smash: 1.24, launch: 21, spin: 7500, apex: 66, descent: 49 },
  },
  "9-Iron": {
    pga: { carry: 148, total: 156, ballSpeed: 109, clubSpeed: 85, smash: 1.28, launch: 20, spin: 8650, apex: 80, descent: 52 },
    lpga: { carry: 119, total: 125, ballSpeed: 86, clubSpeed: 72, smash: 1.19, launch: 23, spin: 8100, apex: 60, descent: 50 },
  },
  PW: {
    pga: { carry: 136, total: 142, ballSpeed: 102, clubSpeed: 83, smash: 1.23, launch: 24, spin: 9300, apex: 74, descent: 54 },
    lpga: { carry: 107, total: 112, ballSpeed: 80, clubSpeed: 70, smash: 1.14, launch: 26, spin: 8600, apex: 56, descent: 52 },
  },
  GW: {
    pga: { carry: 123, total: 128, ballSpeed: 96, clubSpeed: 79, smash: 1.22, launch: 27, spin: 9800, apex: 69, descent: 55 },
    lpga: { carry: 95, total: 99, ballSpeed: 74, clubSpeed: 66, smash: 1.12, launch: 28, spin: 9000, apex: 51, descent: 53 },
  },
  SW: {
    pga: { carry: 115, total: 119, ballSpeed: 90, clubSpeed: 76, smash: 1.18, launch: 29, spin: 10300, apex: 63, descent: 56 },
    lpga: { carry: 82, total: 86, ballSpeed: 68, clubSpeed: 62, smash: 1.1, launch: 31, spin: 9400, apex: 45, descent: 54 },
  },
  LW: {
    pga: { carry: 95, total: 98, ballSpeed: 78, clubSpeed: 67, smash: 1.16, launch: 32, spin: 10500, apex: 52, descent: 58 },
    lpga: { carry: 65, total: 68, ballSpeed: 58, clubSpeed: 55, smash: 1.05, launch: 34, spin: 9800, apex: 38, descent: 56 },
  },
};

const CLUB_ORDER = [
  "Driver",
  "3-Wood",
  "5-Wood",
  "5-Iron",
  "6-Iron",
  "7-Iron",
  "8-Iron",
  "9-Iron",
  "PW",
  "GW",
  "SW",
  "LW",
];

const NAV_ITEMS: { id: Tab; label: string; icon: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: "⌁" },
  { id: "sessions", label: "Sessions", icon: "◫" },
  { id: "clubs", label: "Clubs", icon: "▥" },
  { id: "coach", label: "Coach", icon: "✦" },
  { id: "practice", label: "Practice", icon: "◎" },
  { id: "import", label: "Import", icon: "⇧" },
];

const DEMO_CSV = `club,proximity,carry,total,ballSpeed,clubSpeed,smash,apex,spin,spinAxis,launch,descent,horizontalAngle,faceAngle,clubPath,faceToPath,sideCarry,sideTotal,offline
6-Iron,59.8,175.9,191.8,122.4,86.5,1.42,81.8,5742,-3,14.9,39.4,2.3,1.5,5.2,-3.7,6.3,6.2,6.2
6-Iron,51.3,178.7,198.0,122.8,87.5,1.40,77.3,5940,-4,15.4,38.8,2.9,2.1,8.4,-4.3,7.6,7.8,7.8
6-Iron,50.4,170.6,198.7,122.1,85.8,1.42,53.2,4346,-8,11.5,30.1,2.1,1.0,6.8,-5.7,1.8,0.8,0.8
6-Iron,53.3,181.1,197.3,124.5,87.4,1.42,78.6,5566,-5,14.3,39.0,2.8,1.9,6.4,-4.5,6.1,6.1,6.1
6-Iron,54.0,175.9,195.6,122.6,87.2,1.41,67.3,5085,-10,13.3,35.3,0.8,-0.6,6.4,-7.0,-4.7,-6.6,-6.6
6-Iron,75.3,183.5,194.8,125.9,86.3,1.46,100.2,6493,1,18.4,44.5,5.3,5.0,6.4,-1.4,20.0,21.4,21.4
6-Iron,37.1,175.5,192.2,121.2,91.2,1.33,75.2,5511,-2,15.6,38.1,1.2,0.6,5.5,-3.2,4.0,4.1,4.1
6-Iron,50.2,176.2,198.4,122.8,87.4,1.40,66.3,4992,-4,13.1,34.9,2.3,1.5,5.6,-4.2,5.3,5.2,5.2`;

const SIMULATOR_SOURCES = [
  { label: "Full Swing", logo: "/logos/full-swing.png", tone: "dark" },
  { label: "TrackMan", logo: "/logos/trackman.svg", tone: "dark" },
  { label: "Foresight GCQuad", logo: "/logos/foresight-sports.png", tone: "dark" },
  { label: "SkyTrak", logo: "/logos/skytrak.png", tone: "light" },
  { label: "FlightScope Mevo+", logo: "/logos/flightscope.png", tone: "dark" },
];

const METRIC_DEFINITIONS: Record<string, { title: string; description: string; benchmark: (club: string) => string }> = {
  quality: {
    title: "Performance index",
    description: "Composite of strike efficiency, dispersion, launch window, and curve control for the selected club.",
    benchmark: () => "80+ is strong, 70-79 is playable, below 70 needs focused work.",
  },
  carry: {
    title: "Average carry",
    description: "How far the ball flies before landing. This is the number to use for hazards and approach planning.",
    benchmark: (club) => `${club} target: ${CLUB_TARGETS[club]?.carry ?? "club"} yd carry.`,
  },
  dispersion: {
    title: "Shot dispersion",
    description: "Typical left-right spread from the target line. Lower means more fairways, greens, and predictable misses.",
    benchmark: (club) => `${club} working window: inside ${Math.max(6, CLUB_TARGETS[club]?.sideCarry ?? 12)} yd side carry.`,
  },
  smash: {
    title: "Smash factor",
    description: "Ball speed divided by club speed. It shows how efficiently your strike transfers energy.",
    benchmark: (club) => `${club} benchmark: ${CLUB_TARGETS[club]?.smash.toFixed(2) ?? "1.40"} or better.`,
  },
  ballSpeed: {
    title: "Ball speed",
    description: "Speed of the ball immediately after impact. It is the clearest distance engine.",
    benchmark: (club) => `${club} target: ${CLUB_TARGETS[club]?.ballSpeed ?? "tracked"} mph.`,
  },
  clubSpeed: {
    title: "Club speed",
    description: "Club-head speed at impact. Speed matters most when smash factor stays stable.",
    benchmark: (club) => `${club} target: ${CLUB_TARGETS[club]?.clubSpeed ?? "tracked"} mph.`,
  },
  total: {
    title: "Total distance",
    description: "Carry plus rollout. Useful for tee shots and run-up approaches, less useful for forced carries.",
    benchmark: (club) => `${club} reference: ${CLUB_TARGETS[club]?.total ?? "tracked"} yd total.`,
  },
  apex: {
    title: "Apex height",
    description: "Peak height of the ball flight. Helps explain stopping power and whether shots are ballooning.",
    benchmark: (club) => `${club} target: around ${CLUB_TARGETS[club]?.apex ?? "tracked"} ft.`,
  },
  spin: {
    title: "Spin rate",
    description: "Backspin immediately after impact. Too high can balloon; too low can reduce carry and hold.",
    benchmark: (club) => `${club} target: about ${CLUB_TARGETS[club]?.spin ?? "tracked"} rpm.`,
  },
  launch: {
    title: "Launch angle",
    description: "Initial vertical launch. It should match the club and speed window.",
    benchmark: (club) => `${club} target: ${CLUB_TARGETS[club]?.launch ?? "tracked"} degrees.`,
  },
  descent: {
    title: "Descent angle",
    description: "The landing angle into the turf or green. Steeper descent generally helps approach shots stop.",
    benchmark: (club) => `${club} target: roughly ${CLUB_TARGETS[club]?.descent ?? "tracked"} degrees.`,
  },
  spinAxis: {
    title: "Spin axis",
    description: "Tilt of the spin axis. More tilt means more curve left or right.",
    benchmark: (club) => `${club} goal: within ${CLUB_TARGETS[club]?.spinAxis ?? 4} degrees either way.`,
  },
  faceToPath: {
    title: "Face to path",
    description: "Relationship between face angle and club path. It is the main curve-control number.",
    benchmark: (club) => `${club} goal: within ${CLUB_TARGETS[club]?.faceToPath ?? 2} degrees.`,
  },
  proximity: {
    title: "Proximity",
    description: "Distance from the intended target. It blends distance control and directional control.",
    benchmark: (club) => `${club} target: under ${CLUB_TARGETS[club]?.proximity ?? "tracked"} ft.`,
  },
};

const SHOT_PATTERNS: Record<string, { carryBias: number; offline: number[]; smashBias: number; launchBias: number; spinBias: number }> = {
  Driver: { carryBias: -5, offline: [18, -24, 10, 6, -16, 26, 4, -7, 13, -20, 9, 18], smashBias: -0.02, launchBias: -1.1, spinBias: 420 },
  "3-Wood": { carryBias: -2, offline: [8, -12, 5, 14, -7, 9, -9, 11], smashBias: -0.01, launchBias: -0.4, spinBias: 180 },
  "5-Wood": { carryBias: 0, offline: [5, 9, -8, 7, -5, 12, 2, -10], smashBias: 0, launchBias: 0.2, spinBias: 120 },
  "5-Iron": { carryBias: -4, offline: [-10, -7, -13, 4, 8, -16, 6, -8, -14], smashBias: -0.025, launchBias: -1.3, spinBias: 360 },
  "6-Iron": { carryBias: -1, offline: [-6, 8, -8, 5, 3, -10, 6, -4, 9], smashBias: -0.01, launchBias: -0.5, spinBias: 170 },
  "7-Iron": { carryBias: -3, offline: [-14, 6, -10, -18, 8, -5, -15, 10, -9, 4], smashBias: -0.02, launchBias: -1.4, spinBias: 480 },
  "8-Iron": { carryBias: 1, offline: [4, -6, 8, -5, 6, -8, 2, -4], smashBias: 0.005, launchBias: 0.3, spinBias: 80 },
  "9-Iron": { carryBias: 0, offline: [3, -5, 4, -6, 7, -4, 5, -3], smashBias: 0, launchBias: 0.4, spinBias: 90 },
  PW: { carryBias: -2, offline: [4, -9, 7, -6, 10, -11, 6, -5], smashBias: -0.01, launchBias: -0.2, spinBias: 260 },
  GW: { carryBias: 2, offline: [3, -5, 4, 6, -4, 5, -6], smashBias: 0.005, launchBias: 0.5, spinBias: 150 },
  SW: { carryBias: -1, offline: [6, -8, 5, -7, 9, -5, 4], smashBias: -0.005, launchBias: 0.7, spinBias: 210 },
  LW: { carryBias: 0, offline: [4, -6, 5, -5, 7, -4], smashBias: 0, launchBias: 0.8, spinBias: 120 },
};

function makeShot(sessionId: string, club: string, index: number, shift: number): Shot {
  const target = CLUB_TARGETS[club] ?? CLUB_TARGETS["7-Iron"];
  const pattern = SHOT_PATTERNS[club] ?? SHOT_PATTERNS["7-Iron"];
  const direction = pattern.offline[index % pattern.offline.length] + shift * (index % 2 === 0 ? 0.8 : -0.4);
  const rhythm = ((index % 5) - 2) * 0.012;
  const carry = target.carry + pattern.carryBias + shift * 0.9 + ((index % 7) - 3) * 2.1;
  const clubSpeed = target.clubSpeed + ((index % 6) - 2) * 0.8 + shift * 0.18;
  const ballSpeed = target.ballSpeed + pattern.carryBias * 0.35 + ((index % 4) - 1.5) * 1.6 + shift * 0.35;
  const smash = Math.max(1.18, Math.min(1.51, target.smash + pattern.smashBias + rhythm));
  const launch = target.launch + pattern.launchBias + ((index % 5) - 2) * 0.55;
  const spin = target.spin + pattern.spinBias + ((index % 6) - 2.5) * 115;
  const faceToPath = round(((direction / 7) % 6) - 2, 1);

  return {
    id: `${sessionId}-${club}-${index}`,
    club,
    carry: round(carry),
    total: round(carry * (club === "Driver" ? 1.11 : 1.08)),
    ballSpeed: round(ballSpeed),
    clubSpeed: round(clubSpeed),
    smash: round(smash, 2),
    launch: round(launch),
    spin: Math.round(spin),
    offline: round(direction),
    shape: direction < -15 ? "Pull" : direction < -6 ? "Draw" : direction > 15 ? "Slice" : direction > 6 ? "Fade" : "Straight",
    proximity: round(Math.abs(direction) * 2.2 + Math.abs(carry - target.carry) * 0.8 + 12),
    apex: round(target.apex + ((index % 6) - 2.5) * 3.8 + shift * 0.5),
    spinAxis: round(direction / 3.2),
    descent: round(target.descent + ((index % 5) - 2) * 1.4),
    horizontalAngle: round(direction / 3.4),
    faceAngle: round(direction / 6.8),
    clubPath: round(direction / 4.1 + 3),
    faceToPath,
    sideCarry: round(direction * 0.74),
    sideTotal: round(direction * 0.78),
  };
}

function makeSession(id: string, title: string, date: string, source: string, focus: string, clubs: string[], shift: number): Session {
  const shots = clubs.flatMap((club) => {
    const count = club === "Driver" ? 14 : club.includes("Wood") ? 10 : club.length <= 2 ? 9 : 12;
    return Array.from({ length: count }, (_, index) => makeShot(id, club, index, shift));
  });

  return { id, title, date, source, focus, shots };
}

function makeFullSwingSession(): Session {
  const rows = [
    [51.3, 178.7, 198.0, 122.8, 87.5, 1.4, 77.3, 5940, -4, 15.4, 38.8, 2.9, 2.1, 8.4, -4.3, 7.6, 7.8],
    [50.4, 170.6, 198.7, 122.1, 85.8, 1.42, 53.2, 4346, -8, 11.5, 30.1, 2.1, 1.0, 6.8, -5.7, 1.8, 0.8],
    [53.3, 181.1, 197.3, 124.5, 87.4, 1.42, 78.6, 5566, -5, 14.3, 39.0, 2.8, 1.9, 6.4, -4.5, 6.1, 6.1],
    [54.0, 175.9, 195.6, 122.6, 87.2, 1.41, 67.3, 5085, -10, 13.3, 35.3, 0.8, -0.6, 6.4, -7.0, -4.7, -6.6],
    [75.3, 183.5, 194.8, 125.9, 86.3, 1.46, 100.2, 6493, 1, 18.4, 44.5, 5.3, 5.0, 6.4, -1.4, 20.0, 21.4],
    [37.1, 175.5, 192.2, 121.2, 91.2, 1.33, 75.2, 5511, -2, 15.6, 38.1, 1.2, 0.6, 5.5, -3.2, 4.0, 4.1],
    [50.2, 176.2, 198.4, 122.8, 87.4, 1.4, 66.3, 4992, -4, 13.1, 34.9, 2.3, 1.5, 5.6, -4.2, 5.3, 5.2],
  ];

  return {
    id: "fullswing-6iron-photo",
    title: "Full Swing 6-Iron photo import",
    date: "2026-06-23",
    source: "Full Swing Photo",
    focus: "6-Iron shot history",
    shots: rows.map((row, index) => {
      const [
        proximity,
        carry,
        total,
        ballSpeed,
        clubSpeed,
        smash,
        apex,
        spin,
        spinAxis,
        launch,
        descent,
        horizontalAngle,
        faceAngle,
        clubPath,
        faceToPath,
        sideCarry,
        sideTotal,
      ] = row;

      return {
        id: `fullswing-6i-${index + 1}`,
        club: "6-Iron",
        proximity,
        carry,
        total,
        ballSpeed,
        clubSpeed,
        smash,
        apex,
        spin,
        spinAxis,
        launch,
        descent,
        horizontalAngle,
        faceAngle,
        clubPath,
        faceToPath,
        sideCarry,
        sideTotal,
        offline: sideTotal,
        shape: sideTotal < -6 ? "Draw" : sideTotal > 6 ? "Fade" : "Straight",
      };
    }),
  };
}

const BASE_SESSIONS: Session[] = [
  makeFullSwingSession(),
  makeSession("s1", "Driver start-line block", "2026-06-22", "TrackMan", "Tee accuracy", ["Driver", "3-Wood"], 4),
  makeSession("s2", "Approach ladder", "2026-06-18", "Foresight GCQuad", "Carry windows", ["5-Iron", "6-Iron", "7-Iron", "8-Iron"], 2),
  makeSession("s3", "Wedge matrix", "2026-06-14", "SkyTrak", "Distance control", ["PW", "GW", "SW", "LW"], -1),
  makeSession("s4", "Pre-round tune", "2026-06-09", "Mevo+", "Bag blend", ["Driver", "7-Iron", "PW"], -2),
  makeSession("s5", "Full bag baseline", "2026-06-02", "TrackMan", "Benchmark", ["Driver", "5-Wood", "6-Iron", "8-Iron", "PW", "SW"], -4),
  makeSession("s6", "Long iron strike", "2026-05-26", "GCQuad", "Contact", ["5-Iron", "6-Iron", "7-Iron"], -5),
];

function round(value: number, digits = 1) {
  return Number(value.toFixed(digits));
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[]) {
  if (values.length < 2) return 0;
  const mean = average(values);
  return Math.sqrt(average(values.map((value) => (value - mean) ** 2)));
}

function averageMetric(shots: Shot[], key: keyof Shot) {
  return average(
    shots
      .map((shot) => shot[key])
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value)),
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(`${value}T12:00:00`));
}

function formatFullDate(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T12:00:00`));
}

function getClubMetricConfig(metricKey: ClubMetricKey) {
  return CLUB_METRIC_OPTIONS.find((metric) => metric.key === metricKey) ?? CLUB_METRIC_OPTIONS[1];
}

function formatClubMetricValue(value: number, metric: ClubMetricConfig) {
  const rounded = metric.decimals !== undefined ? round(value, metric.decimals).toFixed(metric.decimals) : Math.round(value).toString();
  return metric.unit ? `${rounded} ${metric.unit}` : rounded;
}

function getClubMetricValue(club: ClubSummary, metricKey: ClubMetricKey) {
  return club[metricKey];
}

function getReferenceMetricValue(stats: ProTourStats, metricKey: ClubMetricKey) {
  return stats[metricKey];
}

function getAmateurMetricValue(club: string, metricKey: ClubMetricKey, tier: "low" | "mid" | "high") {
  const target = CLUB_TARGETS[club] ?? CLUB_TARGETS["7-Iron"];
  const base = target[metricKey];
  const powerMultipliers = {
    low: 1.03,
    mid: 0.9,
    high: 0.76,
  };

  if (metricKey === "smash") {
    const adjustments = { low: 0.02, mid: -0.01, high: -0.05 };
    return Math.max(1, Math.min(1.5, target.smash + adjustments[tier]));
  }

  if (metricKey === "spin") {
    const spinMultipliers = { low: 1, mid: 0.96, high: 0.9 };
    return base * spinMultipliers[tier];
  }

  if (metricKey === "launch") {
    const launchAdjustments = { low: 0, mid: 1, high: 2 };
    return base + launchAdjustments[tier];
  }

  if (metricKey === "descent") {
    const descentAdjustments = { low: 1, mid: 0, high: -3 };
    return base + descentAdjustments[tier];
  }

  return base * powerMultipliers[tier];
}

function getTodayDateString() {
  const today = new Date();
  return new Date(today.getTime() - today.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function makeLastImport(submissionType: LastImport["submissionType"], shots: Shot[], date = getTodayDateString()): LastImport {
  return {
    date,
    facilityName: DEFAULT_FACILITY_NAME,
    simulator: DEFAULT_SIMULATOR,
    submissionType,
    shots,
  };
}

function getSeverityScore(severity: Insight["severity"]) {
  return severity === "high" ? 3 : severity === "medium" ? 2 : 1;
}

function summarizeClubs(sessions: Session[]): ClubSummary[] {
  const shotsByClub = new Map<string, Shot[]>();
  sessions.flatMap((session) => session.shots).forEach((shot) => {
    shotsByClub.set(shot.club, [...(shotsByClub.get(shot.club) ?? []), shot]);
  });

  return CLUB_ORDER.filter((club) => shotsByClub.has(club)).map((club) => {
    const shots = shotsByClub.get(club) ?? [];
    const target = CLUB_TARGETS[club];
    const carry = average(shots.map((shot) => shot.carry));
    const dispersion = standardDeviation(shots.map((shot) => shot.offline));
    const smash = average(shots.map((shot) => shot.smash));
    const launch = average(shots.map((shot) => shot.launch));
    const spin = average(shots.map((shot) => shot.spin));
    const total = average(shots.map((shot) => shot.total));
    const ballSpeed = average(shots.map((shot) => shot.ballSpeed));
    const clubSpeed = average(shots.map((shot) => shot.clubSpeed));
    const proximity = averageMetric(shots, "proximity");
    const apex = averageMetric(shots, "apex");
    const descent = averageMetric(shots, "descent");
    const spinAxis = averageMetric(shots, "spinAxis");
    const faceToPath = averageMetric(shots, "faceToPath");
    const sideCarry = averageMetric(shots, "sideCarry");
    const strikeScore = Math.max(0, 100 - Math.abs((target?.smash ?? 1.4) - smash) * 450);
    const dispersionScore = Math.max(0, 100 - dispersion * 3.4);
    const launchScore = Math.max(0, 100 - Math.abs((target?.launch ?? launch) - launch) * 7);
    const curveScore = Math.max(0, 100 - Math.abs(faceToPath) * 7);

    return {
      club,
      shots: shots.length,
      carry: round(carry),
      dispersion: round(dispersion),
      smash: round(smash, 2),
      launch: round(launch),
      spin: Math.round(spin),
      total: round(total),
      ballSpeed: round(ballSpeed),
      clubSpeed: round(clubSpeed),
      proximity: round(proximity),
      apex: round(apex),
      descent: round(descent),
      spinAxis: round(spinAxis),
      faceToPath: round(faceToPath),
      sideCarry: round(sideCarry),
      quality: Math.round(average([strikeScore, dispersionScore, launchScore, curveScore])),
    };
  });
}

function computeInsights(clubs: ClubSummary[], sessions: Session[]): Insight[] {
  const insights: Insight[] = [];

  clubs.forEach((club) => {
    const target = CLUB_TARGETS[club.club];
    if (!target) return;

    if (club.dispersion > 15) {
      insights.push({
        id: `${club.club}-dispersion`,
        title: "Start-line spread is costing playable misses",
        club: club.club,
        severity: club.dispersion > 19 ? "high" : "medium",
        metric: "Offline spread",
        value: `±${club.dispersion} yd`,
        target: "±12 yd",
        evidence: `${club.club} shots are finishing wide enough to turn solid distance into missed targets.`,
        action: "Run a 20-ball gate test and record face angle after every five shots.",
      });
    }

    if (club.smash < target.smash - 0.035) {
      insights.push({
        id: `${club.club}-strike`,
        title: "Energy transfer is leaking through strike quality",
        club: club.club,
        severity: club.smash < target.smash - 0.06 ? "high" : "medium",
        metric: "Smash factor",
        value: club.smash.toFixed(2),
        target: target.smash.toFixed(2),
        evidence: `Average smash trails the club benchmark, so speed is not becoming ball speed consistently.`,
        action: "Use foot-spray contact mapping for three sets of seven swings.",
      });
    }

    if (club.launch < target.launch - 1.4) {
      insights.push({
        id: `${club.club}-launch`,
        title: "Launch window is too low for reliable carry",
        club: club.club,
        severity: "medium",
        metric: "Launch angle",
        value: `${club.launch}°`,
        target: `${target.launch}°`,
        evidence: `The ball is launching below the expected window, which narrows descent angle and stopping power.`,
        action: "Move ball position half a ball forward and compare 10-shot launch average.",
      });
    }

    if (club.spin > target.spin * 1.14) {
      insights.push({
        id: `${club.club}-spin`,
        title: "Spin is creating extra curvature and ballooning",
        club: club.club,
        severity: "low",
        metric: "Spin rate",
        value: `${club.spin} rpm`,
        target: `${target.spin} rpm`,
        evidence: `Spin is above the working range, especially when contact drifts low on the face.`,
        action: "Track strike height and dynamic loft together during the next block.",
      });
    }
  });

  const recent = sessions.slice(0, 2).flatMap((session) => session.shots);
  const older = sessions.slice(2).flatMap((session) => session.shots);
  if (recent.length && older.length && average(recent.map((shot) => shot.smash)) < average(older.map((shot) => shot.smash)) - 0.015) {
    insights.push({
      id: "trend-smash",
      title: "Recent strike trend is drifting down",
      club: "All clubs",
      severity: "high",
      metric: "Recent smash",
      value: average(recent.map((shot) => shot.smash)).toFixed(2),
      target: average(older.map((shot) => shot.smash)).toFixed(2),
      evidence: "The last two sessions are less efficient than the prior baseline.",
      action: "Start next session with 12 half-speed swings before full-speed work.",
    });
  }

  return insights.sort((a, b) => getSeverityScore(b.severity) - getSeverityScore(a.severity)).slice(0, 7);
}

function parseCsv(text: string): Shot[] {
  const rows = text.trim().split(/\r?\n/).filter(Boolean);
  if (rows.length < 2) return [];
  const normalize = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  const headers = rows[0].split(",").map((header) => normalize(header));
  const read = (cells: string[], names: string[], fallback = 0) => {
    const index = names.map(normalize).map((name) => headers.indexOf(name)).find((match) => match >= 0);
    if (index === undefined || index < 0) return fallback;
    const parsed = Number(cells[index]);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  return rows.slice(1).map((row, index) => {
    const cells = row.split(",").map((cell) => cell.trim());
    const clubIndex = headers.indexOf("club");
    const club = clubIndex >= 0 ? cells[clubIndex] || "7-Iron" : "7-Iron";
    const target = CLUB_TARGETS[club] ?? CLUB_TARGETS["7-Iron"];
    const clubSpeed = read(cells, ["clubSpeed", "club speed", "club speed mph"], target.clubSpeed);
    const ballSpeed = read(cells, ["ballSpeed", "ball speed", "ball speed mph"], target.ballSpeed);
    const sideTotal = read(cells, ["sideTotal", "side total", "side total yards"], 0);
    const offline = read(cells, ["offline", "side", "side total", "side total yards"], sideTotal);

    return {
      id: `csv-${Date.now()}-${index}`,
      club,
      carry: read(cells, ["carry", "carry yards"], target.carry),
      total: read(cells, ["total", "total yards"], read(cells, ["carry", "carry yards"], target.carry) * 1.04),
      ballSpeed,
      clubSpeed,
      smash: read(cells, ["smash", "smash factor"], ballSpeed / clubSpeed),
      launch: read(cells, ["launch", "launch angle"], target.launch),
      spin: Math.round(read(cells, ["spin", "spin rate", "spin rate rpm"], target.spin)),
      offline,
      proximity: read(cells, ["proximity", "proximity feet"], target.proximity),
      apex: read(cells, ["apex", "apex feet"], target.apex),
      spinAxis: read(cells, ["spinAxis", "spin axis"], 0),
      descent: read(cells, ["descent", "descent angle"], target.descent),
      horizontalAngle: read(cells, ["horizontalAngle", "horiz angle", "horizontal angle"], 0),
      faceAngle: read(cells, ["faceAngle", "face angle"], 0),
      clubPath: read(cells, ["clubPath", "club path"], 0),
      faceToPath: read(cells, ["faceToPath", "face to path"], 0),
      sideCarry: read(cells, ["sideCarry", "side carry", "side carry yards"], offline),
      sideTotal: sideTotal || offline,
      shape: offline < -12 ? "Draw" : offline > 12 ? "Fade" : "Straight",
    };
  });
}

function buildImportedSession(shots: Shot[], submissionType: LastImport["submissionType"]): Session {
  const source =
    submissionType === "API feed"
      ? `${DEFAULT_SIMULATOR} API`
      : submissionType === "Photo"
        ? `${DEFAULT_SIMULATOR} Photo Scan`
        : "CSV Upload";

  return {
    id: `import-${Date.now()}`,
    title: `${DEFAULT_SIMULATOR} import`,
    date: getTodayDateString(),
    source,
    focus: "New data",
    shots,
  };
}

function cls(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function makeCoachMessage(role: CoachMessage["role"], content: string): CoachMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role,
    content,
  };
}

function compactShot(shot: Shot) {
  return {
    club: shot.club,
    carry: shot.carry,
    total: shot.total,
    ballSpeed: shot.ballSpeed,
    clubSpeed: shot.clubSpeed,
    smash: shot.smash,
    launch: shot.launch,
    spin: shot.spin,
    spinAxis: shot.spinAxis,
    faceAngle: shot.faceAngle,
    clubPath: shot.clubPath,
    faceToPath: shot.faceToPath,
    sideCarry: shot.sideCarry,
    sideTotal: shot.sideTotal,
    offline: shot.offline,
    shape: shot.shape,
  };
}

function summarizeSessionForCoach(session: Session) {
  const clubs = summarizeClubs([session]);
  return {
    title: session.title,
    date: session.date,
    source: session.source,
    focus: session.focus,
    shotCount: session.shots.length,
    clubs: clubs.map((club) => ({
      club: club.club,
      shots: club.shots,
      carry: club.carry,
      dispersion: club.dispersion,
      smash: club.smash,
      launch: club.launch,
      spin: club.spin,
      faceToPath: club.faceToPath,
      quality: club.quality,
    })),
  };
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [sessions, setSessions] = useState<Session[]>(BASE_SESSIONS);
  const [selectedSessionId, setSelectedSessionId] = useState(BASE_SESSIONS[0].id);
  const [selectedClub, setSelectedClub] = useState("6-Iron");
  const [csvText, setCsvText] = useState(DEMO_CSV);
  const [importMessage, setImportMessage] = useState("Demo CSV loaded");
  const [accountMode, setAccountMode] = useState<AccountMode>("pending");
  const [lastImport, setLastImport] = useState<LastImport>(() => makeLastImport("Photo", parseCsv(DEMO_CSV), DEFAULT_IMPORT_DATE));
  const [userName, setUserName] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState("Choose how you want to use Free Range Golf.");

  const clubs = useMemo(() => summarizeClubs(sessions), [sessions]);
  const insights = useMemo(() => computeInsights(clubs, sessions), [clubs, sessions]);
  const allShots = useMemo(() => sessions.flatMap((session) => session.shots), [sessions]);
  const selectedSession = sessions.find((session) => session.id === selectedSessionId) ?? sessions[0];
  const selectedClubSummary = clubs.find((club) => club.club === selectedClub) ?? clubs[0];
  const activeClub = selectedClubSummary?.club ?? selectedClub;
  const selectedClubShots = allShots.filter((shot) => shot.club === activeClub);
  const avgCarry = selectedClubSummary?.carry ?? round(average(allShots.map((shot) => shot.carry)));
  const avgSmash = selectedClubSummary?.smash ?? round(average(allShots.map((shot) => shot.smash)), 2);
  const avgDispersion = selectedClubSummary?.dispersion ?? round(standardDeviation(allShots.map((shot) => shot.offline)));
  const performanceIndex = Math.round(average(clubs.map((club) => club.quality)));
  const ballCountLabel = `${allShots.length.toLocaleString()} ${allShots.length === 1 ? "ball" : "balls"}`;
  const topInsight = insights[0];

  async function saveUserSessions(nextSessions: Session[]) {
    if (accountMode !== "user") return;

    try {
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessions: nextSessions }),
      });

      if (!response.ok) {
        setSyncStatus("Could not save this update.");
        return;
      }

      setSyncStatus("Saved to your account.");
    } catch {
      setSyncStatus("Could not save this update.");
    }
  }

  async function connectAccount() {
    setSyncStatus("Checking your account...");
    try {
      const response = await fetch("/api/sessions");
      const payload = await response.json();

      if (payload.mode !== "user") {
        setAccountMode("guest");
        setSyncStatus("Using guest mode. Sign-in headers were not available.");
        return;
      }

      const savedSessions = Array.isArray(payload.sessions) && payload.sessions.length ? payload.sessions : sessions;
      setAccountMode("user");
      setUserName(payload.user?.displayName ?? payload.user?.email ?? "Signed-in golfer");
      setSessions(savedSessions);
      setSelectedSessionId(savedSessions[0]?.id ?? BASE_SESSIONS[0].id);
      setSelectedClub(savedSessions[0]?.shots?.[0]?.club ?? "6-Iron");
      setSyncStatus(payload.sessions?.length ? "Loaded your saved sessions." : "Signed in. Demo sessions saved on first import.");

      if (!payload.sessions?.length) {
        await fetch("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessions }),
        });
      }
    } catch {
      setAccountMode("guest");
      setSyncStatus("Using guest mode. Saved history is unavailable right now.");
    }
  }

  function continueAsGuest() {
    setAccountMode("guest");
    setSyncStatus("Guest mode: session changes stay in this browser tab.");
  }

  function importCsv(submissionType: LastImport["submissionType"] = "CSV / Excel") {
    const shots = parseCsv(csvText);
    if (!shots.length) {
      setImportMessage("No rows detected");
      return;
    }
    const nextSession = buildImportedSession(shots, submissionType);
    const nextSessions = [nextSession, ...sessions];
    setSessions(nextSessions);
    setSelectedSessionId(nextSession.id);
    setSelectedClub(shots[0]?.club ?? selectedClub);
    setActiveTab("dashboard");
    setLastImport(makeLastImport(submissionType, shots, nextSession.date));
    setImportMessage(`${shots.length} shots imported from ${submissionType}`);
    void saveUserSessions(nextSessions);
  }

  return (
    <main className="app-shell">
      <aside className="rail" aria-label="Free Range Golf navigation">
        <div className="brand-lockup">
          <div className="brand-logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt="Free Range Golf logo" src="/logos/free-range-golf.png" />
          </div>
          <div>
            <strong>Free Range Golf</strong>
            <span>Sim performance</span>
          </div>
        </div>
        <nav className="rail-nav">
          {NAV_ITEMS.map((item) => (
            <button
              className={cls("rail-button", activeTab === item.id && "active")}
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              title={item.label}
            >
              <span aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="rail-footer">
          <span>Total Balls Struck</span>
          <strong>{ballCountLabel}</strong>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">June performance review</p>
            <h1>{NAV_ITEMS.find((item) => item.id === activeTab)?.label}</h1>
          </div>
          <div className="topbar-actions" aria-label="Session controls">
            <div className={cls("account-pill", accountMode)}>
              <span>{accountMode === "user" ? "Saved" : accountMode === "guest" ? "Guest" : "Not set"}</span>
              <strong>{accountMode === "user" ? userName : syncStatus}</strong>
            </div>
            {accountMode !== "user" && (
              <button className="secondary-action" onClick={connectAccount}>
                Log in
              </button>
            )}
            <button className="icon-button" title="Refresh analysis" onClick={() => setSessions([...sessions])}>
              ↻
            </button>
            <button className="primary-action" onClick={() => setActiveTab("import")}>
              <span>⇧</span>
              Import
            </button>
          </div>
        </header>

        {activeTab === "dashboard" && (
          <DashboardView
            avgCarry={avgCarry}
            avgDispersion={avgDispersion}
            avgSmash={avgSmash}
            clubs={clubs}
            insights={insights}
            performanceIndex={performanceIndex}
            selectedClub={activeClub}
            selectedClubShots={selectedClubShots}
            selectedClubSummary={selectedClubSummary}
            selectedSession={selectedSession}
            sessions={sessions}
            shots={allShots}
            topInsight={topInsight}
            setActiveTab={setActiveTab}
            setSelectedClub={setSelectedClub}
          />
        )}

        {activeTab === "sessions" && (
          <SessionsView
            selectedSession={selectedSession}
            selectedSessionId={selectedSessionId}
            sessions={sessions}
            setActiveTab={setActiveTab}
            setSelectedSessionId={setSelectedSessionId}
          />
        )}

        {activeTab === "clubs" && <ClubsView clubs={clubs} selectedClub={activeClub} />}

        {activeTab === "coach" && (
          <CoachView
            clubs={clubs}
            insights={insights}
            selectedClub={activeClub}
            selectedClubShots={selectedClubShots}
            selectedClubSummary={selectedClubSummary}
            selectedSession={selectedSession}
            sessions={sessions}
          />
        )}

        {activeTab === "practice" && <PracticeView insights={insights} />}

        {activeTab === "import" && (
          <ImportView
            csvText={csvText}
            importCsv={importCsv}
            importMessage={importMessage}
            lastImport={lastImport}
            setCsvText={setCsvText}
          />
        )}
      </section>

      {accountMode === "pending" && (
        <AccountGate connectAccount={connectAccount} continueAsGuest={continueAsGuest} syncStatus={syncStatus} />
      )}
    </main>
  );
}

function DashboardView({
  avgCarry,
  avgDispersion,
  avgSmash,
  clubs,
  insights,
  performanceIndex,
  selectedClub,
  selectedClubShots,
  selectedClubSummary,
  selectedSession,
  sessions,
  setActiveTab,
  setSelectedClub,
  shots,
  topInsight,
}: {
  avgCarry: number;
  avgDispersion: number;
  avgSmash: number;
  clubs: ClubSummary[];
  insights: Insight[];
  performanceIndex: number;
  selectedClub: string;
  selectedClubShots: Shot[];
  selectedClubSummary?: ClubSummary;
  selectedSession: Session;
  sessions: Session[];
  shots: Shot[];
  topInsight?: Insight;
  setActiveTab: (tab: Tab) => void;
  setSelectedClub: (club: string) => void;
}) {
  return (
    <div className="view-stack">
      <section className="control-strip">
        <div>
          <p className="eyebrow">Club selection</p>
          <h2>{selectedClub} view</h2>
          <span>{selectedClubShots.length} shots matched to this club</span>
        </div>
        <label className="select-control">
          <span>Club</span>
          <select value={selectedClub} onChange={(event) => setSelectedClub(event.target.value)}>
            {clubs.map((club) => (
              <option key={club.club} value={club.club}>
                {club.club}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="metric-grid">
        <Kpi club={selectedClub} label="Performance index" metricKey="quality" value={selectedClubSummary?.quality ?? performanceIndex} unit="/100" tone="green" />
        <Kpi club={selectedClub} label="Average carry" metricKey="carry" value={avgCarry} unit="yd" tone="blue" />
        <Kpi club={selectedClub} label="Shot dispersion" metricKey="dispersion" value={`±${avgDispersion}`} unit="yd" tone="amber" />
        <Kpi club={selectedClub} label="Smash factor" metricKey="smash" value={avgSmash.toFixed(2)} unit="avg" tone="coral" />
      </section>

      {selectedClubSummary && (
        <section className="metric-grid detail-grid">
          <Kpi club={selectedClub} label="Ball speed" metricKey="ballSpeed" value={selectedClubSummary.ballSpeed} unit="mph" tone="blue" />
          <Kpi club={selectedClub} label="Club speed" metricKey="clubSpeed" value={selectedClubSummary.clubSpeed} unit="mph" tone="green" />
          <Kpi club={selectedClub} label="Total distance" metricKey="total" value={selectedClubSummary.total} unit="yd" tone="amber" />
          <Kpi club={selectedClub} label="Apex height" metricKey="apex" value={selectedClubSummary.apex} unit="ft" tone="blue" />
          <Kpi club={selectedClub} label="Spin rate" metricKey="spin" value={selectedClubSummary.spin} unit="rpm" tone="coral" />
          <Kpi club={selectedClub} label="Launch angle" metricKey="launch" value={selectedClubSummary.launch} unit="deg" tone="green" />
          <Kpi club={selectedClub} label="Descent angle" metricKey="descent" value={selectedClubSummary.descent} unit="deg" tone="amber" />
          <Kpi club={selectedClub} label="Face to path" metricKey="faceToPath" value={selectedClubSummary.faceToPath} unit="deg" tone="coral" />
        </section>
      )}

      <section className="dashboard-grid comparison-grid">
        <article className="panel">
          <PanelHeader kicker="Selected club detail" title={`${selectedClub} delivery`} meta="Full Swing-style data points" />
          <MetricMatrix summary={selectedClubSummary} />
        </article>
        <article className="panel">
          <PanelHeader kicker="Benchmark guide" title={`${selectedClub} windows`} meta="Hover cards use these targets" />
          <BenchmarkList club={selectedClub} />
        </article>
        <article className="panel">
          <PanelHeader kicker="Pro comparison" title={`${selectedClub} tour stats`} meta="PGA + LPGA reference" />
          <ProStatsList club={selectedClub} />
        </article>
      </section>

      <section className="dashboard-grid">
        <article className="panel panel-large">
          <PanelHeader
            kicker="Shot pattern"
            title={selectedSession.title}
            meta={`${formatDate(selectedSession.date)} · ${selectedSession.source}`}
            action={<button className="text-button" onClick={() => setActiveTab("sessions")}>Sessions</button>}
          />
          <ShotMap shots={selectedSession.shots} />
        </article>

        <article className="panel">
          <PanelHeader kicker="Coach priority" title={topInsight?.club ?? "All clubs"} meta={topInsight?.metric ?? "No urgent flags"} />
          {topInsight ? (
            <div className="priority-card">
              <span className={cls("severity-dot", topInsight.severity)} />
              <h3>{topInsight.title}</h3>
              <dl>
                <div>
                  <dt>Current</dt>
                  <dd>{topInsight.value}</dd>
                </div>
                <div>
                  <dt>Target</dt>
                  <dd>{topInsight.target}</dd>
                </div>
              </dl>
              <p>{topInsight.action}</p>
            </div>
          ) : (
            <EmptyState title="No major coaching flags" body="The current data set is inside the working windows." />
          )}
        </article>

        <article className="panel">
          <PanelHeader kicker="Club ladder" title="Carry gaps" meta={`${clubs.length} clubs tracked`} />
          <GapLadder clubs={clubs} />
        </article>

        <article className="panel panel-large">
          <PanelHeader kicker="Trend line" title="Session quality" meta={`${sessions.length} sessions`} />
          <TrendChart sessions={sessions} />
        </article>

        <article className="panel">
          <PanelHeader kicker="Insights" title="Active flags" meta={`${insights.length} coaching notes`} />
          <InsightList insights={insights.slice(0, 4)} compact />
        </article>

        <article className="panel">
          <PanelHeader kicker="Bag profile" title="Club quality" meta={`${shots.length} shots`} />
          <QualityBars clubs={clubs.slice(0, 6)} />
        </article>
      </section>
    </div>
  );
}

function SessionsView({
  selectedSession,
  selectedSessionId,
  sessions,
  setActiveTab,
  setSelectedSessionId,
}: {
  selectedSession: Session;
  selectedSessionId: string;
  sessions: Session[];
  setActiveTab: (tab: Tab) => void;
  setSelectedSessionId: (id: string) => void;
}) {
  const selectedClubs = summarizeClubs([selectedSession]);

  return (
    <section className="split-view">
      <div className="panel">
        <PanelHeader kicker="Session log" title="Recent sim work" meta={`${sessions.length} sessions`} />
        <div className="session-list">
          {sessions.map((session) => {
            const sessionShots = session.shots;
            const carry = round(average(sessionShots.map((shot) => shot.carry)));
            const dispersion = round(standardDeviation(sessionShots.map((shot) => shot.offline)));
            return (
              <button
                className={cls("session-row", session.id === selectedSessionId && "active")}
                key={session.id}
                onClick={() => setSelectedSessionId(session.id)}
              >
                <span>
                  <strong>{session.title}</strong>
                  <small>{formatDate(session.date)} · {session.source}</small>
                </span>
                <span className="row-metric">{carry} yd</span>
                <span className="row-metric">±{dispersion}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="panel panel-large">
        <PanelHeader
          kicker={selectedSession.focus}
          title={selectedSession.title}
          meta={`${selectedSession.shots.length} shots · ${selectedSession.source}`}
          action={<button className="text-button" onClick={() => setActiveTab("coach")}>Coach notes</button>}
        />
        <ShotMap shots={selectedSession.shots} />
        <div className="club-table compact-table">
          <div className="table-row table-head">
            <span>Club</span>
            <span>Shots</span>
            <span>Carry</span>
            <span>Dispersion</span>
            <span>Smash</span>
          </div>
          {selectedClubs.map((club) => (
            <div className="table-row" key={club.club}>
              <span>{club.club}</span>
              <span>{club.shots}</span>
              <span>{club.carry} yd</span>
              <span>±{club.dispersion}</span>
              <span>{club.smash.toFixed(2)}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ClubsView({ clubs, selectedClub }: { clubs: ClubSummary[]; selectedClub: string }) {
  const [clubMetricKey, setClubMetricKey] = useState<ClubMetricKey>("total");
  const metric = getClubMetricConfig(clubMetricKey);

  return (
    <div className="view-stack">
      <section className="control-strip">
        <div>
          <p className="eyebrow">Club comparison</p>
          <h2>Bag benchmarks</h2>
          <span>Choose a data point below to compare your clubs against amateur and professional benchmarks.</span>
        </div>
      </section>

      <section className="panel">
        <PanelHeader kicker="Bag map" title="Club-by-club performance" meta={`${clubs.length} active clubs`} />
        <div className="club-table">
          <div className="table-row table-head">
            <span>Club</span>
            <span>Shots</span>
            <span>Carry</span>
            <span>Total</span>
            <span>Gap</span>
            <span>Ball speed</span>
            <span>Club speed</span>
            <span>Dispersion</span>
            <span>Launch</span>
            <span>Apex</span>
            <span>Spin</span>
            <span>Quality</span>
          </div>
          {clubs.map((club, index) => {
            const nextClub = clubs[index + 1];
            const gap = nextClub ? round(club.carry - nextClub.carry) : null;
            return (
              <div className={cls("table-row", club.club === selectedClub && "selected-row")} key={club.club}>
                <span>{club.club}</span>
                <span>{club.shots}</span>
                <span>{club.carry} yd</span>
                <span>{club.total} yd</span>
                <span className={cls(gap !== null && (gap < 8 || gap > 18) && "warning-text")}>{gap ? `${gap} yd` : "—"}</span>
                <span>{club.ballSpeed} mph</span>
                <span>{club.clubSpeed} mph</span>
                <span>±{club.dispersion}</span>
                <span>{club.launch}°</span>
                <span>{club.apex} ft</span>
                <span>{club.spin}</span>
                <span>
                  <QualityPill score={club.quality} />
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="club-comparison-grid">
        <article className="panel">
          <PanelHeader
            action={
              <label className="select-control metric-panel-select">
                <span>Data point</span>
                <select value={clubMetricKey} onChange={(event) => setClubMetricKey(event.target.value as ClubMetricKey)}>
                  {CLUB_METRIC_OPTIONS.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            }
            kicker="Your data"
            title={`${metric.label} by club`}
            meta="Driver through wedges"
          />
          <ClubMetricUserTable clubs={clubs} metric={metric} />
        </article>
        <article className="panel">
          <PanelHeader kicker="Typical amateur stats" title="Handicap benchmarks" meta="Low, mid, and high handicap" />
          <AmateurMetricTable clubs={clubs} metric={metric} />
        </article>
        <article className="panel">
          <PanelHeader kicker="Professional stats" title="Tour benchmarks" meta="PGA + LPGA reference" />
          <ProfessionalMetricTable clubs={clubs} metric={metric} />
        </article>
      </section>
    </div>
  );
}

function ClubMetricUserTable({ clubs, metric }: { clubs: ClubSummary[]; metric: ClubMetricConfig }) {
  const maxValue = Math.max(...clubs.map((club) => getClubMetricValue(club, metric.key)), 1);

  return (
    <div className="metric-table">
      <div className="metric-table-row metric-table-head">
        <span>Club</span>
        <span>Your {metric.shortLabel}</span>
        <span>Vs mid HCP</span>
      </div>
      {clubs.map((club) => {
        const value = getClubMetricValue(club, metric.key);
        const midBenchmark = getAmateurMetricValue(club.club, metric.key, "mid");
        const delta = value - midBenchmark;
        const deltaLabel = `${delta >= 0 ? "+" : ""}${formatClubMetricValue(delta, metric)}`;

        return (
          <div className="metric-table-row metric-user-row" key={club.club}>
            <span>{club.club}</span>
            <span>
              <strong>{formatClubMetricValue(value, metric)}</strong>
              <i style={{ width: `${Math.max(8, (value / maxValue) * 100)}%` }} />
            </span>
            <span className={cls("metric-delta", delta >= 0 ? "positive" : "negative")}>{deltaLabel}</span>
          </div>
        );
      })}
    </div>
  );
}

function AmateurMetricTable({ clubs, metric }: { clubs: ClubSummary[]; metric: ClubMetricConfig }) {
  const tiers: Array<{ key: "low" | "mid" | "high"; label: string }> = [
    { key: "low", label: "0-5" },
    { key: "mid", label: "6-15" },
    { key: "high", label: "16+" },
  ];

  return (
    <div className="metric-table comparison-table">
      <div className="metric-table-row metric-table-head">
        <span>Club</span>
        {tiers.map((tier) => (
          <span key={tier.key}>{tier.label}</span>
        ))}
      </div>
      {clubs.map((club) => (
        <div className="metric-table-row" key={club.club}>
          <span>{club.club}</span>
          {tiers.map((tier) => (
            <span key={tier.key}>{formatClubMetricValue(getAmateurMetricValue(club.club, metric.key, tier.key), metric)}</span>
          ))}
        </div>
      ))}
    </div>
  );
}

function ProfessionalMetricTable({ clubs, metric }: { clubs: ClubSummary[]; metric: ClubMetricConfig }) {
  return (
    <div className="metric-table comparison-table pro-comparison-table">
      <div className="metric-table-row metric-table-head">
        <span>Club</span>
        <span>PGA</span>
        <span>LPGA</span>
      </div>
      {clubs.map((club) => {
        const reference = PRO_REFERENCE_STATS[club.club] ?? PRO_REFERENCE_STATS["7-Iron"];
        return (
          <div className="metric-table-row" key={club.club}>
            <span>{club.club}</span>
            <span>{formatClubMetricValue(getReferenceMetricValue(reference.pga, metric.key), metric)}</span>
            <span>{formatClubMetricValue(getReferenceMetricValue(reference.lpga, metric.key), metric)}</span>
          </div>
        );
      })}
    </div>
  );
}

function CoachView({
  clubs,
  insights,
  selectedClub,
  selectedClubShots,
  selectedClubSummary,
  selectedSession,
  sessions,
}: {
  clubs: ClubSummary[];
  insights: Insight[];
  selectedClub: string;
  selectedClubShots: Shot[];
  selectedClubSummary?: ClubSummary;
  selectedSession: Session;
  sessions: Session[];
}) {
  const [coachInput, setCoachInput] = useState("");
  const [coachStatus, setCoachStatus] = useState("Ready");
  const [coachMessages, setCoachMessages] = useState<CoachMessage[]>([
    makeCoachMessage(
      "assistant",
      "I’m MatRat AI. Pick a club or ask what to fix first, and I’ll turn the numbers into one clear swing priority, one drill, and one next-swing feel.",
    ),
  ]);

  const quickPrompts = [
    `What should I fix first with my ${selectedClub}?`,
    "Explain my face-to-path in plain English.",
    "Give me one drill for my next practice block.",
    "Am I losing more distance or control?",
  ];

  const selectedSessionShots = selectedSession.shots
    .filter((shot) => shot.club === selectedClub)
    .slice(-18);
  const contextShots = selectedSessionShots.length ? selectedSessionShots : selectedClubShots.slice(-18);

  async function askCoach(questionOverride?: string) {
    const question = (questionOverride ?? coachInput).trim();
    if (!question) return;

    const nextMessages = [...coachMessages, makeCoachMessage("user", question)];
    setCoachMessages(nextMessages);
    setCoachInput("");
    setCoachStatus("Reading your session...");

    const coachContext = {
      selectedClub,
      selectedClubSummary,
      selectedSession: summarizeSessionForCoach(selectedSession),
      recentSessions: sessions.slice(0, 5).map(summarizeSessionForCoach),
      bagSummary: clubs,
      activeFindings: insights.slice(0, 6),
      recentShots: contextShots.map(compactShot),
      coachPreferences: {
        brand: "MatRat AI",
        feedbackStyle: "plain English, focused, feel-based, no swing overhaul",
        outputGoal: "one priority, one drill, one measurable target, one follow-up question when useful",
      },
    };

    try {
      const response = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          messages: nextMessages.slice(-6).map((message) => ({ role: message.role, content: message.content })),
          context: coachContext,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "MatRat AI could not answer right now.");
      }

      setCoachMessages((current) => [
        ...current,
        makeCoachMessage("assistant", payload.answer ?? "MatRat AI did not return a readable answer."),
      ]);
      setCoachStatus(payload.mode === "setup" ? "API key needed" : "Answered");
    } catch (error) {
      setCoachMessages((current) => [
        ...current,
        makeCoachMessage("assistant", error instanceof Error ? error.message : "MatRat AI could not answer right now."),
      ]);
      setCoachStatus("Needs attention");
    }
  }

  return (
    <section className="coach-layout">
      <article className="panel coach-chat-panel">
        <PanelHeader kicker="MatRat AI coach" title={`${selectedClub} conversation`} meta={coachStatus} />

        <div className="chat-transcript" aria-live="polite">
          {coachMessages.map((message) => (
            <div className={cls("chat-message", message.role)} key={message.id}>
              <span>{message.role === "assistant" ? "MatRat AI" : "You"}</span>
              <p>{message.content}</p>
            </div>
          ))}
        </div>

        <div className="quick-prompt-row" aria-label="Coach question shortcuts">
          {quickPrompts.map((prompt) => (
            <button className="quick-prompt" key={prompt} onClick={() => void askCoach(prompt)}>
              {prompt}
            </button>
          ))}
        </div>

        <form
          className="coach-composer"
          onSubmit={(event) => {
            event.preventDefault();
            void askCoach();
          }}
        >
          <textarea
            aria-label="Ask MatRat AI"
            onChange={(event) => setCoachInput(event.target.value)}
            placeholder={`Ask about your ${selectedClub} misses, distance gaps, or next drill`}
            value={coachInput}
          />
          <button className="primary-action" type="submit">
            Ask coach
          </button>
        </form>
      </article>

      <aside className="coach-side-panel">
        <article className="panel">
          <PanelHeader kicker="Context sent" title={selectedClub} meta={`${contextShots.length} recent shots`} />
          {selectedClubSummary ? (
            <div className="coach-context-grid">
              <div>
                <span>Carry</span>
                <strong>{selectedClubSummary.carry} yd</strong>
              </div>
              <div>
                <span>Smash</span>
                <strong>{selectedClubSummary.smash.toFixed(2)}</strong>
              </div>
              <div>
                <span>Face to path</span>
                <strong>{selectedClubSummary.faceToPath}°</strong>
              </div>
              <div>
                <span>Dispersion</span>
                <strong>±{selectedClubSummary.dispersion} yd</strong>
              </div>
            </div>
          ) : (
            <EmptyState title="No club data" body="Choose a club with shots before asking MatRat AI." />
          )}
        </article>

        <article className="panel">
          <PanelHeader kicker="Active findings" title="What MatRat sees" meta={`${insights.length} flags`} />
          <InsightList insights={insights.slice(0, 3)} compact />
        </article>
      </aside>
    </section>
  );
}

function PracticeView({ insights }: { insights: Insight[] }) {
  const priority = insights[0];
  const practiceBlocks = [
    {
      time: "10 min",
      title: "Calibration",
      body: "Half-speed swings with face tape, then record launch and smash only.",
      metric: "Contact cluster",
    },
    {
      time: "20 min",
      title: priority?.club === "Driver" ? "Start-line gate" : "Carry window ladder",
      body: priority?.action ?? "Alternate target yardages and keep dispersion inside the working window.",
      metric: priority?.metric ?? "Dispersion",
    },
    {
      time: "15 min",
      title: "Transfer set",
      body: "Randomize clubs and commit to one target before stepping into each ball.",
      metric: "Decision quality",
    },
  ];

  return (
    <section className="practice-board">
      <div className="panel panel-large">
        <PanelHeader
          kicker="Next session"
          title={priority ? priority.title : "Maintenance block"}
          meta={priority ? `${priority.club} · ${priority.metric}` : "Balanced practice"}
        />
        <div className="practice-track">
          {practiceBlocks.map((block, index) => (
            <article className="practice-step" key={block.title}>
              <span className="step-index">{index + 1}</span>
              <div>
                <small>{block.time}</small>
                <h3>{block.title}</h3>
                <p>{block.body}</p>
                <strong>{block.metric}</strong>
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="panel">
        <PanelHeader kicker="Targets" title="Session scorecard" meta="Track after each block" />
        <div className="scorecard-list">
          {["Start line inside 12 yd", "Smash within 0.03 band", "Carry window inside 8 yd", "One note after each club"].map((item) => (
            <label key={item} className="check-row">
              <input type="checkbox" />
              <span>{item}</span>
            </label>
          ))}
        </div>
      </div>
    </section>
  );
}

function ImportView({
  csvText,
  importCsv,
  importMessage,
  lastImport,
  setCsvText,
}: {
  csvText: string;
  importCsv: (submissionType?: LastImport["submissionType"]) => void;
  importMessage: string;
  lastImport: LastImport;
  setCsvText: (value: string) => void;
}) {
  const [importMode, setImportMode] = useState<"api" | "file" | "photo">("api");

  return (
    <section className="import-grid">
      <div className="panel panel-large">
        <PanelHeader kicker="Import" title="Add simulator data" meta={importMessage} />
        <div className="import-mode-grid">
          {[
            { id: "api", label: "API feed", body: "Connect TrackMan, Full Swing, GCQuad, SkyTrak, or Mevo+." },
            { id: "file", label: "CSV / Excel", body: "Paste exported rows or upload a file from your simulator." },
            { id: "photo", label: "Session photos", body: "Upload screenshots like your Full Swing shot-history screens." },
          ].map((mode) => (
            <button
              className={cls("import-mode", importMode === mode.id && "active")}
              key={mode.id}
              onClick={() => setImportMode(mode.id as "api" | "file" | "photo")}
            >
              <strong>{mode.label}</strong>
              <span>{mode.body}</span>
            </button>
          ))}
        </div>

        {importMode === "api" && (
          <div className="import-panel">
            <div className="connection-grid">
              {SIMULATOR_SOURCES.map((source) => (
                <button className={cls("source-tile", source.tone === "dark" && "dark-logo")} key={source.label}>
                  <span className="source-logo">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img alt={`${source.label} logo`} src={source.logo} />
                  </span>
                  <strong>{source.label}</strong>
                </button>
              ))}
            </div>
            <p className="muted-copy">API feed is staged as a connection path; imported sessions will save automatically after sign-in.</p>
          </div>
        )}

        {importMode === "file" && (
          <div className="import-panel">
            <input className="file-input" type="file" accept=".csv,.xlsx,.xls" />
            <textarea
              className="csv-input"
              value={csvText}
              onChange={(event) => setCsvText(event.target.value)}
              spellCheck={false}
            />
            <div className="button-row">
              <button className="secondary-action" onClick={() => setCsvText(DEMO_CSV)}>Load Full Swing demo rows</button>
              <button className="primary-action" onClick={() => importCsv("CSV / Excel")}>
                <span>⇧</span>
                Analyze rows
              </button>
            </div>
          </div>
        )}

        {importMode === "photo" && (
          <div className="import-panel">
            <input className="file-input" type="file" accept="image/*" multiple />
            <div className="photo-drop">
              <strong>Photo scan ready</strong>
              <span>Upload shot-history or shot-dispersion screenshots. The current Full Swing sample maps proximity, carry, total, ball speed, club speed, smash, apex, spin, spin axis, launch, descent, face angle, club path, face-to-path, side carry, and side total.</span>
            </div>
            <div className="button-row">
              <button className="primary-action" onClick={() => importCsv("Photo")}>Use Full Swing sample</button>
            </div>
          </div>
        )}
      </div>

      <LastImportPanel lastImport={lastImport} />
    </section>
  );
}

function LastImportPanel({ lastImport }: { lastImport: LastImport }) {
  const detailRows = [
    ["Date", formatFullDate(lastImport.date)],
    ["Facility Name", lastImport.facilityName],
    ["Sim", lastImport.simulator],
    ["Submission type", lastImport.submissionType],
  ];
  const averageRows = [
    ["Shots", `${lastImport.shots.length}`],
    ["Carry", `${round(averageMetric(lastImport.shots, "carry"))} yd`],
    ["Total", `${round(averageMetric(lastImport.shots, "total"))} yd`],
    ["Ball speed", `${round(averageMetric(lastImport.shots, "ballSpeed"))} mph`],
    ["Club speed", `${round(averageMetric(lastImport.shots, "clubSpeed"), 1)} mph`],
    ["Smash", averageMetric(lastImport.shots, "smash").toFixed(2)],
    ["Launch", `${round(averageMetric(lastImport.shots, "launch"), 1)} deg`],
    ["Spin", `${Math.round(averageMetric(lastImport.shots, "spin"))} rpm`],
    ["Descent", `${round(averageMetric(lastImport.shots, "descent"), 1)} deg`],
  ];

  return (
    <div className="panel import-summary-panel">
      <PanelHeader kicker="Last import" title={lastImport.facilityName} meta={`${lastImport.simulator} · ${lastImport.shots.length} shots`} />
      <dl className="import-detail-list">
        {detailRows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <div className="import-average-heading">
        <span>Average stats</span>
      </div>
      <div className="benchmark-list import-average-list">
        {averageRows.map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function Kpi({
  club,
  label,
  metricKey,
  value,
  unit,
  tone,
}: {
  club: string;
  label: string;
  metricKey: string;
  value: number | string;
  unit: string;
  tone: "green" | "blue" | "amber" | "coral";
}) {
  const definition = METRIC_DEFINITIONS[metricKey];

  return (
    <article className={cls("kpi", tone)} tabIndex={0}>
      <span>{label}</span>
      <strong>
        {value}
        <small>{unit}</small>
      </strong>
      {definition && (
        <div className="metric-tooltip" role="tooltip">
          <b>{definition.title}</b>
          <p>{definition.description}</p>
          <em>{definition.benchmark(club)}</em>
        </div>
      )}
    </article>
  );
}

function MetricMatrix({ summary }: { summary?: ClubSummary }) {
  if (!summary) return <EmptyState title="No club selected" body="Choose a club to inspect its delivery numbers." />;

  const rows = [
    ["Proximity", `${summary.proximity} ft`],
    ["Spin axis", `${summary.spinAxis} deg`],
    ["Side carry", `${summary.sideCarry} yd`],
    ["Face to path", `${summary.faceToPath} deg`],
    ["Apex", `${summary.apex} ft`],
    ["Descent", `${summary.descent} deg`],
  ];

  return (
    <div className="metric-matrix">
      {rows.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}

function BenchmarkList({ club }: { club: string }) {
  const target = CLUB_TARGETS[club] ?? CLUB_TARGETS["7-Iron"];
  const rows = [
    ["Carry", `${target.carry} yd`],
    ["Ball speed", `${target.ballSpeed} mph`],
    ["Club speed", `${target.clubSpeed} mph`],
    ["Launch", `${target.launch} deg`],
    ["Spin", `${target.spin} rpm`],
    ["Descent", `${target.descent} deg`],
  ];

  return (
    <div className="benchmark-list">
      {rows.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}

function ProStatsList({ club }: { club: string }) {
  const reference = PRO_REFERENCE_STATS[club] ?? PRO_REFERENCE_STATS["7-Iron"];
  const tours = [
    { label: "PGA Tour avg", stats: reference.pga },
    { label: "LPGA Tour avg", stats: reference.lpga },
  ];

  return (
    <div className="pro-stat-list">
      {tours.map(({ label, stats }) => {
        const rows = [
          ["Ball speed", `${stats.ballSpeed} mph`],
          ["Club speed", `${stats.clubSpeed} mph`],
          ["Launch", `${stats.launch} deg`],
          ["Spin", `${stats.spin} rpm`],
          ["Descent", `${stats.descent} deg`],
          ["Total", `${stats.total} yd`],
        ];

        return (
          <article className="pro-stat-card" key={label}>
            <header>
              <span>{label}</span>
              <strong>{stats.carry} yd</strong>
              <small>carry</small>
            </header>
            <div className="pro-stat-grid">
              {rows.map(([name, value]) => (
                <div key={name}>
                  <span>{name}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
          </article>
        );
      })}
      <p className="pro-stat-note">Use these as reference points, not requirements. Speed profile, age, contact, and shot intent all change the right target.</p>
    </div>
  );
}

function AccountGate({
  connectAccount,
  continueAsGuest,
  syncStatus,
}: {
  connectAccount: () => void;
  continueAsGuest: () => void;
  syncStatus: string;
}) {
  return (
    <div className="account-overlay">
      <section className="account-modal">
        <div>
          <p className="eyebrow">Welcome to Free Range Golf</p>
          <h2>Save sessions or keep it temporary.</h2>
          <span>{syncStatus}</span>
        </div>
        <div className="account-choice-grid">
          <button className="account-choice primary-choice" onClick={connectAccount}>
            <strong>Log in and save history</strong>
            <span>Use your signed-in workspace account to keep previous simulator sessions.</span>
          </button>
          <button className="account-choice" onClick={continueAsGuest}>
            <strong>Continue as guest</strong>
            <span>Explore the dashboard without saving data after you leave.</span>
          </button>
        </div>
      </section>
    </div>
  );
}

function PanelHeader({
  action,
  kicker,
  meta,
  title,
}: {
  action?: React.ReactNode;
  kicker: string;
  meta?: string;
  title: string;
}) {
  return (
    <div className="panel-header">
      <div>
        <p>{kicker}</p>
        <h2>{title}</h2>
        {meta && <span>{meta}</span>}
      </div>
      {action}
    </div>
  );
}

function ShotMap({ shots }: { shots: Shot[] }) {
  const maxCarry = Math.max(...shots.map((shot) => shot.carry), 1);
  const minCarry = Math.min(...shots.map((shot) => shot.carry), 0);
  const clubNames = Array.from(new Set(shots.map((shot) => shot.club))).slice(0, 6);

  return (
    <div className="shot-map">
      <svg viewBox="0 0 760 360" role="img" aria-label="Shot dispersion chart">
        <defs>
          <linearGradient id="fairway" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#e3f7ec" />
            <stop offset="100%" stopColor="#d8ecff" />
          </linearGradient>
        </defs>
        <rect x="24" y="18" width="712" height="314" rx="8" fill="url(#fairway)" />
        <path d="M380 40 C438 92 462 170 430 322" fill="none" stroke="#ffffff" strokeWidth="72" strokeLinecap="round" opacity="0.62" />
        <path d="M380 40 C438 92 462 170 430 322" fill="none" stroke="#34a853" strokeWidth="2" strokeDasharray="8 8" opacity="0.65" />
        {[0, 1, 2, 3].map((line) => (
          <line key={line} x1={92 + line * 174} x2={92 + line * 174} y1="28" y2="322" stroke="#ffffff" strokeWidth="1" opacity="0.85" />
        ))}
        {[0, 1, 2].map((line) => (
          <line key={line} x1="36" x2="724" y1={92 + line * 78} y2={92 + line * 78} stroke="#ffffff" strokeWidth="1" opacity="0.85" />
        ))}
        {shots.map((shot, index) => {
          const x = 380 + shot.offline * 7.2;
          const y = 306 - ((shot.carry - minCarry) / Math.max(1, maxCarry - minCarry)) * 242;
          const clubIndex = clubNames.indexOf(shot.club);
          return (
            <circle
              cx={Math.max(44, Math.min(716, x))}
              cy={Math.max(42, Math.min(312, y))}
              fill={["#177245", "#1769aa", "#d97706", "#d84a4a", "#7c3aed", "#0f766e"][clubIndex] ?? "#177245"}
              key={shot.id}
              opacity="0.82"
              r={index % 3 === 0 ? 5.4 : 4.4}
            />
          );
        })}
      </svg>
      <div className="map-legend">
        {clubNames.map((club, index) => (
          <span key={club}>
            <i style={{ background: ["#177245", "#1769aa", "#d97706", "#d84a4a", "#7c3aed", "#0f766e"][index] }} />
            {club}
          </span>
        ))}
      </div>
    </div>
  );
}

function GapLadder({ clubs, extended = false }: { clubs: ClubSummary[]; extended?: boolean }) {
  const maxCarry = Math.max(...clubs.map((club) => club.carry), 1);

  return (
    <div className="gap-list">
      {clubs.slice(0, extended ? clubs.length : 7).map((club, index) => {
        const nextClub = clubs[index + 1];
        const gap = nextClub ? round(club.carry - nextClub.carry) : null;
        return (
          <div className="gap-row" key={club.club}>
            <div>
              <strong>{club.club}</strong>
              <span>{club.carry} yd</span>
            </div>
            <div className="gap-track">
              <i style={{ width: `${Math.max(12, (club.carry / maxCarry) * 100)}%` }} />
            </div>
            <em className={cls(gap !== null && (gap < 8 || gap > 18) && "flagged")}>{gap ? `${gap} yd` : "top"}</em>
          </div>
        );
      })}
    </div>
  );
}

function TrendChart({ sessions }: { sessions: Session[] }) {
  const points = [...sessions].reverse().map((session) => {
    const clubs = summarizeClubs([session]);
    return {
      label: formatDate(session.date),
      quality: Math.round(average(clubs.map((club) => club.quality))),
    };
  });
  const width = 720;
  const height = 220;
  const plotted = points.map((point, index) => {
    const x = 42 + (index / Math.max(1, points.length - 1)) * (width - 84);
    const y = height - 34 - (point.quality / 100) * (height - 68);
    return { ...point, x, y };
  });
  const path = plotted.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");

  return (
    <div className="trend-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Session quality trend">
        {[25, 50, 75].map((line) => {
          const y = height - 34 - (line / 100) * (height - 68);
          return <line key={line} x1="34" x2={width - 28} y1={y} y2={y} stroke="#d8e1ea" strokeWidth="1" />;
        })}
        <path d={path} fill="none" stroke="#177245" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        {plotted.map((point) => (
          <g key={point.label}>
            <circle cx={point.x} cy={point.y} r="6" fill="#ffffff" stroke="#177245" strokeWidth="3" />
            <text x={point.x} y={height - 10} textAnchor="middle" fill="#607083" fontSize="12">{point.label}</text>
            <text x={point.x} y={point.y - 12} textAnchor="middle" fill="#1f2b37" fontSize="12" fontWeight="700">{point.quality}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function InsightList({ compact = false, insights }: { compact?: boolean; insights: Insight[] }) {
  if (!insights.length) return <EmptyState title="Clean report" body="No active alerts from this data set." />;

  return (
    <div className={cls("insight-list", compact && "compact")}>
      {insights.map((insight) => (
        <article className="insight-card" key={insight.id}>
          <div className="insight-topline">
            <span className={cls("severity-pill", insight.severity)}>{insight.severity}</span>
            <strong>{insight.club}</strong>
          </div>
          <h3>{insight.title}</h3>
          {!compact && <p>{insight.evidence}</p>}
          <dl>
            <div>
              <dt>{insight.metric}</dt>
              <dd>{insight.value}</dd>
            </div>
            <div>
              <dt>Target</dt>
              <dd>{insight.target}</dd>
            </div>
          </dl>
          <small>{insight.action}</small>
        </article>
      ))}
    </div>
  );
}

function QualityBars({ clubs }: { clubs: ClubSummary[] }) {
  return (
    <div className="quality-list">
      {clubs.map((club) => (
        <div className="quality-row" key={club.club}>
          <span>{club.club}</span>
          <div>
            <i style={{ width: `${club.quality}%` }} />
          </div>
          <strong>{club.quality}</strong>
        </div>
      ))}
    </div>
  );
}

function QualityPill({ score }: { score: number }) {
  return <span className={cls("quality-pill", score >= 80 ? "good" : score >= 68 ? "ok" : "work")}>{score}</span>;
}

function EmptyState({ body, title }: { body: string; title: string }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <span>{body}</span>
    </div>
  );
}
