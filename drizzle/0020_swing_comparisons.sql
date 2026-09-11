CREATE TABLE IF NOT EXISTS lesson_swing_comparisons (
  video_id TEXT PRIMARY KEY REFERENCES lesson_videos(id) ON DELETE CASCADE,
  draft_json TEXT,
  published_json TEXT,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
