"""Agency onboarding, profile and dashboard (api-contracts.md §3, Agencies)."""

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AgencyExists, EmailNotVerified, Forbidden, NotFound
from app.modules.agencies.models import Agency, AgencyStatus, Subscription, SubscriptionStatus, WorkerRole
from app.modules.agencies.repository import AgencyRepository, cac_taken_error
from app.modules.users.models import User, UserRole
from app.modules.verification.models import VerificationStatus
from app.modules.verification.repository import VerificationRepository

NEEDS_ATTENTION = (VerificationStatus.submitted, VerificationStatus.rejected, VerificationStatus.expired)


def is_active(agency: Agency, subscription: Subscription | None) -> bool:
    """May list workers and propose them: approved, with an active subscription (backend.md §4)."""
    return (
        agency.status is AgencyStatus.approved
        and subscription is not None
        and subscription.status is SubscriptionStatus.active
    )


class AgencyService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
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
        async with self.session.begin():
            subscription = await self.agencies.subscription(agency.id)
            counts = await self.agencies.worker_counts(agency.id)
            attention = await VerificationRepository(self.session).count_for_agency(
                agency.id, NEEDS_ATTENTION
            )
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
            "open_requests": 0,  # requests arrive in B4
            "trials_ending": [],  # placements arrive in B4
        }

    async def subscription(self, agency_id: uuid.UUID) -> Subscription | None:
        async with self.session.begin():
            return await self.agencies.subscription(agency_id)
