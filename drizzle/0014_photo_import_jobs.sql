CREATE TABLE IF NOT EXISTS photo_import_jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  session_id TEXT,
  status TEXT NOT NULL,
  simulator TEXT,
  club TEXT,
  extraction_provider TEXT NOT NULL DEFAULT '',
  extraction_model TEXT NOT NULL DEFAULT '',
  prompt_version TEXT NOT NULL DEFAULT '',
  ocr_engine TEXT NOT NULL DEFAULT '',
  ocr_version TEXT NOT NULL DEFAULT '',
  preprocessing_version TEXT NOT NULL DEFAULT '',
  merge_version TEXT NOT NULL DEFAULT '',
  csv_schema_version TEXT NOT NULL DEFAULT '',
  image_hashes_json TEXT NOT NULL DEFAULT '[]',
  original_file_names_json TEXT NOT NULL DEFAULT '[]',
  source_paths_json TEXT NOT NULL DEFAULT '[]',
  result_json TEXT NOT NULL DEFAULT '{}',
  normalized_csv TEXT NOT NULL DEFAULT '',
  confidence REAL,
  warnings_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS photo_import_jobs_user_idx
  ON photo_import_jobs(user_id, created_at);

CREATE INDEX IF NOT EXISTS photo_import_jobs_session_idx
  ON photo_import_jobs(user_id, session_id);
