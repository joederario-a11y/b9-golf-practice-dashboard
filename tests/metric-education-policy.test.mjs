import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

import {
  buildMetricEducationCards,
  getMetricEducationContent,
  METRIC_EDUCATION_VIDEO_PRELOAD,
  metricEducationHasVideo,
  SMASH_FACTOR_VIDEO,
} from "../lib/metric-education-policy.mjs";

const smashMetric = {
  aimFor: "Approximately 1.43 for this club window.",
  compare: "Player window: target 1.43.",
  decimals: 2,
  description: "How efficiently your club speed becomes ball speed.",
  howToImprove: "Use foot spray or impact tape.",
  id: "smash",
  label: "Smash Factor",
  meaning: "Your contact efficiency is 1.34.",
  rawValue: 1.34,
  status: "Leaking speed",
  tone: "needs-work",
  unit: "",
  value: "1.34",
  visual: "energy",
  what: "Smash factor is ball speed divided by club speed.",
};

test("metric education renders exactly four explanation cards", () => {
  const content = getMetricEducationContent(smashMetric);
  const cards = buildMetricEducationCards(content);

  assert.equal(cards.length, 4);
  assert.deepEqual(cards.map((card) => card.title), [
    "What is it?",
    "What does my number mean?",
    "What should I aim for?",
    "How can I improve it?",
  ]);
});

test("comparison context is folded into the meaning card", () => {
  const content = getMetricEducationContent(smashMetric);
  const cards = buildMetricEducationCards(content);
  const meaning = cards.find((card) => card.id === "meaning");

  assert.ok(meaning.body.includes("Player window: target 1.43."));
  assert.equal(cards.some((card) => card.title === "How do I compare?"), false);
});

test("only configured metrics expose a video", () => {
  const smashContent = getMetricEducationContent(smashMetric);
  const clubSpeedContent = getMetricEducationContent({
    ...smashMetric,
    id: "clubSpeed",
    label: "Club Speed",
  });

  assert.equal(metricEducationHasVideo(smashContent), true);
  assert.equal(smashContent.video.src, "/videos/metrics/smash-factor.mp4");
  assert.equal(smashContent.video.poster, "/videos/metrics/smash-factor-poster.jpg");
  assert.equal(smashContent.video.title, "Why Smash Factor Matters");
  assert.equal(smashContent.video.durationLabel, "1:00");
  assert.equal(metricEducationHasVideo(clubSpeedContent), false);
  assert.equal(clubSpeedContent.video, undefined);
});

test("metric video preload policy does not use full preload", () => {
  assert.equal(METRIC_EDUCATION_VIDEO_PRELOAD, "metadata");
  assert.notEqual(METRIC_EDUCATION_VIDEO_PRELOAD, "auto");
});

test("dashboard component includes modal accessibility and close behavior", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(source, /MetricEducationPanel/);
  assert.match(source, /MetricVideoThumbnail/);
  assert.match(source, /role="dialog"/);
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /event\.key === "Escape"/);
  assert.match(source, /player\.pause\(\)/);
  assert.match(source, /player\.currentTime = 0/);
  assert.match(source, /document\.body\.style\.overflow = "hidden"/);
  assert.match(source, /triggerRef\.current\?\.focus\(\)/);
  assert.match(source, /<track/);
  assert.doesNotMatch(source, /<span>How do I compare\?<\/span>/);
});

test("dashboard CSS defines desktop video rail and mobile stacking", async () => {
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(styles, /\.dashboard-metric-detail\.has-video\s*{\s*grid-template-columns: minmax\(0, 1\.9fr\) minmax\(260px, 0\.9fr\)/);
  assert.match(styles, /\.metric-education-card-grid\s*{\s*display: grid;\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(styles, /\.metric-video-thumbnail\s*{[^}]*aspect-ratio: 9 \/ 16/s);
  assert.match(styles, /@media \(max-width: 760px\)[\s\S]*\.metric-education-card-grid\s*{\s*grid-template-columns: 1fr/);
  assert.match(styles, /\.metric-video-player\s*{[^}]*object-fit: contain/s);
});

test("smash factor video and portrait poster assets exist", async () => {
  const [video, poster] = await Promise.all([
    stat(new URL("../public/videos/metrics/smash-factor.mp4", import.meta.url)),
    stat(new URL("../public/videos/metrics/smash-factor-poster.jpg", import.meta.url)),
  ]);

  assert.ok(video.size > 1_000_000);
  assert.ok(poster.size > 10_000);
  assert.equal(SMASH_FACTOR_VIDEO.src, "/videos/metrics/smash-factor.mp4");
});
