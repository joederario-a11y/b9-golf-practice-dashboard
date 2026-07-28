import { APP_VERSION_INFO } from "@/lib/build-info";

const VERSION_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
};

export async function GET() {
  return Response.json({
    appName: APP_VERSION_INFO.appName,
    environment: APP_VERSION_INFO.environment,
    branch: APP_VERSION_INFO.branch,
    commitSha: APP_VERSION_INFO.commitSha,
    shortCommitSha: APP_VERSION_INFO.shortCommitSha,
    buildTimestamp: APP_VERSION_INFO.buildTimestamp,
  }, {
    headers: VERSION_HEADERS,
  });
}
