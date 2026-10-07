import { http, HttpResponse } from "msw";
import { env } from "@/config/env";
import { contactSchema } from "@/features/marketing";
import { db, persist } from "../db";
import { errorResponse, forcedError } from "../errors";
import { mockLatency } from "../latency";
import { fieldErrors } from "./auth";

const base = env.NEXT_PUBLIC_API_BASE_URL;

export const contactHandlers = [
  http.post(`${base}/contact`, async ({ request }) => {
    await mockLatency();
    const forced = forcedError(request);
    if (forced) return forced;

    const parsed = contactSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return errorResponse("VALIDATION_ERROR", "Some fields are invalid.", fieldErrors(parsed.error.issues));
    }

    db.contactMessages.push({
      id: crypto.randomUUID(),
      ...parsed.data,
      phone: parsed.data.phone || undefined,
      created_at: new Date().toISOString(),
    });
    persist();
    return HttpResponse.json({ received: true }, { status: 202 });
  }),
];
