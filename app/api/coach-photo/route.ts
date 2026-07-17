import {
  canManageUserPhoto,
  canViewUserPhoto,
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

type UserImageRow = {
  id: string;
  user_id: string;
  storage_path: string;
  original_file_name: string;
  mime_type: string;
  file_size: number;
  is_current: number;
  updated_at: string;
};

type AppUserRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: "admin" | "coach" | "member";
};

function text(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function displayName(row: { first_name: string; last_name: string; email?: string }) {
  return [row.first_name, row.last_name].filter(Boolean).join(" ") || row.email || "User";
}

function safeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-").slice(0, 100) || "headshot";
}

function extensionForMime(mimeType: string) {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

function photoUrl(userId: string, imageId: string, version = Date.now().toString()) {
  const params = new URLSearchParams({ imageId, userId, v: version });
  return `/api/coach-photo?${params.toString()}`;
}

async function getUser(database: D1Database, userId: string) {
  return database
    .prepare("SELECT id, first_name, last_name, email, role FROM users WHERE id = ?")
    .bind(userId)
    .first<AppUserRow>();
}

async function memberIsAssignedToCoach(database: D1Database, memberId: string, coachId: string) {
  const row = await database
    .prepare("SELECT id FROM coach_members WHERE member_id = ? AND coach_id = ?")
    .bind(memberId, coachId)
    .first<{ id: string }>();
  return Boolean(row);
}

async function relationshipFor(identity: AuthIdentity, database: D1Database, targetUser: AppUserRow) {
  return {
    isAssignedCoach: identity.role === "coach" && targetUser.role === "member"
      ? await memberIsAssignedToCoach(database, targetUser.id, identity.id)
      : false,
    isAssignedMember: identity.role === "member" && targetUser.role === "coach"
      ? await memberIsAssignedToCoach(database, identity.id, targetUser.id)
      : false,
  };
}

async function getCurrentImage(database: D1Database, userId: string, imageId?: string) {
  const query = imageId
    ? `SELECT * FROM user_profile_images
       WHERE user_id = ? AND id = ? AND is_current = 1`
    : `SELECT * FROM user_profile_images
       WHERE user_id = ? AND is_current = 1
       ORDER BY updated_at DESC LIMIT 1`;
  const statement = database.prepare(query);
  return imageId
    ? statement.bind(userId, imageId).first<UserImageRow>()
    : statement.bind(userId).first<UserImageRow>();
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

function imagePathIsSafe(image: UserImageRow, userId: string) {
  if (image.storage_path.includes("..")) return false;
  return image.storage_path.startsWith(`user-profile-images/${userId}/`) ||
    image.storage_path.startsWith(`coach-profile-images/${userId}/`);
}

export async function GET(request: Request) {
  try {
    const identity = await requireIdentity();
    const database = getRequiredDatabase();
    await ensurePlatformSchema(database);
    const url = new URL(request.url);
    const userId = text(url.searchParams.get("userId"), 80) || text(url.searchParams.get("coachId"), 80);
    const imageId = text(url.searchParams.get("imageId"), 80);
    if (!userId) return Response.json({ error: "userId is required." }, { status: 400 });
    const user = await getUser(database, userId);
    if (!user) return Response.json({ error: "User image not found." }, { status: 404 });
    const relationship = await relationshipFor(identity, database, user);
    if (!canViewUserPhoto(identity, user, relationship)) {
      return Response.json({ error: "You do not have access to that user image." }, { status: 403 });
    }
    const image = await getCurrentImage(database, userId, imageId || undefined);
    if (!image || !imagePathIsSafe(image, userId)) return Response.json({ error: "User image not found." }, { status: 404 });
    const object = await getRequiredVideoStorage().get(image.storage_path);
    if (!object) return Response.json({ error: "User image not found." }, { status: 404 });
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
    const userId = text(form.get("userId"), 80) || text(form.get("coachId"), 80) || identity.id;
    const user = await getUser(database, userId);
    if (!user) return Response.json({ error: "User not found." }, { status: 404 });
    const relationship = await relationshipFor(identity, database, user);
    if (!canManageUserPhoto(identity, user, relationship)) {
      return Response.json({ error: "You cannot edit that user image." }, { status: 403 });
    }
    const image = form.get("image");
    if (!(image instanceof File)) {
      return Response.json({ error: "Choose a JPG, PNG, or WebP headshot." }, { status: 400 });
    }
    const { bytes, mimeType } = await validateUploadedImage(image);
    const current = await getCurrentImage(database, userId);
    const imageId = crypto.randomUUID();
    const storagePath = `user-profile-images/${userId}/${imageId}.${extensionForMime(mimeType)}`;
    const bucket = getRequiredVideoStorage();
    try {
      await bucket.put(storagePath, bytes, {
        httpMetadata: { contentType: mimeType },
        customMetadata: {
          originalFileName: safeFileName(image.name),
          uploadedBy: identity.id,
          userId,
        },
      });
      await database.batch([
        database
          .prepare("UPDATE user_profile_images SET is_current = 0, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND is_current = 1")
          .bind(userId),
        database
          .prepare(
            `INSERT INTO user_profile_images (
              id, user_id, storage_path, original_file_name, mime_type,
              file_size, is_current, created_by, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          )
          .bind(
            imageId,
            userId,
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
      action: current ? "user_profile_photo_replaced" : "user_profile_photo_uploaded",
      actor: identity,
      database,
      entityId: imageId,
      entityType: "user_profile_image",
      metadata: { mimeType, role: user.role, size: bytes.byteLength, userId },
      summary: `${identity.displayName} ${current ? "replaced" : "uploaded"} ${displayName(user)}'s profile photo.`,
      targetUserId: userId,
    });
    return Response.json({
      ok: true,
      photo: {
        fileSize: bytes.byteLength,
        id: imageId,
        mimeType,
        url: photoUrl(userId, imageId),
        userId,
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
    const payload = await request.json().catch(() => ({})) as { coachId?: unknown; userId?: unknown };
    const userId = text(payload.userId, 80) || text(payload.coachId, 80) || identity.id;
    const user = await getUser(database, userId);
    if (!user) return Response.json({ error: "User not found." }, { status: 404 });
    const relationship = await relationshipFor(identity, database, user);
    if (!canManageUserPhoto(identity, user, relationship)) {
      return Response.json({ error: "You cannot edit that user image." }, { status: 403 });
    }
    const current = await getCurrentImage(database, userId);
    if (!current) return Response.json({ ok: true, removed: false });
    await database
      .prepare("UPDATE user_profile_images SET is_current = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(current.id)
      .run();
    await getRequiredVideoStorage().delete(current.storage_path).catch(() => undefined);
    await recordActivity({
      action: "user_profile_photo_removed",
      actor: identity,
      database,
      entityId: current.id,
      entityType: "user_profile_image",
      metadata: { role: user.role, userId },
      summary: `${identity.displayName} removed ${displayName(user)}'s profile photo.`,
      targetUserId: userId,
    });
    return Response.json({ ok: true, removed: true });
  } catch (error) {
    return responseFromError(error);
  }
}
