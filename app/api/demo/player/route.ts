import {
  ensurePlatformSchema,
  getRequiredDatabase,
  requireIdentity,
  responseFromError,
} from "@/lib/server/platform";

type MemberRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  skill_level: string | null;
  notes: string | null;
  invite_status: string;
  created_at: string;
  video_count: number;
  last_video_at: string | null;
};

function serializeMember(row: MemberRow) {
  return {
    id: row.id,
    name: [row.first_name, row.last_name].filter(Boolean).join(" "),
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone ?? "",
    skillLevel: row.skill_level ?? "",
    notes: row.notes ?? "",
    inviteStatus: row.invite_status,
    createdAt: row.created_at,
    videoCount: Number(row.video_count ?? 0),
    lastVideoAt: row.last_video_at,
  };
}

function demoEmailForCoach(coachId: string) {
  const suffix = coachId.replace(/[^a-z0-9]/gi, "").slice(0, 12).toLowerCase() || "coach";
  return `sample.player.${suffix}@example.test`;
}

export async function POST() {
  try {
    const identity = await requireIdentity();
    if (identity.role === "member") {
      return Response.json({ error: "Coach or admin access is required." }, { status: 403 });
    }

    const database = getRequiredDatabase();
    await ensurePlatformSchema(database);

    const email = demoEmailForCoach(identity.id);
    const existing = await database
      .prepare("SELECT id FROM users WHERE email = ?")
      .bind(email)
      .first<{ id: string }>();
    const memberId = existing?.id ?? crypto.randomUUID();

    await database.batch([
      database
        .prepare(
          `INSERT INTO users (
            id, role, first_name, last_name, email, phone, skill_level, notes,
            invite_status, created_by, created_at, updated_at
          ) VALUES (?, 'member', 'Sam', 'Sample Player', ?, '(555) 010-0199', 'Demo student', ?, 'accepted', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT(email) DO UPDATE SET
            first_name = excluded.first_name,
            last_name = excluded.last_name,
            phone = excluded.phone,
            skill_level = excluded.skill_level,
            notes = excluded.notes,
            invite_status = 'accepted',
            updated_at = CURRENT_TIMESTAMP`,
        )
        .bind(
          memberId,
          email,
          "Demo player for coach upload walkthroughs. Use this account to test lesson video assignment, notes, publishing, and member-library playback.",
          identity.id,
        ),
      identity.role === "coach"
        ? database
            .prepare(
              `INSERT INTO coach_members (id, coach_id, member_id, created_at)
               VALUES (?, ?, ?, CURRENT_TIMESTAMP)
               ON CONFLICT(coach_id, member_id) DO NOTHING`,
            )
            .bind(crypto.randomUUID(), identity.id, memberId)
        : database.prepare("SELECT 1"),
    ]);

    const row = await database
      .prepare(
        `SELECT
          users.id, users.first_name, users.last_name, users.email, users.phone,
          users.skill_level, users.notes, users.invite_status, users.created_at,
          COUNT(lesson_videos.id) AS video_count,
          MAX(lesson_videos.created_at) AS last_video_at
        FROM users
        LEFT JOIN lesson_videos ON lesson_videos.member_id = users.id
        WHERE users.id = ?
        GROUP BY users.id`,
      )
      .bind(memberId)
      .first<MemberRow>();

    return Response.json({
      member: row ? serializeMember(row) : null,
      publicMessage: "Sample player is ready for a coach upload demo.",
    }, { status: existing ? 200 : 201 });
  } catch (error) {
    return responseFromError(error);
  }
}
