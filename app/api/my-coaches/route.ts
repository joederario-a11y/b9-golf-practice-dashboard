import {
  ensurePlatformSchema,
  getRequiredDatabase,
  requireIdentity,
  responseFromError,
} from "@/lib/server/platform";

type AssignedCoachRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  skill_level: string | null;
  image_id: string | null;
  image_updated_at: string | null;
};

function displayName(row: { first_name: string; last_name: string; email?: string }) {
  return [row.first_name, row.last_name].filter(Boolean).join(" ") || row.email || "Coach";
}

function coachPhotoUrl(userId: string, imageId?: string | null, version?: string | null) {
  if (!imageId) return "";
  const params = new URLSearchParams({ imageId, userId });
  if (version) params.set("v", version);
  return `/api/coach-photo?${params.toString()}`;
}

export async function GET() {
  try {
    const identity = await requireIdentity();
    const database = getRequiredDatabase();
    await ensurePlatformSchema(database);
    if (identity.role !== "member") {
      return Response.json({ coaches: [] });
    }
    const result = await database
      .prepare(
        `SELECT
          users.id,
          users.first_name,
          users.last_name,
          users.email,
          users.skill_level,
          profile_image.id AS image_id,
          profile_image.updated_at AS image_updated_at
        FROM coach_members
        JOIN users ON users.id = coach_members.coach_id
        LEFT JOIN user_profile_images AS profile_image
          ON profile_image.user_id = users.id AND profile_image.is_current = 1
        WHERE coach_members.member_id = ?
        ORDER BY coach_members.created_at DESC`,
      )
      .bind(identity.id)
      .all<AssignedCoachRow>();
    return Response.json({
      coaches: result.results.map((coach) => ({
        id: coach.id,
        name: displayName(coach),
        email: coach.email,
        title: coach.skill_level ?? "Coach",
        profileImageUrl: coachPhotoUrl(coach.id, coach.image_id, coach.image_updated_at),
      })),
    });
  } catch (error) {
    return responseFromError(error);
  }
}
