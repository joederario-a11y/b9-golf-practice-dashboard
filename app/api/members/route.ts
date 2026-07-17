import {
  ensurePlatformSchema,
  getAssignedMemberIds,
  getEmailFromAddress,
  getPlatformEnvironment,
  getRequiredDatabase,
  recordActivity,
  requireIdentity,
  responseFromError,
} from "@/lib/server/platform";
import { normalizeEmail, singleCoachAssignmentGuard } from "@/lib/admin-user-policy.mjs";

type MemberPayload = {
  coachId?: unknown;
  email?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  notes?: unknown;
  phone?: unknown;
  skillLevel?: unknown;
};

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

function text(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

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

async function sendMemberInvite(
  request: Request,
  member: { email: string; firstName: string },
  coachName: string,
  inviteUrl: string,
) {
  const runtime = getPlatformEnvironment();
  const emailFrom = getEmailFromAddress();
  if (!runtime.RESEND_API_KEY || !emailFrom) {
    return { status: "pending", reason: "Email delivery is not configured." };
  }
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${runtime.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: emailFrom,
        to: [member.email],
        subject: "Your Free Range Golf video library is ready",
        html: `
          <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#17231d;line-height:1.6;">
            <p>Hi ${escapeHtml(member.firstName)},</p>
            <p>${escapeHtml(coachName)} added you to Free Range Golf so lesson videos and coach notes can be shared with you.</p>
            <p><a href="${escapeHtml(inviteUrl)}" style="display:inline-block;background:#0b1511;color:#35f27a;text-decoration:none;padding:12px 18px;border-radius:6px;font-weight:700;">Create your login</a></p>
            <p>Use the same email address this invitation was sent to when you log in.</p>
          </div>
        `,
      }),
    });
    const result = await response.json() as { id?: string; message?: string };
    if (!response.ok || !result.id) {
      throw new Error(result.message || "The email provider did not accept the invitation.");
    }
    return { status: "sent", providerId: result.id };
  } catch (error) {
    return {
      status: "failed",
      reason: error instanceof Error ? error.message : "Invitation email failed.",
    };
  }
}

function createInviteUrl(request: Request, token: string) {
  const runtime = getPlatformEnvironment();
  const baseUrl = runtime.APP_BASE_URL?.replace(/\/$/, "") || new URL(request.url).origin;
  return `${baseUrl}/?tab=videos&invite=${encodeURIComponent(token)}`;
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
          users.skill_level, users.notes, users.invite_status, users.created_at,
          COUNT(lesson_videos.id) AS video_count,
          MAX(lesson_videos.created_at) AS last_video_at
        FROM users
        LEFT JOIN lesson_videos ON lesson_videos.member_id = users.id
        WHERE users.role = 'member'
        GROUP BY users.id
        ORDER BY users.last_name, users.first_name`
      : `SELECT
          users.id, users.first_name, users.last_name, users.email, users.phone,
          users.skill_level, users.notes, users.invite_status, users.created_at,
          COUNT(lesson_videos.id) AS video_count,
          MAX(lesson_videos.created_at) AS last_video_at
        FROM coach_members
        JOIN users ON users.id = coach_members.member_id
        LEFT JOIN lesson_videos ON lesson_videos.member_id = users.id
        WHERE coach_members.coach_id = ?
        GROUP BY users.id
        ORDER BY users.last_name, users.first_name`;
    const statement = database.prepare(query);
    const result = identity.role === "admin"
      ? await statement.all<MemberRow>()
      : await statement.bind(identity.id).all<MemberRow>();

    return Response.json({ members: result.results.map(serializeMember) });
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

    const invite = existing
      ? { reason: "Existing member connected without changing account setup or invite status.", status: "not_sent" }
      : await (async () => {
        const inviteToken = crypto.randomUUID();
        const inviteUrl = createInviteUrl(request, inviteToken);
        const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();
        const sentInvite = await sendMemberInvite(request, { email, firstName }, identity.displayName, inviteUrl);
        await database.batch([
          database
            .prepare(
              `INSERT INTO member_invitations (
                id, member_id, coach_id, email_to, invite_token, invite_url,
                status, provider_id, failure_reason, expires_at, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            )
            .bind(
              crypto.randomUUID(),
              memberId,
              coachId,
              email,
              inviteToken,
              inviteUrl,
              sentInvite.status,
              "providerId" in sentInvite ? sentInvite.providerId : null,
              "reason" in sentInvite ? sentInvite.reason : null,
              expiresAt,
            ),
          database
            .prepare("UPDATE users SET invite_status = ?, invited_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
            .bind(sentInvite.status, memberId),
        ]);
        return sentInvite;
      })();
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
      invite,
    }, { status: existing ? 200 : 201 });
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

    return Response.json({ member: row ? serializeMember(row) : null });
  } catch (error) {
    return responseFromError(error);
  }
}
