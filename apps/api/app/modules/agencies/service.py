"""Agency onboarding, profile and dashboard (api-contracts.md §3, Agencies)."""

import uuid
from datetime import timedelta
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.clock import utcnow
from app.core.config import Settings
from app.core.dates import lagos_date
from app.core.errors import AgencyExists, EmailNotVerified, Forbidden, NotFound
from app.modules.agencies.models import Agency, AgencyStatus, Subscription, SubscriptionStatus, WorkerRole
from app.modules.agencies.repository import AgencyRepository, cac_taken_error
from app.modules.placements.repository import PlacementRepository
from app.modules.placements.views import PlacementViews
from app.modules.requests.repository import RequestRepository
from app.modules.users.models import User, UserRole
from app.modules.verification.models import VerificationStatus
from app.modules.verification.repository import VerificationRepository

NEEDS_ATTENTION = (VerificationStatus.submitted, VerificationStatus.rejected, VerificationStatus.expired)
TRIAL_REMINDER_DAYS = 3  # the dashboard lists trials ending within this many days (as the web mock does)


def is_active(agency: Agency, subscription: Subscription | None) -> bool:
    """May list workers and propose them: approved, with an active subscription (backend.md §4)."""
    return (
        agency.status is AgencyStatus.approved
        and subscription is not None
        and subscription.status is SubscriptionStatus.active
    )


class AgencyService:
    def __init__(self, session: AsyncSession, settings: Settings) -> None:
        self.session = session
        self.settings = settings
        self.agencies = AgencyRepository(session)

    async def for_user(self, user_id: uuid.UUID) -> Agency | None:
        async with self.session.begin():
            return await self.agencies.for_user(user_id)

    async def require_for_user(self, user: User) -> Agency:
        """The caller's agency. An agency admin who hasn't registered one yet gets 403 (as in the mock)."""
        if user.role is not UserRole.agency_admin:
            raise Forbidden()
        agency = await self.for_user(user.id)
        if agency is None:
            raise Forbidden("Register your agency first.")
        return agency

    async def register(self, user: User, data: dict[str, Any]) -> Agency:
        """Onboarding, once per agency admin. The agency starts `pending` until a super admin approves it."""
        if user.role is not UserRole.agency_admin:
            raise Forbidden()
        if user.email_verified_at is None:
            raise EmailNotVerified()
        async with self.session.begin():
            if await self.agencies.for_user(user.id):
                raise AgencyExists()
            if await self.agencies.cac_taken(data["cac_number"]):
                raise cac_taken_error()
            return await self.agencies.add(
                Agency(**data | {"roles_offered": [WorkerRole(r) for r in data["roles_offered"]]}),
                admin_user_id=user.id,
            )

    async def update(self, agency: Agency, changes: dict[str, Any]) -> Agency:
        async with self.session.begin():
            current = await self.agencies.get(agency.id, for_update=True)
            if current is None:
                raise NotFound()
            for field, value in changes.items():
                if value is None:
                    continue  # every editable field is required on the agency
                setattr(current, field, [WorkerRole(r) for r in value] if field == "roles_offered" else value)
        return current

    async def dashboard(self, agency: Agency) -> dict[str, Any]:
        soon = lagos_date(utcnow()) + timedelta(days=TRIAL_REMINDER_DAYS)
        async with self.session.begin():
            subscription = await self.agencies.subscription(agency.id)
            counts = await self.agencies.worker_counts(agency.id)
            attention = await VerificationRepository(self.session).count_for_agency(
                agency.id, NEEDS_ATTENTION
            )
            open_requests = await RequestRepository(self.session).count_matching(
                list(agency.roles_offered), agency.state
            )
            ending = await PlacementRepository(self.session).trials_ending(soon, agency_id=agency.id)
            summaries = await PlacementViews(self.session, self.settings).summaries(ending)
        return {
            "agency": {
                "id": agency.id,
                "name": agency.name,
                "status": agency.status.value,
                "status_reason": agency.status_reason,
            },
            "subscription": (
                {"status": subscription.status.value, "current_period_end": subscription.current_period_end}
                if subscription
                else None
            ),
            "active": is_active(agency, subscription),
            "workers": counts,
            "checks_needing_attention": attention,
            "open_requests": open_requests,
            "trials_ending": [
                {
                    "id": s.id,
                    "worker_name": s.worker.full_name,
                    "family_name": s.family.name,
                    "trial_ends_on": s.trial_ends_on,
                }
                for s in summaries
            ],
        }

    async def subscription(self, agency_id: uuid.UUID) -> Subscription | None:
        async with self.session.begin():
            return await self.agencies.subscription(agency_id)
