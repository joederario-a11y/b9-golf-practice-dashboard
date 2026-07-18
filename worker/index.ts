/** Cloudflare Worker entry point for the vinext-starter template. */
import { WorkflowEntrypoint } from "cloudflare:workers";
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

import { isDevBuildTarget } from "@/lib/build-info";
import { handlePhotoImportRequest } from "@/lib/server/photo-import-request";
import { requireIdentityFromRequest, responseFromError } from "@/lib/server/platform";
import {
  runVideoLessonRecapWorkflow,
  type VideoLessonRecapWorkflowParams,
} from "@/lib/server/video-ai-recap";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  VIDEO_STORAGE: R2Bucket;
  MEDIA?: {
    input(stream: ReadableStream): {
      output(options: Record<string, unknown>): {
        response(): Promise<Response>;
      };
    };
  };
  OPENAI_API_KEY?: string;
  OPENAI_ANALYSIS_MODEL?: string;
  OPENAI_MODEL?: string;
  OPENAI_TRANSCRIPTION_MODEL?: string;
  OPENAI_VISION_MODEL?: string;
  VIDEO_LESSON_RECAP_WORKFLOW?: {
    create(options?: { id?: string; params?: unknown }): Promise<{ id: string }>;
    get(id: string): Promise<{ id: string; terminate(): Promise<void> }>;
  };
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

type WorkflowStep = {
  do<T>(name: string, callback: () => Promise<T>): Promise<T>;
};

type WorkflowEvent = {
  payload?: VideoLessonRecapWorkflowParams;
  params?: VideoLessonRecapWorkflowParams;
};

function isHtmlNavigation(request: Request, response: Response) {
  const accept = request.headers.get("Accept") ?? "";
  const contentType = response.headers.get("Content-Type") ?? "";
  return request.method === "GET" && (accept.includes("text/html") || contentType.includes("text/html"));
}

function withDevNoCache(request: Request, response: Response) {
  const url = new URL(request.url);
  if (!isDevBuildTarget(url.hostname) || !isHtmlNavigation(request, response)) return response;
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-cache");
  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

export class VideoLessonRecapWorkflow extends WorkflowEntrypoint<Env, VideoLessonRecapWorkflowParams> {
  async run(event: WorkflowEvent, step: WorkflowStep) {
    await runVideoLessonRecapWorkflow(this.env, event, step);
  }
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/import/photos" && request.method === "POST") {
      try {
        const identity = await requireIdentityFromRequest(request);
        return handlePhotoImportRequest(request, identity);
      } catch (error) {
        return responseFromError(error);
      }
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    const response = await handler.fetch(request, env, ctx);
    return withDevNoCache(request, response);
  },
};

export default worker;
