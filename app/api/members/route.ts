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
  confirmExisting?: unknown;
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

type AccountSetupInviteResult = Awaited<ReturnType<typeof createAccountSetupInvitation>>;

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

function displayNameForMember(user: { email?: string | null; first_name?: string | null; last_name?: string | null }) {
  return [user.first_name, user.last_name].filter(Boolean).join(" ").trim() || user.email || "This member";
}

function memberError(code: string, message: string, status = 400, extra: Record<string, unknown> = {}) {
  return Response.json({
    ok: false,
    error: { code, message },
    publicMessage: message,
    ...extra,
  }, { status });
}

function existingMemberPrompt(existing: {
  account_status?: string | null;
  email: string;
  first_name: string;
  id: string;
  invite_status: string | null;
  last_name: string;
}, passwordConfigured: boolean, message: string) {
  return {
    id: existing.id,
    accountStatus: existing.account_status ?? "active",
    email: existing.email,
    firstName: existing.first_name,
    inviteStatus: existing.invite_status ?? "pending",
    lastName: existing.last_name,
    name: displayNameForMember(existing),
    passwordConfigured,
    message,
  };
}

function noEmailInvite(status: string, publicMessage: string): AccountSetupInviteResult {
  return {
    status: status as AccountSetupInviteResult["status"],
    publicMessage,
  };
}

async function createSetupInvitationWithoutBlockingMember(values: Parameters<typeof createAccountSetupInvitation>[0]) {
  try {
    return await createAccountSetupInvitation(values);
  } catch {
    return {
      status: "failed" as const,
      publicMessage: "The member was saved, but the welcome email needs attention. You can resend it below.",
      safeErrorCode: "invitation_error",
    };
  }
}

async function readMemberRow(database: D1Database, memberId: string) {
  return database
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
    const confirmExisting = payload.confirmExisting === true;
    if (!firstName || !lastName || !email) {
      return Response.json({ error: "First name, last name, and email are required." }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({ error: "Enter a valid member email address." }, { status: 400 });
    }

    const database = getRequiredDatabase();
    await ensurePlatformSchema(database);
    const duplicateEmailRows = await database
      .prepare("SELECT id FROM users WHERE LOWER(TRIM(email)) = ?")
      .bind(email)
      .all<{ id: string }>();
    if ((duplicateEmailRows.results ?? []).length > 1) {
      return memberError(
        "duplicate_normalized_email",
        "Multiple accounts use that email after normalization. An admin needs to merge or correct the duplicate records before this member can be added.",
        409,
      );
    }
    const existing = await database
      .prepare(
        `SELECT id, role, first_name, last_name, email, phone, skill_level, notes,
                account_status, invite_status, created_at
         FROM users WHERE LOWER(TRIM(email)) = ?`,
      )
      .bind(email)
      .first<{
        account_status: string | null;
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
      const roleLabel = existing.role === "admin" ? "an Administrator" : "a Coach";
      return memberError(
        "existing_staff_account",
        `This email belongs to ${roleLabel} account. An admin must review it before adding a member relationship.`,
        409,
      );
    }
    const memberId = existing?.id ?? crypto.randomUUID();
    const coachId = identity.role === "coach" ? identity.id : requestedCoachId || null;
    const passwordRow = existing
      ? await database
          .prepare("SELECT user_id FROM user_passwords WHERE user_id = ?")
          .bind(existing.id)
          .first<{ user_id: string }>()
      : null;
    const passwordConfigured = Boolean(passwordRow);
    if (coachId) {
      const coach = await database
        .prepare("SELECT id FROM users WHERE id = ? AND role = 'coach'")
        .bind(coachId)
        .first<{ id: string }>();
      if (!coach) {
        return memberError("invalid_coach", "Choose a valid coach for this member.", 400);
      }
      const assigned = await database
        .prepare("SELECT coach_id FROM coach_members WHERE member_id = ?")
        .bind(memberId)
        .all<{ coach_id: string }>();
      const assignedCoachIds = assigned.results.map((row) => row.coach_id);
      if (existing && assignedCoachIds.includes(coachId)) {
        const row = await readMemberRow(database, memberId);
        return Response.json({
          ok: true,
          result: "member_already_linked",
          firstMemberOnboardingStatus: identity.role === "coach"
            ? await getFirstMemberOnboardingStatus(database, identity.id)
            : "completed",
          member: row ? serializeMember(row) : null,
          invite: noEmailInvite(
            existing.invite_status ?? "not_sent",
            `${displayNameForMember(existing)} is already on your roster.`,
          ),
          passwordConfigured,
        });
      }
      if (assignedCoachIds.length > 0 && (assignedCoachIds.length > 1 || !assignedCoachIds.includes(coachId))) {
        return memberError(
          "member_linked_to_another_coach",
          "This member is already connected to another coach. An administrator must review the relationship before you can add them.",
          409,
        );
      }
      const guard = singleCoachAssignmentGuard({
        coachId,
        existingCoachIds: assignedCoachIds,
        identityId: identity.id,
        identityRole: identity.role,
      });
      if (!guard.allowed) {
        return memberError("coach_assignment_blocked", guard.message, guard.status);
      }
    }

    if (existing && passwordConfigured && !confirmExisting) {
      const message = `${displayNameForMember(existing)} already has a MAI Coach account. Would you like to add them to your roster?`;
      return memberError(
        "existing_member_available",
        message,
        409,
        { existingMember: existingMemberPrompt(existing, passwordConfigured, message) },
      );
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

    const invite = existing
      ? noEmailInvite(
          existing.invite_status ?? "not_sent",
          passwordConfigured
            ? `${displayNameForMember(existing)} was added to your roster.`
            : `${displayNameForMember(existing)} was added to your roster. Their account setup is still pending; you can resend the setup email.`,
        )
      : await createSetupInvitationWithoutBlockingMember({
          actor: identity,
          coachId,
          request,
          user: {
            id: memberId,
            email,
            first_name: firstName,
            last_name: lastName,
            role: "member",
            invite_status: "pending",
          },
        });
    const firstMemberOnboardingStatus =
      identity.role === "coach" && shouldCompleteFirstMemberOnboardingAfterInvite(invite.status)
        ? await setFirstMemberOnboardingStatus(database, identity, "completed")
        : identity.role === "coach"
          ? await getFirstMemberOnboardingStatus(database, identity.id)
          : "completed";
    const row = await readMemberRow(database, memberId);

    return Response.json({
      ok: true,
      result: existing ? "linked_existing_member" : "member_created",
      firstMemberOnboardingStatus,
      member: row ? serializeMember(row) : null,
      invite,
      passwordConfigured,
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
