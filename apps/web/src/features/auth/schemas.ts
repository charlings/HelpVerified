import { z } from "zod";
import { nigerianStates } from "@/content/locations";
import { serviceSlugs } from "@/config/routes";

export const PRIVACY_NOTICE_VERSION = "draft-2026-10-05";

const email = z.email("Enter a valid email address, like name@example.com.");
const password = z.string().min(8, "Use at least 8 characters.").max(128, "Use 128 characters or fewer.");

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password."),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const signupSchema = z.object({
  role: z.enum(["family", "agency_admin"], { message: "Choose how you'll use HelpVerified." }),
  full_name: z.string().trim().min(2, "Enter your full name."),
  email,
  password,
  accept_privacy: z.boolean().refine((v) => v, { message: "You need to accept the privacy notice to continue." }),
});
export type SignupInput = z.infer<typeof signupSchema>;

export const forgotPasswordSchema = z.object({ email });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    password,
    confirm: z.string().min(1, "Enter the same password again."),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "The passwords don't match." });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

const phone = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, ""))
  .pipe(z.string().regex(/^(\+234|0)[789][01]\d{8}$/, "Enter a Nigerian phone number, like 0803 123 4567."));

export const agencySchema = z.object({
  name: z.string().trim().min(2, "Enter your agency's registered name."),
  cac_number: z
    .string()
    .trim()
    .regex(/^(RC|BN|IT)\s?\d{4,8}$/i, "Enter your CAC number, like RC 1234567 or BN 1234567."),
  email,
  phone,
  address_line: z.string().trim().min(5, "Enter your office address."),
  state: z.enum(nigerianStates, { message: "Choose a state." }),
  lga: z.string().trim().min(2, "Enter your local government area."),
  roles_offered: z.array(z.enum(serviceSlugs)).min(1, "Choose at least one role your agency places."),
});
export type AgencyInput = z.input<typeof agencySchema>;
export type AgencyPayload = z.output<typeof agencySchema>;

/** Which onboarding step owns each field, so server validation errors can send the user back to it. */
export const agencyStepFields = [
  ["name", "cac_number", "email", "phone"],
  ["address_line", "state", "lga", "roles_offered"],
] as const;
