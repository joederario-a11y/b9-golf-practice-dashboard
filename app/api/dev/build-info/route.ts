import { APP_BUILD_INFO, isDevBuildTarget } from "@/lib/build-info";
import { getPlatformEnvironment } from "@/lib/server/platform";

const BUILD_INFO_HEADERS = {
  "Cache-Control": "no-cache, no-store, must-revalidate",
  "Content-Type": "application/json",
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const runtime = getPlatformEnvironment();
  const appBaseHost = runtime.APP_BASE_URL ? new URL(runtime.APP_BASE_URL).hostname : "";
  const isDev = isDevBuildTarget(url.hostname) || isDevBuildTarget(appBaseHost);

  if (!isDev) {
    return Response.json({ error: "Build info is only available on the Dev worker." }, {
      headers: BUILD_INFO_HEADERS,
      status: 404,
    });
  }

  return Response.json({
    environment: "dev",
    commit: APP_BUILD_INFO.commit,
    shortCommit: APP_BUILD_INFO.shortCommit,
    buildTime: APP_BUILD_INFO.buildTime,
    worker: "mai-coach-dev",
  }, {
    headers: BUILD_INFO_HEADERS,
  });
}
