function text(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function lower(value) {
  return text(value).toLowerCase();
}

const INACTIVE_RELATIONSHIP_STATUSES = new Set([
  "archived",
  "cancelled",
  "canceled",
  "declined",
  "deleted",
  "expired",
  "inactive",
  "invited",
  "pending",
  "removed",
]);

export function isActiveCoachRelationshipRecord(relationship = {}) {
  if (!relationship || typeof relationship !== "object" || Array.isArray(relationship)) return false;
  if (relationship.active === false || relationship.isActive === false) return false;
  if (relationship.deleted === true || relationship.isDeleted === true) return false;
  if (relationship.archived === true || relationship.isArchived === true) return false;
  if (relationship.cancelled === true || relationship.isCancelled === true) return false;
  if (relationship.expired === true || relationship.isExpired === true) return false;
  if (text(relationship.deletedAt || relationship.deleted_at)) return false;
  if (text(relationship.archivedAt || relationship.archived_at)) return false;
  if (text(relationship.cancelledAt || relationship.cancelled_at)) return false;
  if (text(relationship.expiredAt || relationship.expired_at)) return false;

  const explicitRelationshipStatus = text(
    relationship.status ||
      relationship.relationshipStatus ||
      relationship.relationship_status ||
      relationship.inviteStatus ||
      relationship.invite_status,
  );
  if (explicitRelationshipStatus && INACTIVE_RELATIONSHIP_STATUSES.has(lower(explicitRelationshipStatus))) return false;
  if (explicitRelationshipStatus && lower(explicitRelationshipStatus) !== "active") return false;

  const accountStatus = text(relationship.accountStatus || relationship.account_status);
  if (accountStatus && lower(accountStatus) !== "active") return false;
  return true;
}

export function activeCoachRelationships(relationships = []) {
  return (Array.isArray(relationships) ? relationships : [])
    .filter(isActiveCoachRelationshipRecord);
}

export function getActiveCoachContext(relationships = []) {
  const activeRelationships = activeCoachRelationships(relationships);
  const relationship = activeRelationships[0] ?? null;
  return {
    hasActiveCoach: Boolean(relationship),
    relationshipId: text(relationship?.relationshipId || relationship?.relationship_id || relationship?.id) || null,
    coachId: text(relationship?.coachId || relationship?.coach_id || relationship?.id) || null,
    coachName: text(relationship?.coachName || relationship?.coach_name || relationship?.name) || null,
  };
}

export function coachMatchesActiveContext(coachId, activeCoachContext = {}) {
  const candidateCoachId = text(coachId);
  const activeCoachId = text(activeCoachContext.coachId);
  return Boolean(candidateCoachId && activeCoachId && candidateCoachId === activeCoachId);
}
