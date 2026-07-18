export const ALL_SESSION_CLUBS = "all";

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function clubKey(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function sessionShots(session) {
  return isRecord(session) && Array.isArray(session.shots) ? session.shots.filter(isRecord) : [];
}

export function getSessionClubOptions(session, clubOrder = []) {
  const seen = new Set();
  const clubs = [];

  for (const shot of sessionShots(session)) {
    const club = text(shot.club);
    if (!club || seen.has(club)) continue;
    seen.add(club);
    clubs.push(club);
  }

  const order = Array.isArray(clubOrder) ? clubOrder : [];
  return [
    ...order.filter((club) => seen.has(club)),
    ...clubs.filter((club) => !order.includes(club)),
  ];
}

export function findSessionClub(clubs, requestedClub) {
  const requested = clubKey(requestedClub);
  if (!requested) return null;
  return clubs.find((club) => clubKey(club) === requested) ?? null;
}

export function getSessionViewShots(session, selection = {}) {
  const shots = sessionShots(session);
  const club = text(selection.club, ALL_SESSION_CLUBS);
  if (club === ALL_SESSION_CLUBS) return shots;
  return shots.filter((shot) => shot.club === club);
}

export function resolveSessionViewSelection(session, requested = {}, options = {}) {
  const clubs = getSessionClubOptions(session, options.clubOrder);
  const shots = sessionShots(session);
  const requestedShotId = text(requested.shotId);
  const requestedShot = requestedShotId ? shots.find((shot) => text(shot.id) === requestedShotId) : null;
  const requestedClub = text(requested.club, "");
  const currentClub = text(options.currentClub, "");
  let club = ALL_SESSION_CLUBS;

  if (clubs.length === 1) {
    club = clubs[0];
  } else if (requestedShot && (!requestedClub || requestedClub === ALL_SESSION_CLUBS)) {
    club = text(requestedShot.club, ALL_SESSION_CLUBS);
  } else if (requestedClub === ALL_SESSION_CLUBS) {
    club = ALL_SESSION_CLUBS;
  } else {
    club =
      findSessionClub(clubs, requestedClub) ??
      findSessionClub(clubs, currentClub) ??
      ALL_SESSION_CLUBS;
  }

  const filteredShots = getSessionViewShots(session, { club });
  const shotId = requestedShotId && filteredShots.some((shot) => text(shot.id) === requestedShotId)
    ? requestedShotId
    : null;
  const metric = text(requested.metric, "") || null;

  return {
    club,
    shotId,
    metric,
  };
}

export function makeSessionAnalysisKey(sessionId, selection = {}) {
  const baseId = text(sessionId);
  const club = text(selection.club, ALL_SESSION_CLUBS);
  if (!baseId || club === ALL_SESSION_CLUBS) return baseId;
  return `${baseId}::club=${encodeURIComponent(club)}`;
}
