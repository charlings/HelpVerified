/**
 * Type-level check that the web app's types match the API (B7, packages/contracts). Nothing here runs:
 * `pnpm typecheck` fails when the API's OpenAPI schema stops satisfying what a screen reads.
 *
 * - Responses: `Reads<Web, Api>` — what the API returns must be assignable to the web type.
 * - Request bodies: `Sends<Api, Web>` — what the web sends must be assignable to the API's input.
 *
 * After an API change: `pnpm contracts:generate`, then fix whichever side is wrong.
 */
import type { Schemas } from "@helpverified/contracts";

import type {
  AdminAgency,
  AdminAgencySummary,
  AdminAlert,
  AdminOverview,
  AdminWorker,
  AdminWorkerDetail,
  AuditEntry,
} from "@/features/admin/types";
import type { AgencyDashboard, AgencyProfile } from "@/features/agencies/api";
import type {
  AgencySummary,
  GooglePendingResponse,
  LoginResponse,
  RefreshResponse,
  SessionUser,
  SignupResponse,
  VerifyEmailResponse,
} from "@/features/auth/types";
import type { Payment, Subscription } from "@/features/billing/api";
import type { FamilyDashboard, FamilyProfile } from "@/features/families/api";
import type { PaymentVerification } from "@/features/payments/api";
import type { Placement, PlacementEvent, PlacementSummary } from "@/features/placements/types";
import type { AcceptResult, AgencyRequest, FamilyProposal, FamilyRequest, Proposal } from "@/features/requests/types";
import type { VerificationDocument, VerificationItem } from "@/features/verification/types";
import type { Worker, WorkerPublic } from "@/features/workers/types";
import type { AgencyPayload } from "@/features/auth/schemas";
import type { CreateRequestPayload } from "@/features/requests/schemas";
import type { CreateWorkerPayload } from "@/features/workers/schemas";
import type { SignedUploadParams } from "@/lib/cloudinary";
import type { Paginated } from "@/types/domain";

type Reads<Web, Api extends Web> = Api;
type Sends<Api, Web extends Api> = Web;

// Bodies built from a form. The small inline bodies (login, reasons, ids) are covered by the e2e flows.
export type RequestChecks = [
  Sends<Schemas["AgencyCreate"], AgencyPayload>,
  Sends<Schemas["AlertResolveIn"], { note: string; paystack_refund_id?: number }>,
  Sends<Schemas["RequestCreate"], CreateRequestPayload>,
  Sends<Schemas["WorkerCreate"], CreateWorkerPayload>,
];

export type ResponseChecks = [
  // Auth
  Reads<SessionUser, Schemas["UserOut"]>,
  Reads<LoginResponse, Schemas["LoginOut"]>,
  Reads<RefreshResponse, Schemas["RefreshOut"]>,
  Reads<SignupResponse, Schemas["SignupOut"]>,
  Reads<VerifyEmailResponse, Schemas["VerifyEmailOut"]>,
  Reads<GooglePendingResponse, Schemas["GooglePendingOut"]>,
  Reads<AgencySummary, Schemas["AgencyCreated"]>,
  // Agencies and families
  Reads<AgencyDashboard, Schemas["AgencyDashboard"]>,
  Reads<AgencyProfile, Schemas["AgencyProfile"]>,
  Reads<FamilyDashboard, Schemas["FamilyDashboard"]>,
  Reads<FamilyProfile, Schemas["FamilyProfile"]>,
  // Workers and verification
  Reads<Worker, Schemas["WorkerOut"]>,
  Reads<Paginated<Worker>, Schemas["Page_WorkerOut_"]>,
  Reads<WorkerPublic, Schemas["WorkerPublicOut"]>,
  Reads<VerificationItem, Schemas["ItemOut"]>,
  Reads<VerificationDocument, Schemas["DocumentOut"]>,
  Reads<SignedUploadParams, Schemas["UploadSignatureOut"]>,
  Reads<{ url: string; expires_at: string }, Schemas["DocumentUrl"]>,
  // Requests and proposals
  Reads<AgencyRequest, Schemas["AgencyRequestOut"]>,
  Reads<Paginated<AgencyRequest>, Schemas["Page_AgencyRequestOut_"]>,
  Reads<FamilyRequest, Schemas["FamilyRequestOut"]>,
  Reads<Paginated<FamilyRequest>, Schemas["Page_FamilyRequestOut_"]>,
  Reads<FamilyProposal, Schemas["FamilyProposalOut"]>,
  Reads<Proposal, Schemas["AgencyProposalOut"]>,
  Reads<AcceptResult, Schemas["AcceptOut"]>,
  // Placements
  Reads<Placement, Schemas["PlacementOut"]>,
  Reads<PlacementSummary, Schemas["PlacementSummary"]>,
  Reads<Paginated<PlacementSummary>, Schemas["Page_PlacementSummary_"]>,
  Reads<PlacementEvent, Schemas["EventOut"]>,
  Reads<{ placement: Placement; new_request: { id: string } }, Schemas["ReplacementOut"]>,
  Reads<{ authorization_url: string; reference: string }, Schemas["CheckoutOut"]>,
  // Payments and billing
  Reads<PaymentVerification, Schemas["PaymentVerification"]>,
  Reads<Payment, Schemas["PaymentOut"]>,
  Reads<Paginated<Payment>, Schemas["Page_PaymentOut_"]>,
  Reads<Subscription, Schemas["BillingSubscription"]>,
  // Admin
  Reads<AdminOverview, Schemas["AdminOverview"]>,
  Reads<AdminAgencySummary, Schemas["AdminAgencySummary"]>,
  Reads<Paginated<AdminAgencySummary>, Schemas["Page_AdminAgencySummary_"]>,
  Reads<AdminAgency, Schemas["AdminAgencyDetail"]>,
  Reads<AdminWorker, Schemas["AdminWorkerOut"]>,
  Reads<Paginated<AdminWorker>, Schemas["Page_AdminWorkerOut_"]>,
  Reads<AdminWorkerDetail, Schemas["AdminWorkerDetail"]>,
  Reads<AuditEntry, Schemas["AuditEntry"]>,
  Reads<Paginated<AuditEntry>, Schemas["Page_AuditEntry_"]>,
  Reads<AdminAlert, Schemas["AlertOut"]>,
  Reads<Paginated<AdminAlert>, Schemas["Page_AlertOut_"]>,
];
