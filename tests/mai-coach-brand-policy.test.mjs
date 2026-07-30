import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");

function readSource(filePath) {
  return fs.readFileSync(path.join(root, filePath), "utf8");
}

function assertIncludes(source, value) {
  assert.ok(source.includes(value), `Expected source to include ${value}`);
}

function pngSize(filePath) {
  const buffer = fs.readFileSync(path.join(root, filePath));
  return {
    height: buffer.readUInt32BE(20),
    width: buffer.readUInt32BE(16),
  };
}

const brandAssets = {
  "/brand/mai-coach/mai-coach-logo-horizontal-dark-v3.png": [1248, 339],
  "/brand/mai-coach/mai-coach-logo-horizontal-light-v3.png": [1248, 339],
  "/brand/mai-coach/mai-coach-logo-horizontal-no-tagline-dark-v3.png": [1140, 230],
  "/brand/mai-coach/mai-coach-logo-horizontal-no-tagline-light-v3.png": [1140, 230],
  "/brand/mai-coach/mai-coach-logo-compact-v3.png": [792, 164],
  "/brand/mai-coach/mai-coach-logo-email-v3.png": [676, 142],
  "/brand/mai-coach/mai-coach-mark-v3.png": [640, 640],
  "/brand/mai-coach/mai-coach-social-1200x630-v3.png": [1200, 630],
  "/brand/mai-coach/mai-coach-favicon-16-v3.png": [16, 16],
  "/brand/mai-coach/mai-coach-favicon-32-v3.png": [32, 32],
  "/brand/mai-coach/mai-coach-favicon-48-v3.png": [48, 48],
  "/brand/mai-coach/mai-coach-apple-touch-icon-v3.png": [180, 180],
  "/brand/mai-coach/mai-coach-pwa-192-v3.png": [192, 192],
  "/brand/mai-coach/mai-coach-pwa-512-v3.png": [512, 512],
  "/brand/mai-coach/mai-coach-maskable-512-v3.png": [512, 512],
};

test("new MAI Coach production logo assets exist with expected dimensions", () => {
  for (const [publicPath, [width, height]] of Object.entries(brandAssets)) {
    const filePath = `public${publicPath}`;
    assert.ok(fs.existsSync(path.join(root, filePath)), `${filePath} should exist`);
    assert.deepEqual(pngSize(filePath), { width, height });
  }
});

test("central BrandLogo component owns every logo variant", () => {
  const source = readSource("components/brand/mai-coach-logo.tsx");

  assertIncludes(source, "export type BrandLogoVariant");
  for (const publicPath of Object.keys(brandAssets).filter((value) => !value.includes("favicon") && !value.includes("pwa") && !value.includes("apple") && !value.includes("maskable") && !value.includes("social"))) {
    assertIncludes(source, publicPath);
  }
  assertIncludes(source, "MAI Coach — AI Golf Coaching");
  assertIncludes(source, "fullLight");
  assertIncludes(source, "compactLight");
  assertIncludes(source, "objectFit: \"contain\"");
});

test("app chrome, auth, onboarding, setup, practice, and challenge surfaces use the new brand component", () => {
  const pageSource = readSource("app/page.tsx");
  const setupSource = readSource("app/setup-account/page.tsx");
  const practiceSource = readSource("app/practice/[practiceAssignmentId]/page.tsx");
  const challengeSource = readSource("app/challenges/[challengeId]/page.tsx");
  const cssSource = readSource("app/globals.css");

  assertIncludes(pageSource, "MaiCoachLogoCompact");
  assertIncludes(pageSource, "sidebar-brand-logo");
  assertIncludes(pageSource, "MaiCoachLogoFull className=\"onboarding-logo-full\"");
  assertIncludes(pageSource, "MaiCoachLogoFull className=\"auth-modal-logo\"");
  assertIncludes(pageSource, "MaiCoachLogoMark className=\"auth-modal-mark\"");
  assertIncludes(pageSource, "MaiCoachLogoFull className=\"account-logo-full\"");
  assertIncludes(setupSource, "MaiCoachLogoFull className=\"setup-account-logo\"");
  assertIncludes(practiceSource, "MaiCoachLogoFull className=\"brand-lockup\"");
  assertIncludes(challengeSource, "MaiCoachLogoFull className=\"brand-lockup\"");
  assert.match(cssSource, /\.sidebar-brand-logo\s*\{[\s\S]*object-fit: contain/);
  assert.match(cssSource, /\.brand-logo\s*\{[\s\S]*background: #07110d/);
});

test("metadata, favicon, PWA, and Open Graph references use versioned new assets", () => {
  const layoutSource = readSource("app/layout.tsx");
  const manifestSource = readSource("public/manifest.webmanifest");

  assertIncludes(layoutSource, "/brand/mai-coach/mai-coach-social-1200x630-v3.png");
  assertIncludes(layoutSource, "/brand/mai-coach/mai-coach-favicon-16-v3.png");
  assertIncludes(layoutSource, "/brand/mai-coach/mai-coach-favicon-32-v3.png");
  assertIncludes(layoutSource, "/brand/mai-coach/mai-coach-favicon-48-v3.png");
  assertIncludes(layoutSource, "/brand/mai-coach/mai-coach-apple-touch-icon-v3.png");
  assertIncludes(manifestSource, "/brand/mai-coach/mai-coach-pwa-192-v3.png");
  assertIncludes(manifestSource, "/brand/mai-coach/mai-coach-pwa-512-v3.png");
  assertIncludes(manifestSource, "/brand/mai-coach/mai-coach-maskable-512-v3.png");
});

test("email templates use public logo URL, semantic text fallback, and branded wrapper", () => {
  const cloudflareEmail = readSource("lib/server/email-service.ts");
  const signupFunction = readSource("supabase/functions/send-signup-email/index.ts");
  const videoEmail = readSource("lib/server/video-email.ts");
  const authEmail = readSource("lib/server/auth-email.ts");

  for (const source of [cloudflareEmail, signupFunction]) {
    assertIncludes(source, "/brand/mai-coach/mai-coach-logo-email-v3.png");
    assertIncludes(source, "APP_BASE_URL");
    assertIncludes(source, "alt=\"MAI Coach\"");
    assertIncludes(source, "MAI Coach");
    assertIncludes(source, "AI Golf Coaching");
  }
  assertIncludes(cloudflareEmail, "MAI Coach\\nAI Golf Coaching");
  assertIncludes(cloudflareEmail, "EMAIL_LOGO_WIDTH = 300");
  assertIncludes(cloudflareEmail, "EMAIL_LOGO_HEIGHT = 63");
  assertIncludes(videoEmail, "sendEmailMessage");
  assertIncludes(authEmail, "sendPasswordResetEmail");
});

test("old generated logos and composite source sheet are not referenced or retained", () => {
  const searchedFiles = [
    "app/layout.tsx",
    "app/page.tsx",
    "components/brand/mai-coach-logo.tsx",
    "lib/server/email-service.ts",
    "lib/server/auth-email.ts",
    "lib/server/video-email.ts",
    "public/manifest.webmanifest",
    "supabase/functions/send-signup-email/index.ts",
  ];
  const joinedSource = searchedFiles.map(readSource).join("\n");
  assert.doesNotMatch(joinedSource, /mai-coach-[a-z0-9-]+-v2\.png/);
  assert.doesNotMatch(joinedSource, new RegExp(["My", "AI", "Golf", "Coach"].join(" "), "i"));
  const staleLogoPrefix = "mai-coach-logo-";
  const staleExtension = ".svg";
  const staleFilenames = [
    `${staleLogoPrefix}full${staleExtension}`,
    `${staleLogoPrefix}mark${staleExtension}`,
    `${staleLogoPrefix}monochrome${staleExtension}`,
    `mai-coach-og-image${staleExtension}`,
    ["ChatGPT Image", "Jul 27"].join(" "),
  ];

  for (const stale of staleFilenames) {
    assert.doesNotMatch(joinedSource, new RegExp(stale.replaceAll(".", "\\.")));
  }

  for (const stalePath of [
    `public/favicon${staleExtension}`,
    `public/brand/mai-coach/${staleLogoPrefix}full${staleExtension}`,
    `public/brand/mai-coach/${staleLogoPrefix}mark${staleExtension}`,
    `public/brand/mai-coach/${staleLogoPrefix}monochrome${staleExtension}`,
    `public/brand/mai-coach/mai-coach-og-image${staleExtension}`,
  ]) {
    assert.equal(fs.existsSync(path.join(root, stalePath)), false, `${stalePath} should be removed`);
  }
});
