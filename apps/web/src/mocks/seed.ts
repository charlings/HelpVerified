/**
 * Demo data. All people are fictional. NINs are stored only as SHA-256 hashes plus last 4 digits.
 * Dates are relative to when the seed runs so trials, holds and expiries stay meaningful.
 */
import type { Role } from "@/config/routes";
import type { VerificationKind, VerificationStatus } from "@/types/domain";
import type {
  MockAgency,
  MockAuditEntry,
  MockDocument,
  MockFamily,
  MockPayment,
  MockPlacement,
  MockPlacementEvent,
  MockProposal,
  MockRequest,
  MockSubscription,
  MockUser,
  MockVerificationItem,
  MockWorker,
} from "./types";

export const DEMO_PASSWORD = "demo1234";
// TODO(content): demo amount only — the real placement fee is an open owner decision.
export const DEMO_PLACEMENT_FEE_KOBO = 20_000 * 100;
// TODO(content): demo amount only — the real subscription price is an open owner decision.
export const DEMO_SUBSCRIPTION_KOBO = 25_000 * 100;
const DAY = 24 * 60 * 60 * 1000;
const naira = (n: number) => n * 100;

export function seedData(now = Date.now()) {
  const iso = (offsetDays: number) => new Date(now + offsetDays * DAY).toISOString();
  const date = (offsetDays: number) => iso(offsetDays).slice(0, 10);
  const verifiedAt = iso(-60);

  const user = (id: string, email: string, full_name: string, role: Role, extra: Partial<MockUser> = {}): MockUser => ({
    id,
    email,
    password: DEMO_PASSWORD,
    full_name,
    role,
    status: "active",
    email_verified_at: iso(-90),
    privacy_notice_version: "draft-2026-10-05",
    ...extra,
  });

  const users: MockUser[] = [
    user("u-family", "family@demo.hv", "Ada Okafor", "family"),
    user("u-bola", "bola@demo.hv", "Bola Martins", "family"),
    user("u-newfamily", "newfamily@demo.hv", "Ngozi Ade", "family"),
    user("u-ifeoma", "ifeoma@demo.hv", "Ifeoma Chukwu", "family"),
    user("u-agency", "agency@demo.hv", "Tunde Bakare", "agency_admin"),
    user("u-kano", "kano@demo.hv", "Aisha Musa", "agency_admin"),
    user("u-admin", "admin@demo.hv", "HelpVerified Admin", "super_admin"),
    user("u-newagency", "newagency@demo.hv", "Kemi Adeyemi", "agency_admin"),
    user("u-pending", "pending@demo.hv", "Femi Olawale", "agency_admin"),
    user("u-harbour", "suspendedagency@demo.hv", "Grace Bello", "agency_admin"),
    user("u-unverified", "unverified@demo.hv", "Chidi Eze", "agency_admin", { email_verified_at: null }),
    user("u-suspended", "suspended@demo.hv", "Sam Ojo", "family", { status: "suspended" }),
  ];

  const agencies: MockAgency[] = [
    {
      id: "a-sunrise",
      admin_user_id: "u-agency",
      name: "Sunrise Domestic Staffing",
      cac_number: "RC 1234567",
      email: "hello@sunrise.demo",
      phone: "08031234567",
      address_line: "12 Allen Avenue",
      state: "Lagos",
      lga: "Ikeja",
      roles_offered: ["nanny", "driver", "cleaner"],
      status: "approved",
      approved_at: iso(-398),
      status_reason: null,
      created_at: iso(-400),
    },
    {
      id: "a-kano",
      admin_user_id: "u-kano",
      name: "Kano Home Helpers",
      cac_number: "RC 2345678",
      email: "info@kanohome.demo",
      phone: "08062345678",
      address_line: "5 Zoo Road",
      state: "Kano",
      lga: "Tarauni",
      roles_offered: ["nanny"],
      status: "approved",
      approved_at: iso(-297),
      status_reason: null,
      created_at: iso(-300),
    },
    {
      id: "a-brighthands",
      admin_user_id: "u-pending",
      name: "Bright Hands Agency",
      cac_number: "RC 3456789",
      email: "office@brighthands.demo",
      phone: "08051234567",
      address_line: "4 Admiralty Way",
      state: "Lagos",
      lga: "Eti-Osa",
      roles_offered: ["nanny", "cleaner"],
      status: "pending",
      approved_at: null,
      status_reason: null,
      created_at: iso(-2),
    },
    {
      id: "a-harbour",
      admin_user_id: "u-harbour",
      name: "Harbour Care Services",
      cac_number: "RC 4567890",
      email: "team@harbourcare.demo",
      phone: "08091234567",
      address_line: "18 Aggrey Road",
      state: "Rivers",
      lga: "Port Harcourt",
      roles_offered: ["driver", "cleaner"],
      status: "suspended",
      approved_at: iso(-200),
      status_reason: "CAC registration lapsed; resubmit an up-to-date certificate.",
      created_at: iso(-205),
    },
  ];

  const families: MockFamily[] = [
    { id: "f-ada", user_id: "u-family", name: "Okafor family", state: "Lagos", lga: "Ikeja" },
    { id: "f-bola", user_id: "u-bola", name: "Martins family", state: "Lagos", lga: "Eti-Osa" },
    {
      id: "f-ifeoma",
      user_id: "u-ifeoma",
      name: "Chukwu family",
      state: "Federal Capital Territory",
      lga: "Abuja Municipal",
    },
  ];

  const worker = (
    id: string,
    full_name: string,
    role: MockWorker["role"],
    years: number,
    languages: string[],
    lga: string,
    nin: { hash: string; last4: string },
    listing: MockWorker["listing_status"],
    extra: Partial<MockWorker> = {},
  ): MockWorker => ({
    id,
    agency_id: "a-sunrise",
    full_name,
    role,
    years_experience: years,
    languages,
    live_in_ok: role === "nanny",
    state: "Lagos",
    lga,
    expected_salary_min_kobo: naira(role === "driver" ? 90_000 : 70_000),
    expected_salary_max_kobo: naira(role === "driver" ? 140_000 : 110_000),
    nin_hash: nin.hash,
    nin_last4: nin.last4,
    consent_at: iso(-120),
    listing_status: listing,
    listed_at: listing === "listed" ? iso(-50) : null,
    created_at: iso(-120),
    ...extra,
  });

  // SHA-256 of fictional 11-digit NINs (generated offline); only hashes and last 4 digits are kept.
  const nins = [
    { hash: "568918dfc3607004a5d39c4c0e149940be73fb68613ffa1e9c9bd7734837b2ae", last4: "7919" },
    { hash: "130fa9df0c97157b719ab7de7c33b3ecd7145dd596a4cfb2798c819a67cb26ef", last4: "5838" },
    { hash: "dcf97bca2ee79a373c7eb344790d65fb0b21333735fb470bb273496d64f025e0", last4: "3757" },
    { hash: "cba0a41cbdbcaa8c3ac407adba272ea792274ab7fb8702a0d131a3757ed52c78", last4: "1676" },
    { hash: "0b62dc137f258b2a26f0256ac459dbc2b1b1beee5bc40731bd4ba906a029395d", last4: "9595" },
    { hash: "cf3266781e30a4b3acf5e34a4486b621831556d9c7d01cedde41a8081f81b77b", last4: "7514" },
    { hash: "899f3445f85e4519fe6bbc53412afd2f322d330395a4cc09293c2c9e48c6a682", last4: "5433" },
    { hash: "d022d103b4aa95df25f4128044e3fccef2aafd1d51001e8a33518b4eca7bd8e4", last4: "3352" },
    { hash: "38263ffa28669bbb8f08fc1e648be28da26464e4450cac79566a64764b031d62", last4: "1271" },
    { hash: "7029f4afd6fd991fbefac8520f3e893e23d37a4f7bbd4dea2418a9f5b5012ef2", last4: "9190" },
    { hash: "dbcda7cb343d306727f3a934ba5ca4689f06bf87fc07d1e9c66bd1749976ff3a", last4: "7109" },
  ] as const;

  const workers: MockWorker[] = [
    worker("w-amaka", "Amaka Obi", "nanny", 6, ["English", "Igbo"], "Ikeja", nins[0], "listed"),
    worker("w-blessing", "Blessing Eze", "nanny", 4, ["English", "Yoruba"], "Surulere", nins[1], "listed"),
    worker("w-musa", "Musa Ibrahim", "driver", 9, ["English", "Hausa"], "Ikeja", nins[2], "listed"),
    worker("w-chinedu", "Chinedu Okeke", "driver", 5, ["English", "Igbo"], "Eti-Osa", nins[3], "listed"),
    worker("w-grace", "Grace Adebayo", "cleaner", 3, ["English", "Yoruba"], "Ikorodu", nins[4], "listed"),
    worker("w-fatima", "Fatima Bello", "cleaner", 7, ["English", "Hausa"], "Lagos Mainland", nins[5], "listed"),
    worker("w-joy", "Joy Nwosu", "nanny", 2, ["English", "Igbo"], "Ikeja", nins[6], "draft"),
    worker("w-emeka", "Emeka Udo", "driver", 3, ["English"], "Surulere", nins[7], "draft"),
    worker("w-halima", "Halima Sani", "cleaner", 5, ["English", "Hausa"], "Ikeja", nins[8], "delisted"),
    worker("w-tobi", "Tobi Afolabi", "nanny", 1, ["English", "Yoruba"], "Ikorodu", nins[9], "draft"),
    worker("w-zainab", "Zainab Umar", "nanny", 8, ["English", "Hausa"], "Tarauni", nins[10], "listed", {
      agency_id: "a-kano",
      state: "Kano",
    }),
  ];

  const kinds: VerificationKind[] = ["id", "guarantor", "references", "address"];
  const expiring = (kind: VerificationKind) => kind === "references" || kind === "address";
  const details: Record<VerificationKind, Record<string, string>> = {
    id: { document_type: "NIN slip" },
    guarantor: { name: "Mrs. Funke Ade", phone: "08023456789", relationship: "Former employer" },
    references: { referee_name: "Mr. Kunle Bello", referee_phone: "08034567890", relationship: "Previous employer" },
    address: { address_line: "14 Market Street" },
  };

  const items: MockVerificationItem[] = [];
  const documents: MockDocument[] = [];
  let docCount = 0;

  function addItem(
    workerId: string,
    kind: VerificationKind,
    status: VerificationStatus,
    extra: Partial<MockVerificationItem> = {},
  ) {
    const item: MockVerificationItem = {
      id: `vi-${workerId}-${kind}`,
      worker_id: workerId,
      kind,
      status,
      details: status === "not_started" ? {} : details[kind],
      verified_by: status === "verified" || status === "expired" ? "u-agency" : null,
      verified_at: status === "verified" || status === "expired" ? verifiedAt : null,
      expires_at: status === "verified" && expiring(kind) ? iso(-60 + 365) : null,
      rejection_reason: null,
      ...extra,
    };
    items.push(item);
    if (status !== "not_started") {
      docCount += 1;
      documents.push({
        id: `doc-${docCount}`,
        item_id: item.id,
        public_id: `workers/docs/${workerId}/${kind}/seed-${docCount}`,
        format: kind === "id" ? "jpg" : "pdf",
        bytes: 180_000 + docCount * 7_000,
        uploaded_by: "u-agency",
        created_at: iso(-62),
        deleted_at: null,
      });
    }
  }

  const allVerified = ["w-amaka", "w-blessing", "w-musa", "w-chinedu", "w-grace", "w-fatima", "w-zainab"];
  for (const id of allVerified) for (const kind of kinds) addItem(id, kind, "verified");

  // 3/4: address evidence uploaded, waiting to be verified.
  for (const kind of kinds) addItem("w-joy", kind, kind === "address" ? "submitted" : "verified");
  // Guarantor rejected, address not started.
  addItem("w-emeka", "id", "verified");
  addItem("w-emeka", "guarantor", "rejected", {
    rejection_reason: "The guarantor's phone number could not be reached.",
  });
  addItem("w-emeka", "references", "verified");
  addItem("w-emeka", "address", "not_started");
  // References lapsed after 12 months, so the worker was delisted.
  for (const kind of kinds) {
    if (kind === "references") {
      addItem("w-halima", kind, "expired", { verified_at: iso(-395), expires_at: iso(-30) });
    } else {
      addItem("w-halima", kind, "verified");
    }
  }
  for (const kind of kinds) addItem("w-tobi", kind, "not_started");

  const request = (
    id: string,
    family_id: string,
    role: MockRequest["role"],
    extra: Partial<MockRequest>,
  ): MockRequest => ({
    id,
    family_id,
    role,
    title: `${role[0]!.toUpperCase()}${role.slice(1)} needed`,
    description: "Looking for someone reliable and kind who can start soon.",
    schedule: "full_time",
    live_in: false,
    state: "Lagos",
    lga: "Ikeja",
    budget_min_kobo: naira(70_000),
    budget_max_kobo: naira(120_000),
    start_date: date(14),
    trial_days: 14,
    status: "open",
    replaces_placement_id: null,
    created_at: iso(-3),
    ...extra,
  });

  const requests: MockRequest[] = [
    request("r-ada-nanny", "f-ada", "nanny", {
      title: "Live-in nanny for two toddlers",
      description: "Two children aged 2 and 4. Help with meals, bath time and the morning school run.",
      live_in: true,
      budget_min_kobo: naira(80_000),
      budget_max_kobo: naira(110_000),
    }),
    request("r-bola-driver", "f-bola", "driver", {
      title: "Part-time family driver",
      description: "School runs on weekdays and occasional weekend trips.",
      schedule: "part_time",
      lga: "Eti-Osa",
      start_date: date(7),
      created_at: iso(-1),
    }),
    request("r-bola-cleaner", "f-bola", "cleaner", {
      title: "Cleaner for a 4-bedroom house",
      description: "Three days a week, including laundry and ironing.",
      schedule: "part_time",
      lga: "Eti-Osa",
      created_at: iso(-6),
    }),
    request("r-ifeoma-cleaner", "f-ifeoma", "cleaner", {
      title: "Full-time housekeeper",
      state: "Federal Capital Territory",
      lga: "Abuja Municipal",
    }),
    // Requests behind placements.
    request("r-ada-nanny-2", "f-ada", "nanny", { status: "matched", created_at: iso(-12) }),
    request("r-bola-driver-2", "f-bola", "driver", { status: "matched", lga: "Eti-Osa", created_at: iso(-40) }),
    request("r-bola-cleaner-2", "f-bola", "cleaner", { status: "matched", lga: "Eti-Osa", created_at: iso(-1) }),
    request("r-ada-driver", "f-ada", "driver", { status: "closed", created_at: iso(-220) }),
  ];

  const proposal = (
    id: string,
    request_id: string,
    worker_id: string,
    status: MockProposal["status"],
  ): MockProposal => ({
    id,
    request_id,
    worker_id,
    agency_id: "a-sunrise",
    note: "Experienced, calm and great with routines.",
    status,
    created_at: iso(-2),
  });

  const proposals: MockProposal[] = [
    proposal("pr-amaka-ada", "r-ada-nanny", "w-amaka", "pending"),
    proposal("pr-fatima-bola", "r-bola-cleaner", "w-fatima", "withdrawn"),
    proposal("pr-blessing", "r-ada-nanny-2", "w-blessing", "accepted"),
    proposal("pr-chinedu", "r-bola-driver-2", "w-chinedu", "accepted"),
    proposal("pr-grace", "r-bola-cleaner-2", "w-grace", "accepted"),
    proposal("pr-musa", "r-ada-driver", "w-musa", "accepted"),
  ];

  const placement = (
    id: string,
    request_id: string,
    proposal_id: string,
    worker_id: string,
    family_id: string,
    extra: Partial<MockPlacement>,
  ): MockPlacement => ({
    id,
    request_id,
    proposal_id,
    worker_id,
    family_id,
    agency_id: "a-sunrise",
    status: "trial",
    hold_expires_at: null,
    trial_starts_on: null,
    trial_ends_on: null,
    confirmed_at: null,
    ended_at: null,
    end_reason: null,
    replacements_used: 0,
    created_at: iso(-10),
    ...extra,
  });

  const placements: MockPlacement[] = [
    placement("p-blessing", "r-ada-nanny-2", "pr-blessing", "w-blessing", "f-ada", {
      status: "trial",
      trial_starts_on: date(-12),
      trial_ends_on: date(2),
      created_at: iso(-12),
    }),
    placement("p-chinedu", "r-bola-driver-2", "pr-chinedu", "w-chinedu", "f-bola", {
      status: "confirmed",
      trial_starts_on: date(-34),
      trial_ends_on: date(-20),
      confirmed_at: iso(-20),
      created_at: iso(-35),
    }),
    placement("p-grace", "r-bola-cleaner-2", "pr-grace", "w-grace", "f-bola", {
      status: "pending_payment",
      hold_expires_at: new Date(now + 25 * 60 * 1000).toISOString(),
      created_at: iso(0),
    }),
    placement("p-musa", "r-ada-driver", "pr-musa", "w-musa", "f-ada", {
      status: "ended",
      trial_starts_on: date(-210),
      trial_ends_on: date(-196),
      confirmed_at: iso(-196),
      ended_at: iso(-30),
      end_reason: "completed",
      created_at: iso(-211),
    }),
  ];

  const event = (
    placement_id: string,
    n: number,
    from_status: MockPlacementEvent["from_status"],
    to_status: MockPlacementEvent["to_status"],
    actor: MockPlacementEvent["actor"],
    at: string,
    reason: string | null = null,
  ): MockPlacementEvent => ({
    id: `pe-${placement_id}-${n}`,
    placement_id,
    from_status,
    to_status,
    actor,
    reason,
    created_at: at,
  });

  const placementEvents: MockPlacementEvent[] = [
    event("p-blessing", 1, null, "pending_payment", "family", iso(-12)),
    event("p-blessing", 2, "pending_payment", "trial", "system", iso(-12)),
    event("p-chinedu", 1, null, "pending_payment", "family", iso(-35)),
    event("p-chinedu", 2, "pending_payment", "trial", "system", iso(-34)),
    event("p-chinedu", 3, "trial", "confirmed", "family", iso(-20)),
    event("p-grace", 1, null, "pending_payment", "family", iso(0)),
    event("p-musa", 1, null, "pending_payment", "family", iso(-211)),
    event("p-musa", 2, "pending_payment", "trial", "system", iso(-210)),
    event("p-musa", 3, "trial", "confirmed", "family", iso(-196)),
    event("p-musa", 4, "confirmed", "ended", "family", iso(-30), "Our family relocated."),
  ];

  const subscriptions: MockSubscription[] = [
    { agency_id: "a-sunrise", plan_code: "PLN_agency_monthly", status: "active", current_period_end: iso(20) },
    { agency_id: "a-kano", plan_code: "PLN_agency_monthly", status: "active", current_period_end: iso(11) },
    { agency_id: "a-harbour", plan_code: "PLN_agency_monthly", status: "active", current_period_end: iso(15) },
  ];

  const audit = (
    id: string,
    daysAgo: number,
    action: MockAuditEntry["action"],
    entity: MockAuditEntry["entity"],
    entity_id: string,
    data: MockAuditEntry["data"],
    actor_id: string | null = "u-admin",
  ): MockAuditEntry => ({ id, actor_id, action, entity, entity_id, data, created_at: iso(-daysAgo) });
  const auditLog: MockAuditEntry[] = [
    audit("al-1", 398, "agency.approved", "agency", "a-sunrise", { label: "Sunrise Domestic Staffing" }),
    audit("al-2", 297, "agency.approved", "agency", "a-kano", { label: "Kano Home Helpers" }),
    audit("al-3", 200, "agency.approved", "agency", "a-harbour", { label: "Harbour Care Services" }),
    audit("al-4", 30, "placement.ended", "placement", "p-musa", {
      label: "Musa Ibrahim with the Okafor family",
      reason: "Contract completed.",
    }),
    audit("al-5", 6, "agency.suspended", "agency", "a-harbour", {
      label: "Harbour Care Services",
      reason: "CAC registration lapsed; resubmit an up-to-date certificate.",
    }),
  ].sort((a, b) => b.created_at.localeCompare(a.created_at));

  const fee = (id: string, placement_id: string, payer: string, daysAgo: number, status: "success" | "pending") => ({
    id,
    kind: "placement_fee" as const,
    payer_user_id: payer,
    placement_id,
    agency_id: null,
    amount_kobo: DEMO_PLACEMENT_FEE_KOBO,
    reference: `HV-PF-${id.toUpperCase()}`,
    status,
    paid_at: status === "success" ? iso(-daysAgo) : null,
    created_at: iso(-daysAgo),
  });
  const subscriptionPayments: MockPayment[] = [-70, -40, -10].map((offset, i) => ({
    id: `pay-sub-${i + 1}`,
    kind: "subscription" as const,
    payer_user_id: "u-agency",
    placement_id: null,
    agency_id: "a-sunrise",
    amount_kobo: DEMO_SUBSCRIPTION_KOBO,
    reference: `HV-SUB-SUNRISE-${i + 1}`,
    status: "success" as const,
    paid_at: iso(offset),
    created_at: iso(offset),
  }));
  const payments: MockPayment[] = [
    ...subscriptionPayments,
    fee("pf-blessing", "p-blessing", "u-family", 12, "success"),
    fee("pf-chinedu", "p-chinedu", "u-bola", 35, "success"),
    fee("pf-grace", "p-grace", "u-bola", 0, "pending"),
    fee("pf-musa", "p-musa", "u-family", 211, "success"),
  ];

  return {
    users,
    agencies,
    families,
    workers,
    verificationItems: items,
    documents,
    requests,
    proposals,
    placements,
    placementEvents,
    subscriptions,
    payments,
    auditLog,
  };
}
