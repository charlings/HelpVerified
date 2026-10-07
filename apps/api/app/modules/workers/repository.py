"""Worker queries. Translates the database's refusals into domain errors:
the listing gate (P0001, hint WORKER_NOT_VERIFIED) and a duplicate NIN (uq_workers_nin_hash)."""

import uuid

from sqlalchemy import exists, func, select
from sqlalchemy.exc import DBAPIError, IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import DuplicateWorker, WorkerNotVerified
from app.core.pagination import PageParams
from app.db.errors import pg_error
from app.modules.agencies.models import Agency, WorkerRole
from app.modules.placements.models import ACTIVE, Placement
from app.modules.verification.models import KINDS, VerificationItem
from app.modules.workers.models import ListingStatus, Worker


class WorkerRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get(self, worker_id: uuid.UUID, *, for_update: bool = False) -> Worker | None:
        query = select(Worker).where(Worker.id == worker_id)
        return await self.session.scalar(query.with_for_update() if for_update else query)

    async def get_owned(
        self, worker_id: uuid.UUID, agency_id: uuid.UUID, *, for_update: bool = False
    ) -> Worker | None:
        """Another agency's worker is "not found", so IDs can't be probed (backend.md §2)."""
        query = select(Worker).where(Worker.id == worker_id, Worker.agency_id == agency_id)
        return await self.session.scalar(query.with_for_update() if for_update else query)

    async def count_listed(self) -> int:
        return (
            await self.session.scalar(
                select(func.count()).select_from(Worker).where(Worker.listing_status == ListingStatus.listed)
            )
            or 0
        )

    async def nin_exists(self, nin_hash: str) -> bool:
        return await self.session.scalar(select(func.count()).where(Worker.nin_hash == nin_hash)) != 0

    async def add_with_items(self, worker: Worker) -> Worker:
        """Inserts the worker and its four checks (`not_started`) in the caller's transaction."""
        self.session.add(worker)
        try:
            await self.session.flush()
        except IntegrityError as exc:
            if pg_error(exc).constraint == "uq_workers_nin_hash":
                raise DuplicateWorker() from exc
            raise
        self.session.add_all(VerificationItem(worker_id=worker.id, kind=kind) for kind in KINDS)
        await self.session.flush()
        await self.session.refresh(worker)
        return worker

    async def save_listing(self, worker: Worker) -> None:
        """Flushes a listing_status change; the gate trigger has the final say."""
        try:
            await self.session.flush()
        except DBAPIError as exc:
            if pg_error(exc).hint == "WORKER_NOT_VERIFIED":
                raise WorkerNotVerified() from exc
            raise
        await self.session.refresh(worker)

    async def page(
        self,
        params: PageParams,
        *,
        agency_id: uuid.UUID | None = None,
        role: WorkerRole | None = None,
        listing_status: ListingStatus | None = None,
        available: bool | None = None,
        order_by_name: bool = False,
    ) -> tuple[list[tuple[Worker, Agency]], int]:
        query = select(Worker, Agency).join(Agency, Agency.id == Worker.agency_id)
        count = select(func.count()).select_from(Worker)
        placed = exists().where(Placement.worker_id == Worker.id, Placement.status.in_(ACTIVE))
        for condition in (
            Worker.agency_id == agency_id if agency_id else None,
            Worker.role == role if role else None,
            Worker.listing_status == listing_status if listing_status else None,
            None if available is None else (~placed if available else placed),
        ):
            if condition is not None:
                query = query.where(condition)
                count = count.where(condition)
        order = (Worker.full_name, Worker.id) if order_by_name else (Worker.created_at.desc(), Worker.id)
        rows = await self.session.execute(
            query.order_by(*order).offset(params.offset).limit(params.page_size)
        )
        total = await self.session.scalar(count) or 0
        return [(worker, agency) for worker, agency in rows], total
