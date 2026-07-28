#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const DEV_BRANCH = "dev";
const DEV_REMOTE_REF = "refs/heads/dev";
const FULL_SHA_PATTERN = /^[0-9a-f]{40}$/i;

function parseEnvironment(argv = process.argv.slice(2), env = process.env) {
  const environmentIndex = argv.findIndex((arg) => arg === "--environment" || arg === "--env");
  const flagEnvironment = environmentIndex >= 0 ? argv[environmentIndex + 1] : "";
  return (flagEnvironment || env.APP_ENVIRONMENT || env.MAI_COACH_APP_ENVIRONMENT || "dev").trim();
}

function git(args) {
  const result = spawnSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `git ${args.join(" ")} failed`).trim());
  }

  return result.stdout.trim();
}

export function evaluateDeploySource({
  branch,
  commitSha,
  environment = "dev",
  remoteDevSha,
  statusPorcelain = "",
}) {
  const clean = statusPorcelain.trim().length === 0;
  const shortCommitSha = FULL_SHA_PATTERN.test(commitSha ?? "") ? commitSha.slice(0, 7) : "unknown";
  const branchLabel = branch || "detached";
  const failures = [];

  if (!environment) {
    failures.push("Deployment environment could not be determined.");
  }

  if (!FULL_SHA_PATTERN.test(commitSha ?? "")) {
    failures.push("Commit SHA could not be determined.");
  }

  if (!branch || branch === "HEAD") {
    failures.push("Repository is in detached HEAD state.");
  }

  if (!clean) {
    failures.push("Repository has uncommitted or untracked changes. Commit or stash them before deploying.");
  }

  if (environment === "dev") {
    if (branch !== DEV_BRANCH) {
      failures.push(`Dev deployments must run from branch '${DEV_BRANCH}', not '${branchLabel}'.`);
    }

    if (!FULL_SHA_PATTERN.test(remoteDevSha ?? "")) {
      failures.push("Current remote dev SHA could not be retrieved from origin. Check network/auth and try again.");
    } else if (FULL_SHA_PATTERN.test(commitSha ?? "") && commitSha !== remoteDevSha) {
      failures.push("HEAD does not match the current remote dev SHA. Push or pull before deploying Dev.");
    }
  }

  return {
    branch: branchLabel,
    clean,
    commitSha: commitSha || "unknown",
    environment: environment || "unknown",
    failures,
    ok: failures.length === 0,
    shortCommitSha,
  };
}

export function parseLsRemoteSha(output, expectedRef = DEV_REMOTE_REF) {
  const trimmed = typeof output === "string" ? output.trim() : "";
  if (!trimmed) return "";

  for (const line of trimmed.split(/\r?\n/)) {
    const [sha, ref] = line.trim().split(/\s+/);
    if (ref === expectedRef && FULL_SHA_PATTERN.test(sha ?? "")) {
      return sha;
    }
  }

  return "";
}

function printReport(report) {
  console.log(`environment: ${report.environment}`);
  console.log(`branch: ${report.branch}`);
  console.log(`commit: ${report.commitSha}`);
  console.log(`short commit: ${report.shortCommitSha}`);
  console.log(`repository clean: ${report.clean ? "yes" : "no"}`);
}

export function collectDeploySource(environment = parseEnvironment()) {
  let branch = "";
  let commitSha = "";
  let remoteDevSha = "";
  let statusPorcelain = "";

  try {
    branch = git(["symbolic-ref", "--quiet", "--short", "HEAD"]);
  } catch {
    branch = "";
  }

  try {
    commitSha = git(["rev-parse", "HEAD"]);
  } catch {
    commitSha = "";
  }

  try {
    remoteDevSha = parseLsRemoteSha(git(["ls-remote", "origin", DEV_REMOTE_REF]));
  } catch {
    remoteDevSha = "";
  }

  try {
    statusPorcelain = git(["status", "--porcelain"]);
  } catch {
    statusPorcelain = "unknown";
  }

  return evaluateDeploySource({
    branch,
    commitSha,
    environment,
    remoteDevSha,
    statusPorcelain,
  });
}

function main() {
  const report = collectDeploySource(parseEnvironment());
  printReport(report);

  if (!report.ok) {
    console.error("");
    console.error("Deployment source check failed:");
    for (const failure of report.failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log("Deployment source check passed.");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main();
}
