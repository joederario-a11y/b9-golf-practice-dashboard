import OpenAI from "openai";

import { getPlatformEnvironment } from "@/lib/server/platform";

export async function extractPhotoImportWithVision(images: Array<{
  base64: string;
  contentType: string;
  fileName: string;
}>) {
  const runtime = getPlatformEnvironment();
  const apiKey = runtime.OPENAI_API_KEY;
  const model = runtime.OPENAI_VISION_MODEL || runtime.OPENAI_MODEL;
  if (!apiKey || !model) {
    return {
      ok: false as const,
      reason: "missing_openai_configuration",
      message: "Photo vision extraction is not connected in this environment.",
    };
  }

  const client = new OpenAI({ apiKey });
  const prompt = [
    "You are extracting launch-monitor shot-history tables for MAI Coach.",
    "Identify simulator, selected club, page type, visible shot numbers, AVG rows, duplicate overlap, headers, and every visible cell.",
    "Preserve decimal points, units, and L/R direction. Never invent hidden values. Return null when uncertain.",
    "Keep AVG rows separate from shot rows. Do not infer shots from AVG data.",
    "Return strict JSON with pages and rows only.",
  ].join("\n");

  try {
    const response = await client.responses.create({
      model,
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: prompt }],
        },
        {
          role: "user",
          content: [
            { type: "input_text", text: "Extract these related Full Swing shot-history screenshots as one session batch." },
            ...images.map((image) => ({
              type: "input_image",
              image_url: `data:${image.contentType};base64,${image.base64}`,
            })),
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "photo_import_extraction",
          strict: true,
          schema: {
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
                  required: ["fileName", "pageType", "visibleShotNumbers", "containsAverageRow", "rows"],
                  properties: {
                    fileName: { type: "string" },
                    pageType: { type: "string" },
                    visibleShotNumbers: { type: "array", items: { type: "number" } },
                    containsAverageRow: { type: "boolean" },
                    rows: {
                      type: "array",
                      items: {
                        type: "object",
                        additionalProperties: true,
                        required: ["shotNumber", "metrics"],
                        properties: {
                          shotNumber: { type: ["number", "null"] },
                          metrics: { type: "object", additionalProperties: true },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    } as never);

    const outputText = (response as { output_text?: string }).output_text;
    if (!outputText) {
      return {
        ok: false as const,
        reason: "empty_vision_response",
        message: "Photo vision extraction returned no structured content.",
      };
    }

    return {
      ok: true as const,
      model,
      raw: JSON.parse(outputText) as unknown,
    };
  } catch {
    return {
      ok: false as const,
      reason: "vision_extraction_failed",
      message: "Photo vision extraction failed. Use OCR fallback or try sharper images.",
    };
  }
}
