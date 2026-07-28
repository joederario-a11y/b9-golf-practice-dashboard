declare const __MAI_COACH_BUILD_BRANCH__: string | undefined;
declare const __MAI_COACH_BUILD_COMMIT__: string | undefined;
declare const __MAI_COACH_BUILD_TIME__: string | undefined;
declare const __MAI_COACH_BUILD_WORKER__: string | undefined;
declare const __MAI_COACH_APP_ENVIRONMENT__: string | undefined;

function buildValue(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

const commit = buildValue(
  typeof __MAI_COACH_BUILD_COMMIT__ === "undefined" ? undefined : __MAI_COACH_BUILD_COMMIT__,
  "local",
);
const worker = buildValue(
  typeof __MAI_COACH_BUILD_WORKER__ === "undefined" ? undefined : __MAI_COACH_BUILD_WORKER__,
  "local",
);
const branch = buildValue(
  typeof __MAI_COACH_BUILD_BRANCH__ === "undefined" ? undefined : __MAI_COACH_BUILD_BRANCH__,
  "local",
);
const appEnvironment = buildValue(
  typeof __MAI_COACH_APP_ENVIRONMENT__ === "undefined" ? undefined : __MAI_COACH_APP_ENVIRONMENT__,
  worker === "mai-coach-dev" || branch === "dev" ? "dev" : worker === "local" ? "local" : "production",
);
const buildTime = buildValue(
  typeof __MAI_COACH_BUILD_TIME__ === "undefined" ? undefined : __MAI_COACH_BUILD_TIME__,
  new Date(0).toISOString(),
);

export const APP_BUILD_INFO = Object.freeze({
  branch,
  buildTime,
  commit,
  environment: appEnvironment,
  shortCommit: commit.length >= 7 ? commit.slice(0, 7) : commit,
  worker,
});

export const APP_VERSION_INFO = Object.freeze({
  appName: "MAI Coach",
  branch,
  buildTimestamp: buildTime,
  commitSha: commit,
  environment: appEnvironment,
  shortCommitSha: APP_BUILD_INFO.shortCommit,
});

export function isDevBuildTarget(hostname = "") {
  return APP_BUILD_INFO.worker === "mai-coach-dev" || hostname.includes("mai-coach-dev");
}
