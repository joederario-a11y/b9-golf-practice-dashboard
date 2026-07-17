import {
  ensurePlatformSchema,
  getIdentity,
  getPlatformEnvironment,
  getRequiredDatabase,
  responseFromError,
} from "@/lib/server/platform";

async function currentProfileImageUrl(userId: string) {
  const database = getRequiredDatabase();
  await ensurePlatformSchema(database);
  const image = await database
    .prepare("SELECT id, updated_at FROM user_profile_images WHERE user_id = ? AND is_current = 1 ORDER BY updated_at DESC LIMIT 1")
    .bind(userId)
    .first<{ id: string; updated_at: string }>();
  if (!image) return "";
  const params = new URLSearchParams({ imageId: image.id, userId, v: image.updated_at });
  return `/api/coach-photo?${params.toString()}`;
}

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
      user: {
        ...identity,
        profileImageUrl: await currentProfileImageUrl(identity.id),
      },
    });
  } catch (error) {
    return responseFromError(error);
  }
}
