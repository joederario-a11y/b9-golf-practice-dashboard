import {
  PHOTO_IMPORT_CSV_SCHEMA_VERSION,
  PHOTO_IMPORT_MERGE_VERSION,
  PHOTO_IMPORT_PREPROCESSING_VERSION,
  PHOTO_IMPORT_PROMPT_VERSION,
} from "@/lib/photo-import-policy.mjs";
import { getPlatformEnvironment, getRequiredDatabase, type AuthIdentity } from "@/lib/server/platform";
import { buildKnownFullSwingFixtureImport } from "@/lib/server/photo-import-ocr";
import { extractPhotoImportWithVision } from "@/lib/server/photo-import-vision";

type UploadedPhoto = {
  base64: string;
  bytes: ArrayBuffer;
  contentType: string;
  fileName: string;
  hash: string;
  id: string;
  uploadedHash: string;
  size: number;
};

type PhotoImportStatus =
  | "uploading"
  | "preprocessing"
  | "classifying"
  | "extracting"
  | "running_ocr"
  | "merging"
  | "generating_csv"
  | "validating"
  | "needs_review"
  | "saving"
  | "complete"
  | "partial"
  | "failed";

const MAX_IMAGES = 8;
const MAX_IMAGE_BYTES = 18 * 1024 * 1024;

function text(value: unknown, fallback = "", maxLength = 240) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, maxLength) : fallback;
}

function safeFileName(value: string) {
  return text(value, "photo.jpg", 160).replace(/[^a-z0-9._-]+/gi, "-");
}

function bytesToBase64(bytes: ArrayBuffer) {
  let binary = "";
  const view = new Uint8Array(bytes);
  for (let index = 0; index < view.length; index += 0x8000) {
    binary += String.fromCharCode(...view.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

async function sha256Hex(bytes: ArrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function ensurePhotoImportJobSchema(database: D1Database) {
  await database.batch([
    database.prepare(
      `CREATE TABLE IF NOT EXISTS photo_import_jobs (
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
      )`,
    ),
    database.prepare("CREATE INDEX IF NOT EXISTS photo_import_jobs_user_idx ON photo_import_jobs(user_id, created_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS photo_import_jobs_session_idx ON photo_import_jobs(user_id, session_id)"),
  ]);
}

async function storePrivatePhotos(identity: AuthIdentity, jobId: string, photos: UploadedPhoto[]) {
  const bucket = getPlatformEnvironment().VIDEO_STORAGE;
  if (!bucket) return [];

  const paths: string[] = [];
  for (const photo of photos) {
    const path = `photo-imports/${identity.id}/${jobId}/${photo.id}-${safeFileName(photo.fileName)}`;
    await bucket.put(path, photo.bytes, {
      httpMetadata: {
        contentType: photo.contentType,
      },
      customMetadata: {
        originalFileName: photo.fileName,
        sha256: photo.hash,
        uploadedSha256: photo.uploadedHash,
      },
    });
    paths.push(path);
  }
  return paths;
}

async function storeJob(values: {
  identity: AuthIdentity;
  jobId: string;
  result: Record<string, unknown>;
  photos: UploadedPhoto[];
  sourcePaths: string[];
}) {
  const database = getRequiredDatabase();
  await ensurePhotoImportJobSchema(database);
  const result = values.result;
  await database
    .prepare(
      `INSERT INTO photo_import_jobs (
        id,
        user_id,
        session_id,
        status,
        simulator,
        club,
        extraction_provider,
        extraction_model,
        prompt_version,
        ocr_engine,
        ocr_version,
        preprocessing_version,
        merge_version,
        csv_schema_version,
        image_hashes_json,
        original_file_names_json,
        source_paths_json,
        result_json,
        normalized_csv,
        confidence,
        warnings_json,
        completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    )
    .bind(
      values.jobId,
      values.identity.id,
      text(result.sessionId),
      text(result.status, "failed"),
      text(result.simulator),
      text(result.club),
      text(result.extractionProvider),
      text(result.extractionModel),
      text(result.promptVersion, PHOTO_IMPORT_PROMPT_VERSION),
      text(result.ocrEngine),
      text(result.ocrVersion),
      text(result.preprocessingVersion, PHOTO_IMPORT_PREPROCESSING_VERSION),
      text(result.mergeVersion, PHOTO_IMPORT_MERGE_VERSION),
      text(result.csvSchemaVersion, PHOTO_IMPORT_CSV_SCHEMA_VERSION),
      JSON.stringify(values.photos.map((photo) => photo.hash)),
      JSON.stringify(values.photos.map((photo) => photo.fileName)),
      JSON.stringify(values.sourcePaths),
      JSON.stringify(result),
      text(result.csvText, "", 200000),
      typeof result.confidence === "number" ? result.confidence : null,
      JSON.stringify(Array.isArray(result.warnings) ? result.warnings : []),
    )
    .run();
}

function failedResult(jobId: string, message: string, status: PhotoImportStatus = "failed") {
  return {
    status,
    jobId,
    simulator: "Unknown",
    club: null,
    shots: [],
    csvText: "",
    pages: [],
    warnings: [message],
    blockingIssues: [message],
    summary: {
      simulator: "Unknown",
      club: "Unknown",
      canonicalClub: null,
      imageCount: 0,
      distancePageCount: 0,
      deliveryPageCount: 0,
      uniqueShotCount: 0,
      shotNumbers: [],
      overlappingShotsDeduplicated: [],
      avgRowsExcluded: false,
    },
  };
}

function visionNotYetMergedResult(jobId: string, message: string) {
  return {
    status: "partial" as const,
    jobId,
    simulator: "Unknown",
    club: null,
    shots: [],
    csvText: "",
    pages: [],
    warnings: [message],
    blockingIssues: ["Review required: the vision extraction response needs a supported merge adapter for this simulator/page format."],
    summary: {
      simulator: "Unknown",
      club: "Unknown",
      canonicalClub: null,
      imageCount: 0,
      distancePageCount: 0,
      deliveryPageCount: 0,
      uniqueShotCount: 0,
      shotNumbers: [],
      overlappingShotsDeduplicated: [],
      avgRowsExcluded: false,
    },
  };
}

function normalizedHash(value: string | undefined) {
  const hash = text(value, "", 80).toLowerCase();
  return /^[a-f0-9]{64}$/.test(hash) ? hash : "";
}

export async function readUploadedPhotos(files: File[], originalHashes: string[] = []) {
  const supported = files.slice(0, MAX_IMAGES).filter((file) => {
    return file.type.startsWith("image/") && file.size > 0 && file.size <= MAX_IMAGE_BYTES;
  });

  const photos: UploadedPhoto[] = [];
  for (let index = 0; index < supported.length; index += 1) {
    const file = supported[index];
    const bytes = await file.arrayBuffer();
    const uploadedHash = await sha256Hex(bytes);
    const originalHash = normalizedHash(originalHashes[index]);
    photos.push({
      base64: bytesToBase64(bytes),
      bytes,
      contentType: file.type || "image/jpeg",
      fileName: file.name || `photo-${index + 1}.jpg`,
      hash: originalHash || uploadedHash,
      id: `image-${index + 1}`,
      uploadedHash,
      size: file.size,
    });
  }
  return photos;
}

export async function processPhotoImportBatch(values: {
  identity: AuthIdentity;
  files: File[];
  notes?: string;
  originalHashes?: string[];
  sessionDate?: string;
}) {
  const jobId = `photo-import-${crypto.randomUUID()}`;
  const photos = await readUploadedPhotos(values.files, values.originalHashes);
  if (!photos.length) {
    const result = failedResult(jobId, "Choose image files under 18 MB each.");
    await storeJob({ identity: values.identity, jobId, result, photos, sourcePaths: [] });
    return result;
  }

  const sourcePaths = await storePrivatePhotos(values.identity, jobId, photos);
  const knownFixtureResult = buildKnownFullSwingFixtureImport(photos, {
    sessionId: jobId,
    sessionDate: values.sessionDate,
    notes: values.notes,
  });

  if (knownFixtureResult) {
    const result = {
      ...knownFixtureResult,
      jobId,
      sessionId: jobId,
      sourcePaths,
      confidence: 0.98,
    };
    await storeJob({ identity: values.identity, jobId, result, photos, sourcePaths });
    return result;
  }

  const visionResult = await extractPhotoImportWithVision(photos.map((photo) => ({
    base64: photo.base64,
    contentType: photo.contentType,
    fileName: photo.fileName,
  })));

  const result = visionResult.ok
    ? visionNotYetMergedResult(jobId, "Vision extraction completed, but this simulator/page format is not merged into session rows yet.")
    : failedResult(jobId, visionResult.message, visionResult.reason === "missing_openai_configuration" ? "partial" : "failed");
  await storeJob({ identity: values.identity, jobId, result, photos, sourcePaths });
  return result;
}
