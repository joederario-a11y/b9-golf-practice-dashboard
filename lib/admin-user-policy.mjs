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
