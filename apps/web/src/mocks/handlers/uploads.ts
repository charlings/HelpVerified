import { http, HttpResponse } from "msw";
import { env } from "@/config/env";
import { db, fileBlobs, persist } from "../db";
import { ownWorker, requireAgency } from "../domain";
import { errorResponse, forcedError } from "../errors";
import { mockLatency } from "../latency";
import { authenticate } from "./auth";

const base = env.NEXT_PUBLIC_API_BASE_URL;
const cloudName = env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? "helpverified-demo";
export const CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

const FORMAT_BY_TYPE: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "application/pdf": "pdf" };

export const uploadHandlers = [
  // The real API signs uploads restricted to one folder; the browser then uploads straight to Cloudinary.
  http.post(`${base}/uploads/signature`, async ({ request }) => {
    await mockLatency();
    const forced = forcedError(request);
    if (forced) return forced;
    const ctx = requireAgency(authenticate(request));
    if ("error" in ctx) return ctx.error;
    const body = (await request.json().catch(() => ({}))) as { purpose?: string; worker_id?: string; kind?: string };
    const worker = ownWorker(ctx.agency, body.worker_id);
    if (!worker) return errorResponse("NOT_FOUND", "Worker not found.");
    const isDoc = body.purpose === "verification_doc";
    return HttpResponse.json({
      upload_url: CLOUDINARY_UPLOAD_URL,
      api_key: "demo",
      timestamp: Math.floor(Date.now() / 1000),
      signature: "demo-signature",
      folder: isDoc ? `workers/docs/${worker.id}/${body.kind}` : `workers/photos/${worker.id}`,
      type: isDoc ? "authenticated" : "upload",
    });
  }),

  // Cloudinary accepts cross-origin uploads; answer the CORS preflight like it does.
  http.options(CLOUDINARY_UPLOAD_URL, () => new HttpResponse(null, { status: 204, headers: CORS_HEADERS })),

  // Demo mode: Cloudinary is intercepted here, so files never leave the browser.
  http.post(CLOUDINARY_UPLOAD_URL, async ({ request }) => {
    const form = await request.formData();
    const file = form.get("file");
    const folder = String(form.get("folder") ?? "");
    if (!(file instanceof File)) {
      return HttpResponse.json({ error: { message: "No file" } }, { status: 400, headers: CORS_HEADERS });
    }
    const format = FORMAT_BY_TYPE[file.type];
    if (!format) {
      return HttpResponse.json({ error: { message: "Unsupported format" } }, { status: 400, headers: CORS_HEADERS });
    }

    const public_id = `${folder}/${crypto.randomUUID()}`;
    db.uploads[public_id] = {
      public_id,
      folder,
      bytes: file.size,
      format,
      resource_type: format === "pdf" ? "raw" : "image",
    };
    if (typeof URL.createObjectURL === "function") fileBlobs.set(public_id, URL.createObjectURL(file));
    persist();
    return HttpResponse.json(
      { public_id, bytes: file.size, format, resource_type: db.uploads[public_id]!.resource_type },
      { headers: CORS_HEADERS },
    );
  }),
];
