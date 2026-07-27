function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function lower(value) {
  return text(value).toLowerCase();
}

function displayName(identity = {}) {
  return text(identity.displayName) ||
    [identity.firstName, identity.lastName].map((part) => text(part)).filter(Boolean).join(" ") ||
    text(identity.email) ||
    "MAI Coach golfer";
}

function profileMatchesIdentity(profile = {}, identity = {}) {
  const profileEmail = lower(profile.email);
  const identityEmail = lower(identity.email);
  if (profileEmail && identityEmail && profileEmail !== identityEmail) return false;

  const profileRole = lower(profile.role);
  const identityRole = lower(identity.role);
  if (identityRole === "member" && (profileRole === "coach" || profileRole === "admin")) return false;
  if (identityRole === "coach" && profileRole === "admin") return false;
  return true;
}

export function shouldPersistLocalPracticeProfileForIdentity(profile, identity = {}) {
  if (!isRecord(profile)) return false;
  return profileMatchesIdentity(profile, identity);
}

export function sanitizePracticeProfileForIdentity(profile, identity = {}) {
  if (!isRecord(profile)) return {};
  const normalized = { ...profile };
  const identityRole = lower(identity.role);
  const identityEmail = text(identity.email);
  const identityName = displayName(identity);

  if (!profileMatchesIdentity(normalized, identity)) {
    delete normalized.facilityName;
    delete normalized.coachBio;
    delete normalized.specialties;
    delete normalized.location;
    delete normalized.profilePhotoName;
    delete normalized.coachNotes;
  }

  if (identityRole === "member") {
    normalized.role = "player";
  } else if (identityRole) {
    normalized.role = identityRole;
  }
  if (identityEmail) normalized.email = identityEmail;
  if (identityName) normalized.displayName = identityName;

  return normalized;
}
