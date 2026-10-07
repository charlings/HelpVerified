"""Workers owned by an agency (api-contracts.md §3, Workers). Listing lives in the verification
service, next to the checks it depends on (CLAUDE.md: rule 1)."""

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.clock import utcnow
from app.core.config import Settings
from app.core.errors import DuplicateWorker, NotFound, ValidationFailed
from app.core.pagination import PageParams
from app.core.security import hash_nin
from app.modules.agencies.models import Agency, WorkerRole
from app.modules.placements.repository import PlacementRepository
from app.modules.verification.repository import VerificationRepository
from app.modules.workers.models import ListingStatus, Worker
from app.modules.workers.repository import WorkerRepository
from app.modules.workers.schemas import WorkerOut


def photo_url(settings: Settings, worker: Worker) -> str | None:
    """Worker photos are public assets in their own folder (documents never are)."""
    if not worker.photo_public_id:
        return None
    return (
        f"https://res.cloudinary.com/{settings.CLOUDINARY_CLOUD_NAME}/image/upload/{worker.photo_public_id}"
    )


class WorkerService:
    def __init__(self, session: AsyncSession, settings: Settings) -> None:
        self.session = session
        self.settings = settings
        self.workers = WorkerRepository(session)
        self.checks = VerificationRepository(session)
        self.placements = PlacementRepository(session)

    async def out(self, worker: Worker) -> WorkerOut:
        statuses = await self.checks.statuses([worker.id])
        active = await self.placements.active_for_worker(worker.id)
        return WorkerOut.of(worker, statuses[worker.id], photo_url(self.settings, worker), active)

    async def create(self, agency: Agency, data: dict[str, Any], nin: str) -> WorkerOut:
        """Creates the worker with its four checks `not_started`. Allowed before approval (drafts)."""
        nin_hash = hash_nin(nin, self.settings.NIN_PEPPER.get_secret_value())
        async with self.session.begin():
            if await self.workers.nin_exists(nin_hash):
                raise DuplicateWorker()
            worker = await self.workers.add_with_items(
                Worker(
                    **data | {"role": WorkerRole(data["role"])},
                    agency_id=agency.id,
                    nin_hash=nin_hash,
                    nin_last4=nin[-4:],
                    consent_at=utcnow(),
                )
            )
            return await self.out(worker)

    async def get(self, agency: Agency, worker_id: uuid.UUID) -> WorkerOut:
        async with self.session.begin():
            worker = await self.workers.get_owned(worker_id, agency.id)
            if worker is None:
                raise NotFound()
            return await self.out(worker)

    async def page(
        self,
        agency: Agency,
        params: PageParams,
        role: WorkerRole | None,
        listing_status: ListingStatus | None,
        available: bool | None,
    ) -> tuple[list[WorkerOut], int]:
        async with self.session.begin():
            rows, total = await self.workers.page(
                params, agency_id=agency.id, role=role, listing_status=listing_status, available=available
            )
            ids = [w.id for w, _ in rows]
            statuses = await self.checks.statuses(ids)
            active = await self.placements.active_for_workers(ids)
            return [
                WorkerOut.of(w, statuses[w.id], photo_url(self.settings, w), active.get(w.id))
                for w, _ in rows
            ], total

    async def update(self, agency: Agency, worker_id: uuid.UUID, changes: dict[str, Any]) -> WorkerOut:
        async with self.session.begin():
            worker = await self.workers.get_owned(worker_id, agency.id, for_update=True)
            if worker is None:
                raise NotFound()
            low = changes.get("expected_salary_min_kobo", worker.expected_salary_min_kobo)
            high = changes.get("expected_salary_max_kobo", worker.expected_salary_max_kobo)
            if low is not None and high is not None and low > high:
                raise ValidationFailed(
                    details={
                        "fields": {"expected_salary_max_kobo": ["The maximum must be at least the minimum."]}
                    }
                )
            for field, value in changes.items():
                if value is None and field in {
                    "full_name",
                    "years_experience",
                    "languages",
                    "live_in_ok",
                    "state",
                    "lga",
                }:
                    continue  # required fields can't be cleared
                setattr(worker, field, value)
            await self.session.flush()
            return await self.out(worker)
