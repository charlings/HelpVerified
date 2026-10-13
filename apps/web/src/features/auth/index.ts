// Public API of the auth feature. Screens are imported by route files from ./screens/* (see ADR 0003 / M3).
export { RoleGuard } from "./components/RoleGuard";
export { useSession } from "./client";
export { AccountControls } from "./components/AccountControls";
export { PromoPanel } from "./components/PromoPanel";
export { AuthLegal } from "./components/AuthLegal";
export { agencySchema, forgotPasswordSchema, googleSignupSchema, loginSchema, signupSchema } from "./schemas";
export type { SessionUser } from "./types";
