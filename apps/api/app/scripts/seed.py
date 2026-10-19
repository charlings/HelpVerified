"""Demo data for development and the end-to-end tests (B7). Mirrors apps/web/src/mocks/seed.ts.

    cd apps/api
    uv run python -m app.scripts.seed            # into an empty database
    uv run python -m app.scripts.seed --reset    # empties every table first

Refused in staging and production. Passwords come from SEED_DEMO_PASSWORD (every demo account) and
SEED_ADMIN_PASSWORD (the super admin; falls back to the demo one), never from code.

Rows are written directly, in one transaction, because the demo needs history (a placement that ended
months ago) that the services can only create in real time. The two hard rules still hold: PostgreSQL
enforces them (the `workers_listing_gate` trigger and the `placements_one_active_per_*` unique indexes),
so a mistake here fails the seed instead of producing an illegal state.

IDs are UUIDv5 of the mock IDs ("w-amaka"), so a demo URL is the same on every run; the e2e tests derive
them the same way (apps/web/e2e/seed-ids.ts).
"""

import argparse
import asyncio
import sys
import uuid
from datetime import date, datetime, timedelta
from typing import Any

from sqlalchemy import text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.clock import utcnow
from app.core.config import Settings, load_settings
from app.core.dates import lagos_date
from app.core.security import hash_nin, hash_password
from app.db.session import create_engine, create_sessionmaker
from app.modules.admin.models import AuditAction, AuditLog
from app.modules.agencies.models import (
    Agency,
    AgencyMember,
    AgencyStatus,
    Subscription,
    SubscriptionStatus,
    WorkerRole,
)
from app.modules.families.models import Family
from app.modules.payments.models import Payment, PaymentKind, PaymentStatus
from app.modules.placements.models import EndReason, Placement, PlacementEvent, PlacementStatus
from app.modules.requests.models import Proposal, ProposalStatus, Request, RequestStatus
from app.modules.users.models import AccountStatus, User, UserRole
from app.modules.verification.models import (
    KINDS,
    VerificationDocument,
    VerificationItem,
    VerificationKind,
    VerificationStatus,
)
from app.modules.workers.models import ListingStatus, Worker

# Fixed forever: changing it changes every demo URL (and apps/web/e2e/seed-ids.ts must match).
SEED_NAMESPACE = uuid.UUID("5f0c3a52-8d0e-4b8e-9a51-6a1e2f7d4c10")
PRIVACY_NOTICE_VERSION = "draft-2026-10-05"  # apps/web/src/features/auth/schemas.ts
DEMO_EMAIL_DOMAIN = "demo.hv"  # owner input #12 decides the deployed demo's addresses


def seed_id(name: str) -> uuid.UUID:
    return uuid.uuid5(SEED_NAMESPACE, name)


def naira(amount: int) -> int:
    return amount * 100


class Seeder:
    def __init__(self, session: AsyncSession, settings: Settings, demo_password: str, admin_password: str):
        self.session = session
        self.settings = settings
        self.now = utcnow()
        self.today = lagos_date(self.now)
        self.demo_hash = hash_password(demo_password)
        self.admin_hash = hash_password(admin_password)
        self.documents = 0
        # Added after their checks are flushed: without ORM relationships the flush can't order them.
        self.pending_documents: list[VerificationDocument] = []

    def at(self, days: float) -> datetime:
        return self.now + timedelta(days=days)

    def on(self, days: int) -> date:
        return self.today + timedelta(days=days)

    def add(self, *rows: Any) -> None:
        self.session.add_all(rows)

    async def run(self) -> None:
        await self.users()
        await self.agencies()
        await self.families()
        await self.workers()
        await self.requests_and_proposals()
        await self.placements()
        await self.payments_and_audit()

    async def users(self) -> None:
        people: list[tuple[str, str, str, UserRole, dict[str, Any]]] = [
            ("u-family", "family", "Ada Okafor", UserRole.family, {}),
            ("u-bola", "bola", "Bola Martins", UserRole.family, {}),
            ("u-newfamily", "newfamily", "Ngozi Ade", UserRole.family, {}),
            ("u-ifeoma", "ifeoma", "Ifeoma Chukwu", UserRole.family, {}),
            ("u-agency", "agency", "Tunde Bakare", UserRole.agency_admin, {}),
            ("u-kano", "kano", "Aisha Musa", UserRole.agency_admin, {}),
            ("u-admin", "admin", "HelpVerified Admin", UserRole.super_admin, {}),
            ("u-newagency", "newagency", "Kemi Adeyemi", UserRole.agency_admin, {}),
            ("u-pending", "pending", "Femi Olawale", UserRole.agency_admin, {}),
            ("u-harbour", "suspendedagency", "Grace Bello", UserRole.agency_admin, {}),
            ("u-unverified", "unverified", "Chidi Eze", UserRole.agency_admin, {"email_verified_at": None}),
            ("u-suspended", "suspended", "Sam Ojo", UserRole.family, {"status": AccountStatus.suspended}),
        ]
        for key, local, name, role, extra in people:
            self.add(
                User(
                    id=seed_id(key),
                    email=f"{local}@{DEMO_EMAIL_DOMAIN}",
                    password_hash=self.admin_hash if role is UserRole.super_admin else self.demo_hash,
                    full_name=name,
                    role=role,
                    privacy_notice_version=PRIVACY_NOTICE_VERSION,
                    privacy_accepted_at=self.at(-90),
                    created_at=self.at(-90),
                    **({"status": AccountStatus.active, "email_verified_at": self.at(-90)} | extra),
                )
            )
        await self.session.flush()

    async def agencies(self) -> None:
        admin = seed_id("u-admin")
        lapsed = "CAC registration lapsed; resubmit an up-to-date certificate."
        rows: list[tuple[str, str, dict[str, Any], int | None, int]] = [
            # (key, admin user, fields, approved days ago, created days ago)
            ("a-sunrise", "u-agency", {
                "name": "Sunrise Domestic Staffing", "cac_number": "RC 1234567",
                "email": "hello@sunrise.demo", "phone": "08031234567", "address_line": "12 Allen Avenue",
                "state": "Lagos", "lga": "Ikeja",
                "roles_offered": ["nanny", "driver", "cleaner"], "status": AgencyStatus.approved,
            }, -398, -400),
            ("a-kano", "u-kano", {
                "name": "Kano Home Helpers", "cac_number": "RC 2345678", "email": "info@kanohome.demo",
                "phone": "08062345678", "address_line": "5 Zoo Road", "state": "Kano", "lga": "Tarauni",
                "roles_offered": ["nanny"], "status": AgencyStatus.approved,
            }, -297, -300),
            ("a-brighthands", "u-pending", {
                "name": "Bright Hands Agency", "cac_number": "RC 3456789", "email": "office@brighthands.demo",
                "phone": "08051234567", "address_line": "4 Admiralty Way", "state": "Lagos", "lga": "Eti-Osa",
                "roles_offered": ["nanny", "cleaner"], "status": AgencyStatus.pending,
            }, None, -2),
            ("a-harbour", "u-harbour", {
                "name": "Harbour Care Services", "cac_number": "RC 4567890", "email": "team@harbourcare.demo",
                "phone": "08091234567", "address_line": "18 Aggrey Road", "state": "Rivers",
                "lga": "Port Harcourt", "roles_offered": ["driver", "cleaner"],
                "status": AgencyStatus.suspended, "status_reason": lapsed,
            }, -200, -205),
        ]  # fmt: skip
        for key, _, fields, approved, created in rows:
            self.add(
                Agency(
                    id=seed_id(key),
                    approved_at=self.at(approved) if approved is not None else None,
                    approved_by=admin if approved is not None else None,
                    created_at=self.at(created),
                    **fields | {"roles_offered": [WorkerRole(r) for r in fields["roles_offered"]]},
                )
            )
        await self.session.flush()
        for key, user, *_ in rows:
            self.add(AgencyMember(user_id=seed_id(user), agency_id=seed_id(key)))
        plan = self.settings.PAYSTACK_AGENCY_PLAN_CODE or "PLN_demo_agency_monthly"
        for key, period_end in (("a-sunrise", 20), ("a-kano", 11), ("a-harbour", 15)):
            self.add(
                Subscription(
                    agency_id=seed_id(key),
                    plan_code=plan,
                    status=SubscriptionStatus.active,
                    current_period_end=self.at(period_end),
                )
            )
        await self.session.flush()

    async def families(self) -> None:
        for key, user, name, state, lga in (
            ("f-ada", "u-family", "Okafor family", "Lagos", "Ikeja"),
            ("f-bola", "u-bola", "Martins family", "Lagos", "Eti-Osa"),
            ("f-ifeoma", "u-ifeoma", "Chukwu family", "Federal Capital Territory", "Abuja Municipal"),
        ):
            self.add(Family(id=seed_id(key), user_id=seed_id(user), name=name, state=state, lga=lga))
        await self.session.flush()

    async def workers(self) -> None:
        pepper = self.settings.NIN_PEPPER.get_secret_value()
        # Fictional NINs (last 4 digits as in the mock). Only the keyed hash and last 4 digits are stored.
        workers = [
            ("w-amaka", "Amaka Obi", "nanny", 6, ["English", "Igbo"], "Ikeja", "90000017919"),
            ("w-blessing", "Blessing Eze", "nanny", 4, ["English", "Yoruba"], "Surulere", "90000025838"),
            ("w-musa", "Musa Ibrahim", "driver", 9, ["English", "Hausa"], "Ikeja", "90000033757"),
            ("w-chinedu", "Chinedu Okeke", "driver", 5, ["English", "Igbo"], "Eti-Osa", "90000041676"),
            ("w-grace", "Grace Adebayo", "cleaner", 3, ["English", "Yoruba"], "Ikorodu", "90000059595"),
            ("w-fatima", "Fatima Bello", "cleaner", 7, ["English", "Hausa"], "Lagos Mainland", "90000067514"),
            ("w-joy", "Joy Nwosu", "nanny", 2, ["English", "Igbo"], "Ikeja", "90000075433"),
            ("w-emeka", "Emeka Udo", "driver", 3, ["English"], "Surulere", "90000083352"),
            ("w-halima", "Halima Sani", "cleaner", 5, ["English", "Hausa"], "Ikeja", "90000091271"),
            ("w-tobi", "Tobi Afolabi", "nanny", 1, ["English", "Yoruba"], "Ikorodu", "90000109190"),
            ("w-zainab", "Zainab Umar", "nanny", 8, ["English", "Hausa"], "Tarauni", "90000117109"),
        ]
        for key, name, role, years, languages, lga, nin in workers:
            kano = key == "w-zainab"
            self.add(
                Worker(
                    id=seed_id(key),
                    agency_id=seed_id("a-kano" if kano else "a-sunrise"),
                    full_name=name,
                    role=WorkerRole(role),
                    years_experience=years,
                    languages=languages,
                    live_in_ok=role == "nanny",
                    state="Kano" if kano else "Lagos",
                    lga=lga,
                    expected_salary_min_kobo=naira(90_000 if role == "driver" else 70_000),
                    expected_salary_max_kobo=naira(140_000 if role == "driver" else 110_000),
                    nin_hash=hash_nin(nin, pepper),
                    nin_last4=nin[-4:],
                    consent_at=self.at(-120),
                    listing_status=ListingStatus.draft,  # listed below, once the checks exist
                    created_at=self.at(-120),
                )
            )
        await self.session.flush()

        verified = ["w-amaka", "w-blessing", "w-musa", "w-chinedu", "w-grace", "w-fatima", "w-zainab"]
        for key in verified:
            for kind in KINDS:
                self.item(key, kind, VerificationStatus.verified)
        # 3 of 4: the address evidence is uploaded and waiting to be checked.
        for kind in KINDS:
            status = (
                VerificationStatus.submitted
                if kind is VerificationKind.address
                else VerificationStatus.verified
            )
            self.item("w-joy", kind, status)
        # Guarantor rejected, address not started.
        self.item("w-emeka", VerificationKind.id, VerificationStatus.verified)
        self.item(
            "w-emeka",
            VerificationKind.guarantor,
            VerificationStatus.rejected,
            rejection_reason="The guarantor's phone number could not be reached.",
        )
        self.item("w-emeka", VerificationKind.references, VerificationStatus.verified)
        self.item("w-emeka", VerificationKind.address, VerificationStatus.not_started)
        # References lapsed after 12 months, so the worker was delisted.
        for kind in KINDS:
            if kind is VerificationKind.references:
                self.item(
                    "w-halima",
                    kind,
                    VerificationStatus.expired,
                    verified_at=self.at(-395),
                    expires_at=self.at(-30),
                )
            else:
                self.item("w-halima", kind, VerificationStatus.verified)
        for kind in KINDS:
            self.item("w-tobi", kind, VerificationStatus.not_started)
        await self.session.flush()
        self.add(*self.pending_documents)
        await self.session.flush()

        # Listing goes through the rule 1 trigger, which refuses anyone without 4/4 verified checks.
        await self.session.execute(
            update(Worker)
            .where(Worker.id.in_([seed_id(k) for k in verified]))
            .values(listing_status=ListingStatus.listed)
        )
        await self.session.execute(
            update(Worker)
            .where(Worker.id == seed_id("w-halima"))
            .values(listing_status=ListingStatus.delisted)
        )
        # The trigger stamps listed_at with now(); back-date it like the mock (an UPDATE OF listed_at only).
        await self.session.execute(
            update(Worker).where(Worker.id.in_([seed_id(k) for k in verified])).values(listed_at=self.at(-50))
        )

    def item(self, worker: str, kind: VerificationKind, status: VerificationStatus, **extra: Any) -> None:
        details: dict[VerificationKind, dict[str, str]] = {
            VerificationKind.id: {"document_type": "NIN slip"},
            VerificationKind.guarantor: {
                "name": "Mrs. Funke Ade", "phone": "08023456789", "relationship": "Former employer"
            },
            VerificationKind.references: {
                "referee_name": "Mr. Kunle Bello", "referee_phone": "08034567890",
                "relationship": "Previous employer",
            },
            VerificationKind.address: {"address_line": "14 Market Street"},
        }  # fmt: skip
        checked = status in (VerificationStatus.verified, VerificationStatus.expired)
        expiring = kind in (VerificationKind.references, VerificationKind.address)
        item_id = seed_id(f"vi-{worker}-{kind.value}")
        fields: dict[str, Any] = {
            "details": {} if status is VerificationStatus.not_started else details[kind],
            "verified_by": seed_id("u-agency") if checked else None,
            "verified_at": self.at(-60) if checked else None,
            "expires_at": self.at(-60 + 365) if status is VerificationStatus.verified and expiring else None,
        } | extra
        self.add(VerificationItem(id=item_id, worker_id=seed_id(worker), kind=kind, status=status, **fields))
        if status is not VerificationStatus.not_started:
            # Metadata only: these files aren't in Cloudinary, so opening one shows Cloudinary's not-found.
            self.documents += 1
            self.pending_documents.append(
                VerificationDocument(
                    id=seed_id(f"doc-{self.documents}"),
                    item_id=item_id,
                    cloudinary_public_id=f"workers/docs/{worker}/{kind.value}/seed-{self.documents}",
                    resource_type="image",
                    format="jpg" if kind is VerificationKind.id else "pdf",
                    bytes=180_000 + self.documents * 7_000,
                    uploaded_by=seed_id("u-agency"),
                    created_at=self.at(-62),
                )
            )

    async def requests_and_proposals(self) -> None:
        def request(key: str, family: str, role: str, **extra: Any) -> Request:
            fields: dict[str, Any] = {
                "title": f"{role.capitalize()} needed",
                "description": "Looking for someone reliable and kind who can start soon.",
                "schedule": "full_time",
                "live_in": False,
                "state": "Lagos",
                "lga": "Ikeja",
                "budget_min_kobo": naira(70_000),
                "budget_max_kobo": naira(120_000),
                "start_date": self.on(14),
                "trial_days": 14,
                "status": RequestStatus.open,
                "created_at": self.at(-3),
            } | extra
            return Request(id=seed_id(key), family_id=seed_id(family), role=WorkerRole(role), **fields)

        self.add(
            request(
                "r-ada-nanny", "f-ada", "nanny",
                title="Live-in nanny for two toddlers",
                description=(
                    "Two children aged 2 and 4. Help with meals, bath time and the morning school run."
                ),
                live_in=True, budget_min_kobo=naira(80_000), budget_max_kobo=naira(110_000),
            ),
            request(
                "r-bola-driver", "f-bola", "driver",
                title="Part-time family driver",
                description="School runs on weekdays and occasional weekend trips.",
                schedule="part_time", lga="Eti-Osa", start_date=self.on(7), created_at=self.at(-1),
            ),
            request(
                "r-bola-cleaner", "f-bola", "cleaner",
                title="Cleaner for a 4-bedroom house",
                description="Three days a week, including laundry and ironing.",
                schedule="part_time", lga="Eti-Osa", created_at=self.at(-6),
            ),
            request(
                "r-ifeoma-cleaner", "f-ifeoma", "cleaner",
                title="Full-time housekeeper", state="Federal Capital Territory", lga="Abuja Municipal",
            ),
            # Requests behind placements.
            request("r-ada-nanny-2", "f-ada", "nanny", status=RequestStatus.matched, created_at=self.at(-12)),
            request(
                "r-bola-driver-2", "f-bola", "driver",
                status=RequestStatus.matched, lga="Eti-Osa", created_at=self.at(-40),
            ),
            request(
                "r-bola-cleaner-2", "f-bola", "cleaner",
                status=RequestStatus.matched, lga="Eti-Osa", created_at=self.at(-1),
            ),
            request("r-ada-driver", "f-ada", "driver", status=RequestStatus.closed, created_at=self.at(-220)),
        )  # fmt: skip
        await self.session.flush()
        for key, request_key, worker, status in (
            ("pr-amaka-ada", "r-ada-nanny", "w-amaka", ProposalStatus.pending),
            ("pr-fatima-bola", "r-bola-cleaner", "w-fatima", ProposalStatus.withdrawn),
            ("pr-blessing", "r-ada-nanny-2", "w-blessing", ProposalStatus.accepted),
            ("pr-chinedu", "r-bola-driver-2", "w-chinedu", ProposalStatus.accepted),
            ("pr-grace", "r-bola-cleaner-2", "w-grace", ProposalStatus.accepted),
            ("pr-musa", "r-ada-driver", "w-musa", ProposalStatus.accepted),
        ):
            self.add(
                Proposal(
                    id=seed_id(key),
                    request_id=seed_id(request_key),
                    worker_id=seed_id(worker),
                    agency_id=seed_id("a-sunrise"),
                    note="Experienced, calm and great with routines.",
                    status=status,
                    created_at=self.at(-2),
                )
            )
        await self.session.flush()

    async def placements(self) -> None:
        def placement(
            key: str, request: str, proposal: str, worker: str, family: str, **extra: Any
        ) -> Placement:
            return Placement(
                id=seed_id(key),
                request_id=seed_id(request),
                proposal_id=seed_id(proposal),
                worker_id=seed_id(worker),
                family_id=seed_id(family),
                agency_id=seed_id("a-sunrise"),
                **extra,
            )

        # One active placement per worker (rule 2): the partial unique index refuses a second.
        self.add(
            placement(
                "p-blessing", "r-ada-nanny-2", "pr-blessing", "w-blessing", "f-ada",
                status=PlacementStatus.trial, trial_starts_on=self.on(-12), trial_ends_on=self.on(2),
                created_at=self.at(-12),
            ),
            placement(
                "p-chinedu", "r-bola-driver-2", "pr-chinedu", "w-chinedu", "f-bola",
                status=PlacementStatus.confirmed, trial_starts_on=self.on(-34), trial_ends_on=self.on(-20),
                confirmed_at=self.at(-20), created_at=self.at(-35),
            ),
            # The 30-minute fee hold: the expire_holds job cancels it if nobody pays.
            placement(
                "p-grace", "r-bola-cleaner-2", "pr-grace", "w-grace", "f-bola",
                status=PlacementStatus.pending_payment, hold_expires_at=self.now + timedelta(minutes=25),
                created_at=self.now,
            ),
            placement(
                "p-musa", "r-ada-driver", "pr-musa", "w-musa", "f-ada",
                status=PlacementStatus.ended, trial_starts_on=self.on(-210), trial_ends_on=self.on(-196),
                confirmed_at=self.at(-196), ended_at=self.at(-30), end_reason=EndReason.completed,
                created_at=self.at(-211),
            ),
        )  # fmt: skip
        await self.session.flush()
        ada, bola = seed_id("u-family"), seed_id("u-bola")
        P = PlacementStatus  # noqa: N806
        for key, from_status, to_status, actor, days, reason in (
            ("p-blessing", None, P.pending_payment, ada, -12, None),
            ("p-blessing", P.pending_payment, P.trial, None, -12, None),
            ("p-chinedu", None, P.pending_payment, bola, -35, None),
            ("p-chinedu", P.pending_payment, P.trial, None, -34, None),
            ("p-chinedu", P.trial, P.confirmed, bola, -20, None),
            ("p-grace", None, P.pending_payment, bola, 0, None),
            ("p-musa", None, P.pending_payment, ada, -211, None),
            ("p-musa", P.pending_payment, P.trial, None, -210, None),
            ("p-musa", P.trial, P.confirmed, ada, -196, None),
            ("p-musa", P.confirmed, P.ended, ada, -30, "Our family relocated."),
        ):
            self.add(
                PlacementEvent(
                    placement_id=seed_id(key),
                    from_status=from_status,
                    to_status=to_status,
                    actor_id=actor,
                    reason=reason,
                    created_at=self.at(days),
                )
            )
        await self.session.flush()

    async def payments_and_audit(self) -> None:
        fee = self.settings.PLACEMENT_FEE_KOBO
        # Grace's hold has no checkout attempt yet: "Pay" opens one (ADR 0017). The web mock lists a pending
        # payment for it instead; an attempt with no Paystack transaction would only be reconciled forever.
        for key, placement, payer, days in (
            ("pf-blessing", "p-blessing", "u-family", -12),
            ("pf-chinedu", "p-chinedu", "u-bola", -35),
            ("pf-musa", "p-musa", "u-family", -211),
        ):
            self.add(
                Payment(
                    id=seed_id(key),
                    kind=PaymentKind.placement_fee,
                    payer_user_id=seed_id(payer),
                    placement_id=seed_id(placement),
                    amount_kobo=fee,
                    paystack_reference=f"HV-SEED-{key.upper()}",
                    status=PaymentStatus.succeeded,
                    attempt_no=1,
                    paid_at=self.at(days),
                    created_at=self.at(days),
                )
            )
        for n, days in enumerate((-70, -40, -10), start=1):
            self.add(
                Payment(
                    id=seed_id(f"pay-sub-{n}"),
                    kind=PaymentKind.subscription,
                    payer_user_id=seed_id("u-agency"),
                    agency_id=seed_id("a-sunrise"),
                    amount_kobo=self.settings.AGENCY_SUBSCRIPTION_KOBO,
                    paystack_reference=f"HV-SEED-SUB-SUNRISE-{n}",
                    status=PaymentStatus.success,  # subscriptions keep pending / success / failed
                    paid_at=self.at(days),
                    created_at=self.at(days),
                )
            )
        admin = seed_id("u-admin")
        suspended = "CAC registration lapsed; resubmit an up-to-date certificate."
        for days, action, entity, key, data in (
            (-398, AuditAction.agency_approved, "agency", "a-sunrise",
             {"label": "Sunrise Domestic Staffing"}),
            (-297, AuditAction.agency_approved, "agency", "a-kano", {"label": "Kano Home Helpers"}),
            (-200, AuditAction.agency_approved, "agency", "a-harbour", {"label": "Harbour Care Services"}),
            (-30, AuditAction.placement_ended, "placement", "p-musa",
             {"label": "Musa Ibrahim with the Okafor family", "reason": "Contract completed."}),
            (-6, AuditAction.agency_suspended, "agency", "a-harbour",
             {"label": "Harbour Care Services", "reason": suspended}),
        ):  # fmt: skip
            self.add(
                AuditLog(
                    actor_id=admin,
                    action=action.value,
                    entity=entity,
                    entity_id=seed_id(key),
                    data=data,
                    created_at=self.at(days),
                )
            )
        await self.session.flush()


async def empty_database(session: AsyncSession) -> None:
    tables = (
        await session.execute(
            text(
                "SELECT tablename FROM pg_tables "
                "WHERE schemaname = 'public' AND tablename <> 'alembic_version'"
            )
        )
    ).scalars()
    names = ", ".join(f'"{name}"' for name in tables)  # from the catalog, not from input
    if names:
        await session.execute(text(f"TRUNCATE {names} RESTART IDENTITY CASCADE"))


async def seed(settings: Settings, *, reset: bool) -> None:
    demo = settings.SEED_DEMO_PASSWORD.get_secret_value() if settings.SEED_DEMO_PASSWORD else ""
    admin = settings.SEED_ADMIN_PASSWORD.get_secret_value() if settings.SEED_ADMIN_PASSWORD else demo
    engine = create_engine(settings.database_url)
    try:
        async with create_sessionmaker(engine)() as session, session.begin():
            if reset:
                await empty_database(session)
            elif (await session.execute(text("SELECT EXISTS (SELECT 1 FROM users)"))).scalar():
                raise SeedError("The database already has users. Run with --reset to empty it first.")
            await Seeder(session, settings, demo, admin).run()
    finally:
        await engine.dispose()


class SeedError(RuntimeError):
    pass


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0] if __doc__ else None)
    parser.add_argument("--reset", action="store_true", help="empty every table first")
    args = parser.parse_args(argv)
    settings = load_settings()
    if settings.APP_ENV not in ("development", "test"):
        print(f"Refusing to seed demo data with APP_ENV={settings.APP_ENV}.")
        return 1
    if not settings.SEED_DEMO_PASSWORD:
        print("Set SEED_DEMO_PASSWORD in apps/api/.env first (and optionally SEED_ADMIN_PASSWORD).")
        return 1
    try:
        asyncio.run(seed(settings, reset=args.reset))
    except SeedError as exc:
        print(exc)
        return 1
    print(f"Seeded the demo data. Accounts are <name>@{DEMO_EMAIL_DOMAIN} (see README).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
