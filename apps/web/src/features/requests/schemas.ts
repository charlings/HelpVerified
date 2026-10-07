import { z } from "zod";
import { business } from "@/config/business";
import { serviceSlugs } from "@/config/routes";
import { nigerianStates } from "@/content/locations";

const todayIso = () => new Date().toISOString().slice(0, 10);

const nairaToKobo = z
  .string()
  .trim()
  .transform((v) => v.replace(/[,\s₦]/g, ""))
  .pipe(
    z
      .string()
      .regex(/^\d*$/, "Enter an amount in naira, digits only.")
      .transform((v) => (v === "" ? null : Number(v) * 100)),
  );

/** New-request form (family). */
export const requestFormSchema = z
  .object({
    role: z.enum(serviceSlugs, { message: "Choose who you need." }),
    schedule: z.enum(["full_time", "part_time"], { message: "Choose full-time or part-time." }),
    live_in: z.boolean(),
    state: z.enum(nigerianStates, { message: "Choose a state." }),
    lga: z.string().trim().min(2, "Enter your local government area."),
    start_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a start date.")
      .refine((d) => d >= todayIso(), "The start date can't be in the past."),
    trial_days: z.coerce
      .number({ message: "Enter the trial length in days." })
      .int("Use whole days.")
      .min(business.trialDaysMin, `The trial must be at least ${business.trialDaysMin} days.`)
      .max(business.trialDaysMax, `The trial can be at most ${business.trialDaysMax} days.`),
    title: z.string().trim().min(5, "Give your request a short title.").max(80, "Keep the title under 80 characters."),
    description: z
      .string()
      .trim()
      .min(20, "Describe the role in a little more detail (at least 20 characters).")
      .max(1500, "Keep the description under 1,500 characters."),
    budget_min: nairaToKobo,
    budget_max: nairaToKobo,
  })
  .refine((v) => v.budget_min === null || v.budget_max === null || v.budget_min <= v.budget_max, {
    path: ["budget_max"],
    message: "The maximum must be at least the minimum.",
  });

export type RequestFormInput = z.input<typeof requestFormSchema>;
export type RequestFormValues = z.output<typeof requestFormSchema>;

export const requestStepFields = [
  ["role", "schedule", "live_in"],
  ["state", "lga", "start_date", "trial_days"],
  ["title", "description", "budget_min", "budget_max"],
] as const;

/** `POST /requests` body. */
export const createRequestSchema = z.object({
  role: z.enum(serviceSlugs),
  schedule: z.enum(["full_time", "part_time"]),
  live_in: z.boolean(),
  state: z.enum(nigerianStates),
  lga: z.string().trim().min(2),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  trial_days: z.number().int().min(business.trialDaysMin).max(business.trialDaysMax),
  title: z.string().trim().min(5).max(80),
  description: z.string().trim().min(20).max(1500),
  budget_min_kobo: z.number().int().positive().nullable(),
  budget_max_kobo: z.number().int().positive().nullable(),
});
export type CreateRequestPayload = z.infer<typeof createRequestSchema>;

export function toCreateRequestPayload(v: RequestFormValues): CreateRequestPayload {
  return {
    role: v.role,
    schedule: v.schedule,
    live_in: v.live_in,
    state: v.state,
    lga: v.lga,
    start_date: v.start_date,
    trial_days: v.trial_days,
    title: v.title,
    description: v.description,
    budget_min_kobo: v.budget_min,
    budget_max_kobo: v.budget_max,
  };
}
