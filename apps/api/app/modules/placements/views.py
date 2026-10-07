"""Builds placement responses, including `allowed_actions` for the caller (api-contracts.md §3)."""

import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.modules.agencies.models import Agency
from app.modules.families.models import Family
from app.modules.placements.models import Placement
from app.modules.placements.repository import PlacementRepository
from app.modules.placements.schemas import EventOut, FamilyRef, PlacementOut, PlacementSummary
from app.modules.placements.state_machine import Role, allowed_actions
from app.modules.requests.schemas import AgencyRef, WorkerRef
from app.modules.users.models import User, UserRole
from app.modules.workers.models import Worker

ACTOR_LABEL = {UserRole.family: "family", UserRole.agency_admin: "agency", UserRole.super_admin: "admin"}


class PlacementViews:
    def __init__(self, session: AsyncSession, settings: Settings) -> None:
        self.session = session
        self.settings = settings
        self.placements = PlacementRepository(session)

    async def summaries(self, placements: list[Placement]) -> list[PlacementSummary]:
        workers = await self._by_id(Worker, [p.worker_id for p in placements])
        families = await self._by_id(Family, [p.family_id for p in placements])
        agencies = await self._by_id(Agency, [p.agency_id for p in placements])
        return [
            PlacementSummary(
                id=p.id,
                status=p.status.value,
                worker=WorkerRef(
                    id=p.worker_id,
                    full_name=workers[p.worker_id].full_name,
                    role=workers[p.worker_id].role.value,
                ),
                family=FamilyRef(id=p.family_id, name=families[p.family_id].name),
                agency=AgencyRef(id=p.agency_id, name=agencies[p.agency_id].name),
                request_id=p.request_id,
                hold_expires_at=p.hold_expires_at,
                trial_starts_on=p.trial_starts_on,
                trial_ends_on=p.trial_ends_on,
                confirmed_at=p.confirmed_at,
                ended_at=p.ended_at,
                end_reason=p.end_reason.value if p.end_reason else None,
                replacements_used=p.replacements_used,
                created_at=p.created_at,
            )
            for p in placements
        ]

    async def summary(self, placement: Placement) -> PlacementSummary:
        [summary] = await self.summaries([placement])
        return summary

    async def detail(self, placement: Placement, viewer: User, now: datetime) -> PlacementOut:
        summary = await self.summary(placement)
        events = await self.placements.events(placement.id)
        role: Role = viewer.role.value
        return PlacementOut(
            **summary.model_dump(),
            allowed_actions=allowed_actions(
                role, placement.status, placement.confirmed_at, self.settings.REPLACEMENT_WINDOW_DAYS, now
            ),
            events=[
                EventOut(
                    from_=e.from_status.value if e.from_status else None,
                    to=e.to_status.value,
                    at=e.created_at,
                    actor=ACTOR_LABEL[actor.role] if actor else "system",
                    reason=e.reason,
                )
                for e, actor in events
            ],
        )

    async def _by_id[T](self, model: type[T], ids: list[uuid.UUID]) -> dict[uuid.UUID, T]:
        rows = await self.session.scalars(select(model).where(model.id.in_(set(ids))))  # type: ignore[attr-defined]
        return {row.id: row for row in rows}  # type: ignore[attr-defined]
