import {
  ensurePlatformSchema,
  getAssignedMemberIds,
  getRequiredDatabase,
  recordActivity,
  requireIdentity,
  responseFromError,
} from "@/lib/server/platform";
import { createAccountSetupInvitation } from "@/lib/server/email-service";
import { normalizeEmail, singleCoachAssignmentGuard } from "@/lib/admin-user-policy.mjs";
import {
  normalizeFirstMemberOnboardingStatus,
  shouldCompleteFirstMemberOnboardingAfterInvite,
} from "@/lib/coach-first-member-onboarding-policy.mjs";

type MemberPayload = {
  coachId?: unknown;
  email?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  notes?: unknown;
  phone?: unknown;
  skillLevel?: unknown;
};

type FirstMemberOnboardingPayload = {
  firstMemberOnboardingStatus?: unknown;
};

type MemberRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  skill_level: string | null;
  notes: string | null;
  account_status: string | null;
  invite_status: string;
  created_at: string;
  video_count: number;
  last_video_at: string | null;
  profile_image_id: string | null;
  profile_image_updated_at: string | null;
};

function text(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function serializeMember(row: MemberRow) {
  const profileImageUrl = row.profile_image_id
    ? `/api/coach-photo?${new URLSearchParams({
        imageId: row.profile_image_id,
        userId: row.id,
        v: row.profile_image_updated_at ?? "",
      }).toString()}`
    : "";
  return {
    id: row.id,
    name: [row.first_name, row.last_name].filter(Boolean).join(" "),
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone ?? "",
    skillLevel: row.skill_level ?? "",
    notes: row.notes ?? "",
    accountStatus: row.account_status ?? "active",
    inviteStatus: row.invite_status,
    createdAt: row.created_at,
    videoCount: Number(row.video_count ?? 0),
    lastVideoAt: row.last_video_at,
    profileImageUrl,
  };
}

function parseJsonObject(value: string | null) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

async function getFirstMemberOnboardingStatus(database: D1Database, userId: string) {
  const row = await database
    .prepare("SELECT profile_json FROM golf_practice_profiles WHERE user_id = ?")
    .bind(userId)
    .first<{ profile_json: string }>();
  const profile = parseJsonObject(row?.profile_json ?? null);
  return normalizeFirstMemberOnboardingStatus(
    typeof profile.first_member_onboarding_status === "string"
      ? profile.first_member_onboarding_status
      : profile.firstMemberOnboardingStatus,
  );
}

async function setFirstMemberOnboardingStatus(database: D1Database, identity: Awaited<ReturnType<typeof requireIdentity>>, status: string) {
  const normalizedStatus = normalizeFirstMemberOnboardingStatus(status);
  const row = await database
    .prepare("SELECT profile_json FROM golf_practice_profiles WHERE user_id = ?")
    .bind(identity.id)
    .first<{ profile_json: string }>();
  const profile = parseJsonObject(row?.profile_json ?? null);
  profile.first_member_onboarding_status = normalizedStatus;
  await database
    .prepare(
      `INSERT INTO golf_practice_profiles (
        user_email, user_id, display_name, profile_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(user_email) DO UPDATE SET
        user_id = excluded.user_id,
        display_name = excluded.display_name,
        profile_json = excluded.profile_json,
        updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(identity.email, identity.id, identity.displayName, JSON.stringify(profile))
    .run();
  return normalizedStatus;
}

export async function GET() {
  try {
    const identity = await requireIdentity();
    if (identity.role === "member") {
      return Response.json({ error: "Coach or admin access is required." }, { status: 403 });
    }
    const database = getRequiredDatabase();
    await ensurePlatformSchema(database);
    const query = identity.role === "admin"
      ? `SELECT
	          users.id, users.first_name, users.last_name, users.email, users.phone,
	          users.skill_level, users.notes, users.account_status, users.invite_status, users.created_at,
	          profile_image.id AS profile_image_id,
	          profile_image.updated_at AS profile_image_updated_at,
	          COUNT(lesson_videos.id) AS video_count,
	          MAX(lesson_videos.created_at) AS last_video_at
	        FROM users
	        LEFT JOIN lesson_videos ON lesson_videos.member_id = users.id
            AND LOWER(COALESCE(lesson_videos.video_type, '')) NOT IN ('system_test', 'system test')
	        LEFT JOIN user_profile_images AS profile_image
	          ON profile_image.user_id = users.id AND profile_image.is_current = 1
	        WHERE users.role = 'member'
        GROUP BY users.id
        ORDER BY users.last_name, users.first_name`
      : `SELECT
	          users.id, users.first_name, users.last_name, users.email, users.phone,
	          users.skill_level, users.notes, users.account_status, users.invite_status, users.created_at,
	          profile_image.id AS profile_image_id,
	          profile_image.updated_at AS profile_image_updated_at,
	          COUNT(lesson_videos.id) AS video_count,
	          MAX(lesson_videos.created_at) AS last_video_at
	        FROM coach_members
	        JOIN users ON users.id = coach_members.member_id
	        LEFT JOIN lesson_videos ON lesson_videos.member_id = users.id
            AND LOWER(COALESCE(lesson_videos.video_type, '')) NOT IN ('system_test', 'system test')
	        LEFT JOIN user_profile_images AS profile_image
	          ON profile_image.user_id = users.id AND profile_image.is_current = 1
        WHERE coach_members.coach_id = ?
        GROUP BY users.id
        ORDER BY users.last_name, users.first_name`;
    const statement = database.prepare(query);
    const result = identity.role === "admin"
      ? await statement.all<MemberRow>()
      : await statement.bind(identity.id).all<MemberRow>();
    const members = result.results.map(serializeMember);
    const activeMemberCount = members.filter((member) => member.accountStatus !== "inactive").length;

    return Response.json({
      activeMemberCount,
      firstMemberOnboardingStatus: identity.role === "coach"
        ? await getFirstMemberOnboardingStatus(database, identity.id)
        : "completed",
      members,
    });
  } catch (error) {
    return responseFromError(error);
  }
}

export async function POST(request: Request) {
  try {
    const identity = await requireIdentity();
    if (identity.role === "member") {
      return Response.json({ error: "Coach or admin access is required." }, { status: 403 });
    }
    const payload = await request.json() as MemberPayload;
    const firstName = text(payload.firstName, 80);
    const lastName = text(payload.lastName, 80);
    const email = normalizeEmail(payload.email);
    const phone = text(payload.phone, 40);
    const skillLevel = text(payload.skillLevel, 80);
    const notes = text(payload.notes, 2000);
    const requestedCoachId = text(payload.coachId, 80);
    if (!firstName || !lastName || !email) {
      return Response.json({ error: "First name, last name, and email are required." }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({ error: "Enter a valid member email address." }, { status: 400 });
    }

    const database = getRequiredDatabase();
    await ensurePlatformSchema(database);
    const existing = await database
      .prepare(
        `SELECT id, role, first_name, last_name, email, phone, skill_level, notes, invite_status, created_at
         FROM users WHERE LOWER(email) = ?`,
      )
      .bind(email)
      .first<{
        id: string;
        role: string;
        first_name: string;
        last_name: string;
        email: string;
        phone: string | null;
        skill_level: string | null;
        notes: string | null;
        invite_status: string;
        created_at: string;
      }>();
    if (existing && existing.role !== "member") {
      return Response.json({ error: "That email belongs to a coach or administrator." }, { status: 409 });
    }
    const memberId = existing?.id ?? crypto.randomUUID();
    const coachId = identity.role === "coach" ? identity.id : requestedCoachId || null;
    if (coachId) {
      const coach = await database
        .prepare("SELECT id FROM users WHERE id = ? AND role = 'coach'")
        .bind(coachId)
        .first<{ id: string }>();
      if (!coach) {
        return Response.json({ error: "Choose a valid coach for this member." }, { status: 400 });
      }
      const assigned = await database
        .prepare("SELECT coach_id FROM coach_members WHERE member_id = ?")
        .bind(memberId)
        .all<{ coach_id: string }>();
      const assignedCoachIds = assigned.results.map((row) => row.coach_id);
      if (assignedCoachIds.length > 0 && (assignedCoachIds.length > 1 || !assignedCoachIds.includes(coachId))) {
        return Response.json({ error: "This member already has a coach. Use the admin user detail panel to reassign them." }, { status: 409 });
      }
      const guard = singleCoachAssignmentGuard({
        coachId,
        existingCoachIds: assignedCoachIds,
        identityId: identity.id,
        identityRole: identity.role,
      });
      if (!guard.allowed) {
        return Response.json({ error: guard.message }, { status: guard.status });
      }
    }

    if (existing) {
      if (coachId) {
        await database
          .prepare(
            `INSERT INTO coach_members (id, coach_id, member_id, created_at)
             VALUES (?, ?, ?, CURRENT_TIMESTAMP)
             ON CONFLICT(coach_id, member_id) DO NOTHING`,
          )
          .bind(crypto.randomUUID(), coachId, memberId)
          .run();
      }
    } else {
      await database.batch([
        database
          .prepare(
            `INSERT INTO users (
              id, role, first_name, last_name, email, phone, skill_level, notes,
              invite_status, invited_at, created_by, created_at, updated_at
            ) VALUES (?, 'member', ?, ?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          )
          .bind(memberId, firstName, lastName, email, phone || null, skillLevel || null, notes || null, identity.id),
        coachId
          ? database
              .prepare(
                `INSERT INTO coach_members (id, coach_id, member_id, created_at)
                 VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                 ON CONFLICT(coach_id, member_id) DO NOTHING`,
              )
              .bind(crypto.randomUUID(), coachId, memberId)
          : database.prepare("SELECT 1"),
      ]);
    }
    if (coachId) {
      await recordActivity({
        action: identity.role === "coach" ? "coach_added_student" : "coach_assigned",
        actor: identity,
        database,
        entityId: `${coachId}:${memberId}`,
        entityType: "coach_assignment",
        memberId,
        metadata: { coachId, existingMember: Boolean(existing) },
        summary: `${identity.displayName} added ${existing ? `${existing.first_name} ${existing.last_name}` : `${firstName} ${lastName}`} to ${identity.role === "coach" ? "their roster" : "a coach roster"}.`,
        targetUserId: memberId,
      });
    }

    const invite = await createAccountSetupInvitation({
      actor: identity,
      coachId,
      request,
      user: {
        id: memberId,
        email,
        first_name: existing?.first_name ?? firstName,
        last_name: existing?.last_name ?? lastName,
        role: "member",
        invite_status: existing?.invite_status ?? "pending",
      },
    });
    const firstMemberOnboardingStatus =
      identity.role === "coach" && shouldCompleteFirstMemberOnboardingAfterInvite(invite.status)
        ? await setFirstMemberOnboardingStatus(database, identity, "completed")
        : identity.role === "coach"
          ? await getFirstMemberOnboardingStatus(database, identity.id)
          : "completed";
    const row = await database
      .prepare(
        `SELECT
	          users.id, users.first_name, users.last_name, users.email, users.phone,
	          users.skill_level, users.notes, users.account_status, users.invite_status, users.created_at,
	          profile_image.id AS profile_image_id,
	          profile_image.updated_at AS profile_image_updated_at,
	          COUNT(lesson_videos.id) AS video_count,
	          MAX(lesson_videos.created_at) AS last_video_at
	        FROM users
	        LEFT JOIN lesson_videos ON lesson_videos.member_id = users.id
            AND LOWER(COALESCE(lesson_videos.video_type, '')) NOT IN ('system_test', 'system test')
	        LEFT JOIN user_profile_images AS profile_image
	          ON profile_image.user_id = users.id AND profile_image.is_current = 1
        WHERE users.id = ?
        GROUP BY users.id`,
      )
      .bind(memberId)
      .first<MemberRow>();

    return Response.json({
      firstMemberOnboardingStatus,
      member: row ? serializeMember(row) : null,
      invite,
      passwordConfigured: false,
    }, { status: existing ? 200 : 201 });
  } catch (error) {
    return responseFromError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const identity = await requireIdentity();
    if (identity.role !== "coach") {
      return Response.json({ error: "Coach access is required." }, { status: 403 });
    }
    const payload = await request.json() as FirstMemberOnboardingPayload;
    const status = normalizeFirstMemberOnboardingStatus(
      typeof payload.firstMemberOnboardingStatus === "string"
        ? payload.firstMemberOnboardingStatus
        : undefined,
    );
    const database = getRequiredDatabase();
    await ensurePlatformSchema(database);
    const firstMemberOnboardingStatus = await setFirstMemberOnboardingStatus(database, identity, status);
    return Response.json({ firstMemberOnboardingStatus });
  } catch (error) {
    return responseFromError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const identity = await requireIdentity();
    if (identity.role === "member") {
      return Response.json({ error: "Coach or admin access is required." }, { status: 403 });
    }

    const payload = await request.json() as MemberPayload & { memberId?: unknown };
    const memberId = text(payload.memberId, 80);
    if (!memberId) {
      return Response.json({ error: "memberId is required." }, { status: 400 });
    }

    const database = getRequiredDatabase();
    await ensurePlatformSchema(database);
    if (identity.role !== "admin") {
      const assignedMemberIds = await getAssignedMemberIds(identity, database);
      if (!assignedMemberIds.includes(memberId)) {
        return Response.json({ error: "You do not have access to that member." }, { status: 403 });
      }
    }

    const existing = await database
      .prepare("SELECT id FROM users WHERE id = ? AND role = 'member'")
      .bind(memberId)
      .first<{ id: string }>();
    if (!existing) {
      return Response.json({ error: "Member not found." }, { status: 404 });
    }

    const firstName = text(payload.firstName, 80);
    const lastName = text(payload.lastName, 80);
    const phone = text(payload.phone, 40);
    const skillLevel = text(payload.skillLevel, 80);
    const notes = text(payload.notes, 2000);
    if (!firstName || !lastName) {
      return Response.json({ error: "First and last name are required." }, { status: 400 });
    }

    await database
      .prepare(
        `UPDATE users SET
          first_name = ?,
          last_name = ?,
          phone = ?,
          skill_level = ?,
          notes = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND role = 'member'`,
      )
      .bind(firstName, lastName, phone || null, skillLevel || null, notes || null, memberId)
      .run();

    const row = await database
      .prepare(
        `SELECT
          users.id, users.first_name, users.last_name, users.email, users.phone,
          users.skill_level, users.notes, users.account_status, users.invite_status, users.created_at,
          profile_image.id AS profile_image_id,
          profile_image.updated_at AS profile_image_updated_at,
          COUNT(lesson_videos.id) AS video_count,
          MAX(lesson_videos.created_at) AS last_video_at
        FROM users
        LEFT JOIN lesson_videos ON lesson_videos.member_id = users.id
          AND LOWER(COALESCE(lesson_videos.video_type, '')) NOT IN ('system_test', 'system test')
        LEFT JOIN user_profile_images AS profile_image
          ON profile_image.user_id = users.id AND profile_image.is_current = 1
        WHERE users.id = ?
        GROUP BY users.id`,
      )
      .bind(memberId)
      .first<MemberRow>();

    return Response.json({ member: row ? serializeMember(row) : null });
  } catch (error) {
    return responseFromError(error);
  }
}
