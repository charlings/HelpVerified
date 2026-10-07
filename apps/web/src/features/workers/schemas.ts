import { z } from "zod";
import { serviceSlugs } from "@/config/routes";
import { nigerianStates } from "@/content/locations";

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

/** Add-worker form. The NIN is sent once over TLS; the API keeps only a keyed hash and the last 4 digits. */
export const workerFormSchema = z
  .object({
    full_name: z.string().trim().min(2, "Enter the worker's full name."),
    role: z.enum(serviceSlugs, { message: "Choose a role." }),
    years_experience: z.coerce
      .number({ message: "Enter years of experience." })
      .int("Use whole years.")
      .min(0, "Years can't be negative.")
      .max(60, "Enter 60 years or fewer."),
    languages: z.string().trim().min(2, "List at least one language."),
    live_in_ok: z.boolean(),
    state: z.enum(nigerianStates, { message: "Choose a state." }),
    lga: z.string().trim().min(2, "Enter the local government area."),
    salary_min: nairaToKobo,
    salary_max: nairaToKobo,
    nin: z
      .string()
      .trim()
      .regex(/^\d{11}$/, "A NIN has exactly 11 digits."),
    consent: z.boolean().refine((v) => v, {
      message: "Confirm the worker agreed to their information being collected and shared.",
    }),
  })
  .refine((v) => v.salary_min === null || v.salary_max === null || v.salary_min <= v.salary_max, {
    path: ["salary_max"],
    message: "The maximum must be at least the minimum.",
  });

export type WorkerFormInput = z.input<typeof workerFormSchema>;
export type WorkerFormValues = z.output<typeof workerFormSchema>;

/** Steps of the add-worker form and the fields each owns. */
export const workerStepFields = [
  ["full_name", "role", "years_experience", "languages", "live_in_ok", "state", "lga", "salary_min", "salary_max"],
  ["nin", "consent"],
] as const;

/** `POST /workers` body. */
export const createWorkerSchema = z.object({
  full_name: z.string().trim().min(2),
  role: z.enum(serviceSlugs),
  years_experience: z.number().int().min(0).max(60),
  languages: z.array(z.string().trim().min(1)).min(1),
  live_in_ok: z.boolean(),
  state: z.enum(nigerianStates),
  lga: z.string().trim().min(2),
  expected_salary_min_kobo: z.number().int().positive().nullable(),
  expected_salary_max_kobo: z.number().int().positive().nullable(),
  nin: z.string().regex(/^\d{11}$/),
  consent: z.literal(true),
});
export type CreateWorkerPayload = z.infer<typeof createWorkerSchema>;

export function toCreateWorkerPayload(values: WorkerFormValues): CreateWorkerPayload {
  return {
    full_name: values.full_name,
    role: values.role,
    years_experience: values.years_experience,
    languages: values.languages
      .split(",")
      .map((l) => l.trim())
      .filter(Boolean),
    live_in_ok: values.live_in_ok,
    state: values.state,
    lga: values.lga,
    expected_salary_min_kobo: values.salary_min,
    expected_salary_max_kobo: values.salary_max,
    nin: values.nin,
    consent: true,
  };
}
