import assert from "node:assert/strict";
import test from "node:test";

import {
  coachMatchesActiveContext,
  getActiveCoachContext,
  isActiveCoachRelationshipRecord,
} from "../lib/coach-relationship-policy.mjs";
import {
  sanitizePracticeProfileForIdentity,
  shouldPersistLocalPracticeProfileForIdentity,
} from "../lib/practice-profile-ownership-policy.mjs";

test("canonical coach relationship policy excludes non-active relationship states", () => {
  assert.equal(isActiveCoachRelationshipRecord({ id: "rel-1", coachId: "zac" }), true);
  assert.equal(isActiveCoachRelationshipRecord({ id: "rel-2", coachId: "zac", status: "pending" }), false);
  assert.equal(isActiveCoachRelationshipRecord({ id: "rel-3", coachId: "zac", status: "archived" }), false);
  assert.equal(isActiveCoachRelationshipRecord({ id: "rel-4", coachId: "zac", deletedAt: "2026-07-27" }), false);
  assert.equal(isActiveCoachRelationshipRecord({ id: "rel-5", coachId: "zac", accountStatus: "inactive" }), false);
});

test("coach attribution requires the source coach to match the active relationship", () => {
  const activeCoach = getActiveCoachContext([{ id: "rel-1", coachId: "zac", coachName: "Zac Malone" }]);

  assert.equal(activeCoach.hasActiveCoach, true);
  assert.equal(coachMatchesActiveContext("zac", activeCoach), true);
  assert.equal(coachMatchesActiveContext("joey", activeCoach), false);
  assert.equal(coachMatchesActiveContext(null, activeCoach), false);
});

test("local profile sync refuses to attach a coach profile to an unrelated member", () => {
  const localCoachProfile = {
    role: "coach",
    displayName: "Zac Malone",
    email: "woodstock@thebackninegolf.com",
    facilityName: "The Back Nine",
    coachBio: "Played 10 Years on PGA",
  };
  const dave = {
    role: "member",
    displayName: "Dave Matthews",
    email: "jderario@icloud.com",
  };

  assert.equal(shouldPersistLocalPracticeProfileForIdentity(localCoachProfile, dave), false);
  assert.deepEqual(sanitizePracticeProfileForIdentity(localCoachProfile, dave), {
    role: "player",
    displayName: "Dave Matthews",
    email: "jderario@icloud.com",
  });
});
