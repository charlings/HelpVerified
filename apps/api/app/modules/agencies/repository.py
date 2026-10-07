"""Agency, membership and subscription queries."""

import uuid

from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ValidationFailed
from app.core.pagination import PageParams
from app.db.errors import pg_error
from app.modules.agencies.models import Agency, AgencyMember, AgencyStatus, Subscription
from app.modules.users.models import User
from app.modules.workers.models import ListingStatus, Worker


def cac_taken_error() -> ValidationFailed:
    return ValidationFailed(
        details={"fields": {"cac_number": ["An agency with this CAC number is already registered."]}}
    )


class AgencyRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get(self, agency_id: uuid.UUID, *, for_update: bool = False) -> Agency | None:
        query = select(Agency).where(Agency.id == agency_id)
        return await self.session.scalar(query.with_for_update() if for_update else query)

    async def for_user(self, user_id: uuid.UUID) -> Agency | None:
        return await self.session.scalar(
            select(Agency)
            .join(AgencyMember, AgencyMember.agency_id == Agency.id)
            .where(AgencyMember.user_id == user_id)
        )

    async def cac_taken(self, cac_number: str) -> bool:
        return await self.session.scalar(select(func.count()).where(Agency.cac_number == cac_number)) != 0

    async def add(self, agency: Agency, admin_user_id: uuid.UUID) -> Agency:
        self.session.add(agency)
        try:
            await self.session.flush()
        except IntegrityError as exc:
            if pg_error(exc).constraint == "uq_agencies_cac_number":
                raise cac_taken_error() from exc
            raise
        self.session.add(AgencyMember(user_id=admin_user_id, agency_id=agency.id))
        await self.session.flush()
        await self.session.refresh(agency)
        return agency

    async def pending_oldest_first(self) -> list[Agency]:
        rows = await self.session.scalars(
            select(Agency).where(Agency.status == AgencyStatus.pending).order_by(Agency.created_at)
        )
        return list(rows)

    async def subscription(self, agency_id: uuid.UUID) -> Subscription | None:
        return await self.session.scalar(select(Subscription).where(Subscription.agency_id == agency_id))

    async def admin_user(self, agency_id: uuid.UUID) -> User | None:
        return await self.session.scalar(
            select(User)
            .join(AgencyMember, AgencyMember.user_id == User.id)
            .where(AgencyMember.agency_id == agency_id)
            .order_by(AgencyMember.created_at)
            .limit(1)
        )

    async def worker_counts(self, agency_id: uuid.UUID) -> dict[str, int]:
        rows = await self.session.execute(
            select(Worker.listing_status, func.count())
            .where(Worker.agency_id == agency_id)
            .group_by(Worker.listing_status)
        )
        counts = {status.value: 0 for status in ListingStatus}
        for status, count in rows:
            counts[status.value] = count
        return {"total": sum(counts.values()), **counts}

    async def page(
        self, params: PageParams, status: AgencyStatus | None
    ) -> tuple[list[tuple[Agency, int]], int]:
        """Pending first (they need action), then newest; with each agency's worker count."""
        workers = (
            select(func.count()).where(Worker.agency_id == Agency.id).correlate(Agency).scalar_subquery()
        )
        pending_first = (Agency.status != AgencyStatus.pending).asc()
        query = select(Agency, workers)
        count = select(func.count()).select_from(Agency)
        if status:
            query = query.where(Agency.status == status)
            count = count.where(Agency.status == status)
        rows = await self.session.execute(
            query.order_by(pending_first, Agency.created_at.desc())
            .offset(params.offset)
            .limit(params.page_size)
        )
        total = await self.session.scalar(count) or 0
        return [(agency, n) for agency, n in rows], total

    async def set_workers_status(
        self, agency_id: uuid.UUID, from_status: ListingStatus, to_status: ListingStatus
    ) -> None:
        await self.session.execute(
            update(Worker)
            .where(Worker.agency_id == agency_id, Worker.listing_status == from_status)
            .values(listing_status=to_status)
        )
