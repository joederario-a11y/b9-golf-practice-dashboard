INSERT INTO users (
  id, role, first_name, last_name, email, phone, skill_level, notes,
  invite_status, invited_at, created_by, created_at, updated_at
) VALUES
  (
    'demo-admin-ava', 'admin', 'Ava', 'Admin', 'admin.demo@thebackninegolf.com',
    '(555) 010-0100', 'Admin', 'Seeded admin account for production admin workflow demos.',
    'accepted', CURRENT_TIMESTAMP, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  ),
  (
    'demo-coach-zac', 'coach', 'Zac', 'Coach', 'zac.demo@thebackninegolf.com',
    '(555) 010-0101', 'Coach', 'Seeded coach account for production smoke tests.',
    'accepted', CURRENT_TIMESTAMP, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  ),
  (
    'demo-member-sam', 'member', 'Sam', 'Sample Player', 'sam.sample@thebackninegolf.com',
    '(555) 010-0199', 'Demo student', 'Seeded sample player for lesson video assignment demos.',
    'accepted', CURRENT_TIMESTAMP, 'demo-coach-zac', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  ),
  (
    'demo-member-joe', 'member', 'Joe', 'Demo Player', 'joe.demo@thebackninegolf.com',
    '(555) 010-0102', 'Player', 'Seeded player account with simulator demo data.',
    'accepted', CURRENT_TIMESTAMP, 'demo-coach-zac', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  )
ON CONFLICT(email) DO UPDATE SET
  role = excluded.role,
  first_name = excluded.first_name,
  last_name = excluded.last_name,
  phone = excluded.phone,
  skill_level = excluded.skill_level,
  notes = excluded.notes,
  invite_status = excluded.invite_status,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO coach_members (id, coach_id, member_id, created_at) VALUES
  ('demo-assignment-zac-sam', 'demo-coach-zac', 'demo-member-sam', CURRENT_TIMESTAMP),
  ('demo-assignment-zac-joe', 'demo-coach-zac', 'demo-member-joe', CURRENT_TIMESTAMP)
ON CONFLICT(coach_id, member_id) DO NOTHING;

INSERT INTO golf_session_snapshots (
  user_email, user_id, display_name, sessions_json, created_at, updated_at
) VALUES (
  'joe.demo@thebackninegolf.com',
  'demo-member-joe',
  'Joe Demo Player',
  '[{"id":"seeded-sand-wedge-session","title":"Seeded sand wedge session","date":"2026-07-15","source":"Seed data","focus":"Wedge distance control","location":"Back Nine Woodstock","shots":[{"id":"seeded-shot-1","club":"SW","carry":93,"total":100,"ballSpeed":77,"clubSpeed":68,"smash":1.13,"launch":31.7,"spin":6626,"offline":5.5,"shape":"Fade","proximity":18,"apex":68,"descent":39.8},{"id":"seeded-shot-2","club":"SW","carry":102,"total":110,"ballSpeed":81,"clubSpeed":70,"smash":1.16,"launch":26.8,"spin":7000,"offline":7.4,"shape":"Fade","proximity":24,"apex":61,"descent":46}]}]',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT(user_email) DO UPDATE SET
  user_id = excluded.user_id,
  display_name = excluded.display_name,
  sessions_json = excluded.sessions_json,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO golf_practice_profiles (
  user_email, user_id, display_name, profile_json, created_at, updated_at
) VALUES (
  'joe.demo@thebackninegolf.com',
  'demo-member-joe',
  'Joe Demo Player',
  '{"skillLevel":"Weekend golfer","handicap":"12","simExperience":"Regular","simulatorGoals":["Wedge control","Shot shape"],"goals":["Lower scores","Better practice"],"frustrations":["Distance control"],"practiceStyle":["Data guided"],"timeAvailable":"45 minutes","frequency":"2x per week","experienceStyle":["Coach feedback"],"path":"Casual","completedAt":"2026-07-15T12:00:00.000Z"}',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT(user_email) DO UPDATE SET
  user_id = excluded.user_id,
  display_name = excluded.display_name,
  profile_json = excluded.profile_json,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO member_content_items (
  id, member_id, created_by, content_type, title, body, visibility, status,
  session_data_id, metadata_json, created_at, updated_at
) VALUES
  (
    'demo-content-sam-drill',
    'demo-member-sam',
    'demo-coach-zac',
    'drill',
    'Clock wedge ladder',
    'Hit 3 sets of 6 balls at 70, 85, and 100 yards. Score landing-zone proximity after each set.',
    'member',
    'active',
    'seeded-sand-wedge-session',
    '{"club":"SW","priority":"Wedge distance control"}',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'demo-content-joe-plan',
    'demo-member-joe',
    'demo-coach-zac',
    'practice_recommendation',
    'Wedge start-line tune-up',
    'Begin each practice with 10 half-speed wedges through a start-line gate before moving to carry targets.',
    'member',
    'active',
    'seeded-sand-wedge-session',
    '{"club":"SW","priority":"Start line"}',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )
ON CONFLICT(id) DO UPDATE SET
  title = excluded.title,
  body = excluded.body,
  visibility = excluded.visibility,
  status = excluded.status,
  session_data_id = excluded.session_data_id,
  metadata_json = excluded.metadata_json,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO member_activity_log (
  id, actor_id, actor_role, member_id, target_user_id, entity_type, entity_id,
  action, summary, metadata_json, created_at
) VALUES
  (
    'demo-activity-admin-created',
    'demo-admin-ava',
    'admin',
    NULL,
    'demo-coach-zac',
    'user',
    'demo-coach-zac',
    'user_created',
    'Ava Admin seeded Coach Zac for the demo workspace.',
    '{}',
    CURRENT_TIMESTAMP
  ),
  (
    'demo-activity-coach-assigned',
    'demo-admin-ava',
    'admin',
    'demo-member-sam',
    'demo-member-sam',
    'coach_assignment',
    'demo-assignment-zac-sam',
    'coach_assigned',
    'Ava Admin assigned Sam Sample Player to Zac Coach.',
    '{"coachId":"demo-coach-zac"}',
    CURRENT_TIMESTAMP
  ),
  (
    'demo-activity-drill-added',
    'demo-coach-zac',
    'coach',
    'demo-member-sam',
    'demo-member-sam',
    'content',
    'demo-content-sam-drill',
    'content_added',
    'Zac Coach added a wedge ladder drill for Sam Sample Player.',
    '{"contentType":"drill"}',
    CURRENT_TIMESTAMP
  )
ON CONFLICT(id) DO UPDATE SET
  summary = excluded.summary,
  metadata_json = excluded.metadata_json;
