import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { evaluateDeploySource, parseLsRemoteSha } from "../scripts/assert-deploy-source.mjs";

test("version endpoint exposes only safe public provenance fields with no-store caching", async () => {
  const buildInfoSource = await readFile(new URL("../lib/build-info.ts", import.meta.url), "utf8");
  const versionRouteSource = await readFile(new URL("../app/api/version/route.ts", import.meta.url), "utf8");
  const devBuildRouteSource = await readFile(new URL("../app/api/dev/build-info/route.ts", import.meta.url), "utf8");

  for (const field of ["appName", "environment", "branch", "commitSha", "shortCommitSha", "buildTimestamp"]) {
    assert.match(buildInfoSource, new RegExp(field));
    assert.match(versionRouteSource, new RegExp(field));
  }

  for (const unsafeField of ["worker", "database", "bucket", "Workflow", "secret", "account_id", "filesystem"]) {
    assert.doesNotMatch(versionRouteSource, new RegExp(unsafeField, "i"));
  }

  assert.match(devBuildRouteSource, /APP_VERSION_INFO/);
  assert.match(versionRouteSource, /no-store/);
  assert.doesNotMatch(versionRouteSource, /no-cache/);
});

test("build provenance includes safe fallback values for local builds", async () => {
  const buildInfoSource = await readFile(new URL("../lib/build-info.ts", import.meta.url), "utf8");

  assert.match(buildInfoSource, /"local"/);
  assert.match(buildInfoSource, /new Date\(0\)\.toISOString\(\)/);
  assert.match(buildInfoSource, /commit\.length >= 7/);
});

test("admin workspace includes a small System build information section", async () => {
  const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const cssSource = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(pageSource, /kicker="System"/);
  assert.match(pageSource, /title="Build information"/);
  assert.match(pageSource, /admin-system-panel/);
  assert.match(pageSource, /APP_VERSION_INFO\.commitSha/);
  assert.match(pageSource, /APP_VERSION_INFO\.shortCommitSha/);
  assert.match(pageSource, /copyBuildCommitSha/);
  assert.match(cssSource, /\.admin-system-grid/);
});

test("Dev deployment guard accepts only a clean dev branch matching the current remote dev SHA", () => {
  const sha = "b1a55972bce1948b4ad93ace8feb2d7d2d6a59ab";
  const report = evaluateDeploySource({
    branch: "dev",
    commitSha: sha,
    environment: "dev",
    remoteDevSha: sha,
    statusPorcelain: "",
  });

  assert.equal(report.ok, true);
  assert.equal(report.clean, true);
  assert.equal(report.shortCommitSha, "b1a5597");
});

test("Dev deployment guard rejects local HEAD that differs from remote dev", () => {
  const report = evaluateDeploySource({
    branch: "dev",
    commitSha: "b1a55972bce1948b4ad93ace8feb2d7d2d6a59ab",
    environment: "dev",
    remoteDevSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    statusPorcelain: "",
  });

  assert.equal(report.ok, false);
  assert.match(report.failures.join("\n"), /current remote dev SHA/);
});

test("Dev deployment guard rejects dirty state and detached HEAD", () => {
  const report = evaluateDeploySource({
    branch: "",
    commitSha: "b1a55972bce1948b4ad93ace8feb2d7d2d6a59ab",
    environment: "dev",
    remoteDevSha: "b1a55972bce1948b4ad93ace8feb2d7d2d6a59ab",
    statusPorcelain: " M app/page.tsx",
  });

  assert.equal(report.ok, false);
  assert.match(report.failures.join("\n"), /detached HEAD/);
  assert.match(report.failures.join("\n"), /uncommitted or untracked/);
  assert.match(report.failures.join("\n"), /branch 'dev'/);
});

test("Dev deployment guard fails closed when remote dev SHA cannot be retrieved", () => {
  const report = evaluateDeploySource({
    branch: "dev",
    commitSha: "b1a55972bce1948b4ad93ace8feb2d7d2d6a59ab",
    environment: "dev",
    remoteDevSha: "",
    statusPorcelain: "",
  });

  assert.equal(report.ok, false);
  assert.match(report.failures.join("\n"), /could not be retrieved from origin/);
});

test("remote dev SHA parser accepts only a well-formed refs heads dev response", () => {
  const sha = "b1a55972bce1948b4ad93ace8feb2d7d2d6a59ab";

  assert.equal(parseLsRemoteSha(`${sha}\trefs/heads/dev\n`), sha);
  assert.equal(parseLsRemoteSha(`${sha}\trefs/heads/main\n`), "");
  assert.equal(parseLsRemoteSha(`not-a-sha\trefs/heads/dev\n`), "");
  assert.equal(parseLsRemoteSha(""), "");
});

test("deployment docs identify Dev and production Cloudflare paths", async () => {
  const deploymentDocs = await readFile(new URL("../docs/DEPLOYMENT.md", import.meta.url), "utf8");

  assert.match(deploymentDocs, /mai-coach-dev/);
  assert.match(deploymentDocs, /wrangler\.dev\.jsonc/);
  assert.match(deploymentDocs, /b9-golf-practice-dashboard/);
  assert.match(deploymentDocs, /\/api\/version/);
  assert.match(deploymentDocs, /OPENAI_API_KEY/);
  assert.match(deploymentDocs, /RESEND_API_KEY/);
  assert.match(deploymentDocs, /Commit first, then rebuild, then deploy/);
  assert.match(deploymentDocs, /npm run deploy:dev/);
});
