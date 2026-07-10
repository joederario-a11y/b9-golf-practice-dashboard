import {
  getIdentity,
  getPlatformEnvironment,
  responseFromError,
} from "@/lib/server/platform";

export async function GET() {
  try {
    const identity = await getIdentity();
    const devAuthEnabled = getPlatformEnvironment().DEV_AUTH_ENABLED === "true";
    if (!identity) {
      return Response.json({ devAuthEnabled, mode: "guest", user: null });
    }

    return Response.json({
      devAuthEnabled,
      mode: "user",
      user: identity,
    });
  } catch (error) {
    return responseFromError(error);
  }
}
