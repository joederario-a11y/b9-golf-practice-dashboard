export const ADMIN_USER_ROLES = new Set(["admin", "coach", "member"]);
export const ACCOUNT_STATUSES = new Set(["active", "inactive"]);
export const INVITE_STATUSES = new Set(["pending", "sent", "accepted", "active"]);
export const MAX_COACH_HEADSHOT_BYTES = 5 * 1024 * 1024;
export const COACH_HEADSHOT_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

export function validatePassword(password) {
  if (typeof password !== "string" || password.length < 8) {
    return "Password must be at least 8 characters.";
  }
  return "";
}

export function validatePasswordConfirmation(password, confirmPassword) {
  const passwordError = validatePassword(password);
  if (passwordError) return passwordError;
  if (password !== confirmPassword) return "Password and confirmation must match.";
  return "";
}

export function safeRole(value, fallback = "member") {
  return ADMIN_USER_ROLES.has(value) ? value : fallback;
}

export function safeAccountStatus(value, fallback = "active") {
  return ACCOUNT_STATUSES.has(value) ? value : fallback;
}

export function safeInviteStatus(value, fallback = "pending") {
  return INVITE_STATUSES.has(value) ? value : fallback;
}

export function deriveSetupStatus(user) {
  const flags = [];
  if (user.accountStatus === "inactive") flags.push("Inactive");
  if (user.inviteStatus && user.inviteStatus !== "accepted" && user.inviteStatus !== "active") {
    flags.push("Pending setup");
  }
  flags.push(user.passwordConfigured ? "Password configured" : "Password not configured");
  if (user.passwordResetRequired) flags.push("Password change required");
  flags.push(user.lastLoginAt ? `Last login ${user.lastLoginAt}` : "Never logged in");
  return flags;
}

export function displayPersonName(firstName, lastName, email = "") {
  return [firstName, lastName].filter(Boolean).join(" ").trim() || email || "User";
}

export function splitDisplayNameForRegistration(displayName) {
  const cleanName = typeof displayName === "string" ? displayName.trim().replace(/\s+/g, " ") : "";
  if (!cleanName) {
    return { firstName: "", lastName: "" };
  }
  const parts = cleanName.split(" ");
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "" };
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

export function adminCreateUserGuard(identityRole, existingUser) {
  if (identityRole !== "admin") {
    return {
      message: "Only admins can create users from the admin workspace.",
      status: 403,
    };
  }
  if (existingUser) {
    return {
      message: "That email already exists. Open the existing user and edit by ID instead.",
      status: 409,
    };
  }
  return null;
}

export function singleCoachAssignmentGuard({ identityRole, identityId, coachId, existingCoachIds = [] }) {
  const uniqueCoachIds = Array.from(new Set(existingCoachIds.filter(Boolean)));
  if (identityRole !== "admin" && identityId !== coachId) {
    return {
      allowed: false,
      message: "Only admins can reassign members to another coach.",
      status: 403,
    };
  }
  if (identityRole !== "admin" && uniqueCoachIds.length > 1) {
    return {
      allowed: false,
      message: "This member has conflicting coach assignments. Ask an admin to review the assignment.",
      status: 409,
    };
  }
  if (identityRole !== "admin" && uniqueCoachIds.length > 0 && !uniqueCoachIds.includes(coachId)) {
    return {
      allowed: false,
      message: "This member is already assigned to another coach. Ask an admin to reassign them.",
      status: 409,
    };
  }
  return {
    allowed: true,
    alreadyAssigned: uniqueCoachIds.includes(coachId),
    existingCoachIds: uniqueCoachIds,
  };
}

export function finalActiveAdminChangeGuard({
  activeAdminCount,
  existingAccountStatus,
  existingRole,
  nextAccountStatus,
  nextRole,
}) {
  const isExistingActiveAdmin = existingRole === "admin" && existingAccountStatus !== "inactive";
  const remainsActiveAdmin = nextRole === "admin" && nextAccountStatus !== "inactive";
  if (isExistingActiveAdmin && !remainsActiveAdmin && Number(activeAdminCount ?? 0) <= 1) {
    return {
      message: "You cannot remove or deactivate the final active admin account.",
      status: 409,
    };
  }
  return null;
}

export function canManageCoachPhoto(identity, coachId) {
  return identity?.role === "admin" || (identity?.role === "coach" && identity?.id === coachId);
}

export function canViewCoachPhoto(identity, coachId, isAssignedMember = false) {
  if (identity?.role === "admin") return true;
  if (identity?.role === "coach") return identity.id === coachId;
  return identity?.role === "member" && isAssignedMember;
}

function rowName(row, prefix) {
  return displayPersonName(row[`${prefix}_first_name`], row[`${prefix}_last_name`], row[`${prefix}_email`]);
}

export function buildCoachReconciliationCandidates(videoRows, existingCoachRows = []) {
  const existingByMember = new Map();
  for (const row of existingCoachRows) {
    const coaches = existingByMember.get(row.member_id) ?? [];
    coaches.push({
      coachId: row.coach_id,
      coachName: rowName(row, "coach"),
    });
    existingByMember.set(row.member_id, coaches);
  }

  const rowsByMember = new Map();
  for (const row of videoRows) {
    rowsByMember.set(row.member_id, [...(rowsByMember.get(row.member_id) ?? []), row]);
  }

  return Array.from(rowsByMember.values()).map((rows) => {
    const first = rows[0];
    const existingCoaches = existingByMember.get(first.member_id) ?? [];
    const choicesByCoach = new Map();
    for (const row of rows) {
      const previous = choicesByCoach.get(row.coach_id);
      choicesByCoach.set(row.coach_id, {
        coachId: row.coach_id,
        coachName: rowName(row, "coach"),
        videoCount: Number(previous?.videoCount ?? 0) + Number(row.video_count ?? 0),
        videoEvidence: [
          ...(previous?.videoEvidence ?? []),
          {
            publicationStatus: row.publication_status ?? null,
            title: row.video_title ?? "Untitled video",
            uploadStatus: row.upload_status ?? null,
          },
        ],
      });
    }
    const choices = Array.from(choicesByCoach.values());
    const hasSingleVideoCoach = choices.length === 1;
    const repairable = existingCoaches.length === 0 && hasSingleVideoCoach;
    return {
      ambiguous: !repairable,
      choices,
      existingCoaches,
      existingCoachNames: existingCoaches.map((coach) => coach.coachName),
      memberEmail: first.member_email,
      memberId: first.member_id,
      memberName: displayPersonName(first.member_first_name, first.member_last_name, first.member_email),
      repairable,
      suggestedCoachId: hasSingleVideoCoach ? choices[0].coachId : "",
      suggestedCoachName: hasSingleVideoCoach ? choices[0].coachName : "",
    };
  });
}

export function validateCoachHeadshotFile(mimeType, fileSize) {
  if (!COACH_HEADSHOT_MIME_TYPES.has(mimeType)) {
    return "Use a JPG, PNG, or WebP headshot.";
  }
  if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > MAX_COACH_HEADSHOT_BYTES) {
    return "Choose a headshot smaller than 5 MB.";
  }
  return "";
}

export function sniffImageMimeType(bytes) {
  if (!bytes || bytes.length < 4) return "";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return "";
}
