"""Placement queries. Turns rule 2's database refusal into a domain error: a violation of
`placements_one_active_per_worker` is 409 WORKER_UNAVAILABLE, never a 500 (database.md §5)."""

import uuid
from datetime import date, datetime

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import RequestNotOpen, WorkerUnavailable
from app.core.pagination import PageParams
from app.db.errors import pg_error
from app.modules.placements.models import (
    ACTIVE,
    Placement,
    PlacementEvent,
    PlacementStatus,
    ReplacementRequest,
)
from app.modules.users.models import User


class PlacementRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get(self, placement_id: uuid.UUID, *, for_update: bool = False) -> Placement | None:
        query = select(Placement).where(Placement.id == placement_id)
        return await self.session.scalar(query.with_for_update() if for_update else query)

    async def add(self, placement: Placement) -> Placement:
        self.session.add(placement)
        try:
            await self.session.flush()
        except IntegrityError as exc:
            constraint = pg_error(exc).constraint
            if constraint == "placements_one_active_per_worker":
                raise WorkerUnavailable() from exc
            if constraint == "placements_one_active_per_request":
                raise RequestNotOpen() from exc
            raise
        await self.session.refresh(placement)
        return placement

    async def active_for_worker(self, worker_id: uuid.UUID) -> Placement | None:
        return await self.session.scalar(
            select(Placement).where(Placement.worker_id == worker_id, Placement.status.in_(ACTIVE))
        )

    async def active_for_request(self, request_id: uuid.UUID) -> Placement | None:
        """At most one (placements_one_active_per_request). No lock: the caller holds the request's."""
        return await self.session.scalar(
            select(Placement).where(Placement.request_id == request_id, Placement.status.in_(ACTIVE))
        )

    async def occupying(self, worker_id: uuid.UUID, now: datetime) -> Placement | None:
        """The active placement that makes the worker unavailable, ignoring an unpaid hold that has
        lapsed (the job or the next accept cancels it)."""
        lapsed_hold = (Placement.status == PlacementStatus.pending_payment) & (
            Placement.hold_expires_at <= now
        )
        return await self.session.scalar(
            select(Placement).where(
                Placement.worker_id == worker_id, Placement.status.in_(ACTIVE), ~lapsed_hold
            )
        )

    async def active_for_workers(self, worker_ids: list[uuid.UUID]) -> dict[uuid.UUID, Placement]:
        rows = await self.session.scalars(
            select(Placement).where(Placement.worker_id.in_(worker_ids), Placement.status.in_(ACTIVE))
        )
        return {p.worker_id: p for p in rows}

    async def latest_for_requests(self, request_ids: list[uuid.UUID]) -> dict[uuid.UUID, uuid.UUID]:
        rows = await self.session.execute(
            select(Placement.request_id, Placement.id)
            .where(Placement.request_id.in_(request_ids))
            .order_by(Placement.created_at)
        )
        return {request_id: placement_id for request_id, placement_id in rows}  # later rows win

    async def expired_holds(
        self, now: datetime, worker_id: uuid.UUID | None = None, request_id: uuid.UUID | None = None
    ) -> list[Placement]:
        """Unpaid holds past their deadline, locked; rows another transaction holds are skipped."""
        query = select(Placement).where(
            Placement.status == PlacementStatus.pending_payment, Placement.hold_expires_at <= now
        )
        if worker_id:
            query = query.where(Placement.worker_id == worker_id)
        if request_id:
            query = query.where(Placement.request_id == request_id)
        return list(await self.session.scalars(query.with_for_update(skip_locked=True)))

    async def add_event(
        self,
        placement_id: uuid.UUID,
        from_status: PlacementStatus | None,
        to_status: PlacementStatus,
        actor_id: uuid.UUID | None,
        reason: str | None,
    ) -> None:
        self.session.add(
            PlacementEvent(
                placement_id=placement_id,
                from_status=from_status,
                to_status=to_status,
                actor_id=actor_id,
                reason=reason,
            )
        )
        await self.session.flush()

    async def events(self, placement_id: uuid.UUID) -> list[tuple[PlacementEvent, User | None]]:
        rows = await self.session.execute(
            select(PlacementEvent, User)
            .outerjoin(User, User.id == PlacementEvent.actor_id)
            .where(PlacementEvent.placement_id == placement_id)
            .order_by(PlacementEvent.created_at, PlacementEvent.id)
        )
        return [(event, actor) for event, actor in rows]

    async def add_replacement(self, replacement: ReplacementRequest) -> None:
        self.session.add(replacement)
        await self.session.flush()

    async def open_replacement_for(self, placement_id: uuid.UUID) -> ReplacementRequest | None:
        return await self.session.scalar(
            select(ReplacementRequest).where(ReplacementRequest.placement_id == placement_id)
        )

    async def page(
        self,
        params: PageParams,
        *,
        family_id: uuid.UUID | None = None,
        agency_id: uuid.UUID | None = None,
        status: PlacementStatus | None = None,
    ) -> tuple[list[Placement], int]:
        conditions = [
            c
            for c in (
                Placement.family_id == family_id if family_id else None,
                Placement.agency_id == agency_id if agency_id else None,
                Placement.status == status if status else None,
            )
            if c is not None
        ]
        rows = await self.session.scalars(
            select(Placement)
            .where(*conditions)
            .order_by(Placement.created_at.desc(), Placement.id)
            .offset(params.offset)
            .limit(params.page_size)
        )
        total = await self.session.scalar(select(func.count()).select_from(Placement).where(*conditions)) or 0
        return list(rows), total

    async def active_for_family(self, family_id: uuid.UUID) -> list[Placement]:
        rows = await self.session.scalars(
            select(Placement)
            .where(Placement.family_id == family_id, Placement.status.in_(ACTIVE))
            .order_by(Placement.created_at.desc())
        )
        return list(rows)

    async def trials_ending(self, by: date, agency_id: uuid.UUID | None = None) -> list[Placement]:
        query = select(Placement).where(
            Placement.status == PlacementStatus.trial, Placement.trial_ends_on <= by
        )
        if agency_id:
            query = query.where(Placement.agency_id == agency_id)
        return list(await self.session.scalars(query.order_by(Placement.trial_ends_on)))

    async def count_active(self, agency_id: uuid.UUID | None = None) -> int:
        query = select(func.count()).select_from(Placement).where(Placement.status.in_(ACTIVE))
        if agency_id:
            query = query.where(Placement.agency_id == agency_id)
        return await self.session.scalar(query) or 0
