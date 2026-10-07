import { http, HttpResponse } from "msw";
import { env } from "@/config/env";
import { agencySchema } from "@/features/auth";
import { db, persist } from "../db";
import { errorResponse, forcedError } from "../errors";
import { mockLatency } from "../latency";
import { authenticate, fieldErrors } from "./auth";

const base = env.NEXT_PUBLIC_API_BASE_URL;

export const agencyHandlers = [
  http.post(`${base}/agencies`, async ({ request }) => {
    await mockLatency();
    const forced = forcedError(request);
    if (forced) return forced;

    const user = authenticate(request);
    if (!user) return errorResponse("UNAUTHENTICATED", "Not signed in.");
    if (user.role !== "agency_admin") return errorResponse("FORBIDDEN", "Agency admins only.");
    if (!user.email_verified_at) return errorResponse("EMAIL_NOT_VERIFIED", "Verify your email first.");
    if (db.agencies.some((a) => a.admin_user_id === user.id))
      return errorResponse("AGENCY_EXISTS", "Already registered.");

    const parsed = agencySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return errorResponse("VALIDATION_ERROR", "Invalid agency.", fieldErrors(parsed.error.issues));

    const cac = parsed.data.cac_number.toUpperCase().replace(/\s+/, " ");
    if (db.agencies.some((a) => a.cac_number.replace(/\s/g, "") === cac.replace(/\s/g, ""))) {
      return errorResponse("VALIDATION_ERROR", "CAC number taken.", {
        cac_number: ["An agency with this CAC number is already registered."],
      });
    }

    const agency = {
      id: `a-${crypto.randomUUID()}`,
      admin_user_id: user.id,
      ...parsed.data,
      cac_number: cac,
      roles_offered: [...parsed.data.roles_offered],
      status: "pending" as const,
      approved_at: null,
      status_reason: null,
      created_at: new Date().toISOString(),
    };
    db.agencies.push(agency);
    persist();
    return HttpResponse.json({ id: agency.id, name: agency.name, status: agency.status }, { status: 201 });
  }),
];
