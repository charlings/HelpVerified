"""Builds request, proposal and public-worker responses from rows (several services share these)."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.agencies.models import Agency
from app.modules.placements.repository import PlacementRepository
from app.modules.requests.models import Proposal, Request
from app.modules.requests.repository import RequestRepository
from app.modules.requests.schemas import (
    AgencyProposalOut,
    AgencyRef,
    AgencyRequestOut,
    Badge,
    FamilyProposalOut,
    FamilyRequestOut,
    RequestFields,
    WorkerPublicOut,
    WorkerRef,
)
from app.modules.verification.models import VerificationItem, VerificationStatus
from app.modules.workers.models import Worker


def _fields(request: Request) -> dict[str, object]:
    return RequestFields(
        id=request.id,
        role=request.role.value,
        title=request.title,
        description=request.description,
        schedule=request.schedule,
        live_in=request.live_in,
        state=request.state,
        lga=request.lga,
        budget_min_kobo=request.budget_min_kobo,
        budget_max_kobo=request.budget_max_kobo,
        start_date=request.start_date,
        trial_days=request.trial_days,
        status=request.status.value,
        created_at=request.created_at,
    ).model_dump()


class RequestViews:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.requests = RequestRepository(session)
        self.placements = PlacementRepository(session)

    async def for_family(self, requests: list[Request]) -> list[FamilyRequestOut]:
        ids = [r.id for r in requests]
        counts = await self.requests.proposal_counts(ids)
        latest = await self.placements.latest_for_requests(ids)
        return [
            FamilyRequestOut(
                **_fields(r),
                proposals_count=counts[r.id]["total"],
                pending_proposals=counts[r.id]["pending"],
                replaces_placement_id=r.replaces_placement_id,
                placement_id=latest.get(r.id),
            )
            for r in requests
        ]

    async def for_agency(self, agency_id: uuid.UUID, requests: list[Request]) -> list[AgencyRequestOut]:
        mine = await self.requests.agency_proposal_counts(agency_id, [r.id for r in requests])
        return [AgencyRequestOut(**_fields(r), my_proposals=mine.get(r.id, 0)) for r in requests]

    async def _workers(self, ids: list[uuid.UUID]) -> dict[uuid.UUID, Worker]:
        return {w.id: w for w in await self.session.scalars(select(Worker).where(Worker.id.in_(ids)))}

    async def agency_proposals(self, proposals: list[Proposal]) -> list[AgencyProposalOut]:
        workers = await self._workers([p.worker_id for p in proposals])
        return [
            AgencyProposalOut(
                id=p.id,
                request_id=p.request_id,
                worker=WorkerRef(
                    id=p.worker_id,
                    full_name=workers[p.worker_id].full_name,
                    role=workers[p.worker_id].role.value,
                ),
                note=p.note,
                status=p.status.value,
                created_at=p.created_at,
            )
            for p in proposals
        ]

    async def family_proposals(self, proposals: list[Proposal]) -> list[FamilyProposalOut]:
        workers = await self._workers([p.worker_id for p in proposals])
        public = {w.id: await self.worker_public(w) for w in workers.values()}
        return [
            FamilyProposalOut(
                id=p.id,
                request_id=p.request_id,
                worker=public[p.worker_id],
                note=p.note,
                status=p.status.value,
                created_at=p.created_at,
            )
            for p in proposals
        ]

    async def worker_public(self, worker: Worker) -> WorkerPublicOut:
        agency = await self.session.get(Agency, worker.agency_id)
        assert agency is not None  # noqa: S101  # FK
        items = await self.session.scalars(
            select(VerificationItem).where(
                VerificationItem.worker_id == worker.id,
                VerificationItem.status == VerificationStatus.verified,
            )
        )
        active = await self.placements.active_for_worker(worker.id)
        return WorkerPublicOut(
            id=worker.id,
            first_name=worker.full_name.split()[0] if worker.full_name.split() else worker.full_name,
            role=worker.role.value,
            years_experience=worker.years_experience,
            languages=list(worker.languages),
            live_in_ok=worker.live_in_ok,
            agency=AgencyRef(id=agency.id, name=agency.name),
            badges=[
                Badge(kind=i.kind.value, verified_at=i.verified_at)
                for i in items
                if i.verified_at is not None
            ],
            available=active is None,
        )
