import {
  MAX_COACH_HEADSHOT_BYTES,
  sniffImageMimeType,
  validateCoachHeadshotFile,
} from "@/lib/admin-user-policy.mjs";
import {
  ensurePlatformSchema,
  getRequiredDatabase,
  getRequiredVideoStorage,
  recordActivity,
  requireIdentity,
  responseFromError,
  type AuthIdentity,
} from "@/lib/server/platform";

type CoachImageRow = {
  id: string;
  coach_user_id: string;
  storage_path: string;
  original_file_name: string;
  mime_type: string;
  file_size: number;
  is_current: number;
  updated_at: string;
};

type CoachUserRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
};

function text(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function displayName(row: { first_name: string; last_name: string; email?: string }) {
  return [row.first_name, row.last_name].filter(Boolean).join(" ") || row.email || "Coach";
}

function safeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-").slice(0, 100) || "headshot";
}

function extensionForMime(mimeType: string) {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

async function getCoach(database: D1Database, coachId: string) {
  return database
    .prepare("SELECT id, first_name, last_name, email, role FROM users WHERE id = ? AND role = 'coach'")
    .bind(coachId)
    .first<CoachUserRow>();
}

async function memberIsAssignedToCoach(database: D1Database, memberId: string, coachId: string) {
  const row = await database
    .prepare("SELECT id FROM coach_members WHERE member_id = ? AND coach_id = ?")
    .bind(memberId, coachId)
    .first<{ id: string }>();
  return Boolean(row);
}

async function canViewCoach(identity: AuthIdentity, database: D1Database, coachId: string) {
  if (identity.role === "admin") return true;
  if (identity.role === "coach") return identity.id === coachId;
  return memberIsAssignedToCoach(database, identity.id, coachId);
}

function canManageCoach(identity: AuthIdentity, coachId: string) {
  return identity.role === "admin" || (identity.role === "coach" && identity.id === coachId);
}

async function getCurrentImage(database: D1Database, coachId: string, imageId?: string) {
  const query = imageId
    ? `SELECT * FROM coach_profile_images
       WHERE coach_user_id = ? AND id = ? AND is_current = 1`
    : `SELECT * FROM coach_profile_images
       WHERE coach_user_id = ? AND is_current = 1
       ORDER BY updated_at DESC LIMIT 1`;
  const statement = database.prepare(query);
  return imageId
    ? statement.bind(coachId, imageId).first<CoachImageRow>()
    : statement.bind(coachId).first<CoachImageRow>();
}

async function validateUploadedImage(file: File) {
  const declaredMimeType = file.type.trim().toLowerCase();
  const declaredError = validateCoachHeadshotFile(declaredMimeType, file.size);
  if (declaredError) throw new Response(declaredError, { status: 400 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength > MAX_COACH_HEADSHOT_BYTES) {
    throw new Response("Choose a headshot smaller than 5 MB.", { status: 400 });
  }
  const actualMimeType = sniffImageMimeType(bytes);
  if (actualMimeType !== declaredMimeType) {
    throw new Response("The selected file does not match its image type.", { status: 400 });
  }
  return { bytes, mimeType: actualMimeType };
}

export async function GET(request: Request) {
  try {
    const identity = await requireIdentity();
    const database = getRequiredDatabase();
    await ensurePlatformSchema(database);
    const url = new URL(request.url);
    const coachId = text(url.searchParams.get("coachId"), 80);
    const imageId = text(url.searchParams.get("imageId"), 80);
    if (!coachId) return Response.json({ error: "coachId is required." }, { status: 400 });
    if (!(await canViewCoach(identity, database, coachId))) {
      return Response.json({ error: "You do not have access to that coach image." }, { status: 403 });
    }
    const image = await getCurrentImage(database, coachId, imageId || undefined);
    if (!image) return Response.json({ error: "Coach image not found." }, { status: 404 });
    const expectedPrefix = `coach-profile-images/${coachId}/`;
    if (!image.storage_path.startsWith(expectedPrefix) || image.storage_path.includes("..")) {
      return Response.json({ error: "Coach image reference is invalid." }, { status: 404 });
    }
    const object = await getRequiredVideoStorage().get(image.storage_path);
    if (!object) return Response.json({ error: "Coach image not found." }, { status: 404 });
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("Content-Type", image.mime_type);
    headers.set("Cache-Control", "private, max-age=86400");
    headers.set("ETag", object.httpEtag);
    return new Response(object.body, { headers });
  } catch (error) {
    return responseFromError(error);
  }
}

export async function POST(request: Request) {
  try {
    const identity = await requireIdentity();
    const database = getRequiredDatabase();
    await ensurePlatformSchema(database);
    const form = await request.formData();
    const coachId = text(form.get("coachId"), 80) || identity.id;
    if (!canManageCoach(identity, coachId)) {
      return Response.json({ error: "You cannot edit that coach image." }, { status: 403 });
    }
    const coach = await getCoach(database, coachId);
    if (!coach) return Response.json({ error: "Coach not found." }, { status: 404 });
    const image = form.get("image");
    if (!(image instanceof File)) {
      return Response.json({ error: "Choose a JPG, PNG, or WebP headshot." }, { status: 400 });
    }
    const { bytes, mimeType } = await validateUploadedImage(image);
    const current = await getCurrentImage(database, coachId);
    const imageId = crypto.randomUUID();
    const storagePath = `coach-profile-images/${coachId}/${imageId}.${extensionForMime(mimeType)}`;
    const bucket = getRequiredVideoStorage();
    try {
      await bucket.put(storagePath, bytes, {
        httpMetadata: { contentType: mimeType },
        customMetadata: {
          coachId,
          originalFileName: safeFileName(image.name),
          uploadedBy: identity.id,
        },
      });
      await database.batch([
        database
          .prepare("UPDATE coach_profile_images SET is_current = 0, updated_at = CURRENT_TIMESTAMP WHERE coach_user_id = ? AND is_current = 1")
          .bind(coachId),
        database
          .prepare(
            `INSERT INTO coach_profile_images (
              id, coach_user_id, storage_path, original_file_name, mime_type,
              file_size, is_current, created_by, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          )
          .bind(
            imageId,
            coachId,
            storagePath,
            safeFileName(image.name),
            mimeType,
            bytes.byteLength,
            identity.id,
          ),
      ]);
    } catch (error) {
      await bucket.delete(storagePath).catch(() => undefined);
      throw error;
    }
    if (current?.storage_path) {
      await bucket.delete(current.storage_path).catch(() => undefined);
    }
    await recordActivity({
      action: current
        ? identity.role === "admin" ? "admin_replaced_coach_photo" : "coach_replaced_profile_photo"
        : identity.role === "admin" ? "admin_uploaded_coach_photo" : "coach_uploaded_profile_photo",
      actor: identity,
      database,
      entityId: imageId,
      entityType: "coach_profile_image",
      metadata: { coachId, mimeType, size: bytes.byteLength },
      summary: `${identity.displayName} ${current ? "replaced" : "uploaded"} ${displayName(coach)}'s coach photo.`,
      targetUserId: coachId,
    });
    return Response.json({
      ok: true,
      photo: {
        id: imageId,
        coachId,
        mimeType,
        fileSize: bytes.byteLength,
        url: `/api/coach-photo?coachId=${encodeURIComponent(coachId)}&imageId=${encodeURIComponent(imageId)}&v=${Date.now()}`,
      },
    });
  } catch (error) {
    return responseFromError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const identity = await requireIdentity();
    const database = getRequiredDatabase();
    await ensurePlatformSchema(database);
    const payload = await request.json().catch(() => ({})) as { coachId?: unknown };
    const coachId = text(payload.coachId, 80) || identity.id;
    if (!canManageCoach(identity, coachId)) {
      return Response.json({ error: "You cannot edit that coach image." }, { status: 403 });
    }
    const coach = await getCoach(database, coachId);
    if (!coach) return Response.json({ error: "Coach not found." }, { status: 404 });
    const current = await getCurrentImage(database, coachId);
    if (!current) return Response.json({ ok: true, removed: false });
    await database
      .prepare("UPDATE coach_profile_images SET is_current = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(current.id)
      .run();
    await getRequiredVideoStorage().delete(current.storage_path).catch(() => undefined);
    await recordActivity({
      action: identity.role === "admin" ? "admin_removed_coach_photo" : "coach_removed_profile_photo",
      actor: identity,
      database,
      entityId: current.id,
      entityType: "coach_profile_image",
      metadata: { coachId },
      summary: `${identity.displayName} removed ${displayName(coach)}'s coach photo.`,
      targetUserId: coachId,
    });
    return Response.json({ ok: true, removed: true });
  } catch (error) {
    return responseFromError(error);
  }
}
