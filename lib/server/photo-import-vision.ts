import OpenAI from "openai";

import { PHOTO_IMPORT_METRIC_ORDER, normalizeVisionPhotoImportResult } from "@/lib/photo-import-policy.mjs";
import {
  getOpenAIConfigurationIssue,
  getPlatformEnvironment,
  openAIConfigurationDiagnostic,
  sanitizeOpenAIError,
} from "@/lib/server/platform";

type UploadedVisionImage = {
  base64: string;
  contentType: string;
  fileName: string;
};

const PAGE_TYPES = ["shot_history_distance", "shot_history_delivery", "unknown"] as const;

function extractedCellSchema() {
  return {
    anyOf: [
      { type: "null" },
      {
        type: "object",
        additionalProperties: false,
        required: ["rawText", "value", "direction", "confidence"],
        properties: {
          rawText: { type: "string" },
          value: { type: ["number", "null"] },
          direction: { type: ["string", "null"], enum: ["L", "R", null] },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
      },
    ],
  };
}

function metricRecordSchema() {
  const cell = extractedCellSchema();
  return {
    type: "object",
    additionalProperties: false,
    required: PHOTO_IMPORT_METRIC_ORDER,
    properties: Object.fromEntries(PHOTO_IMPORT_METRIC_ORDER.map((metric) => [metric, cell])),
  };
}

const photoImportExtractionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["simulator", "club", "pages", "warnings"],
  properties: {
    simulator: { type: "string" },
    club: { type: ["string", "null"] },
    warnings: { type: "array", items: { type: "string" } },
    pages: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "fileName",
          "pageType",
          "visibleShotNumbers",
          "containsAverageRow",
          "averageMetrics",
          "rows",
          "confidence",
          "warnings",
        ],
        properties: {
          fileName: { type: "string" },
          pageType: { type: "string", enum: PAGE_TYPES },
          visibleShotNumbers: { type: "array", items: { type: "number" } },
          containsAverageRow: { type: "boolean" },
          averageMetrics: metricRecordSchema(),
          rows: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["shotNumber", "metrics"],
              properties: {
                shotNumber: { type: ["number", "null"] },
                metrics: metricRecordSchema(),
              },
            },
          },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          warnings: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
};

function emptyMetricRecord() {
  return Object.fromEntries(PHOTO_IMPORT_METRIC_ORDER.map((metric) => [metric, null]));
}

function promptText(fileNames: string[], repair = false) {
  return [
    "You are extracting golf launch-monitor shot-history tables for MAI Coach.",
    "Read only visible data from the supplied images. Do not infer hidden rows, hidden columns, AVG rows, or missing values.",
    "The target simulator is often Full Swing, but detect the simulator and selected club from the images.",
    "Classify each image page as shot_history_distance, shot_history_delivery, or unknown.",
    "Return every visible shot row. Keep AVG rows separate in averageMetrics and do not include AVG as a shot.",
    "Use the canonical metric keys exactly: " + PHOTO_IMPORT_METRIC_ORDER.join(", ") + ".",
    "For every metric key that is not visible in a row, return null.",
    "For L/R values, set value negative for L and positive for R, while preserving the rawText and direction.",
    "Preserve decimal points and units in rawText. If a value is unreadable, use value null with low confidence.",
    `Input file names in order: ${fileNames.join(", ")}`,
    repair ? "This is a repair attempt. Return schema-valid JSON only." : "",
  ].filter(Boolean).join("\n");
}

function parseAndValidateVisionOutput(outputText: string, imageFileNames: string[]) {
  const parsed = JSON.parse(outputText) as unknown;
  return normalizeVisionPhotoImportResult(parsed, { imageFileNames });
}

async function requestVisionExtraction(client: OpenAI, model: string, images: UploadedVisionImage[], repair = false) {
  const fileNames = images.map((image) => image.fileName);
  const response = await client.responses.create({
    model,
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: promptText(fileNames, repair) }],
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: "Extract these related shot-history screenshots as one session batch. Return only structured data.",
          },
          ...images.map((image) => ({
            type: "input_image" as const,
            image_url: `data:${image.contentType};base64,${image.base64}`,
          })),
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "mai_photo_import_extraction",
        strict: true,
        schema: photoImportExtractionSchema,
      },
      verbosity: "medium",
    },
    max_output_tokens: 8000,
    store: false,
  } as never);

  const outputText = (response as { output_text?: string }).output_text?.trim();
  if (!outputText) {
    throw new Error("empty_vision_response");
  }
  return parseAndValidateVisionOutput(outputText, fileNames);
}

export async function extractPhotoImportWithVision(images: UploadedVisionImage[]) {
  const runtime = getPlatformEnvironment();
  const apiKey = runtime.OPENAI_API_KEY;
  const model = runtime.OPENAI_VISION_MODEL || runtime.OPENAI_ANALYSIS_MODEL || runtime.OPENAI_MODEL;
  const configurationIssue = getOpenAIConfigurationIssue(runtime);
  if (configurationIssue || !model) {
    const diagnostic = configurationIssue
      ? openAIConfigurationDiagnostic(configurationIssue, {
          endpoint: "responses.create",
          model,
          operation: "photo_import_vision",
        })
      : null;
    return {
      ok: false as const,
      reason: configurationIssue?.code ?? "missing_openai_configuration",
      message: configurationIssue?.publicMessage ?? "Photo vision extraction is not connected in this environment.",
      ...(diagnostic ? { diagnostic } : {}),
    };
  }

  const client = new OpenAI({ apiKey, timeout: 60000 });
  try {
    const extraction = await requestVisionExtraction(client, model, images);
    return {
      ok: true as const,
      model,
      extraction,
      confidence: extraction.pages.length
        ? extraction.pages.reduce((sum, page) => sum + page.confidence, 0) / extraction.pages.length
        : 0.4,
    };
  } catch (firstError) {
    const firstDiagnostic = sanitizeOpenAIError(firstError, {
      endpoint: "responses.create",
      model,
      operation: "photo_import_vision",
    });
    if (firstDiagnostic.category === "schema_validation_failed" || firstDiagnostic.category === "empty_response") {
      try {
        const extraction = await requestVisionExtraction(client, model, images, true);
        return {
          ok: true as const,
          model,
          extraction: {
            ...extraction,
            warnings: [
              ...extraction.warnings,
              "The first vision response required a schema repair pass.",
            ],
          },
          confidence: extraction.pages.length
            ? Math.max(0.4, extraction.pages.reduce((sum, page) => sum + page.confidence, 0) / extraction.pages.length - 0.08)
            : 0.35,
        };
      } catch (repairError) {
        const repairDiagnostic = sanitizeOpenAIError(repairError, {
          endpoint: "responses.create",
          model,
          operation: "photo_import_vision_repair",
        });
        return {
          ok: false as const,
          reason: repairDiagnostic.category,
          message: repairDiagnostic.publicMessage,
          diagnostic: repairDiagnostic,
        };
      }
    }

    return {
      ok: false as const,
      reason: firstDiagnostic.category,
      message: firstDiagnostic.publicMessage,
      diagnostic: firstDiagnostic,
    };
  }
}

export { emptyMetricRecord };
